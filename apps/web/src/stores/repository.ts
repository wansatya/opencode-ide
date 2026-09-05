import { create } from "zustand";
import type { FileNode } from "../types";
import { api } from "../lib/api";
// Shared in-flight guard so duplicate load() calls share one tree scan.
let loadInflight: Promise<void> | null = null;
type S = {
  root: string | null; name: string | null; tree: FileNode[]; truncated: boolean; loading: boolean; error: string | null;
  expanded: Record<string, boolean>; selectedFile: string | null;
  load: () => Promise<void>; openRepo: (path: string) => Promise<void>;
  toggle: (p: string) => void; select: (p: string | null) => void;
};
export const useRepo = create<S>((set, get) => ({
  root: null, name: null, tree: [], truncated: false, loading: false, error: null, expanded: { src: true }, selectedFile: null,
  load: async () => {
    // Dedupe concurrent loads: App mounts two effects that both called
    // load(), causing two full /api/tree scans back-to-back on startup.
    if (loadInflight) return loadInflight;
    loadInflight = (async () => {
      set({ loading: true, error: null });
      try {
        const w = await api.workspace();
        if (!w.root) { set({ root: null, loading: false }); return; }
        const t = await api.tree();
        set({ root: t.root, name: w.name ?? t.root.split("/").pop() ?? null, tree: t.tree, truncated: t.truncated ?? false, loading: false });
      } catch (e: any) { set({ error: e.message, loading: false }); }
    })().finally(() => { loadInflight = null; });
    return loadInflight;
  },
  openRepo: async (p: string) => {
    set({ loading: true, error: null });
    try {
      const r = await api.openWorkspace(p);
      // The open response already carries the effective root; skip the extra
      // GET /api/workspace roundtrip and go straight to the tree scan, which
      // dominates open latency.
      const name = r.root.split("/").pop() || null;
      const t = await api.tree();
      set({ root: r.root, name, tree: t.tree, truncated: t.truncated ?? false, loading: false, selectedFile: null });
      // Backend already exited the old opencode session on workspace switch;
      // its `opencode.state: exited` broadcast flips the terminal to "press
      // Start". No auto-start here — open stays fast, user starts manually.
    } catch (e: any) { set({ error: e.message, loading: false }); throw e; }
  },
  toggle: (p) => set({ expanded: { ...get().expanded, [p]: !get().expanded[p] } }),
  select: (p) => set({ selectedFile: p }),
}));
export function flatFiles(tree: FileNode[]): string[] {
  const out: string[] = [];
  const walk = (ns: FileNode[]) => { for (const n of ns) { if (n.type === "file") out.push(n.path); if (n.children) walk(n.children); } };
  walk(tree); return out;
}
