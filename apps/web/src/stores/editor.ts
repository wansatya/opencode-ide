import { create } from "zustand";
type Conflict = { path: string; diskContent: string } | null;
type S = {
  openFiles: string[]; activeFile: string | null; mode: Record<string, "code" | "diff">;
  dirty: Record<string, boolean>; contents: Record<string, string>; diskHash: Record<string, string | undefined>;
  conflict: Conflict; message: string | null;
  open: (p: string) => void; close: (p: string) => void; setActive: (p: string | null) => void;
  setMode: (p: string, m: "code" | "diff") => void;
  setContent: (p: string, c: string, h?: string) => void; markDirty: (p: string, d: boolean) => void;
  setConflict: (c: Conflict) => void; notify: (m: string | null) => void;
  reset: () => void;
};
export const useEditor = create<S>((set) => ({
  openFiles: [], activeFile: null, mode: {}, dirty: {}, contents: {}, diskHash: {}, conflict: null, message: null,
  open: (p) => set((s) => ({ openFiles: s.openFiles.includes(p) ? s.openFiles : [...s.openFiles, p], activeFile: p })),
  close: (p) => set((s) => {
    const of = s.openFiles.filter((f) => f !== p);
    const { [p]: _m, ...restMode } = s.mode;
    const { [p]: _d, ...restDirty } = s.dirty;
    const { [p]: _c, ...restContents } = s.contents;
    const { [p]: _h, ...restHash } = s.diskHash;
    const conflict = s.conflict?.path === p ? null : s.conflict;
    return { openFiles: of, activeFile: s.activeFile === p ? of[of.length - 1] ?? null : s.activeFile, mode: restMode, dirty: restDirty, contents: restContents, diskHash: restHash, conflict };
  }),
  setActive: (p) => set({ activeFile: p }),
  setMode: (p, m) => set((s) => ({ mode: { ...s.mode, [p]: m } })),
  setContent: (p, c, h) => set((s) => ({ contents: { ...s.contents, [p]: c }, ...(h !== undefined ? { diskHash: { ...s.diskHash, [p]: h } } : {}) })),
  markDirty: (p, d) => set((s) => ({ dirty: { ...s.dirty, [p]: d } })),
  setConflict: (c) => set({ conflict: c }),
  notify: (m) => set({ message: m }),
  reset: () => set({ openFiles: [], activeFile: null, mode: {}, dirty: {}, contents: {}, diskHash: {}, conflict: null, message: null }),
}));
