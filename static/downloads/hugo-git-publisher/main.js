/* yskim Hugo Publisher */
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => HugoGitPublisherPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var import_child_process = require("child_process");
var import_promises = require("fs/promises");
var import_path = require("path");
var DEFAULT_SETTINGS = {
  readyFolder: "_Blog/30_Ready",
  assetFolder: "_Blog/assets",
  publicRepoPath: "C:/Users/yskim/Documents/Projects/yskim-blog-public",
  postsFolder: "content/posts",
  imageFolder: "static/images/blog",
  githubHost: "github.com",
  autoPush: false,
  commitMessage: "content: publish obsidian notes"
};
var HugoGitPublisherPlugin = class extends import_obsidian.Plugin {
  settings = DEFAULT_SETTINGS;
  async onload() {
    await this.loadSettings();
    this.addSettingTab(new HugoPublisherSettingTab(this.app, this));
    this.addCommand({
      id: "export-current-note",
      name: "Export current note to Hugo public repo",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== "md") return false;
        if (!checking) {
          this.exportFiles([file]).catch((error) => this.reportError(error));
        }
        return true;
      }
    });
    this.addCommand({
      id: "export-ready-folder",
      name: "Export _Blog/30_Ready to Hugo public repo",
      callback: () => this.exportReadyFolder().catch((error) => this.reportError(error))
    });
    this.addCommand({
      id: "export-ready-folder-and-push",
      name: "Export ready posts and push public repo",
      callback: () => this.exportReadyFolder(true).catch((error) => this.reportError(error))
    });
    this.addCommand({
      id: "check-desktop-dependencies",
      name: "Check desktop dependencies",
      callback: () => this.checkDesktopDependencies(true).catch((error) => this.reportError(error))
    });
    this.addCommand({
      id: "install-missing-desktop-dependencies",
      name: "Install missing desktop dependencies",
      callback: () => this.installMissingDesktopDependencies().catch((error) => this.reportError(error))
    });
    this.addCommand({
      id: "check-github-login",
      name: "Check GitHub login",
      callback: () => this.checkGithubLogin(true).catch((error) => this.reportError(error))
    });
    this.addCommand({
      id: "login-to-github",
      name: "Login to GitHub",
      callback: () => this.loginToGithub().catch((error) => this.reportError(error))
    });
  }
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  async exportReadyFolder(forcePush = false) {
    const files = this.app.vault.getMarkdownFiles().filter((file) => normalizeVaultPath(file.path).startsWith(`${normalizeVaultPath(this.settings.readyFolder)}/`));
    await this.exportFiles(files, forcePush);
  }
  async exportFiles(files, forcePush = false) {
    let exported = 0;
    for (const file of files) {
      const content = await this.app.vault.read(file);
      const result = await this.exportOne(file, content);
      if (result) exported += 1;
    }
    if (exported === 0) {
      new import_obsidian.Notice("No publishable notes were exported.");
      return;
    }
    if (forcePush || this.settings.autoPush) {
      await this.ensurePublishDependencies();
      await runGit(this.settings.publicRepoPath, ["add", "."]);
      await runGit(this.settings.publicRepoPath, ["commit", "-m", this.settings.commitMessage]).catch((error) => {
        if (!String(error.message).includes("nothing to commit")) throw error;
      });
      await runGit(this.settings.publicRepoPath, ["push"]);
      new import_obsidian.Notice(`Exported and pushed ${exported} note(s).`);
    } else {
      new import_obsidian.Notice(`Exported ${exported} note(s) to Hugo public repo.`);
    }
  }
  async exportOne(file, content) {
    assertAllowedSource(file.path, this.settings.readyFolder);
    const frontMatter = parseFrontMatter(content, file.path);
    for (const field of ["title", "date", "slug", "summary"]) requireField(frontMatter, field, file.path);
    if (!/^tags:\s*$/m.test(content)) throw new Error(`Required YAML list field 'tags' is missing: ${file.path}`);
    if (frontMatter.map.publish !== "true") return false;
    const slug = frontMatter.map.slug;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error(`Slug must be lowercase kebab-case: ${file.path}`);
    const lang = (frontMatter.map.lang || "ko").toLowerCase();
    if (lang !== "ko" && lang !== "en") throw new Error(`lang must be 'ko' or 'en': ${file.path}`);
    if (lang === "en") requireField(frontMatter, "translationKey", file.path);
    const body = frontMatter.lines.slice(frontMatter.endIndex + 1).join("\n");
    if (/\[\[[^\]]+\]\]/.test(body.replace(/!\[\[[^\]]+\]\]/g, ""))) {
      throw new Error(`Obsidian wikilinks are not publishable Markdown: ${file.path}`);
    }
    const convertedBody = await this.convertEmbeds(body, slug, file.path);
    const yaml = frontMatter.lines.slice(0, frontMatter.endIndex + 1).flatMap((line) => {
      if (/^publish:\s*/.test(line)) return [];
      if (/^draft:\s*/.test(line)) return ["draft: false"];
      return [line];
    });
    if (!yaml.some((line) => /^draft:\s*/.test(line))) {
      yaml.splice(Math.max(1, yaml.length - 1), 0, "draft: false");
    }
    const fileName = lang === "en" ? `${slug}.en.md` : `${slug}.md`;
    const destination = (0, import_path.join)(this.settings.publicRepoPath, this.settings.postsFolder, fileName);
    await (0, import_promises.mkdir)((0, import_path.dirname)(destination), { recursive: true });
    await (0, import_promises.writeFile)(destination, `${yaml.join("\n")}
${convertedBody.trim()}
`, "utf8");
    return true;
  }
  async convertEmbeds(body, slug, sourcePath) {
    const embedPattern = /!\[\[([^\]]+)\]\]/g;
    let result = "";
    let lastIndex = 0;
    for (const match of body.matchAll(embedPattern)) {
      result += body.slice(lastIndex, match.index);
      const raw = match[1];
      const [targetRaw, altRaw] = raw.split("|", 2);
      const target = normalizeVaultPath(targetRaw.trim());
      const alt = altRaw?.trim() || (0, import_path.basename)(target);
      const sourceAssetPath = `${normalizeVaultPath(this.settings.assetFolder)}/${target}`;
      const asset = this.app.vault.getAbstractFileByPath(sourceAssetPath);
      if (!(asset instanceof import_obsidian.TFile)) {
        throw new Error(`Embedded asset not found for ${sourcePath}: ${raw}. Put public assets under ${this.settings.assetFolder}.`);
      }
      const bytes = await this.app.vault.readBinary(asset);
      const fileName = (0, import_path.basename)(target);
      const destination = (0, import_path.join)(this.settings.publicRepoPath, this.settings.imageFolder, slug, fileName);
      await (0, import_promises.mkdir)((0, import_path.dirname)(destination), { recursive: true });
      await (0, import_promises.writeFile)(destination, Buffer.from(bytes));
      result += `![${alt}](/images/blog/${slug}/${fileName})`;
      lastIndex = (match.index || 0) + match[0].length;
    }
    result += body.slice(lastIndex);
    return result;
  }
  async ensurePublishDependencies() {
    await ensureCommand("git", ["--version"]);
    await ensureCommand("gh", ["--version"]);
    await this.checkGithubLogin(false);
  }
  async checkDesktopDependencies(showNotice = false) {
    const checks = [
      await checkCommand("git", ["--version"]),
      await checkCommand("gh", ["--version"]),
      await checkCommand("node", ["--version"]),
      await checkCommand("npm", ["--version"]),
      await checkCommand("winget", ["--version"])
    ];
    if (showNotice) {
      const missing = checks.filter((check) => !check.available).map((check) => check.name);
      if (missing.length === 0) {
        new import_obsidian.Notice("All desktop dependencies are installed: git, gh, node, npm, winget.");
      } else {
        new import_obsidian.Notice(`Missing dependencies: ${missing.join(", ")}. Run "Install missing desktop dependencies".`, 8e3);
      }
      console.table(checks);
    }
    return checks;
  }
  async installMissingDesktopDependencies() {
    const checks = await this.checkDesktopDependencies(false);
    const missing = new Set(checks.filter((check) => !check.available).map((check) => check.name));
    if (missing.size === 0) {
      new import_obsidian.Notice("All desktop dependencies are already installed.");
      return;
    }
    if (missing.has("winget")) {
      throw new Error("winget is missing. Install App Installer from Microsoft Store, then rerun this command.");
    }
    const packages = [
      ["git", "Git.Git"],
      ["gh", "GitHub.cli"],
      ["node", "OpenJS.NodeJS.LTS", ["node", "npm"]]
    ];
    for (const [command, packageId, providedCommands = [command]] of packages) {
      if (!providedCommands.some((providedCommand) => missing.has(providedCommand))) continue;
      new import_obsidian.Notice(`Installing ${packageId} with winget. A system prompt may appear.`, 8e3);
      await runCommand("winget", [
        "install",
        "--id",
        packageId,
        "-e",
        "--source",
        "winget",
        "--accept-package-agreements",
        "--accept-source-agreements"
      ]);
    }
    new import_obsidian.Notice("Dependency installation finished. Restart Obsidian if new commands are not detected.", 8e3);
  }
  async checkGithubLogin(showNotice = false) {
    await ensureCommand("gh", ["--version"]);
    const status = await runCommand("gh", ["auth", "status", "--hostname", this.settings.githubHost]);
    if (showNotice) {
      new import_obsidian.Notice(`GitHub login is available for ${this.settings.githubHost}.`);
      console.log(status);
    }
    return status;
  }
  async loginToGithub() {
    await ensureCommand("gh", ["--version"]);
    new import_obsidian.Notice("Opening GitHub login in your browser. Finish the GitHub CLI prompt to continue.", 8e3);
    await runCommand("gh", [
      "auth",
      "login",
      "--hostname",
      this.settings.githubHost,
      "--git-protocol",
      "https",
      "--web",
      "--skip-ssh-key"
    ]);
    await this.checkGithubLogin(true);
  }
  reportError(error) {
    console.error(error);
    new import_obsidian.Notice(error instanceof Error ? error.message : String(error), 8e3);
  }
};
var HugoPublisherSettingTab = class extends import_obsidian.PluginSettingTab {
  plugin;
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Hugo Git Publisher" });
    this.textSetting("Ready folder", "Only notes in this folder are exported.", "readyFolder");
    this.textSetting("Asset folder", "Public-safe Obsidian assets used by embeds.", "assetFolder");
    this.textSetting("Public repo path", "Local path to the public Hugo repository.", "publicRepoPath");
    this.textSetting("GitHub host", "Usually github.com. Change only for GitHub Enterprise.", "githubHost");
    this.textSetting("Commit message", "Used when auto-pushing from Obsidian.", "commitMessage");
    new import_obsidian.Setting(containerEl).setName("Auto push").setDesc("Run git add, commit, and push after export.").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.autoPush).onChange(async (value) => {
        this.plugin.settings.autoPush = value;
        await this.plugin.saveSettings();
      })
    );
  }
  textSetting(name, desc, key) {
    new import_obsidian.Setting(this.containerEl).setName(name).setDesc(desc).addText(
      (text) => text.setValue(String(this.plugin.settings[key])).onChange(async (value) => {
        this.plugin.settings[key] = value;
        await this.plugin.saveSettings();
      })
    );
  }
};
function parseFrontMatter(content, path) {
  const lines = content.split(/\r?\n/);
  if (lines.length < 3 || lines[0].trim() !== "---") throw new Error(`Missing YAML frontmatter: ${path}`);
  const endIndex = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (endIndex < 0) throw new Error(`Unclosed YAML frontmatter: ${path}`);
  const map = {};
  for (let i = 1; i < endIndex; i += 1) {
    const match = lines[i].match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (match) map[match[1]] = match[2].trim().replace(/^"|"$/g, "");
  }
  return { map, lines, endIndex };
}
function requireField(frontMatter, field, path) {
  if (!frontMatter.map[field]) throw new Error(`Required frontmatter field '${field}' is missing: ${path}`);
}
function assertAllowedSource(path, readyFolder) {
  const normalized = normalizeVaultPath(path);
  const ready = normalizeVaultPath(readyFolder);
  if (!normalized.startsWith(`${ready}/`)) throw new Error(`Only notes under ${readyFolder} can be exported: ${path}`);
  for (const forbidden of ["_!Private", "_attachments", ".obsidian", ".smart-env", ".smtcmp_json_db", "Chats", "Excalidraw"]) {
    if (normalized.split("/").includes(forbidden)) throw new Error(`Forbidden path appeared in export input: ${path}`);
  }
}
function normalizeVaultPath(path) {
  return path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}
function runGit(cwd, args) {
  return runCommand("git", args, cwd).then(() => void 0);
}
function ensureCommand(command, args) {
  return runCommand(command, args).catch((error) => {
    throw new Error(`${command} is required but was not found. Run "Install missing desktop dependencies" in this plugin.`);
  });
}
async function checkCommand(command, args) {
  try {
    const detail = await runCommand(command, args);
    return { name: command, available: true, detail: detail.trim().split(/\r?\n/)[0] || "installed" };
  } catch (error) {
    return { name: command, available: false, detail: error instanceof Error ? error.message.trim() : String(error) };
  }
}
function runCommand(command, args, cwd) {
  return new Promise((resolve, reject) => {
    (0, import_child_process.execFile)(command, args, { cwd }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`${stderr || stdout || error.message}`));
        return;
      }
      resolve(`${stdout}${stderr}`);
    });
  });
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL21haW4udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7IEFwcCwgTm90aWNlLCBQbHVnaW4sIFBsdWdpblNldHRpbmdUYWIsIFNldHRpbmcsIFRGaWxlIH0gZnJvbSBcIm9ic2lkaWFuXCI7XG5pbXBvcnQgeyBleGVjRmlsZSB9IGZyb20gXCJjaGlsZF9wcm9jZXNzXCI7XG5pbXBvcnQgeyBta2Rpciwgd3JpdGVGaWxlIH0gZnJvbSBcImZzL3Byb21pc2VzXCI7XG5pbXBvcnQgeyBiYXNlbmFtZSwgZGlybmFtZSwgam9pbiwgbm9ybWFsaXplIH0gZnJvbSBcInBhdGhcIjtcblxuaW50ZXJmYWNlIFB1Ymxpc2hlclNldHRpbmdzIHtcbiAgcmVhZHlGb2xkZXI6IHN0cmluZztcbiAgYXNzZXRGb2xkZXI6IHN0cmluZztcbiAgcHVibGljUmVwb1BhdGg6IHN0cmluZztcbiAgcG9zdHNGb2xkZXI6IHN0cmluZztcbiAgaW1hZ2VGb2xkZXI6IHN0cmluZztcbiAgZ2l0aHViSG9zdDogc3RyaW5nO1xuICBhdXRvUHVzaDogYm9vbGVhbjtcbiAgY29tbWl0TWVzc2FnZTogc3RyaW5nO1xufVxuXG5jb25zdCBERUZBVUxUX1NFVFRJTkdTOiBQdWJsaXNoZXJTZXR0aW5ncyA9IHtcbiAgcmVhZHlGb2xkZXI6IFwiX0Jsb2cvMzBfUmVhZHlcIixcbiAgYXNzZXRGb2xkZXI6IFwiX0Jsb2cvYXNzZXRzXCIsXG4gIHB1YmxpY1JlcG9QYXRoOiBcIkM6L1VzZXJzL3lza2ltL0RvY3VtZW50cy9Qcm9qZWN0cy95c2tpbS1ibG9nLXB1YmxpY1wiLFxuICBwb3N0c0ZvbGRlcjogXCJjb250ZW50L3Bvc3RzXCIsXG4gIGltYWdlRm9sZGVyOiBcInN0YXRpYy9pbWFnZXMvYmxvZ1wiLFxuICBnaXRodWJIb3N0OiBcImdpdGh1Yi5jb21cIixcbiAgYXV0b1B1c2g6IGZhbHNlLFxuICBjb21taXRNZXNzYWdlOiBcImNvbnRlbnQ6IHB1Ymxpc2ggb2JzaWRpYW4gbm90ZXNcIixcbn07XG5cbmludGVyZmFjZSBGcm9udE1hdHRlciB7XG4gIG1hcDogUmVjb3JkPHN0cmluZywgc3RyaW5nPjtcbiAgbGluZXM6IHN0cmluZ1tdO1xuICBlbmRJbmRleDogbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgQ29tbWFuZFN0YXR1cyB7XG4gIG5hbWU6IHN0cmluZztcbiAgYXZhaWxhYmxlOiBib29sZWFuO1xuICBkZXRhaWw6IHN0cmluZztcbn1cblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgSHVnb0dpdFB1Ymxpc2hlclBsdWdpbiBleHRlbmRzIFBsdWdpbiB7XG4gIHNldHRpbmdzOiBQdWJsaXNoZXJTZXR0aW5ncyA9IERFRkFVTFRfU0VUVElOR1M7XG5cbiAgYXN5bmMgb25sb2FkKCkge1xuICAgIGF3YWl0IHRoaXMubG9hZFNldHRpbmdzKCk7XG4gICAgdGhpcy5hZGRTZXR0aW5nVGFiKG5ldyBIdWdvUHVibGlzaGVyU2V0dGluZ1RhYih0aGlzLmFwcCwgdGhpcykpO1xuXG4gICAgdGhpcy5hZGRDb21tYW5kKHtcbiAgICAgIGlkOiBcImV4cG9ydC1jdXJyZW50LW5vdGVcIixcbiAgICAgIG5hbWU6IFwiRXhwb3J0IGN1cnJlbnQgbm90ZSB0byBIdWdvIHB1YmxpYyByZXBvXCIsXG4gICAgICBjaGVja0NhbGxiYWNrOiAoY2hlY2tpbmcpID0+IHtcbiAgICAgICAgY29uc3QgZmlsZSA9IHRoaXMuYXBwLndvcmtzcGFjZS5nZXRBY3RpdmVGaWxlKCk7XG4gICAgICAgIGlmICghZmlsZSB8fCBmaWxlLmV4dGVuc2lvbiAhPT0gXCJtZFwiKSByZXR1cm4gZmFsc2U7XG4gICAgICAgIGlmICghY2hlY2tpbmcpIHtcbiAgICAgICAgICB0aGlzLmV4cG9ydEZpbGVzKFtmaWxlXSkuY2F0Y2goKGVycm9yKSA9PiB0aGlzLnJlcG9ydEVycm9yKGVycm9yKSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgdGhpcy5hZGRDb21tYW5kKHtcbiAgICAgIGlkOiBcImV4cG9ydC1yZWFkeS1mb2xkZXJcIixcbiAgICAgIG5hbWU6IFwiRXhwb3J0IF9CbG9nLzMwX1JlYWR5IHRvIEh1Z28gcHVibGljIHJlcG9cIixcbiAgICAgIGNhbGxiYWNrOiAoKSA9PiB0aGlzLmV4cG9ydFJlYWR5Rm9sZGVyKCkuY2F0Y2goKGVycm9yKSA9PiB0aGlzLnJlcG9ydEVycm9yKGVycm9yKSksXG4gICAgfSk7XG5cbiAgICB0aGlzLmFkZENvbW1hbmQoe1xuICAgICAgaWQ6IFwiZXhwb3J0LXJlYWR5LWZvbGRlci1hbmQtcHVzaFwiLFxuICAgICAgbmFtZTogXCJFeHBvcnQgcmVhZHkgcG9zdHMgYW5kIHB1c2ggcHVibGljIHJlcG9cIixcbiAgICAgIGNhbGxiYWNrOiAoKSA9PiB0aGlzLmV4cG9ydFJlYWR5Rm9sZGVyKHRydWUpLmNhdGNoKChlcnJvcikgPT4gdGhpcy5yZXBvcnRFcnJvcihlcnJvcikpLFxuICAgIH0pO1xuXG4gICAgdGhpcy5hZGRDb21tYW5kKHtcbiAgICAgIGlkOiBcImNoZWNrLWRlc2t0b3AtZGVwZW5kZW5jaWVzXCIsXG4gICAgICBuYW1lOiBcIkNoZWNrIGRlc2t0b3AgZGVwZW5kZW5jaWVzXCIsXG4gICAgICBjYWxsYmFjazogKCkgPT4gdGhpcy5jaGVja0Rlc2t0b3BEZXBlbmRlbmNpZXModHJ1ZSkuY2F0Y2goKGVycm9yKSA9PiB0aGlzLnJlcG9ydEVycm9yKGVycm9yKSksXG4gICAgfSk7XG5cbiAgICB0aGlzLmFkZENvbW1hbmQoe1xuICAgICAgaWQ6IFwiaW5zdGFsbC1taXNzaW5nLWRlc2t0b3AtZGVwZW5kZW5jaWVzXCIsXG4gICAgICBuYW1lOiBcIkluc3RhbGwgbWlzc2luZyBkZXNrdG9wIGRlcGVuZGVuY2llc1wiLFxuICAgICAgY2FsbGJhY2s6ICgpID0+IHRoaXMuaW5zdGFsbE1pc3NpbmdEZXNrdG9wRGVwZW5kZW5jaWVzKCkuY2F0Y2goKGVycm9yKSA9PiB0aGlzLnJlcG9ydEVycm9yKGVycm9yKSksXG4gICAgfSk7XG5cbiAgICB0aGlzLmFkZENvbW1hbmQoe1xuICAgICAgaWQ6IFwiY2hlY2stZ2l0aHViLWxvZ2luXCIsXG4gICAgICBuYW1lOiBcIkNoZWNrIEdpdEh1YiBsb2dpblwiLFxuICAgICAgY2FsbGJhY2s6ICgpID0+IHRoaXMuY2hlY2tHaXRodWJMb2dpbih0cnVlKS5jYXRjaCgoZXJyb3IpID0+IHRoaXMucmVwb3J0RXJyb3IoZXJyb3IpKSxcbiAgICB9KTtcblxuICAgIHRoaXMuYWRkQ29tbWFuZCh7XG4gICAgICBpZDogXCJsb2dpbi10by1naXRodWJcIixcbiAgICAgIG5hbWU6IFwiTG9naW4gdG8gR2l0SHViXCIsXG4gICAgICBjYWxsYmFjazogKCkgPT4gdGhpcy5sb2dpblRvR2l0aHViKCkuY2F0Y2goKGVycm9yKSA9PiB0aGlzLnJlcG9ydEVycm9yKGVycm9yKSksXG4gICAgfSk7XG4gIH1cblxuICBhc3luYyBsb2FkU2V0dGluZ3MoKSB7XG4gICAgdGhpcy5zZXR0aW5ncyA9IE9iamVjdC5hc3NpZ24oe30sIERFRkFVTFRfU0VUVElOR1MsIGF3YWl0IHRoaXMubG9hZERhdGEoKSk7XG4gIH1cblxuICBhc3luYyBzYXZlU2V0dGluZ3MoKSB7XG4gICAgYXdhaXQgdGhpcy5zYXZlRGF0YSh0aGlzLnNldHRpbmdzKTtcbiAgfVxuXG4gIGFzeW5jIGV4cG9ydFJlYWR5Rm9sZGVyKGZvcmNlUHVzaCA9IGZhbHNlKSB7XG4gICAgY29uc3QgZmlsZXMgPSB0aGlzLmFwcC52YXVsdC5nZXRNYXJrZG93bkZpbGVzKCkuZmlsdGVyKChmaWxlKSA9PiBub3JtYWxpemVWYXVsdFBhdGgoZmlsZS5wYXRoKS5zdGFydHNXaXRoKGAke25vcm1hbGl6ZVZhdWx0UGF0aCh0aGlzLnNldHRpbmdzLnJlYWR5Rm9sZGVyKX0vYCkpO1xuICAgIGF3YWl0IHRoaXMuZXhwb3J0RmlsZXMoZmlsZXMsIGZvcmNlUHVzaCk7XG4gIH1cblxuICBhc3luYyBleHBvcnRGaWxlcyhmaWxlczogVEZpbGVbXSwgZm9yY2VQdXNoID0gZmFsc2UpIHtcbiAgICBsZXQgZXhwb3J0ZWQgPSAwO1xuICAgIGZvciAoY29uc3QgZmlsZSBvZiBmaWxlcykge1xuICAgICAgY29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LnJlYWQoZmlsZSk7XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmV4cG9ydE9uZShmaWxlLCBjb250ZW50KTtcbiAgICAgIGlmIChyZXN1bHQpIGV4cG9ydGVkICs9IDE7XG4gICAgfVxuXG4gICAgaWYgKGV4cG9ydGVkID09PSAwKSB7XG4gICAgICBuZXcgTm90aWNlKFwiTm8gcHVibGlzaGFibGUgbm90ZXMgd2VyZSBleHBvcnRlZC5cIik7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKGZvcmNlUHVzaCB8fCB0aGlzLnNldHRpbmdzLmF1dG9QdXNoKSB7XG4gICAgICBhd2FpdCB0aGlzLmVuc3VyZVB1Ymxpc2hEZXBlbmRlbmNpZXMoKTtcbiAgICAgIGF3YWl0IHJ1bkdpdCh0aGlzLnNldHRpbmdzLnB1YmxpY1JlcG9QYXRoLCBbXCJhZGRcIiwgXCIuXCJdKTtcbiAgICAgIGF3YWl0IHJ1bkdpdCh0aGlzLnNldHRpbmdzLnB1YmxpY1JlcG9QYXRoLCBbXCJjb21taXRcIiwgXCItbVwiLCB0aGlzLnNldHRpbmdzLmNvbW1pdE1lc3NhZ2VdKS5jYXRjaCgoZXJyb3IpID0+IHtcbiAgICAgICAgaWYgKCFTdHJpbmcoZXJyb3IubWVzc2FnZSkuaW5jbHVkZXMoXCJub3RoaW5nIHRvIGNvbW1pdFwiKSkgdGhyb3cgZXJyb3I7XG4gICAgICB9KTtcbiAgICAgIGF3YWl0IHJ1bkdpdCh0aGlzLnNldHRpbmdzLnB1YmxpY1JlcG9QYXRoLCBbXCJwdXNoXCJdKTtcbiAgICAgIG5ldyBOb3RpY2UoYEV4cG9ydGVkIGFuZCBwdXNoZWQgJHtleHBvcnRlZH0gbm90ZShzKS5gKTtcbiAgICB9IGVsc2Uge1xuICAgICAgbmV3IE5vdGljZShgRXhwb3J0ZWQgJHtleHBvcnRlZH0gbm90ZShzKSB0byBIdWdvIHB1YmxpYyByZXBvLmApO1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIGV4cG9ydE9uZShmaWxlOiBURmlsZSwgY29udGVudDogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgYXNzZXJ0QWxsb3dlZFNvdXJjZShmaWxlLnBhdGgsIHRoaXMuc2V0dGluZ3MucmVhZHlGb2xkZXIpO1xuICAgIGNvbnN0IGZyb250TWF0dGVyID0gcGFyc2VGcm9udE1hdHRlcihjb250ZW50LCBmaWxlLnBhdGgpO1xuICAgIGZvciAoY29uc3QgZmllbGQgb2YgW1widGl0bGVcIiwgXCJkYXRlXCIsIFwic2x1Z1wiLCBcInN1bW1hcnlcIl0pIHJlcXVpcmVGaWVsZChmcm9udE1hdHRlciwgZmllbGQsIGZpbGUucGF0aCk7XG4gICAgaWYgKCEvXnRhZ3M6XFxzKiQvbS50ZXN0KGNvbnRlbnQpKSB0aHJvdyBuZXcgRXJyb3IoYFJlcXVpcmVkIFlBTUwgbGlzdCBmaWVsZCAndGFncycgaXMgbWlzc2luZzogJHtmaWxlLnBhdGh9YCk7XG4gICAgaWYgKGZyb250TWF0dGVyLm1hcC5wdWJsaXNoICE9PSBcInRydWVcIikgcmV0dXJuIGZhbHNlO1xuXG4gICAgY29uc3Qgc2x1ZyA9IGZyb250TWF0dGVyLm1hcC5zbHVnO1xuICAgIGlmICghL15bYS16MC05XSsoPzotW2EtejAtOV0rKSokLy50ZXN0KHNsdWcpKSB0aHJvdyBuZXcgRXJyb3IoYFNsdWcgbXVzdCBiZSBsb3dlcmNhc2Uga2ViYWItY2FzZTogJHtmaWxlLnBhdGh9YCk7XG4gICAgY29uc3QgbGFuZyA9IChmcm9udE1hdHRlci5tYXAubGFuZyB8fCBcImtvXCIpLnRvTG93ZXJDYXNlKCk7XG4gICAgaWYgKGxhbmcgIT09IFwia29cIiAmJiBsYW5nICE9PSBcImVuXCIpIHRocm93IG5ldyBFcnJvcihgbGFuZyBtdXN0IGJlICdrbycgb3IgJ2VuJzogJHtmaWxlLnBhdGh9YCk7XG4gICAgaWYgKGxhbmcgPT09IFwiZW5cIikgcmVxdWlyZUZpZWxkKGZyb250TWF0dGVyLCBcInRyYW5zbGF0aW9uS2V5XCIsIGZpbGUucGF0aCk7XG5cbiAgICBjb25zdCBib2R5ID0gZnJvbnRNYXR0ZXIubGluZXMuc2xpY2UoZnJvbnRNYXR0ZXIuZW5kSW5kZXggKyAxKS5qb2luKFwiXFxuXCIpO1xuICAgIGlmICgvXFxbXFxbW15cXF1dK1xcXVxcXS8udGVzdChib2R5LnJlcGxhY2UoLyFcXFtcXFtbXlxcXV0rXFxdXFxdL2csIFwiXCIpKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBPYnNpZGlhbiB3aWtpbGlua3MgYXJlIG5vdCBwdWJsaXNoYWJsZSBNYXJrZG93bjogJHtmaWxlLnBhdGh9YCk7XG4gICAgfVxuXG4gICAgY29uc3QgY29udmVydGVkQm9keSA9IGF3YWl0IHRoaXMuY29udmVydEVtYmVkcyhib2R5LCBzbHVnLCBmaWxlLnBhdGgpO1xuICAgIGNvbnN0IHlhbWwgPSBmcm9udE1hdHRlci5saW5lcy5zbGljZSgwLCBmcm9udE1hdHRlci5lbmRJbmRleCArIDEpLmZsYXRNYXAoKGxpbmUpID0+IHtcbiAgICAgIGlmICgvXnB1Ymxpc2g6XFxzKi8udGVzdChsaW5lKSkgcmV0dXJuIFtdO1xuICAgICAgaWYgKC9eZHJhZnQ6XFxzKi8udGVzdChsaW5lKSkgcmV0dXJuIFtcImRyYWZ0OiBmYWxzZVwiXTtcbiAgICAgIHJldHVybiBbbGluZV07XG4gICAgfSk7XG4gICAgaWYgKCF5YW1sLnNvbWUoKGxpbmUpID0+IC9eZHJhZnQ6XFxzKi8udGVzdChsaW5lKSkpIHtcbiAgICAgIHlhbWwuc3BsaWNlKE1hdGgubWF4KDEsIHlhbWwubGVuZ3RoIC0gMSksIDAsIFwiZHJhZnQ6IGZhbHNlXCIpO1xuICAgIH1cblxuICAgIGNvbnN0IGZpbGVOYW1lID0gbGFuZyA9PT0gXCJlblwiID8gYCR7c2x1Z30uZW4ubWRgIDogYCR7c2x1Z30ubWRgO1xuICAgIGNvbnN0IGRlc3RpbmF0aW9uID0gam9pbih0aGlzLnNldHRpbmdzLnB1YmxpY1JlcG9QYXRoLCB0aGlzLnNldHRpbmdzLnBvc3RzRm9sZGVyLCBmaWxlTmFtZSk7XG4gICAgYXdhaXQgbWtkaXIoZGlybmFtZShkZXN0aW5hdGlvbiksIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuICAgIGF3YWl0IHdyaXRlRmlsZShkZXN0aW5hdGlvbiwgYCR7eWFtbC5qb2luKFwiXFxuXCIpfVxcbiR7Y29udmVydGVkQm9keS50cmltKCl9XFxuYCwgXCJ1dGY4XCIpO1xuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgYXN5bmMgY29udmVydEVtYmVkcyhib2R5OiBzdHJpbmcsIHNsdWc6IHN0cmluZywgc291cmNlUGF0aDogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgICBjb25zdCBlbWJlZFBhdHRlcm4gPSAvIVxcW1xcWyhbXlxcXV0rKVxcXVxcXS9nO1xuICAgIGxldCByZXN1bHQgPSBcIlwiO1xuICAgIGxldCBsYXN0SW5kZXggPSAwO1xuICAgIGZvciAoY29uc3QgbWF0Y2ggb2YgYm9keS5tYXRjaEFsbChlbWJlZFBhdHRlcm4pKSB7XG4gICAgICByZXN1bHQgKz0gYm9keS5zbGljZShsYXN0SW5kZXgsIG1hdGNoLmluZGV4KTtcbiAgICAgIGNvbnN0IHJhdyA9IG1hdGNoWzFdO1xuICAgICAgY29uc3QgW3RhcmdldFJhdywgYWx0UmF3XSA9IHJhdy5zcGxpdChcInxcIiwgMik7XG4gICAgICBjb25zdCB0YXJnZXQgPSBub3JtYWxpemVWYXVsdFBhdGgodGFyZ2V0UmF3LnRyaW0oKSk7XG4gICAgICBjb25zdCBhbHQgPSBhbHRSYXc/LnRyaW0oKSB8fCBiYXNlbmFtZSh0YXJnZXQpO1xuICAgICAgY29uc3Qgc291cmNlQXNzZXRQYXRoID0gYCR7bm9ybWFsaXplVmF1bHRQYXRoKHRoaXMuc2V0dGluZ3MuYXNzZXRGb2xkZXIpfS8ke3RhcmdldH1gO1xuICAgICAgY29uc3QgYXNzZXQgPSB0aGlzLmFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgoc291cmNlQXNzZXRQYXRoKTtcbiAgICAgIGlmICghKGFzc2V0IGluc3RhbmNlb2YgVEZpbGUpKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgRW1iZWRkZWQgYXNzZXQgbm90IGZvdW5kIGZvciAke3NvdXJjZVBhdGh9OiAke3Jhd30uIFB1dCBwdWJsaWMgYXNzZXRzIHVuZGVyICR7dGhpcy5zZXR0aW5ncy5hc3NldEZvbGRlcn0uYCk7XG4gICAgICB9XG4gICAgICBjb25zdCBieXRlcyA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LnJlYWRCaW5hcnkoYXNzZXQpO1xuICAgICAgY29uc3QgZmlsZU5hbWUgPSBiYXNlbmFtZSh0YXJnZXQpO1xuICAgICAgY29uc3QgZGVzdGluYXRpb24gPSBqb2luKHRoaXMuc2V0dGluZ3MucHVibGljUmVwb1BhdGgsIHRoaXMuc2V0dGluZ3MuaW1hZ2VGb2xkZXIsIHNsdWcsIGZpbGVOYW1lKTtcbiAgICAgIGF3YWl0IG1rZGlyKGRpcm5hbWUoZGVzdGluYXRpb24pLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcbiAgICAgIGF3YWl0IHdyaXRlRmlsZShkZXN0aW5hdGlvbiwgQnVmZmVyLmZyb20oYnl0ZXMpKTtcbiAgICAgIHJlc3VsdCArPSBgIVske2FsdH1dKC9pbWFnZXMvYmxvZy8ke3NsdWd9LyR7ZmlsZU5hbWV9KWA7XG4gICAgICBsYXN0SW5kZXggPSAobWF0Y2guaW5kZXggfHwgMCkgKyBtYXRjaFswXS5sZW5ndGg7XG4gICAgfVxuICAgIHJlc3VsdCArPSBib2R5LnNsaWNlKGxhc3RJbmRleCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIGFzeW5jIGVuc3VyZVB1Ymxpc2hEZXBlbmRlbmNpZXMoKSB7XG4gICAgYXdhaXQgZW5zdXJlQ29tbWFuZChcImdpdFwiLCBbXCItLXZlcnNpb25cIl0pO1xuICAgIGF3YWl0IGVuc3VyZUNvbW1hbmQoXCJnaFwiLCBbXCItLXZlcnNpb25cIl0pO1xuICAgIGF3YWl0IHRoaXMuY2hlY2tHaXRodWJMb2dpbihmYWxzZSk7XG4gIH1cblxuICBhc3luYyBjaGVja0Rlc2t0b3BEZXBlbmRlbmNpZXMoc2hvd05vdGljZSA9IGZhbHNlKTogUHJvbWlzZTxDb21tYW5kU3RhdHVzW10+IHtcbiAgICBjb25zdCBjaGVja3M6IENvbW1hbmRTdGF0dXNbXSA9IFtcbiAgICAgIGF3YWl0IGNoZWNrQ29tbWFuZChcImdpdFwiLCBbXCItLXZlcnNpb25cIl0pLFxuICAgICAgYXdhaXQgY2hlY2tDb21tYW5kKFwiZ2hcIiwgW1wiLS12ZXJzaW9uXCJdKSxcbiAgICAgIGF3YWl0IGNoZWNrQ29tbWFuZChcIm5vZGVcIiwgW1wiLS12ZXJzaW9uXCJdKSxcbiAgICAgIGF3YWl0IGNoZWNrQ29tbWFuZChcIm5wbVwiLCBbXCItLXZlcnNpb25cIl0pLFxuICAgICAgYXdhaXQgY2hlY2tDb21tYW5kKFwid2luZ2V0XCIsIFtcIi0tdmVyc2lvblwiXSksXG4gICAgXTtcbiAgICBpZiAoc2hvd05vdGljZSkge1xuICAgICAgY29uc3QgbWlzc2luZyA9IGNoZWNrcy5maWx0ZXIoKGNoZWNrKSA9PiAhY2hlY2suYXZhaWxhYmxlKS5tYXAoKGNoZWNrKSA9PiBjaGVjay5uYW1lKTtcbiAgICAgIGlmIChtaXNzaW5nLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICBuZXcgTm90aWNlKFwiQWxsIGRlc2t0b3AgZGVwZW5kZW5jaWVzIGFyZSBpbnN0YWxsZWQ6IGdpdCwgZ2gsIG5vZGUsIG5wbSwgd2luZ2V0LlwiKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG5ldyBOb3RpY2UoYE1pc3NpbmcgZGVwZW5kZW5jaWVzOiAke21pc3Npbmcuam9pbihcIiwgXCIpfS4gUnVuIFwiSW5zdGFsbCBtaXNzaW5nIGRlc2t0b3AgZGVwZW5kZW5jaWVzXCIuYCwgODAwMCk7XG4gICAgICB9XG4gICAgICBjb25zb2xlLnRhYmxlKGNoZWNrcyk7XG4gICAgfVxuICAgIHJldHVybiBjaGVja3M7XG4gIH1cblxuICBhc3luYyBpbnN0YWxsTWlzc2luZ0Rlc2t0b3BEZXBlbmRlbmNpZXMoKSB7XG4gICAgY29uc3QgY2hlY2tzID0gYXdhaXQgdGhpcy5jaGVja0Rlc2t0b3BEZXBlbmRlbmNpZXMoZmFsc2UpO1xuICAgIGNvbnN0IG1pc3NpbmcgPSBuZXcgU2V0KGNoZWNrcy5maWx0ZXIoKGNoZWNrKSA9PiAhY2hlY2suYXZhaWxhYmxlKS5tYXAoKGNoZWNrKSA9PiBjaGVjay5uYW1lKSk7XG4gICAgaWYgKG1pc3Npbmcuc2l6ZSA9PT0gMCkge1xuICAgICAgbmV3IE5vdGljZShcIkFsbCBkZXNrdG9wIGRlcGVuZGVuY2llcyBhcmUgYWxyZWFkeSBpbnN0YWxsZWQuXCIpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAobWlzc2luZy5oYXMoXCJ3aW5nZXRcIikpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIndpbmdldCBpcyBtaXNzaW5nLiBJbnN0YWxsIEFwcCBJbnN0YWxsZXIgZnJvbSBNaWNyb3NvZnQgU3RvcmUsIHRoZW4gcmVydW4gdGhpcyBjb21tYW5kLlwiKTtcbiAgICB9XG5cbiAgICBjb25zdCBwYWNrYWdlczogQXJyYXk8W3N0cmluZywgc3RyaW5nLCBzdHJpbmdbXT9dPiA9IFtcbiAgICAgIFtcImdpdFwiLCBcIkdpdC5HaXRcIl0sXG4gICAgICBbXCJnaFwiLCBcIkdpdEh1Yi5jbGlcIl0sXG4gICAgICBbXCJub2RlXCIsIFwiT3BlbkpTLk5vZGVKUy5MVFNcIiwgW1wibm9kZVwiLCBcIm5wbVwiXV0sXG4gICAgXTtcblxuICAgIGZvciAoY29uc3QgW2NvbW1hbmQsIHBhY2thZ2VJZCwgcHJvdmlkZWRDb21tYW5kcyA9IFtjb21tYW5kXV0gb2YgcGFja2FnZXMpIHtcbiAgICAgIGlmICghcHJvdmlkZWRDb21tYW5kcy5zb21lKChwcm92aWRlZENvbW1hbmQpID0+IG1pc3NpbmcuaGFzKHByb3ZpZGVkQ29tbWFuZCkpKSBjb250aW51ZTtcbiAgICAgIG5ldyBOb3RpY2UoYEluc3RhbGxpbmcgJHtwYWNrYWdlSWR9IHdpdGggd2luZ2V0LiBBIHN5c3RlbSBwcm9tcHQgbWF5IGFwcGVhci5gLCA4MDAwKTtcbiAgICAgIGF3YWl0IHJ1bkNvbW1hbmQoXCJ3aW5nZXRcIiwgW1xuICAgICAgICBcImluc3RhbGxcIixcbiAgICAgICAgXCItLWlkXCIsXG4gICAgICAgIHBhY2thZ2VJZCxcbiAgICAgICAgXCItZVwiLFxuICAgICAgICBcIi0tc291cmNlXCIsXG4gICAgICAgIFwid2luZ2V0XCIsXG4gICAgICAgIFwiLS1hY2NlcHQtcGFja2FnZS1hZ3JlZW1lbnRzXCIsXG4gICAgICAgIFwiLS1hY2NlcHQtc291cmNlLWFncmVlbWVudHNcIixcbiAgICAgIF0pO1xuICAgIH1cblxuICAgIG5ldyBOb3RpY2UoXCJEZXBlbmRlbmN5IGluc3RhbGxhdGlvbiBmaW5pc2hlZC4gUmVzdGFydCBPYnNpZGlhbiBpZiBuZXcgY29tbWFuZHMgYXJlIG5vdCBkZXRlY3RlZC5cIiwgODAwMCk7XG4gIH1cblxuICBhc3luYyBjaGVja0dpdGh1YkxvZ2luKHNob3dOb3RpY2UgPSBmYWxzZSkge1xuICAgIGF3YWl0IGVuc3VyZUNvbW1hbmQoXCJnaFwiLCBbXCItLXZlcnNpb25cIl0pO1xuICAgIGNvbnN0IHN0YXR1cyA9IGF3YWl0IHJ1bkNvbW1hbmQoXCJnaFwiLCBbXCJhdXRoXCIsIFwic3RhdHVzXCIsIFwiLS1ob3N0bmFtZVwiLCB0aGlzLnNldHRpbmdzLmdpdGh1Ykhvc3RdKTtcbiAgICBpZiAoc2hvd05vdGljZSkge1xuICAgICAgbmV3IE5vdGljZShgR2l0SHViIGxvZ2luIGlzIGF2YWlsYWJsZSBmb3IgJHt0aGlzLnNldHRpbmdzLmdpdGh1Ykhvc3R9LmApO1xuICAgICAgY29uc29sZS5sb2coc3RhdHVzKTtcbiAgICB9XG4gICAgcmV0dXJuIHN0YXR1cztcbiAgfVxuXG4gIGFzeW5jIGxvZ2luVG9HaXRodWIoKSB7XG4gICAgYXdhaXQgZW5zdXJlQ29tbWFuZChcImdoXCIsIFtcIi0tdmVyc2lvblwiXSk7XG4gICAgbmV3IE5vdGljZShcIk9wZW5pbmcgR2l0SHViIGxvZ2luIGluIHlvdXIgYnJvd3Nlci4gRmluaXNoIHRoZSBHaXRIdWIgQ0xJIHByb21wdCB0byBjb250aW51ZS5cIiwgODAwMCk7XG4gICAgYXdhaXQgcnVuQ29tbWFuZChcImdoXCIsIFtcbiAgICAgIFwiYXV0aFwiLFxuICAgICAgXCJsb2dpblwiLFxuICAgICAgXCItLWhvc3RuYW1lXCIsXG4gICAgICB0aGlzLnNldHRpbmdzLmdpdGh1Ykhvc3QsXG4gICAgICBcIi0tZ2l0LXByb3RvY29sXCIsXG4gICAgICBcImh0dHBzXCIsXG4gICAgICBcIi0td2ViXCIsXG4gICAgICBcIi0tc2tpcC1zc2gta2V5XCIsXG4gICAgXSk7XG4gICAgYXdhaXQgdGhpcy5jaGVja0dpdGh1YkxvZ2luKHRydWUpO1xuICB9XG5cbiAgcmVwb3J0RXJyb3IoZXJyb3I6IHVua25vd24pIHtcbiAgICBjb25zb2xlLmVycm9yKGVycm9yKTtcbiAgICBuZXcgTm90aWNlKGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKSwgODAwMCk7XG4gIH1cbn1cblxuY2xhc3MgSHVnb1B1Ymxpc2hlclNldHRpbmdUYWIgZXh0ZW5kcyBQbHVnaW5TZXR0aW5nVGFiIHtcbiAgcGx1Z2luOiBIdWdvR2l0UHVibGlzaGVyUGx1Z2luO1xuXG4gIGNvbnN0cnVjdG9yKGFwcDogQXBwLCBwbHVnaW46IEh1Z29HaXRQdWJsaXNoZXJQbHVnaW4pIHtcbiAgICBzdXBlcihhcHAsIHBsdWdpbik7XG4gICAgdGhpcy5wbHVnaW4gPSBwbHVnaW47XG4gIH1cblxuICBkaXNwbGF5KCkge1xuICAgIGNvbnN0IHsgY29udGFpbmVyRWwgfSA9IHRoaXM7XG4gICAgY29udGFpbmVyRWwuZW1wdHkoKTtcbiAgICBjb250YWluZXJFbC5jcmVhdGVFbChcImgyXCIsIHsgdGV4dDogXCJIdWdvIEdpdCBQdWJsaXNoZXJcIiB9KTtcblxuICAgIHRoaXMudGV4dFNldHRpbmcoXCJSZWFkeSBmb2xkZXJcIiwgXCJPbmx5IG5vdGVzIGluIHRoaXMgZm9sZGVyIGFyZSBleHBvcnRlZC5cIiwgXCJyZWFkeUZvbGRlclwiKTtcbiAgICB0aGlzLnRleHRTZXR0aW5nKFwiQXNzZXQgZm9sZGVyXCIsIFwiUHVibGljLXNhZmUgT2JzaWRpYW4gYXNzZXRzIHVzZWQgYnkgZW1iZWRzLlwiLCBcImFzc2V0Rm9sZGVyXCIpO1xuICAgIHRoaXMudGV4dFNldHRpbmcoXCJQdWJsaWMgcmVwbyBwYXRoXCIsIFwiTG9jYWwgcGF0aCB0byB0aGUgcHVibGljIEh1Z28gcmVwb3NpdG9yeS5cIiwgXCJwdWJsaWNSZXBvUGF0aFwiKTtcbiAgICB0aGlzLnRleHRTZXR0aW5nKFwiR2l0SHViIGhvc3RcIiwgXCJVc3VhbGx5IGdpdGh1Yi5jb20uIENoYW5nZSBvbmx5IGZvciBHaXRIdWIgRW50ZXJwcmlzZS5cIiwgXCJnaXRodWJIb3N0XCIpO1xuICAgIHRoaXMudGV4dFNldHRpbmcoXCJDb21taXQgbWVzc2FnZVwiLCBcIlVzZWQgd2hlbiBhdXRvLXB1c2hpbmcgZnJvbSBPYnNpZGlhbi5cIiwgXCJjb21taXRNZXNzYWdlXCIpO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZShcIkF1dG8gcHVzaFwiKVxuICAgICAgLnNldERlc2MoXCJSdW4gZ2l0IGFkZCwgY29tbWl0LCBhbmQgcHVzaCBhZnRlciBleHBvcnQuXCIpXG4gICAgICAuYWRkVG9nZ2xlKCh0b2dnbGUpID0+XG4gICAgICAgIHRvZ2dsZS5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5hdXRvUHVzaCkub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MuYXV0b1B1c2ggPSB2YWx1ZTtcbiAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgfSksXG4gICAgICApO1xuICB9XG5cbiAgdGV4dFNldHRpbmcobmFtZTogc3RyaW5nLCBkZXNjOiBzdHJpbmcsIGtleToga2V5b2YgUHVibGlzaGVyU2V0dGluZ3MpIHtcbiAgICBuZXcgU2V0dGluZyh0aGlzLmNvbnRhaW5lckVsKVxuICAgICAgLnNldE5hbWUobmFtZSlcbiAgICAgIC5zZXREZXNjKGRlc2MpXG4gICAgICAuYWRkVGV4dCgodGV4dCkgPT5cbiAgICAgICAgdGV4dC5zZXRWYWx1ZShTdHJpbmcodGhpcy5wbHVnaW4uc2V0dGluZ3Nba2V5XSkpLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgICh0aGlzLnBsdWdpbi5zZXR0aW5nc1trZXldIGFzIHN0cmluZykgPSB2YWx1ZTtcbiAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgfSksXG4gICAgICApO1xuICB9XG59XG5cbmZ1bmN0aW9uIHBhcnNlRnJvbnRNYXR0ZXIoY29udGVudDogc3RyaW5nLCBwYXRoOiBzdHJpbmcpOiBGcm9udE1hdHRlciB7XG4gIGNvbnN0IGxpbmVzID0gY29udGVudC5zcGxpdCgvXFxyP1xcbi8pO1xuICBpZiAobGluZXMubGVuZ3RoIDwgMyB8fCBsaW5lc1swXS50cmltKCkgIT09IFwiLS0tXCIpIHRocm93IG5ldyBFcnJvcihgTWlzc2luZyBZQU1MIGZyb250bWF0dGVyOiAke3BhdGh9YCk7XG4gIGNvbnN0IGVuZEluZGV4ID0gbGluZXMuZmluZEluZGV4KChsaW5lLCBpbmRleCkgPT4gaW5kZXggPiAwICYmIGxpbmUudHJpbSgpID09PSBcIi0tLVwiKTtcbiAgaWYgKGVuZEluZGV4IDwgMCkgdGhyb3cgbmV3IEVycm9yKGBVbmNsb3NlZCBZQU1MIGZyb250bWF0dGVyOiAke3BhdGh9YCk7XG4gIGNvbnN0IG1hcDogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHt9O1xuICBmb3IgKGxldCBpID0gMTsgaSA8IGVuZEluZGV4OyBpICs9IDEpIHtcbiAgICBjb25zdCBtYXRjaCA9IGxpbmVzW2ldLm1hdGNoKC9eKFtBLVphLXowLTlfLV0rKTpcXHMqKC4qKSQvKTtcbiAgICBpZiAobWF0Y2gpIG1hcFttYXRjaFsxXV0gPSBtYXRjaFsyXS50cmltKCkucmVwbGFjZSgvXlwifFwiJC9nLCBcIlwiKTtcbiAgfVxuICByZXR1cm4geyBtYXAsIGxpbmVzLCBlbmRJbmRleCB9O1xufVxuXG5mdW5jdGlvbiByZXF1aXJlRmllbGQoZnJvbnRNYXR0ZXI6IEZyb250TWF0dGVyLCBmaWVsZDogc3RyaW5nLCBwYXRoOiBzdHJpbmcpIHtcbiAgaWYgKCFmcm9udE1hdHRlci5tYXBbZmllbGRdKSB0aHJvdyBuZXcgRXJyb3IoYFJlcXVpcmVkIGZyb250bWF0dGVyIGZpZWxkICcke2ZpZWxkfScgaXMgbWlzc2luZzogJHtwYXRofWApO1xufVxuXG5mdW5jdGlvbiBhc3NlcnRBbGxvd2VkU291cmNlKHBhdGg6IHN0cmluZywgcmVhZHlGb2xkZXI6IHN0cmluZykge1xuICBjb25zdCBub3JtYWxpemVkID0gbm9ybWFsaXplVmF1bHRQYXRoKHBhdGgpO1xuICBjb25zdCByZWFkeSA9IG5vcm1hbGl6ZVZhdWx0UGF0aChyZWFkeUZvbGRlcik7XG4gIGlmICghbm9ybWFsaXplZC5zdGFydHNXaXRoKGAke3JlYWR5fS9gKSkgdGhyb3cgbmV3IEVycm9yKGBPbmx5IG5vdGVzIHVuZGVyICR7cmVhZHlGb2xkZXJ9IGNhbiBiZSBleHBvcnRlZDogJHtwYXRofWApO1xuICBmb3IgKGNvbnN0IGZvcmJpZGRlbiBvZiBbXCJfIVByaXZhdGVcIiwgXCJfYXR0YWNobWVudHNcIiwgXCIub2JzaWRpYW5cIiwgXCIuc21hcnQtZW52XCIsIFwiLnNtdGNtcF9qc29uX2RiXCIsIFwiQ2hhdHNcIiwgXCJFeGNhbGlkcmF3XCJdKSB7XG4gICAgaWYgKG5vcm1hbGl6ZWQuc3BsaXQoXCIvXCIpLmluY2x1ZGVzKGZvcmJpZGRlbikpIHRocm93IG5ldyBFcnJvcihgRm9yYmlkZGVuIHBhdGggYXBwZWFyZWQgaW4gZXhwb3J0IGlucHV0OiAke3BhdGh9YCk7XG4gIH1cbn1cblxuZnVuY3Rpb24gbm9ybWFsaXplVmF1bHRQYXRoKHBhdGg6IHN0cmluZykge1xuICByZXR1cm4gcGF0aC5yZXBsYWNlKC9cXFxcL2csIFwiL1wiKS5yZXBsYWNlKC9eXFwvK3xcXC8rJC9nLCBcIlwiKTtcbn1cblxuZnVuY3Rpb24gcnVuR2l0KGN3ZDogc3RyaW5nLCBhcmdzOiBzdHJpbmdbXSkge1xuICByZXR1cm4gcnVuQ29tbWFuZChcImdpdFwiLCBhcmdzLCBjd2QpLnRoZW4oKCkgPT4gdW5kZWZpbmVkKTtcbn1cblxuZnVuY3Rpb24gZW5zdXJlQ29tbWFuZChjb21tYW5kOiBzdHJpbmcsIGFyZ3M6IHN0cmluZ1tdKSB7XG4gIHJldHVybiBydW5Db21tYW5kKGNvbW1hbmQsIGFyZ3MpLmNhdGNoKChlcnJvcikgPT4ge1xuICAgIHRocm93IG5ldyBFcnJvcihgJHtjb21tYW5kfSBpcyByZXF1aXJlZCBidXQgd2FzIG5vdCBmb3VuZC4gUnVuIFwiSW5zdGFsbCBtaXNzaW5nIGRlc2t0b3AgZGVwZW5kZW5jaWVzXCIgaW4gdGhpcyBwbHVnaW4uYCk7XG4gIH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiBjaGVja0NvbW1hbmQoY29tbWFuZDogc3RyaW5nLCBhcmdzOiBzdHJpbmdbXSk6IFByb21pc2U8Q29tbWFuZFN0YXR1cz4ge1xuICB0cnkge1xuICAgIGNvbnN0IGRldGFpbCA9IGF3YWl0IHJ1bkNvbW1hbmQoY29tbWFuZCwgYXJncyk7XG4gICAgcmV0dXJuIHsgbmFtZTogY29tbWFuZCwgYXZhaWxhYmxlOiB0cnVlLCBkZXRhaWw6IGRldGFpbC50cmltKCkuc3BsaXQoL1xccj9cXG4vKVswXSB8fCBcImluc3RhbGxlZFwiIH07XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgcmV0dXJuIHsgbmFtZTogY29tbWFuZCwgYXZhaWxhYmxlOiBmYWxzZSwgZGV0YWlsOiBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZS50cmltKCkgOiBTdHJpbmcoZXJyb3IpIH07XG4gIH1cbn1cblxuZnVuY3Rpb24gcnVuQ29tbWFuZChjb21tYW5kOiBzdHJpbmcsIGFyZ3M6IHN0cmluZ1tdLCBjd2Q/OiBzdHJpbmcpIHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlPHN0cmluZz4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgIGV4ZWNGaWxlKGNvbW1hbmQsIGFyZ3MsIHsgY3dkIH0sIChlcnJvciwgc3Rkb3V0LCBzdGRlcnIpID0+IHtcbiAgICAgIGlmIChlcnJvcikge1xuICAgICAgICByZWplY3QobmV3IEVycm9yKGAke3N0ZGVyciB8fCBzdGRvdXQgfHwgZXJyb3IubWVzc2FnZX1gKSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIHJlc29sdmUoYCR7c3Rkb3V0fSR7c3RkZXJyfWApO1xuICAgIH0pO1xuICB9KTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLHNCQUFzRTtBQUN0RSwyQkFBeUI7QUFDekIsc0JBQWlDO0FBQ2pDLGtCQUFtRDtBQWFuRCxJQUFNLG1CQUFzQztBQUFBLEVBQzFDLGFBQWE7QUFBQSxFQUNiLGFBQWE7QUFBQSxFQUNiLGdCQUFnQjtBQUFBLEVBQ2hCLGFBQWE7QUFBQSxFQUNiLGFBQWE7QUFBQSxFQUNiLFlBQVk7QUFBQSxFQUNaLFVBQVU7QUFBQSxFQUNWLGVBQWU7QUFDakI7QUFjQSxJQUFxQix5QkFBckIsY0FBb0QsdUJBQU87QUFBQSxFQUN6RCxXQUE4QjtBQUFBLEVBRTlCLE1BQU0sU0FBUztBQUNiLFVBQU0sS0FBSyxhQUFhO0FBQ3hCLFNBQUssY0FBYyxJQUFJLHdCQUF3QixLQUFLLEtBQUssSUFBSSxDQUFDO0FBRTlELFNBQUssV0FBVztBQUFBLE1BQ2QsSUFBSTtBQUFBLE1BQ0osTUFBTTtBQUFBLE1BQ04sZUFBZSxDQUFDLGFBQWE7QUFDM0IsY0FBTSxPQUFPLEtBQUssSUFBSSxVQUFVLGNBQWM7QUFDOUMsWUFBSSxDQUFDLFFBQVEsS0FBSyxjQUFjLEtBQU0sUUFBTztBQUM3QyxZQUFJLENB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
