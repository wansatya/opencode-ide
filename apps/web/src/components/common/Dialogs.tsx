import { useState, useEffect, useMemo } from "react";
import { Folder, CornerLeftUp, House, Loader2, GitBranch, Plus, X, Sparkles, Code2, Terminal, Cpu, Info, Keyboard, Command } from "lucide-react";
import { flatFiles, useRepo } from "../../stores/repository";
import { useUI } from "../../stores/ui";
import { useGit } from "../../stores/git";
import { api } from "../../lib/api";
import { useTerm } from "../../stores/terminal";
import { getFileIcon } from "../repository/fileIcons";
export function RepositoryPicker({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [p, setP] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [cur, setCur] = useState<string | null>(null);
  const [parent, setParent] = useState<string | null>(null);
  const [home, setHome] = useState("");
  const [entries, setEntries] = useState<{ name: string; path: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [opening, setOpening] = useState(false);
  const nav = async (dir?: string) => {
    setLoading(true); setErr(null);
    try {
      const r = await api.browse(dir ?? undefined);
      setCur(r.path); setP(r.path); setParent(r.parent); setHome(r.home); setEntries(r.entries);
    } catch (e: any) { setErr(e.message); }
    setLoading(false);
  };
  useEffect(() => { if (open) { setErr(null); nav(useRepo.getState().root ?? undefined); } }, [open]);
  if (!open) return null;
  const submit = async () => {
    if (opening) return;
    setOpening(true); setErr(null);
    try {
      await useRepo.getState().openRepo(p);
      onClose();
      // Git status loads in the background: awaiting it kept the dialog
      // spinner up for an extra sequential roundtrip + `git status` scan
      // after the (already slow) tree scan. The badge updates when ready.
      useGit.getState().refresh().catch(() => {});
    } catch (e: any) { setErr(e.message); }
    finally { setOpening(false); }
  };
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-[#222222] border border-[#333333] rounded-lg p-5 w-[520px] max-h-[80vh] flex flex-col text-[#F1ECEC] shadow-2xl">
        <h2 className="font-semibold mb-1 text-[#F1ECEC]">Open Repository</h2>
        <p className="text-xs text-[#B7B1B1] mb-3">Type a path or browse folders, then Open.</p>
        <div className="flex gap-2 mb-2">
          <input autoFocus value={p} disabled={opening} onChange={(e) => setP(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            placeholder="/home/user/projects/my-app"
            className="flex-1 px-2 py-1.5 rounded bg-[#141414] border border-[#333333] text-sm text-[#F1ECEC] outline-none focus:border-[#B7B1B1] disabled:opacity-60" />
          <button onClick={() => nav(p)} disabled={opening} title="Go to typed path" className="px-3 py-1.5 text-sm rounded bg-[#262626] border border-[#333333] hover:bg-[#333333] text-[#F1ECEC] disabled:opacity-40">Go</button>
        </div>
        <div className="flex items-center gap-1 mb-1">
          <button disabled={!parent} onClick={() => parent && nav(parent)} title="Up" className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-[#262626] border border-[#333333] hover:bg-[#333333] text-[#F1ECEC] disabled:opacity-40"><CornerLeftUp size={13} />Up</button>
          <button onClick={() => nav(home)} title="Home" className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-[#262626] border border-[#333333] hover:bg-[#333333] text-[#F1ECEC]"><House size={13} />Home</button>
          <span className="text-xs text-[#B7B1B1] truncate ml-1">{cur ?? (loading ? "Loading…" : "")}</span>
        </div>
        <div className="overflow-y-auto rounded border border-[#333333] bg-[#141414] min-h-[180px] max-h-[320px] mb-2">
          {entries.map((e) => (
            <button key={e.path} onDoubleClick={() => nav(e.path)} onClick={() => { setP(e.path); }}
              onKeyDown={(ev) => { if (ev.key === "Enter") nav(e.path); }}
              className={`flex items-center gap-2 w-full text-left px-3 py-1.5 text-sm hover:bg-[#2c2c2c] ${p === e.path ? "bg-[#4B4646] text-[#F1ECEC] font-medium" : "text-[#B7B1B1]"}`}>
              <Folder size={14} className="shrink-0 text-[#B7B1B1]" />{e.name}
            </button>
          ))}
          {!loading && entries.length === 0 && <div className="px-3 py-4 text-xs text-[#B7B1B1]">No subfolders. Click Open to use this folder.</div>}
          {loading && <div className="px-3 py-4 text-xs text-[#B7B1B1]">Loading…</div>}
        </div>
        <p className="text-[11px] text-[#B7B1B1] mb-2">Single-click selects · double-click enters folder.</p>
        {opening && <div className="flex items-center gap-2 text-xs text-[#F1ECEC] mb-2"><Loader2 size={13} className="animate-spin" />Opening repository — scanning files, starting watcher…</div>}
        {err && <div className="text-xs text-red-400 mb-2">{err}</div>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} disabled={opening} className="px-3 py-1.5 text-sm rounded bg-[#262626] border border-[#333333] hover:bg-[#333333] text-[#F1ECEC] disabled:opacity-40">Cancel</button>
          <button onClick={submit} disabled={opening || !p} className="flex items-center gap-2 px-3 py-1.5 text-sm rounded bg-[#4B4646] hover:bg-[#5e5959] text-white font-medium disabled:opacity-60">
            {opening && <Loader2 size={14} className="animate-spin" />}{opening ? "Opening…" : "Open"}
          </button>
        </div>
      </div>
    </div>
  );
}
export function QuickOpen() {
  const { quickOpen, setQuickOpen } = useUI();
  const { tree } = useRepo();
  const [q, setQ] = useState("");
  const files = useMemo(() => flatFiles(tree), [tree]);
  const hits = useMemo(() => { const s = q.toLowerCase(); return files.filter((f) => f.toLowerCase().includes(s)).slice(0, 20); }, [files, q]);
  useEffect(() => setQ(""), [quickOpen]);
  if (!quickOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex justify-center pt-24" onClick={() => setQuickOpen(false)}>
      <div className="bg-[#222222] border border-[#333333] rounded-lg w-[520px] h-fit overflow-hidden text-[#F1ECEC] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <input autoFocus placeholder="Search files..." value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && hits[0]) { useRepo.getState().select(hits[0]); setQuickOpen(false); } if (e.key === "Escape") setQuickOpen(false); }}
          className="w-full px-3 py-2 bg-[#141414] text-sm text-[#F1ECEC] outline-none border-b border-[#333333]" />
        {hits.map((h) => {
          const base = h.split("/").pop() ?? h;
          const { Icon, className } = getFileIcon(base);
          return (
            <button key={h} onClick={() => { useRepo.getState().select(h); setQuickOpen(false); }} className="flex items-center gap-2 w-full text-left px-3 py-1.5 text-sm text-[#B7B1B1] hover:bg-[#2c2c2c] hover:text-[#F1ECEC]">
              <Icon size={14} className={`${className} shrink-0`} />
              <span className="truncate">{h}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
export function CommandPalette() {
  const { palette, setPalette } = useUI();
  if (!palette) return null;
  const cmds: [string, () => void][] = [
    ["About OpenCode IDE", () => useUI.getState().setAboutOpen(true)],
    ["Open Repository", () => window.dispatchEvent(new CustomEvent("cockpit:open-repo"))],
    ["Refresh Repository", () => { useRepo.getState().load(); useGit.getState().refresh(); }],
    ["Refresh Git Status", () => useGit.getState().refresh()],
    ["Focus Terminal", () => document.querySelector<HTMLElement>(".xterm-screen")?.focus()],
    ["Restart OpenCode", async () => { const s = useTerm.getState().state; if (s === "connected") await api.ocStop(); try { await api.ocStart(120, 30); useTerm.getState().set("connected"); } catch (e: any) { useTerm.getState().set("error", e.message); } }],
    ["Stop OpenCode", () => { void api.ocStop().catch(() => {}); useTerm.getState().set("exited"); }],
  ];
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex justify-center pt-24" onClick={() => setPalette(false)}>
      <div className="bg-[#222222] border border-[#333333] rounded-lg w-[520px] h-fit overflow-hidden text-[#F1ECEC] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {cmds.map(([n, fn]) => <button key={n} onClick={() => { fn(); setPalette(false); }} className="block w-full text-left px-3 py-2 text-sm text-[#B7B1B1] hover:bg-[#2c2c2c] hover:text-[#F1ECEC]">{n}</button>)}
      </div>
    </div>
  );
}

export function AboutDialog() {
  const { aboutOpen, setAboutOpen } = useUI();
  const { name, root } = useRepo();
  const { branch, state: gitState } = useGit();
  const { state: ocState, error: ocError } = useTerm();
  const [activeTab, setActiveTab] = useState<"about" | "shortcuts" | "system">("about");

  useEffect(() => {
    if (!aboutOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAboutOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [aboutOpen, setAboutOpen]);

  if (!aboutOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={() => setAboutOpen(false)}
    >
      <div
        className="bg-[#222222] border border-[#333333] rounded-xl w-full max-w-lg overflow-hidden text-[#F1ECEC] shadow-2xl flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative bg-gradient-to-r from-[#2c2c2c] via-[#222222] to-[#1a1a1a] p-5 border-b border-[#333333]">
          <button
            onClick={() => setAboutOpen(false)}
            className="absolute top-4 right-4 text-[#B7B1B1] hover:text-[#F1ECEC] p-1.5 rounded-lg hover:bg-[#333333]/60 transition-colors"
            title="Close"
          >
            <X size={18} />
          </button>
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#4B4646] to-[#2c2c2c] p-0.5 shadow-lg flex items-center justify-center shrink-0">
              <div className="w-full h-full bg-[#141414] rounded-[10px] flex items-center justify-center">
                <img src="/opencode.webp" alt="OpenCode Logo" className="w-7 h-7 object-contain" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-[#F1ECEC] tracking-tight">OpenCode IDE</h1>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#4B4646] border border-[#B7B1B1]/30 text-[#F1ECEC] font-semibold">
                  v0.1.0
                </span>
              </div>
              <p className="text-xs text-[#B7B1B1] mt-0.5">
                Next-Gen Web IDE & Developer Control Center
              </p>
            </div>
          </div>
        </div>

        <div className="flex border-b border-[#333333] bg-[#1c1c1c] px-4 pt-2 gap-2 text-xs">
          <button
            onClick={() => setActiveTab("about")}
            className={`px-3 py-2 border-b-2 font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === "about"
                ? "border-[#B7B1B1] text-[#F1ECEC]"
                : "border-transparent text-[#B7B1B1] hover:text-[#F1ECEC]"
            }`}
          >
            <Info size={13} />
            About
          </button>
          <button
            onClick={() => setActiveTab("shortcuts")}
            className={`px-3 py-2 border-b-2 font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === "shortcuts"
                ? "border-[#B7B1B1] text-[#F1ECEC]"
                : "border-transparent text-[#B7B1B1] hover:text-[#F1ECEC]"
            }`}
          >
            <Keyboard size={13} />
            Shortcuts
          </button>
          <button
            onClick={() => setActiveTab("system")}
            className={`px-3 py-2 border-b-2 font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === "system"
                ? "border-[#B7B1B1] text-[#F1ECEC]"
                : "border-transparent text-[#B7B1B1] hover:text-[#F1ECEC]"
            }`}
          >
            <Cpu size={13} />
            System Status
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4 text-xs flex-1">
          {activeTab === "about" && (
            <div className="space-y-4">
              <p className="text-[#B7B1B1] leading-relaxed">
                <strong className="text-[#F1ECEC]">OpenCode IDE</strong> is a lightweight, high-performance web-based IDE engineered for rapid software development, git workflow control, and OpenCode process orchestration.
              </p>

              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <div className="p-3 rounded-lg bg-[#141414] border border-[#333333]">
                  <div className="font-semibold text-[#F1ECEC] flex items-center gap-1.5 mb-1">
                    <Terminal size={14} /> OpenCode Engine
                  </div>
                  <div className="text-[11px] text-[#B7B1B1] leading-normal">
                    Interactive terminal & AI background worker.
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-[#141414] border border-[#333333]">
                  <div className="font-semibold text-[#F1ECEC] flex items-center gap-1.5 mb-1">
                    <GitBranch size={14} /> Git Cockpit
                  </div>
                  <div className="text-[11px] text-[#B7B1B1] leading-normal">
                    Real-time git tracking, branch switcher & diff inspector.
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-[#141414] border border-[#333333]">
                  <div className="font-semibold text-[#F1ECEC] flex items-center gap-1.5 mb-1">
                    <Code2 size={14} /> Multi-Tab Editor
                  </div>
                  <div className="text-[11px] text-[#B7B1B1] leading-normal">
                    Code view, syntax highlighting & side-by-side diffing.
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-[#141414] border border-[#333333]">
                  <div className="font-semibold text-[#F1ECEC] flex items-center gap-1.5 mb-1">
                    <Command size={14} /> Command Palette
                  </div>
                  <div className="text-[11px] text-[#B7B1B1] leading-normal">
                    Fuzzy quick open (Ctrl+P) and command runner.
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "shortcuts" && (
            <div className="space-y-2">
              <div className="text-[#B7B1B1] text-[11px] mb-3">
                Keyboard shortcuts for faster navigation:
              </div>
              <div className="space-y-1.5 font-mono text-[11px]">
                {[
                  ["Quick Open File", "Ctrl + P / ⌘P"],
                  ["Command Palette", "Ctrl + Shift + P / ⌘⇧P"],
                  ["Toggle File Explorer", "Ctrl + B / ⌘B"],
                  ["Toggle Terminal Panel", "Ctrl + Shift + B / ⌘⇧B"],
                  ["Toggle Diff View", "Ctrl + Shift + D / ⌘⇧D"],
                  ["Focus Terminal Window", "Ctrl + `"],
                  ["Close Active Tab", "Ctrl + W / ⌘W"],
                ].map(([label, key]) => (
                  <div
                    key={label}
                    className="flex items-center justify-between p-2 rounded bg-[#141414] border border-[#333333]"
                  >
                    <span className="font-sans text-[#B7B1B1]">{label}</span>
                    <kbd className="px-2 py-0.5 rounded bg-[#262626] border border-[#333333] text-[#F1ECEC] text-[10px]">
                      {key}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "system" && (
            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-[#141414] border border-[#333333] space-y-2">
                <div className="text-[#B7B1B1] text-[11px] font-semibold uppercase tracking-wider">
                  OpenCode Service Status
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#B7B1B1]">Status</span>
                  <span className="flex items-center gap-1.5 capitalize font-medium text-[#F1ECEC]">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        ocState === "connected"
                          ? "bg-green-400 animate-pulse"
                          : ocState === "error"
                          ? "bg-red-400"
                          : "bg-[#B7B1B1]"
                      }`}
                    />
                    {ocState}
                  </span>
                </div>
                {ocError && (
                  <div className="text-[11px] text-red-300 bg-red-950/40 p-2 rounded border border-red-900/50">
                    {ocError}
                  </div>
                )}
              </div>

              <div className="p-3 rounded-lg bg-[#141414] border border-[#333333] space-y-2">
                <div className="text-[#B7B1B1] text-[11px] font-semibold uppercase tracking-wider">
                  Workspace Environment
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#B7B1B1]">Repository</span>
                  <span className="font-mono text-[#F1ECEC]">{name ?? "None"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#B7B1B1]">Branch</span>
                  <span className="font-mono text-[#F1ECEC]">{branch ?? "—"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#B7B1B1]">Git State</span>
                  <span className="font-mono text-[#F1ECEC] capitalize">{gitState}</span>
                </div>
                {root && (
                  <div className="pt-1.5 border-t border-[#333333] text-[10px] text-[#B7B1B1] truncate">
                    Path: {root}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-3 bg-[#1c1c1c] border-t border-[#333333] flex items-center justify-between">
          <div className="text-[11px] text-[#B7B1B1]">
            Built with React, Vite & OpenCode
          </div>
          <button
            onClick={() => setAboutOpen(false)}
            className="px-4 py-1.5 text-xs font-medium rounded bg-[#4B4646] hover:bg-[#5e5959] text-white transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export function BranchChoiceDialog({ open, branches, lastBranch, onChoice, onCancel }: { open: boolean; branches: string[]; lastBranch: string | null; onChoice: (choice: string) => void; onCancel: () => void }) {
  const [selected, setSelected] = useState<string>(lastBranch ?? branches[0] ?? "");
  useEffect(() => { if (open) setSelected(lastBranch ?? branches[0] ?? ""); }, [open, branches, lastBranch]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-[#222222] border border-[#333333] rounded-lg p-5 w-[520px] max-h-[80vh] flex flex-col text-[#F1ECEC] shadow-2xl">
        <h2 className="font-semibold mb-1 text-[#F1ECEC] flex items-center gap-2"><GitBranch size={16} /> Repository branches found</h2>
        <p className="text-xs text-[#B7B1B1] mb-3">Select a branch to continue your session or create a new branch for this OpenCode instance.</p>
        <div className="rounded border border-[#333333] bg-[#141414] p-3 mb-3">
          <div className="text-xs text-[#B7B1B1] mb-2">Most recent session branch:</div>
          <div className="flex items-center gap-2 text-sm font-mono bg-[#1c1c1c] border border-[#333333] rounded px-2 py-1.5">
            <GitBranch size={14} className="text-[#B7B1B1] shrink-0" />
            <span className="truncate text-[#F1ECEC]">{lastBranch ?? branches[0] ?? "—"}</span>
          </div>
          {branches.length > 1 && (
            <div className="mt-3">
              <label className="text-xs text-[#B7B1B1]">Or pick another branch from this repository:</label>
              <select value={selected} onChange={(e) => setSelected(e.target.value)} className="mt-1 w-full px-2 py-1.5 rounded bg-[#1c1c1c] border border-[#333333] text-sm text-[#F1ECEC] outline-none focus:border-[#B7B1B1]">
                {branches.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          )}
          {branches.length > 1 && <div className="text-[11px] text-[#B7B1B1] mt-1">{branches.length} branches total</div>}
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-3 py-1.5 text-sm rounded bg-[#262626] border border-[#333333] hover:bg-[#333333] text-[#F1ECEC]">Cancel</button>
          <button onClick={() => onChoice("new")} className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded bg-[#262626] border border-[#333333] hover:bg-[#333333] text-[#F1ECEC]"><Plus size={14} />Create new branch</button>
          <button onClick={() => onChoice(selected)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded bg-[#4B4646] hover:bg-[#5e5959] text-white font-medium"><GitBranch size={14} />Continue {branches.length > 1 ? "selected" : "last"} branch</button>
        </div>
      </div>
    </div>
  );
}
