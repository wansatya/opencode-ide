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
      <div className="bg-[#231a14] border border-[#36281e] rounded-lg p-5 w-[520px] max-h-[80vh] flex flex-col text-[#ece1d8] shadow-2xl">
        <h2 className="font-semibold mb-1 text-amber-200">Open Repository</h2>
        <p className="text-xs text-[#9e8b7d] mb-3">Type a path or browse folders, then Open.</p>
        <div className="flex gap-2 mb-2">
          <input autoFocus value={p} disabled={opening} onChange={(e) => setP(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            placeholder="/home/user/projects/my-app"
            className="flex-1 px-2 py-1.5 rounded bg-[#140f0c] border border-[#36281e] text-sm text-[#ece1d8] outline-none focus:border-[#d97706] disabled:opacity-60" />
          <button onClick={() => nav(p)} disabled={opening} title="Go to typed path" className="px-3 py-1.5 text-sm rounded bg-[#2e2118] border border-[#36281e] hover:bg-[#4a3627] text-[#ece1d8] disabled:opacity-40">Go</button>
        </div>
        <div className="flex items-center gap-1 mb-1">
          <button disabled={!parent} onClick={() => parent && nav(parent)} title="Up" className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-[#2e2118] border border-[#36281e] hover:bg-[#4a3627] text-[#ece1d8] disabled:opacity-40"><CornerLeftUp size={13} />Up</button>
          <button onClick={() => nav(home)} title="Home" className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-[#2e2118] border border-[#36281e] hover:bg-[#4a3627] text-[#ece1d8]"><House size={13} />Home</button>
          <span className="text-xs text-[#9e8b7d] truncate ml-1">{cur ?? (loading ? "Loading…" : "")}</span>
        </div>
        <div className="overflow-y-auto rounded border border-[#36281e] bg-[#140f0c] min-h-[180px] max-h-[320px] mb-2">
          {entries.map((e) => (
            <button key={e.path} onDoubleClick={() => nav(e.path)} onClick={() => { setP(e.path); }}
              onKeyDown={(ev) => { if (ev.key === "Enter") nav(e.path); }}
              className={`flex items-center gap-2 w-full text-left px-3 py-1.5 text-sm hover:bg-[#281f18] ${p === e.path ? "bg-[#453225] text-amber-100 font-medium" : "text-[#c2ab99]"}`}>
              <Folder size={14} className="shrink-0 text-[#9e8b7d]" />{e.name}
            </button>
          ))}
          {!loading && entries.length === 0 && <div className="px-3 py-4 text-xs text-[#9e8b7d]">No subfolders. Click Open to use this folder.</div>}
          {loading && <div className="px-3 py-4 text-xs text-[#9e8b7d]">Loading…</div>}
        </div>
        <p className="text-[11px] text-[#9e8b7d] mb-2">Single-click selects · double-click enters folder.</p>
        {opening && <div className="flex items-center gap-2 text-xs text-amber-300 mb-2"><Loader2 size={13} className="animate-spin" />Opening repository — scanning files, starting watcher…</div>}
        {err && <div className="text-xs text-red-400 mb-2">{err}</div>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} disabled={opening} className="px-3 py-1.5 text-sm rounded bg-[#2e2118] border border-[#36281e] hover:bg-[#4a3627] text-[#ece1d8] disabled:opacity-40">Cancel</button>
          <button onClick={submit} disabled={opening || !p} className="flex items-center gap-2 px-3 py-1.5 text-sm rounded bg-amber-700 hover:bg-amber-600 text-white font-medium disabled:opacity-60">
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
      <div className="bg-[#231a14] border border-[#36281e] rounded-lg w-[520px] h-fit overflow-hidden text-[#ece1d8] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <input autoFocus placeholder="Search files..." value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && hits[0]) { useRepo.getState().select(hits[0]); setQuickOpen(false); } if (e.key === "Escape") setQuickOpen(false); }}
          className="w-full px-3 py-2 bg-[#140f0c] text-sm text-[#ece1d8] outline-none border-b border-[#36281e]" />
        {hits.map((h) => {
          const base = h.split("/").pop() ?? h;
          const { Icon, className } = getFileIcon(base);
          return (
            <button key={h} onClick={() => { useRepo.getState().select(h); setQuickOpen(false); }} className="flex items-center gap-2 w-full text-left px-3 py-1.5 text-sm text-[#c2ab99] hover:bg-[#281f18] hover:text-[#ece1d8]">
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
      <div className="bg-[#231a14] border border-[#36281e] rounded-lg w-[520px] h-fit overflow-hidden text-[#ece1d8] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {cmds.map(([n, fn]) => <button key={n} onClick={() => { fn(); setPalette(false); }} className="block w-full text-left px-3 py-2 text-sm text-[#c2ab99] hover:bg-[#281f18] hover:text-[#ece1d8]">{n}</button>)}
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
        className="bg-[#1f1712] border border-[#36281e] rounded-xl w-full max-w-lg overflow-hidden text-[#ece1d8] shadow-2xl flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative bg-gradient-to-r from-[#2c1d14] via-[#24170e] to-[#1a110a] p-5 border-b border-[#36281e]">
          <button
            onClick={() => setAboutOpen(false)}
            className="absolute top-4 right-4 text-[#9e8b7d] hover:text-[#ece1d8] p-1.5 rounded-lg hover:bg-[#36281e]/60 transition-colors"
            title="Close"
          >
            <X size={18} />
          </button>
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 p-0.5 shadow-lg shadow-amber-950/40 flex items-center justify-center shrink-0">
              <div className="w-full h-full bg-[#18110c] rounded-[10px] flex items-center justify-center">
                <img src="/opencode.webp" alt="OpenCode Logo" className="w-7 h-7 object-contain" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-amber-200 tracking-tight">OpenCode IDE</h1>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 font-semibold">
                  v0.1.0
                </span>
              </div>
              <p className="text-xs text-[#a89485] mt-0.5">
                Next-Gen Web IDE & Developer Control Center
              </p>
            </div>
          </div>
        </div>

        <div className="flex border-b border-[#36281e] bg-[#17100b] px-4 pt-2 gap-2 text-xs">
          <button
            onClick={() => setActiveTab("about")}
            className={`px-3 py-2 border-b-2 font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === "about"
                ? "border-amber-500 text-amber-300"
                : "border-transparent text-[#9e8b7d] hover:text-[#ece1d8]"
            }`}
          >
            <Info size={13} />
            About
          </button>
          <button
            onClick={() => setActiveTab("shortcuts")}
            className={`px-3 py-2 border-b-2 font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === "shortcuts"
                ? "border-amber-500 text-amber-300"
                : "border-transparent text-[#9e8b7d] hover:text-[#ece1d8]"
            }`}
          >
            <Keyboard size={13} />
            Shortcuts
          </button>
          <button
            onClick={() => setActiveTab("system")}
            className={`px-3 py-2 border-b-2 font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === "system"
                ? "border-amber-500 text-amber-300"
                : "border-transparent text-[#9e8b7d] hover:text-[#ece1d8]"
            }`}
          >
            <Cpu size={13} />
            System Status
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4 text-xs flex-1">
          {activeTab === "about" && (
            <div className="space-y-4">
              <p className="text-[#c7b7aa] leading-relaxed">
                <strong className="text-amber-300">OpenCode IDE</strong> is a lightweight, high-performance web-based IDE engineered for rapid software development, git workflow control, and OpenCode process orchestration.
              </p>

              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <div className="p-3 rounded-lg bg-[#140f0c] border border-[#36281e]">
                  <div className="font-semibold text-amber-400 flex items-center gap-1.5 mb-1">
                    <Terminal size={14} /> OpenCode Engine
                  </div>
                  <div className="text-[11px] text-[#9e8b7d] leading-normal">
                    Interactive terminal & AI background worker.
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-[#140f0c] border border-[#36281e]">
                  <div className="font-semibold text-amber-400 flex items-center gap-1.5 mb-1">
                    <GitBranch size={14} /> Git Cockpit
                  </div>
                  <div className="text-[11px] text-[#9e8b7d] leading-normal">
                    Real-time git tracking, branch switcher & diff inspector.
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-[#140f0c] border border-[#36281e]">
                  <div className="font-semibold text-amber-400 flex items-center gap-1.5 mb-1">
                    <Code2 size={14} /> Multi-Tab Editor
                  </div>
                  <div className="text-[11px] text-[#9e8b7d] leading-normal">
                    Code view, syntax highlighting & side-by-side diffing.
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-[#140f0c] border border-[#36281e]">
                  <div className="font-semibold text-amber-400 flex items-center gap-1.5 mb-1">
                    <Command size={14} /> Command Palette
                  </div>
                  <div className="text-[11px] text-[#9e8b7d] leading-normal">
                    Fuzzy quick open (Ctrl+P) and command runner.
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "shortcuts" && (
            <div className="space-y-2">
              <div className="text-[#9e8b7d] text-[11px] mb-3">
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
                    className="flex items-center justify-between p-2 rounded bg-[#140f0c] border border-[#36281e]"
                  >
                    <span className="font-sans text-[#c2ab99]">{label}</span>
                    <kbd className="px-2 py-0.5 rounded bg-[#2e2118] border border-[#4a3627] text-amber-200 text-[10px]">
                      {key}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "system" && (
            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-[#140f0c] border border-[#36281e] space-y-2">
                <div className="text-[#9e8b7d] text-[11px] font-semibold uppercase tracking-wider">
                  OpenCode Service Status
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#c2ab99]">Status</span>
                  <span className="flex items-center gap-1.5 capitalize font-medium text-amber-300">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        ocState === "connected"
                          ? "bg-green-400 animate-pulse"
                          : ocState === "error"
                          ? "bg-red-400"
                          : "bg-amber-400"
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

              <div className="p-3 rounded-lg bg-[#140f0c] border border-[#36281e] space-y-2">
                <div className="text-[#9e8b7d] text-[11px] font-semibold uppercase tracking-wider">
                  Workspace Environment
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#c2ab99]">Repository</span>
                  <span className="font-mono text-amber-300">{name ?? "None"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#c2ab99]">Branch</span>
                  <span className="font-mono text-amber-300">{branch ?? "—"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#c2ab99]">Git State</span>
                  <span className="font-mono text-amber-300 capitalize">{gitState}</span>
                </div>
                {root && (
                  <div className="pt-1.5 border-t border-[#2a1e16] text-[10px] text-[#8c7767] truncate">
                    Path: {root}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-3 bg-[#17100b] border-t border-[#36281e] flex items-center justify-between">
          <div className="text-[11px] text-[#7c6a5c]">
            Built with React, Vite & OpenCode
          </div>
          <button
            onClick={() => setAboutOpen(false)}
            className="px-4 py-1.5 text-xs font-medium rounded bg-amber-700 hover:bg-amber-600 text-white transition-colors"
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
      <div className="bg-[#231a14] border border-[#36281e] rounded-lg p-5 w-[520px] max-h-[80vh] flex flex-col text-[#ece1d8] shadow-2xl">
        <h2 className="font-semibold mb-1 text-amber-200 flex items-center gap-2"><GitBranch size={16} /> OpenCode branches found</h2>
        <p className="text-xs text-[#9e8b7d] mb-3">This repository has existing <code className="px-1 py-0.5 rounded bg-[#140f0c] border border-[#36281e]">opencode/*</code> branches. Do you want to continue the last session or start a fresh one?</p>
        <div className="rounded border border-[#36281e] bg-[#140f0c] p-3 mb-3">
          <div className="text-xs text-[#9e8b7d] mb-2">Most recent branch:</div>
          <div className="flex items-center gap-2 text-sm font-mono bg-[#231a14] border border-[#36281e] rounded px-2 py-1.5">
            <GitBranch size={14} className="text-amber-400 shrink-0" />
            <span className="truncate text-amber-100">{lastBranch ?? branches[0] ?? "—"}</span>
          </div>
          {branches.length > 1 && (
            <div className="mt-3">
              <label className="text-xs text-[#9e8b7d]">Or pick another opencode branch:</label>
              <select value={selected} onChange={(e) => setSelected(e.target.value)} className="mt-1 w-full px-2 py-1.5 rounded bg-[#231a14] border border-[#36281e] text-sm text-[#ece1d8] outline-none focus:border-[#d97706]">
                {branches.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          )}
          {branches.length > 1 && <div className="text-[11px] text-[#9e8b7d] mt-1">{branches.length} opencode branches total</div>}
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-3 py-1.5 text-sm rounded bg-[#2e2118] border border-[#36281e] hover:bg-[#4a3627] text-[#ece1d8]">Cancel</button>
          <button onClick={() => onChoice("new")} className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded bg-[#2e2118] border border-[#36281e] hover:bg-[#4a3627] text-[#ece1d8]"><Plus size={14} />Create new branch</button>
          <button onClick={() => onChoice(selected)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded bg-amber-700 hover:bg-amber-600 text-white font-medium"><GitBranch size={14} />Continue {branches.length > 1 ? "selected" : "last"} branch</button>
        </div>
      </div>
    </div>
  );
}
