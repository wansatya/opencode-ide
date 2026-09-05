import { useState, useEffect, useMemo } from "react";
import { Folder, CornerLeftUp, House, Loader2 } from "lucide-react";
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
    ["Open Repository", () => window.dispatchEvent(new CustomEvent("cockpit:open-repo"))],
    ["Refresh Repository", () => { useRepo.getState().load(); useGit.getState().refresh(); }],
    ["Refresh Git Status", () => useGit.getState().refresh()],
    ["Focus Terminal", () => document.querySelector<HTMLElement>(".xterm-screen")?.focus()],
    ["Restart OpenCode", async () => { const s = useTerm.getState().state; if (s === "connected") await api.ocStop(); try { await api.ocStart(120, 30); useTerm.getState().set("connected"); } catch (e: any) { useTerm.getState().set("error", e.message); } }],
    ["Stop OpenCode", () => api.ocStop()],
  ];
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex justify-center pt-24" onClick={() => setPalette(false)}>
      <div className="bg-[#231a14] border border-[#36281e] rounded-lg w-[520px] h-fit overflow-hidden text-[#ece1d8] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {cmds.map(([n, fn]) => <button key={n} onClick={() => { fn(); setPalette(false); }} className="block w-full text-left px-3 py-2 text-sm text-[#c2ab99] hover:bg-[#281f18] hover:text-[#ece1d8]">{n}</button>)}
      </div>
    </div>
  );
}
