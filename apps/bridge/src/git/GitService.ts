import { simpleGit, type SimpleGit, type StatusResult } from "simple-git";
import path from "node:path";
import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execFileAsync = promisify(execFile);

export type GitFileState = { path: string; index: string; working: string; status: "modified"|"added"|"deleted"|"renamed"|"untracked"|"conflicted"|"staged" };

export class GitService {
  private git: SimpleGit | null = null;
  /** Git toplevel — cwd for git commands. Internal only; never the workspace root. */
  root: string | null = null;
  /**
   * Posix path from the git toplevel down to the workspace ("" when identical).
   * The workspace stays exactly what the user opened; git paths are mapped
   * through this prefix instead of hijacking the workspace root.
   */
  workspacePrefix = "";
  isRepo = false;

  async setRoot(workspaceDir: string) {
    const ws = path.resolve(workspaceDir);
    let top: string | null = null;
    try {
      const { stdout } = await execFileAsync("git", ["rev-parse", "--show-toplevel"], { cwd: ws });
      top = stdout.trim();
      this.isRepo = true;
    } catch {
      try {
        const st = await fs.stat(path.join(ws, ".git"));
        if (st) { top = ws; this.isRepo = true; }
      } catch { top = ws; this.isRepo = false; }
    }
    this.root = top ?? ws;
    this.workspacePrefix = "";
    if (this.isRepo && top) {
      this.workspacePrefix = await this.prefixOf(top, ws);
    }
    if (this.root) this.git = simpleGit(this.root);
    return { root: this.root, isRepo: this.isRepo };
  }

  /** Posix rel path from git toplevel to workspace, "" when identical/outside. */
  private async prefixOf(top: string, ws: string): Promise<string> {
    const rel = path.relative(top, ws).split(path.sep).join("/");
    if (rel === "" || rel === ".") return "";
    if (!rel.startsWith("..")) return rel;
    // Symlinked segments (e.g. /tmp -> /private/tmp) can fake an "outside";
    // retry with real paths before giving up.
    try {
      const [realTop, realWs] = await Promise.all([fs.realpath(top), fs.realpath(ws)]);
      const r2 = path.relative(realTop, realWs).split(path.sep).join("/");
      if (r2 === "" || r2 === ".") return "";
      if (!r2.startsWith("..")) return r2;
    } catch {}
    return "";
  }

  /** Map a toplevel-relative git path to workspace-relative; null if outside. */
  private toWorkspace(p: string): string | null {
    const norm = p.split(path.sep).join("/");
    if (!this.workspacePrefix) return norm;
    if (norm === this.workspacePrefix) return null; // the workspace dir itself
    if (!norm.startsWith(this.workspacePrefix + "/")) return null;
    return norm.slice(this.workspacePrefix.length + 1);
  }

  /** Map a workspace-relative path back to toplevel-relative for git commands. */
  private fromWorkspace(relPath: string): string {
    const norm = relPath.split(path.sep).join("/").replace(/^\/+/, "");
    return this.workspacePrefix ? `${this.workspacePrefix}/${norm}` : norm;
  }

  async getStatus() {
    if (!this.git || !this.isRepo) return { isGitRepository: false as const, branch: null as string | null, files: [] as GitFileState[], ahead: 0, behind: 0, state: "clean" as const };
    let s: StatusResult;
    try { s = await this.git.status(); }
    catch { return { isGitRepository: false as const, branch: null, files: [], ahead: 0, behind: 0, state: "clean" as const }; }
    const files: GitFileState[] = [];
    for (const f of s.files) {
      const rel = this.toWorkspace(f.path);
      if (rel === null) continue; // changed file is outside the open workspace
      const st = f.working_dir === "D" || f.index === "D" ? "deleted" as const
        : f.working_dir === "?" || f.index === "?" ? "untracked" as const
        : f.working_dir === "U" || f.index === "U" ? "conflicted" as const
        : f.index === "A" ? "added" as const
        : f.index === "R" ? "renamed" as const
        : "modified" as const;
      const entry: GitFileState = { path: rel, index: f.index, working: f.working_dir, status: st };
      const from = (f as { from?: unknown }).from;
      if (typeof from === "string") {
        const fromRel = this.toWorkspace(from);
        if (fromRel !== null) (entry as { from?: string }).from = fromRel;
      }
      files.push(entry);
    }
    let state: "clean"|"modified"|"conflicts"|"detached" = files.length ? "modified" : "clean";
    if (files.some((f) => f.status === "conflicted")) state = "conflicts";
    if (s.detached) state = "detached";
    return { isGitRepository: true as const, branch: s.current, files, ahead: s.ahead, behind: s.behind, state };
  }

  async getBranch() {
    if (!this.root) return null;
    try { const { stdout } = await execFileAsync("git", ["branch", "--show-current"], { cwd: this.root }); return stdout.trim() || null; }
    catch { return null; }
  }

  async getDiff(relPath: string, cached = false) {
    if (!this.root) throw new Error("No repo");
    const full = this.fromWorkspace(relPath);
    const args = cached ? ["diff", "--cached", "--", full] : ["diff", "--", full];
    try { const { stdout } = await execFileAsync("git", args, { cwd: this.root, maxBuffer: 10 * 1024 * 1024 }); return stdout; }
    catch (e: any) { return e.stdout ?? ""; }
  }

  async getHeadFile(relPath: string): Promise<string | null> {
    if (!this.root) return null;
    try { const { stdout } = await execFileAsync("git", ["show", `HEAD:${this.fromWorkspace(relPath)}`], { cwd: this.root, maxBuffer: 10 * 1024 * 1024 }); return stdout; }
    catch { return null; }
  }
}
export const gitService = new GitService();
