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

  /** List all local branches, current first, with detached HEAD support. */
  async listBranches(): Promise<{ current: string | null; branches: string[]; detached: boolean }> {
    if (!this.root || !this.isRepo) return { current: null, branches: [], detached: false };
    let current: string | null = null;
    let detached = false;
    try {
      const { stdout } = await execFileAsync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: this.root });
      const r = stdout.trim();
      if (r === "HEAD") { detached = true; current = null; }
      else current = r || null;
    } catch { detached = false; }
    // Fallback for current via getBranch if rev-parse fails
    if (!current && !detached) {
      try { current = await this.getBranch(); } catch {}
    }
    let branches: string[] = [];
    try {
      const { stdout } = await execFileAsync("git", ["branch", "--format=%(refname:short)"], { cwd: this.root });
      branches = stdout.split("\n").map((s) => s.trim()).filter(Boolean).filter((b) => !b.startsWith("(") );
      branches.sort((a, b) => a.localeCompare(b));
      // keep current first for convenience, then alphabetical rest is already sorted
      if (current && branches.includes(current)) {
        branches = [current, ...branches.filter((b) => b !== current)];
      }
    } catch {
      try {
        const out = await this.git!.branchLocal();
        branches = out.all.filter((b) => !b.startsWith("remotes/"));
        branches.sort((a, b) => a.localeCompare(b));
        if (current && branches.includes(current)) branches = [current, ...branches.filter((b) => b !== current)];
        detached = !!out.detached;
        current = out.current || current;
      } catch { branches = current ? [current] : []; }
    }
    return { current, branches, detached };
  }

  /** List branches matching `opencode/*`, most-recent first. */
  async listOpencodeBranches(): Promise<string[]> {
    if (!this.root || !this.isRepo) return [];
    try {
      // Try git-sorted by committerdate first, then enforce lexical descending
      // as a stable tie-breaker for session branches that share the same commit
      // (and thus same committerdate). Session names embed YYYYMMDD-HHMMSS so
      // lexical descending == most-recent first.
      const { stdout } = await execFileAsync("git", ["branch", "--list", "opencode/*", "--sort=-committerdate", "--format=%(refname:short)"], { cwd: this.root });
      const branches = stdout.split("\n").map((s) => s.trim()).filter(Boolean);
      // If multiple branches share the same committerdate, git order is arbitrary.
      // Re-sort session branches lexically descending to surface the newest session.
      branches.sort((a, b) => b.localeCompare(a));
      return branches;
    } catch {
      // Fallback via simple-git if format flag unsupported on old git
      try {
        const out = await this.git!.branchLocal();
        const branches = out.all.filter((b) => b.startsWith("opencode/"));
        branches.sort((a, b) => b.localeCompare(a));
        return branches;
      } catch { return []; }
    }
  }

  /** Checkout an existing local branch. Returns previous branch name. */
  async checkoutBranch(name: string): Promise<{ previous: string | null; branch: string; error?: string }> {
    if (!this.root || !this.isRepo) return { previous: null, branch: name, error: "Not a git repository" };
    let previous: string | null = null;
    try { previous = await this.getBranch(); } catch {}
    try {
      await execFileAsync("git", ["checkout", name], { cwd: this.root });
      return { previous, branch: name };
    } catch (e: any) {
      const msg: string = e?.stderr ?? e?.stdout ?? e?.message ?? String(e);
      return { previous, branch: name, error: msg.trim().slice(0, 500) };
    }
  }

  /**
   * Create an isolated session branch for the current opencode session.
   * Default behaviour is to create `opencode/session-YYYYMMDD-HHMMSS-xxxx`
   * from current HEAD via `git checkout -b`. Dirty working tree is carried
   * over (git allows checkout -b with modifications). The branch must be
   * merged manually — this prevents production code (main/master) being
   * overwritten directly.
   *
   * Returns {created, branch, previous}. No-op if not a git repo.
   */
  async createSessionBranch(): Promise<{ created: boolean; branch: string | null; previous: string | null; error?: string }> {
    if (!this.root || !this.isRepo) return { created: false, branch: null, previous: null };
    let previous: string | null = null;
    try { previous = await this.getBranch(); } catch {}
    // Fallback for detached HEAD: getBranch returns null, but we still want to branch from HEAD
    for (let attempt = 0; attempt < 3; attempt++) {
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
      const rand = Math.random().toString(36).slice(2, 6);
      const name = `opencode/session-${stamp}-${rand}`;
      try {
        await execFileAsync("git", ["checkout", "-b", name], { cwd: this.root });
        // refresh internal cached branch state is lazy via getStatus(); nothing else needed
        return { created: true, branch: name, previous };
      } catch (e: any) {
        const msg: string = e?.stderr ?? e?.stdout ?? e?.message ?? String(e);
        if (msg.includes("already exists") && attempt < 2) continue;
        return { created: false, branch: null, previous, error: msg.trim().slice(0, 500) };
      }
    }
    return { created: false, branch: null, previous, error: "failed to generate unique branch name" };
  }
}
export const gitService = new GitService();
