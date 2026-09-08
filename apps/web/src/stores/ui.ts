import { create } from "zustand";
type S = {
  leftW: number; rightW: number; showLeft: boolean; showRight: boolean;
  leftTab: "repository" | "search";
  quickOpen: boolean; palette: boolean; aboutOpen: boolean;
  editorTabSize: number; editorInsertSpaces: boolean;
  setLeft: (n: number) => void; setRight: (n: number) => void;
  toggleLeft: () => void; toggleRight: () => void;
  setLeftTab: (t: "repository" | "search") => void;
  setQuickOpen: (b: boolean) => void; setPalette: (b: boolean) => void; setAboutOpen: (b: boolean) => void;
  setTabSize: (n: number) => void; setInsertSpaces: (b: boolean) => void;
};
function saved(k: string, d: number) { try { const v = Number(localStorage.getItem(k)); return Number.isFinite(v) && v > 0 ? v : d; } catch { return d; } }
function savedBool(k: string, d: boolean) { try { const v = localStorage.getItem(k); if (v === null) return d; return v === "true"; } catch { return d; } }
export const useUI = create<S>((set, get) => ({
  leftW: saved("leftW", 240), rightW: saved("rightW", 560),
  showLeft: true, showRight: true, leftTab: "repository", quickOpen: false, palette: false, aboutOpen: false,
  editorTabSize: saved("editorTabSize", 2),
  editorInsertSpaces: savedBool("editorInsertSpaces", true),
  setLeft: (n) => { set({ leftW: n }); try { localStorage.setItem("leftW", String(n)); } catch {} },
  setRight: (n) => { set({ rightW: n }); try { localStorage.setItem("rightW", String(n)); } catch {} },
  toggleLeft: () => set({ showLeft: !get().showLeft }),
  toggleRight: () => set({ showRight: !get().showRight }),
  setLeftTab: (t) => set({ leftTab: t, showLeft: true }),
  setQuickOpen: (b) => set({ quickOpen: b }),
  setPalette: (b) => set({ palette: b }),
  setAboutOpen: (b) => set({ aboutOpen: b }),
  setTabSize: (n) => { const v = [2, 4].includes(n) ? n : 2; set({ editorTabSize: v }); try { localStorage.setItem("editorTabSize", String(n)); } catch {} },
  setInsertSpaces: (b) => { set({ editorInsertSpaces: b }); try { localStorage.setItem("editorInsertSpaces", String(b)); } catch {} },
}));
