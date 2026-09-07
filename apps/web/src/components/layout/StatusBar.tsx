import { useEffect, useState } from "react";
import { useGit } from "../../stores/git";
import { useTerm } from "../../stores/terminal";
import { useRepo } from "../../stores/repository";
import { api } from "../../lib/api";
import { GitMerge, Loader2, Check, AlertTriangle, Trash2 } from "lucide-react";

export default function StatusBar() {
  const { files, branch, isRepo, refresh } = useGit();
  const { state } = useTerm();
  const added = files.filter((f) => f.status === "added" || f.status === "untracked").length;
  const mod = files.filter((f) => f.status === "modified").length;

  const [branches, setBranches] = useState<string[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [deleteAfter, setDeleteAfter] = useState(false);
  const [merging, setMerging] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [loadingBranches, setLoadingBranches] = useState(false);

  const fetchBranches = async () => {
    if (!isRepo) {
      setBranches([]);
      setSelected("");
      return;
    }
    setLoadingBranches(true);
    try {
      const r = await api.gitBranches();
      const current = r.current ?? branch;
      const filtered = r.branches.filter((b) => b !== current);
      setBranches(filtered);
      setSelected((prev) => {
        if (prev && filtered.includes(prev)) return prev;
        return filtered[0] ?? "";
      });
    } catch {
      // ignore - e.g. not a git repo
    } finally {
      setLoadingBranches(false);
    }
  };

  useEffect(() => {
    void fetchBranches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRepo, branch]);

  useEffect(() => {
    const h = () => void fetchBranches();
    window.addEventListener("cockpit:git-branch-changed" as any, h);
    window.addEventListener("cockpit:git-status-changed" as any, h);
    return () => {
      window.removeEventListener("cockpit:git-branch-changed" as any, h);
      window.removeEventListener("cockpit:git-status-changed" as any, h);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRepo, branch]);

  // auto-dismiss messages
  useEffect(() => {
    if (!msg) return;
    const t = window.setTimeout(() => setMsg(null), msg.type === "success" ? 5000 : 7000);
    return () => clearTimeout(t);
  }, [msg]);

  const handleMerge = async () => {
    if (!selected || merging) return;
    setMerging(true);
    setMsg(null);
    try {
      const r = await api.gitMerge(selected, deleteAfter);
      let text = `Merged ${selected} into ${r.previous ?? branch ?? "current"}`;
      if (r.deleted) text += " — deleted";
      else if (deleteAfter && r.deleteError) text += ` — merged, delete failed: ${r.deleteError}`;
      else if (r.output && r.output.length < 80) text = r.output;
      setMsg({ type: "success", text });
      await Promise.all([useRepo.getState().load(), refresh()]);
      await fetchBranches();
    } catch (e: any) {
      const raw = e?.message ?? String(e);
      // surface git conflict output if present
      const detail = (e?.output as string | undefined) ?? "";
      const text = detail ? `${raw}: ${detail.slice(0, 200)}` : raw;
      setMsg({ type: "error", text: text.slice(0, 300) });
      // refresh status/tree so conflict markers appear even on failure
      try {
        await refresh();
      } catch {}
      try {
        await useRepo.getState().load();
      } catch {}
      await fetchBranches().catch(() => {});
    } finally {
      setMerging(false);
    }
  };

  const canMerge = isRepo && !!selected && !merging && !loadingBranches;
  const noOtherBranches = isRepo && !loadingBranches && branches.length === 0;

  return (
    <div className="h-8 flex items-center gap-3 px-3 text-xs text-[#9e8b7d] border-t border-[#36281e] bg-[#231a14] shrink-0">
      <span className="whitespace-nowrap hidden sm:inline">
        {files.length} changed · {added} added · {mod} modified
      </span>
      <span className="whitespace-nowrap sm:hidden">{files.length} chg</span>
      <span className="whitespace-nowrap truncate max-w-[140px]">branch: {branch ?? "—"}</span>

      {isRepo && (
        <>
          <div className="h-4 w-px bg-[#36281e] shrink-0 hidden md:block" />
          <div className="flex items-center gap-1.5 min-w-0">
            <GitMerge size={12} className="shrink-0 text-[#9e8b7d] hidden sm:block" />
            <span className="hidden lg:inline whitespace-nowrap">Merge</span>
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              disabled={merging || loadingBranches || branches.length === 0}
              title={noOtherBranches ? "No other branches to merge" : "Choose branch to merge into current"}
              className="max-w-[160px] bg-[#2e2118] border border-[#36281e] rounded px-1.5 py-0.5 text-xs text-[#c2ab99] outline-none focus:border-[#d97706] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loadingBranches && <option value="">Loading…</option>}
              {!loadingBranches && branches.length === 0 && <option value="">No branches</option>}
              {!loadingBranches && branches.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
            <span className="hidden sm:inline text-[#5c4737]">→</span>
            <span className="hidden sm:inline truncate max-w-[100px] text-[#c2ab99]" title={`into ${branch ?? "current"}`}>
              {branch ?? "current"}
            </span>
            <button
              onClick={handleMerge}
              disabled={!canMerge}
              title={selected ? `Merge ${selected} into ${branch ?? "current"}${deleteAfter ? " and delete source" : ""}` : "Select a branch first"}
              className={`flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-medium whitespace-nowrap transition-colors ${
                canMerge
                  ? "bg-amber-700 hover:bg-amber-600 text-white border-amber-600"
                  : "bg-[#2e2118] text-[#9e8b7d] border-[#36281e] opacity-60 cursor-not-allowed"
              }`}
            >
              {merging ? <Loader2 size={11} className="animate-spin" /> : <GitMerge size={11} />}
              {merging ? "Merging…" : "Merge"}
            </button>
            <label
              title="Delete source branch after successful merge (git branch -d)"
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded border cursor-pointer select-none whitespace-nowrap ${
                deleteAfter ? "bg-[#453225] border-[#5c4737] text-amber-200" : "bg-[#2e2118] border-[#36281e] text-[#9e8b7d] hover:bg-[#4a3627]"
              } ${merging ? "opacity-50 pointer-events-none" : ""}`}
            >
              <input
                type="checkbox"
                checked={deleteAfter}
                onChange={(e) => setDeleteAfter(e.target.checked)}
                className="accent-amber-600 w-3 h-3"
              />
              <Trash2 size={11} className={deleteAfter ? "text-amber-400" : "text-[#9e8b7d]"} />
              <span className="hidden xl:inline">delete after</span>
              <span className="xl:hidden">del</span>
            </label>
          </div>
        </>
      )}

      {/* inline feedback */}
      {msg && (
        <span
          className={`hidden md:flex items-center gap-1 truncate max-w-[260px] px-2 py-0.5 rounded border text-[11px] ${
            msg.type === "success"
              ? "bg-emerald-900/40 border-emerald-700/50 text-emerald-200"
              : "bg-red-900/40 border-red-700/50 text-red-200"
          }`}
          title={msg.text}
        >
          {msg.type === "success" ? <Check size={11} className="shrink-0" /> : <AlertTriangle size={11} className="shrink-0" />}
          <span className="truncate">{msg.text}</span>
        </span>
      )}

      <div className="flex-1" />
      <span className="whitespace-nowrap hidden sm:inline">{state === "connected" || state === "working" ? "process running" : state}</span>
      <span className="sm:hidden whitespace-nowrap">{state.slice(0, 4)}</span>
    </div>
  );
}
