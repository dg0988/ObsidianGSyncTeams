import { App, Modal, Notice, Setting } from "obsidian";
import type { GSyncApi } from "./gsync-api";
import { addPermission, DrivePermission, DriveRole, listPermissions, removePermission, updatePermission } from "./drive-teams";

const ROLE_LABELS: Record<DriveRole, string> = {
  reader: "Viewer",
  commenter: "Commenter",
  writer: "Editor",
  fileOrganizer: "Content manager",
  organizer: "Manager",
  owner: "Owner",
};

/** Roles that can be given to someone on a folder (Shared Drive roles only where they apply). */
function assignableRoles(inSharedDrive: boolean): DriveRole[] {
  return inSharedDrive ? ["reader", "commenter", "writer", "fileOrganizer", "organizer"] : ["reader", "commenter", "writer"];
}

function who(p: DrivePermission): string {
  if (p.type === "anyone") return "Anyone with the link";
  if (p.type === "domain") return `Everyone at ${p.domain ?? "your organization"}`;
  return p.displayName && p.emailAddress ? `${p.displayName} (${p.emailAddress})` : p.emailAddress ?? p.displayName ?? "Unknown";
}

/**
 * GSync Teams: manage who can open a synced Drive folder. Permissions are enforced by
 * Google Drive itself, so they hold for every app, not just Obsidian.
 */
export class ManageAccessModal extends Modal {
  private folderId = "";
  private inSharedDrive = false;

  constructor(app: App, private api: GSyncApi, private remotePath: string) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText(`Access: ${this.remotePath}`);
    void this.render();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private async render(): Promise<void> {
    const el = this.contentEl;
    el.empty();
    el.createEl("p", { text: "Loading…" });
    const api = this.api;
    let people: DrivePermission[];
    try {
      this.folderId = await api.ensureFolderPath(this.remotePath);
      const access = await api.folderAccess(this.folderId);
      this.inSharedDrive = access.inSharedDrive;
      people = await listPermissions(api, this.folderId);
      el.empty();
      if (!access.canShare) {
        el.createEl("p", { text: "You can see who has access, but your role doesn't allow changing it. Ask the folder's owner or a manager." });
      }
    } catch (e) {
      el.empty();
      el.createEl("p", { text: `Couldn't load access: ${(e as Error).message}` });
      return;
    }

    el.createEl("p", {
      text: "Viewers and commenters get Drive's changes but can't change files here. Editors sync both ways. Google Drive enforces these roles in every app.",
      cls: "setting-item-description",
    });

    const roles = assignableRoles(this.inSharedDrive);
    for (const p of people) {
      const row = new Setting(el).setName(who(p)).setDesc(p.inherited ? `${ROLE_LABELS[p.role]} (from the parent folder or Shared Drive)` : "");
      if (p.role === "owner" || p.inherited) {
        if (!p.inherited) row.setDesc(ROLE_LABELS[p.role]);
        continue;
      }
      row.addDropdown((d) => {
        for (const r of roles) d.addOption(r, ROLE_LABELS[r]);
        if (!roles.includes(p.role)) d.addOption(p.role, ROLE_LABELS[p.role]);
        d.setValue(p.role).onChange(async (v) => {
          await this.run(() => updatePermission(api, this.folderId, p.id, v as DriveRole), `${who(p)} is now ${ROLE_LABELS[v as DriveRole]}.`);
        });
      });
      row.addExtraButton((b) =>
        b.setIcon("user-minus").setTooltip("Remove access").onClick(async () => {
          await this.run(() => removePermission(api, this.folderId, p.id), `Removed ${who(p)}.`);
        })
      );
    }

    let email = "";
    let role: DriveRole = "reader";
    let notify = true;
    new Setting(el).setName("Add a person").setHeading();
    new Setting(el)
      .addText((t) => t.setPlaceholder("name@company.com").onChange((v) => (email = v.trim())))
      .addDropdown((d) => {
        for (const r of roles) d.addOption(r, ROLE_LABELS[r]);
        d.setValue(role).onChange((v) => (role = v as DriveRole));
      })
      .addButton((b) =>
        b.setButtonText("Add").setCta().onClick(async () => {
          if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
            new Notice("Enter a valid email address.");
            return;
          }
          await this.run(() => addPermission(api, this.folderId, email, role, notify), `Gave ${email} ${ROLE_LABELS[role]} access.`);
        })
      );
    new Setting(el)
      .setName("Email them a notification")
      .addToggle((t) => t.setValue(notify).onChange((v) => (notify = v)));
  }

  private async run(action: () => Promise<void>, done: string): Promise<void> {
    try {
      await action();
      new Notice(done);
    } catch (e) {
      new Notice(`Couldn't change access: ${(e as Error).message}`, 10000);
    }
    await this.render();
  }
}
