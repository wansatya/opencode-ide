import { create } from "zustand";
import type { GitFile } from "../types";
import { api } from "../lib/api";
type S = {
  branch: string | null; files: GitFile[]; isRepo: boolean; state: string;
  statusMap: Record<string, GitFile>;
  refresh: () => Promise<void>; diff: (p: string) => Promise<string>; head: (p: string) => Promise<string | null>;
};
export const useGit = create<S>((set) => ({
  branch: null, files: [], isRepo: true, state: "clean", statusMap: {},
  refresh: async () => {
    try {
      const s = await api.gitStatus();
      const m: Record<string, GitFile> = {};
      for (const f of s.files) m[f.path] = f;
      set({ branch: s.branch, files: s.files, isRepo: s.isGitRepository, state: s.state, statusMap: m });
    } catch {}
  },
  diff: async (p) => (await api.gitDiff(p)).diff,
  head: async (p) => (await api.gitHead(p)).content,
}));
