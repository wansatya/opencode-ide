import { simpleGit, type SimpleGit, type StatusResult } from "simple-git";
import path from "node:path";
import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execFileAsync = promisify(execFile);

export type GitFileState = { path: string; index: string; working: string; status: "modified"|"added"|"deleted"|"renamed"|"untracked"|"conflicted"|"staged" };

export class GitService {
  private git: SimpleGit | null = null;
  root: string | null = null;
  isRepo = false;

  async setRoot(dir: string) {
    let cur = path.resolve(dir);
    try {
      const { stdout } = await execFileAsync("git", ["rev-parse", "--show-toplevel"], { cwd: cur });
      this.root = stdout.trim();
      this.isRepo = true;
    } catch {
      try {
        const st = await fs.stat(path.join(cur, ".git"));
        if (st) { this.root = cur; this.isRepo = true; }
      } catch { this.root = cur; this.isRepo = false; }
    }
    if (this.root) this.git = simpleGit(this.root);
    return { root: this.root, isRepo: this.isRepo };
  }

  async getStatus() {
    if (!this.git || !this.isRepo) return { isGitRepository: false as const, branch: null as string | null, files: [] as GitFileState[], ahead: 0, behind: 0, state: "clean" as const };
    let s: StatusResult;
    try { s = await this.git.status(); }
    catch { return { isGitRepository: false as const, branch: null, files: [], ahead: 0, behind: 0, state: "clean" as const }; }
    const files: GitFileState[] = s.files.map((f) => {
      const st = f.working_dir === "D" || f.index === "D" ? "deleted" as const
        : f.working_dir === "?" || f.index === "?" ? "untracked" as const
        : f.working_dir === "U" || f.index === "U" ? "conflicted" as const
        : f.index === "A" ? "added" as const
        : f.index === "R" ? "renamed" as const
        : "modified" as const;
      return { path: f.path, index: f.index, working: f.working_dir, status: st };
    });
    let state: "clean"|"modified"|"conflicts"|"detached" = s.files.length ? "modified" : "clean";
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
    const args = cached ? ["diff", "--cached", "--", relPath] : ["diff", "--", relPath];
    try { const { stdout } = await execFileAsync("git", args, { cwd: this.root, maxBuffer: 10 * 1024 * 1024 }); return stdout; }
    catch (e: any) { return e.stdout ?? ""; }
  }

  async getHeadFile(relPath: string): Promise<string | null> {
    if (!this.root) return null;
    try { const { stdout } = await execFileAsync("git", ["show", `HEAD:${relPath}`], { cwd: this.root, maxBuffer: 10 * 1024 * 1024 }); return stdout; }
    catch { return null; }
  }
}
export const gitService = new GitService();
