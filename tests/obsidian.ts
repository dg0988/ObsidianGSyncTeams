// Minimal stand-ins for the parts of the Obsidian API these tests touch.
export const Platform = { isAndroidApp: false, isIosApp: false, isTablet: false, isMacOS: false, isWin: true, isLinux: false };
export const requestUrl = (options: unknown) => (globalThis as any).requestUrlMock(options);
export class Plugin {
  app: any;
  constructor(app: any) { this.app = app; }
  async loadData() { return null; }
  async saveData() {}
  addSettingTab() {}
  addCommand() {}
  registerInterval(id: number) { return id; }
}
export class PluginSettingTab { constructor(public app: any, public plugin: any) {} }
export class Modal { constructor(public app: any) {} }
export class FuzzySuggestModal<T> extends Modal { setPlaceholder(_: string) {} }
export class Setting {}
export class Notice { constructor(public message: string) {} }
