import { useEffect, useRef, useState } from "react";
import { GitBranch, Circle, FolderOpen, RefreshCw, ChevronDown, Check, Loader2, AlertTriangle, Sparkles, Search, X } from "lucide-react";
import { useRepo } from "../../stores/repository";
import { useGit } from "../../stores/git";
import { useTerm } from "../../stores/terminal";
import { useUI } from "../../stores/ui";
import { useSearch } from "../../stores/search";
import { api } from "../../lib/api";
const colors: Record<string, string> = { connected: "#3fb950", working: "#d29922", idle: "#8b949e", disconnected: "#6e7681", starting: "#d29922", exited: "#f85149", error: "#f85149" };

export default function TopBar({ onOpen }: { onOpen: () => void }) {
  const { name, root } = useRepo();
  const { branch, files, isRepo, state, refresh } = useGit();
  const { state: oc, error } = useTerm();
  const setAboutOpen = useUI((s) => s.setAboutOpen);
  const setLeftTab = useUI((s) => s.setLeftTab);
  const { query: searchQuery, setQuery: setSearchQuery, executeSearch, isSearching, clearSearch } = useSearch();

  const [open, setOpen] = useState(false);
  const [branches, setBranches] = useState<string[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [branchError, setBranchError] = useState<string | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const handleSearchSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (searchQuery.trim()) {
      setLeftTab("search");
      executeSearch();
    }
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSearchSubmit();
    }
  };

  const fetchBranches = async () => {
    if (!isRepo) return;
    setLoadingBranches(true);
    setBranchError(null);
    try {
      const r = await api.gitBranches();
      setBranches(r.branches);
      setCurrent(r.current);
    } catch (e: any) {
      setBranchError(e.message ?? String(e));
    } finally {
      setLoadingBranches(false);
    }
  };

  useEffect(() => {
    if (open) fetchBranches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // refresh branch list when git status changes elsewhere
  useEffect(() => {
    const h = () => { if (open) fetchBranches(); };
    window.addEventListener("cockpit:git-branch-changed" as any, h);
    return () => window.removeEventListener("cockpit:git-branch-changed" as any, h);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onEsc);
    return () => { window.removeEventListener("mousedown", onDown); window.removeEventListener("keydown", onEsc); };
  }, [open]);

  const handleCheckout = async (target: string) => {
    if (target === current || target === branch) { setOpen(false); return; }
    setSwitching(target);
    setBranchError(null);
    try {
      await api.gitCheckout(target);
      setOpen(false);
      // branch checkout changes files on disk: reload tree + git status
      await Promise.all([useRepo.getState().load(), refresh()]);
      // ensure branch list is fresh next open; also sync current immediately
      setCurrent(target);
    } catch (e: any) {
      setBranchError(e.message ?? String(e));
    } finally {
      setSwitching(null);
    }
  };

  const displayBranch = branch ?? (state === "detached" ? "detached" : "—");
  const isDisabled = !isRepo;

  return (
    <div className="h-11 flex items-center gap-3 px-3 border-b border-[#333333] bg-[#1c1c1c] text-sm shrink-0">
      <button
        onClick={() => setAboutOpen(true)}
        className="font-semibold text-[#F1ECEC] hover:text-white hover:bg-[#2c2c2c] px-1.5 py-0.5 -mx-1.5 rounded transition-colors cursor-pointer flex items-center gap-1.5 focus:outline-none focus:ring-1 focus:ring-[#B7B1B1]/40"
        title="Click to view About OpenCode IDE"
      >
        <img src="/opencode.webp" alt="OpenCode IDE Logo" className="w-4 h-4 object-contain shrink-0" />
        <span>OpenCode IDE</span>
      </button>
      <span className="text-[#4B4646]">|</span>
      <span className="text-[#F1ECEC] font-medium">{name ?? "No repo"}</span>
      {root && <span className="text-xs text-[#B7B1B1] truncate max-w-[280px]">{root}</span>}
      <div ref={wrapRef} className="relative">
        <button
          onClick={() => { if (!isDisabled) setOpen((v) => !v); }}
          disabled={isDisabled}
          title={isDisabled ? "Not a git repository" : "Switch branch"}
          className={`flex items-center gap-1 text-xs px-1.5 py-1 rounded border ${isDisabled ? "opacity-40 cursor-not-allowed border-transparent text-[#B7B1B1]" : "bg-[#262626] border-[#333333] hover:bg-[#333333] text-[#B7B1B1] hover:text-[#F1ECEC]"} `}
        >
          <GitBranch size={13} />
          <span className="max-w-[160px] truncate">{displayBranch}</span>
          {!isDisabled && <ChevronDown size={12} className={`transition-transform ${open ? "rotate-180" : ""} text-[#B7B1B1]`} />}
        </button>
        {open && (
          <div className="absolute top-8 left-0 z-50 min-w-[220px] max-w-[320px] rounded-md border border-[#333333] bg-[#1c1c1c] shadow-xl overflow-hidden">
            <div className="px-3 py-2 text-xs font-medium text-[#B7B1B1] border-b border-[#333333] flex items-center justify-between">
              <span>Switch branch</span>
              <button onClick={() => fetchBranches()} className="p-1 rounded hover:bg-[#2c2c2c] text-[#B7B1B1] hover:text-[#F1ECEC]" title="Refresh branches">
                <RefreshCw size={12} className={loadingBranches ? "animate-spin" : ""} />
              </button>
            </div>
            <div className="max-h-[260px] overflow-y-auto py-1">
              {loadingBranches && (
                <div className="flex items-center gap-2 px-3 py-2 text-xs text-[#B7B1B1]"><Loader2 size={12} className="animate-spin" />Loading branches…</div>
              )}
              {!loadingBranches && branches.length === 0 && !branchError && (
                <div className="px-3 py-2 text-xs text-[#B7B1B1]">No branches found.</div>
              )}
              {!loadingBranches && branches.map((b) => {
                const isCurrent = b === current || b === branch;
                const isSwitching = switching === b;
                return (
                  <button
                    key={b}
                    onClick={() => handleCheckout(b)}
                    disabled={!!switching}
                    className={`flex items-center gap-2 w-full text-left px-3 py-1.5 text-xs hover:bg-[#2c2c2c] ${isCurrent ? "bg-[#4B4646] text-[#F1ECEC] font-medium" : "text-[#B7B1B1] hover:text-[#F1ECEC]"} disabled:opacity-60`}
                  >
                    <GitBranch size={12} className={`shrink-0 ${isCurrent ? "text-[#F1ECEC]" : "text-[#B7B1B1]"}`} />
                    <span className="truncate flex-1">{b}</span>
                    {isSwitching ? <Loader2 size={12} className="animate-spin shrink-0" /> : isCurrent ? <Check size={12} className="shrink-0 text-[#F1ECEC]" /> : null}
                  </button>
                );
              })}
            </div>
            {branchError && (
              <div className="px-3 py-2 text-xs text-red-300 border-t border-[#333333] bg-[#3a1b18]/50 flex items-start gap-1.5">
                <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                <span className="break-words">{branchError}</span>
              </div>
            )}
            <div className="px-3 py-1.5 text-[11px] text-[#B7B1B1] border-t border-[#333333] bg-[#141414]">
              Uncommitted changes may block switching.
            </div>
          </div>
        )}
      </div>
      {/* Centered Search Bar */}
      <div className="flex-1 max-w-[420px] mx-auto flex items-center justify-center">
        <form onSubmit={handleSearchSubmit} className="relative w-full flex items-center">
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search code or text in workspace… (Press Enter)"
            className="w-full pl-8 pr-8 py-1 rounded-md bg-[#141414] border border-[#333333] text-xs text-[#F1ECEC] outline-none focus:border-[#B7B1B1] focus:ring-1 focus:ring-[#B7B1B1]/40 placeholder:text-[#7c7777] transition-all shadow-inner"
          />
          <Search size={13} className="absolute left-2.5 text-[#B7B1B1] pointer-events-none" />
          {isSearching ? (
            <Loader2 size={13} className="absolute right-2.5 text-[#B7B1B1] animate-spin" />
          ) : searchQuery ? (
            <button
              type="button"
              onClick={() => clearSearch()}
              className="absolute right-2 text-[#B7B1B1] hover:text-[#F1ECEC] p-0.5 rounded transition-colors"
              title="Clear Search"
            >
              <X size={13} />
            </button>
          ) : null}
        </form>
      </div>
      <span className="flex items-center gap-1.5 text-xs text-[#B7B1B1]" title={error ?? oc}><Circle size={9} fill={colors[oc] ?? "#f85149"} color={colors[oc] ?? "#f85149"} />OpenCode {oc === "error" && error?.toLowerCase().includes("not found") ? "not found — install first" : oc}</span>
      <button onClick={onOpen} className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-[#262626] border border-[#333333] hover:bg-[#333333] text-[#F1ECEC]"><FolderOpen size={13} />Open</button>
      <button onClick={() => { useRepo.getState().load(); useGit.getState().refresh(); }} className="p-1.5 rounded hover:bg-[#2c2c2c] text-[#B7B1B1] hover:text-[#F1ECEC]" title="Refresh"><RefreshCw size={13} /></button>
    </div>
  );
}
