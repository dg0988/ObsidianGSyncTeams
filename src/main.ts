import { App, FuzzySuggestModal, Notice, Platform, Plugin, PluginSettingTab, Setting } from "obsidian";
import { findSharedDrive } from "./drive-teams";
import { GSyncApi, GSyncFolder } from "./gsync-api";
import {
  activateDevice, Activation, BUY_URL, DeviceList, DeviceStore, License, listDevices, needsRefresh, PRICE, removeDevice,
  ServerError, verifyActivation, verifyLicense,
} from "./license";
import { ManageAccessModal } from "./manage-access";

/** The GSync add-on API version this plugin was built for. */
const SUPPORTED_API = 1;
const GSYNC_ID = "gsync";

interface TeamsSettings {
  licenseKey: string;
}

type Status = "ok" | "unlicensed" | "not-activated" | "no-gsync" | "gsync-too-old" | "gsync-too-new";

/** A readable name for this device in the license's device list. */
function deviceName(): string {
  if (Platform.isAndroidApp) return "Android";
  if (Platform.isIosApp) return Platform.isTablet ? "iPad" : "iPhone";
  if (Platform.isMacOS) return "Mac";
  if (Platform.isWin) return "Windows PC";
  if (Platform.isLinux) return "Linux PC";
  return "Device";
}

interface AppWithPlugins {
  plugins?: { getPlugin(id: string): unknown };
}

export default class GSyncTeamsPlugin extends Plugin {
  settings: TeamsSettings = { licenseKey: "" };
  status: Status = "no-gsync";
  private connectedTo: GSyncApi | null = null;
  private unregister: (() => void) | null = null;
  private licCache: { key: string; lic: License | null } | null = null;
  readonly store = new DeviceStore();
  private refreshing = false;

  async onload() {
    this.settings = { licenseKey: "", ...((await this.loadData()) as Partial<TeamsSettings> | null) };
    this.addSettingTab(new TeamsSettingTab(this.app, this));
    this.addCommand({
      id: "manage-access",
      name: "Manage access to a synced folder",
      callback: () => this.pickFolder(),
    });
    this.app.workspace.onLayoutReady(() => this.connect());
    // GSync may be turned off and on (or updated) while this add-on runs: reconnect when it is.
    this.registerInterval(window.setInterval(() => this.connect(), 30 * 1000));
  }

  onunload() {
    this.disconnect();
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  license(): License | null {
    const key = this.settings.licenseKey;
    if (!this.licCache || this.licCache.key !== key) this.licCache = { key, lic: verifyLicense(key) };
    return this.licCache.lic;
  }

  /** This device's activation for the current license, if it's valid. */
  activation(): Activation | null {
    const lic = this.license();
    if (!lic) return null;
    const token = this.store.activation(lic.id);
    return token ? verifyActivation(token, lic, this.store.deviceId()) : null;
  }

  /** Activate this device. Throws ServerError (with the device list when all slots are used). */
  async activate(): Promise<DeviceList> {
    const lic = this.license();
    if (!lic) throw new ServerError("That license key isn't valid. Check that you pasted the whole key.", 0);
    const r = await activateDevice(this.settings.licenseKey, this.store.deviceId(), deviceName());
    if (!verifyActivation(r.token, lic, this.store.deviceId())) throw new ServerError("The server's activation didn't check out. Contact support.", 0);
    this.store.saveActivation(lic.id, r.token);
    this.connect();
    return r;
  }

  /** Remove a device from the license (this one, or a lost or replaced one). */
  async removeDevice(device: string): Promise<DeviceList> {
    const lic = this.license();
    const r = await removeDevice(this.settings.licenseKey, device);
    if (lic && device === this.store.deviceId()) {
      this.store.saveActivation(lic.id, null);
      this.connect();
    }
    return r;
  }

  devices(): Promise<DeviceList> {
    return listDevices(this.settings.licenseKey);
  }

  /** Quietly renew an activation that's a month old (or recently expired) while online. */
  private refreshInBackground() {
    const lic = this.license();
    if (!lic || this.refreshing) return;
    const token = this.store.activation(lic.id);
    if (!token) return;
    const current = verifyActivation(token, lic, this.store.deviceId());
    if (current && !needsRefresh(current)) return;
    this.refreshing = true;
    activateDevice(this.settings.licenseKey, this.store.deviceId(), deviceName(), true)
      .then((r) => {
        if (verifyActivation(r.token, lic, this.store.deviceId())) this.store.saveActivation(lic.id, r.token);
      })
      .catch((e: unknown) => {
        // Removed from the license or refunded: stop using it. Offline: try again later.
        if (e instanceof ServerError && (e.status === 410 || e.status === 403)) this.store.saveActivation(lic.id, null);
      })
      .finally(() => {
        this.refreshing = false;
        this.connect();
      });
  }

  /** GSync's add-on API, if GSync is installed and enabled. */
  private gsyncApi(): { api: GSyncApi | null; found: boolean } {
    const plugin = (this.app as unknown as AppWithPlugins).plugins?.getPlugin(GSYNC_ID) as { api?: GSyncApi } | null | undefined;
    if (!plugin) return { api: null, found: false };
    return { api: plugin.api ?? null, found: true };
  }

  /** Plug into GSync when licensed, or unplug when not. Safe to call any time. */
  connect(): Status {
    const lic = this.license();
    const { api, found } = this.gsyncApi();
    if (!found) {
      this.disconnect();
      return (this.status = "no-gsync");
    }
    if (!api || api.version < SUPPORTED_API) {
      this.disconnect();
      return (this.status = "gsync-too-old");
    }
    if (api.version > SUPPORTED_API) {
      this.disconnect();
      return (this.status = "gsync-too-new");
    }
    if (!lic) {
      this.disconnect();
      return (this.status = "unlicensed");
    }
    this.refreshInBackground();
    if (!this.activation()) {
      this.disconnect();
      return (this.status = "not-activated");
    }
    if (this.connectedTo !== api) {
      this.disconnect();
      this.unregister = api.registerTeams({
        resolveSharedDrive: (name) => findSharedDrive(api, name),
        manageAccess: (remotePath) => new ManageAccessModal(this.app, api, remotePath).open(),
      });
      this.connectedTo = api;
    }
    return (this.status = "ok");
  }

  private disconnect() {
    this.unregister?.();
    this.unregister = null;
    this.connectedTo = null;
  }

  folders(): GSyncFolder[] {
    return this.connectedTo?.folders().filter((f) => f.remote) ?? [];
  }

  openManageAccess(remotePath: string) {
    if (this.connect() !== "ok" || !this.connectedTo) {
      new Notice(statusText(this.status));
      return;
    }
    new ManageAccessModal(this.app, this.connectedTo, remotePath).open();
  }

  private pickFolder() {
    if (this.connect() !== "ok") {
      new Notice(statusText(this.status));
      return;
    }
    const folders = this.folders();
    if (folders.length === 1) this.openManageAccess(folders[0].remote);
    else new FolderPicker(this.app, folders, (f) => this.openManageAccess(f.remote)).open();
  }
}

function statusText(status: Status): string {
  switch (status) {
    case "ok":
      return "Connected to GSync. Shared Drives and managing access are on.";
    case "unlicensed":
      return "Enter your GSync Teams license key in Settings → GSync Teams.";
    case "not-activated":
      return "Activate GSync Teams on this device in Settings → GSync Teams (needs internet once).";
    case "no-gsync":
      return "GSync Teams adds features to GSync. Install and enable GSync first.";
    case "gsync-too-old":
      return "Update GSync to use GSync Teams.";
    case "gsync-too-new":
      return "Update GSync Teams to work with this version of GSync.";
  }
}

const folderLabel = (f: GSyncFolder) => `${f.local || "Whole vault"} → ${f.remote}`;

class FolderPicker extends FuzzySuggestModal<GSyncFolder> {
  constructor(app: App, private folders: GSyncFolder[], private choose: (f: GSyncFolder) => void) {
    super(app);
    this.setPlaceholder("Choose a synced folder");
  }
  getItems(): GSyncFolder[] {
    return this.folders;
  }
  getItemText(f: GSyncFolder): string {
    return folderLabel(f);
  }
  onChooseItem(f: GSyncFolder): void {
    this.choose(f);
  }
}

class TeamsSettingTab extends PluginSettingTab {
  /** The license's devices, once shown. */
  private list: DeviceList | null = null;

  constructor(app: App, private plugin: GSyncTeamsPlugin) {
    super(app, plugin);
  }

  /** Run a server action, show the result, and redraw. */
  private async run(action: () => Promise<DeviceList>, done: string): Promise<void> {
    try {
      this.list = await action();
      if (done) new Notice(done);
    } catch (e) {
      if (e instanceof ServerError && e.list) this.list = e.list;
      new Notice((e as Error).message, 10000);
    }
    this.refresh();
  }

  private renderDevices(containerEl: HTMLElement, list: DeviceList) {
    new Setting(containerEl).setName(`Devices: ${list.used} of ${list.limit} in use`).setHeading();
    const me = this.plugin.store.deviceId();
    for (const d of list.devices) {
      const seen = d.seen ? new Date(d.seen).toLocaleDateString() : "";
      new Setting(containerEl)
        .setName(d.id === me ? `${d.name} (this device)` : d.name)
        .setDesc(seen ? `Last seen ${seen}` : "")
        .addButton((b) =>
          b.setButtonText("Remove").onClick(() => this.run(() => this.plugin.removeDevice(d.id), `Removed ${d.name}. Its slot is free.`))
        );
    }
  }

  display(): void {
    this.refresh();
  }

  refresh(): void {
    const { containerEl } = this;
    containerEl.empty();
    const status = this.plugin.connect();
    const lic = this.plugin.license();

    new Setting(containerEl).setName("Status").setDesc(statusText(status));
    if (status === "no-gsync") {
      new Setting(containerEl).addButton((b) =>
        b.setButtonText("Find GSync").onClick(() => {
          window.open("obsidian://show-plugin?id=gsync");
        })
      );
    }

    new Setting(containerEl).setName("License").setHeading();
    new Setting(containerEl).setDesc(
      lic
        ? `Licensed to ${lic.name}: ${lic.users} users, up to ${lic.devices} devices (2 per user).`
        : `GSync Teams is ${PRICE} (2 devices per user, lower per-user price for more users): Shared Drives, and managing who can view or edit each synced folder. GSync itself stays free.`
    );
    new Setting(containerEl).setName("License key").addText((t) => {
      t.inputEl.type = "password";
      t.setPlaceholder("GST-…").setValue(this.plugin.settings.licenseKey).onChange(async (v) => {
        this.plugin.settings.licenseKey = v.trim();
        await this.plugin.saveSettings();
      });
    });
    const activation = this.plugin.activation();
    new Setting(containerEl)
      .setName("This device")
      .setDesc(
        activation
          ? `Activated. Works offline until ${new Date(activation.expiresAt).toLocaleDateString()}; GSync Teams renews this automatically when online.`
          : "Not activated. Activating uses one of your license's device slots and needs internet once."
      )
      .addButton((b) =>
        activation
          ? b.setButtonText("Deactivate").onClick(() => this.run(() => this.plugin.removeDevice(this.plugin.store.deviceId()), "This device was deactivated and its slot is free."))
          : b.setButtonText("Activate").setCta().onClick(() => this.run(() => this.plugin.activate(), "GSync Teams is activated on this device."))
      );
    if (lic) {
      new Setting(containerEl)
        .setName("Devices")
        .setDesc("See which devices use this license, and free a slot from a lost or replaced device.")
        .addButton((b) => b.setButtonText("Show devices").onClick(() => this.run(() => this.plugin.devices(), "")));
    }
    if (this.list) this.renderDevices(containerEl, this.list);
    if (!lic) {
      new Setting(containerEl).addButton((b) =>
        b.setButtonText("Get GSync Teams").onClick(() => {
          window.open(BUY_URL);
        })
      );
    }

    if (status !== "ok") return;
    new Setting(containerEl).setName("Synced folders").setHeading();
    new Setting(containerEl).setDesc(
      'Add folders, including Shared Drive folders ("Shared drives/<drive name>/<folder>"), in GSync\'s settings. Manage who can open each one here or with the people icon next to it in GSync.'
    );
    for (const f of this.plugin.folders()) {
      new Setting(containerEl).setName(f.local || "Whole vault").setDesc(f.remote).addButton((b) =>
        b.setButtonText("Manage access").onClick(() => this.plugin.openManageAccess(f.remote))
      );
    }
  }
}
