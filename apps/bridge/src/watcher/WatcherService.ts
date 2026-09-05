import chokidar, { type FSWatcher } from "chokidar";
import Ignore from "ignore";
import fs from "node:fs/promises";
import path from "node:path";
export type FileEvent = { type: "file.created" | "file.modified" | "file.deleted"; path: string };
const DEFAULT_IGNORED = [/node_modules/, /\.git\//, /(^|\/)dist\//, /(^|\/)build\//, /(^|\/)coverage\//, /\.cache/, /\.next/, /\.nuxt/, /(^|\/)target\//, /__pycache__/];
// Dot-directories (except a small allowlist) explode watch size when a large
// folder is opened; ignore them the same way buildTree skips them.
const DOT_DIR_ALLOW = new Set([".github", ".vscode"]);
export class WatcherService {
  private watcher: FSWatcher | null = null;
  private timers = new Map<string, NodeJS.Timeout>();
  private gitTimer: NodeJS.Timeout | null = null;
  onEvent: (e: FileEvent) => void = () => {};
  onGitRefresh: () => void = () => {};
  root: string | null = null;
  async start(root: string) {
    await this.stop();
    this.root = path.resolve(root);
    let ig = Ignore();
    try { const gi = await fs.readFile(path.join(this.root, ".gitignore"), "utf8"); ig = ig.add(gi); } catch {}
    this.watcher = chokidar.watch(this.root, {
      depth: 10,
      ignored: [(p: string) => {
        const rel = path.relative(this.root!, p) || ".";
        if (rel === ".") return false;
        for (const re of DEFAULT_IGNORED) if (re.test(rel)) return true;
        // Ignore contents of dot-directories except allowlist (match
        // buildTree). Only parent segments are checked so dotfiles
        // themselves (e.g. .env, .gitignore) are still watched.
        const segs = rel.split("/");
        for (const seg of segs.slice(0, -1)) {
          if (seg.startsWith(".") && seg.length > 1 && !DOT_DIR_ALLOW.has(seg)) return true;
        }
        try { if (rel && ig.ignores(rel)) return true; } catch {}
        return false;
      }],
      ignoreInitial: true, persistent: true, ignorePermissionErrors: true,
    });
    const debounced = (type: FileEvent["type"], absPath: string) => {
      const rel = path.relative(this.root!, absPath).split(path.sep).join("/");
      const key = type + ":" + rel;
      if (this.timers.has(key)) clearTimeout(this.timers.get(key)!);
      this.timers.set(key, setTimeout(() => { this.timers.delete(key); this.onEvent({ type, path: rel }); this.scheduleGitRefresh(); }, 120));
    };
    this.watcher.on("add", (p) => debounced("file.created", p));
    this.watcher.on("change", (p) => debounced("file.modified", p));
    this.watcher.on("unlink", (p) => debounced("file.deleted", p));
    this.watcher.on("error", () => {});
  }
  private scheduleGitRefresh() {
    if (this.gitTimer) clearTimeout(this.gitTimer);
    this.gitTimer = setTimeout(() => { this.gitTimer = null; this.onGitRefresh(); }, 350);
  }
  async stop() {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
    if (this.gitTimer) { clearTimeout(this.gitTimer); this.gitTimer = null; }
    if (this.watcher) { await this.watcher.close(); this.watcher = null; }
  }
}
export const watcherService = new WatcherService();
