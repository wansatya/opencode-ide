import { GitBranch, Circle, FolderOpen, RefreshCw } from "lucide-react";
import { useRepo } from "../../stores/repository";
import { useGit } from "../../stores/git";
import { useTerm } from "../../stores/terminal";
const colors: Record<string, string> = { connected: "#3fb950", working: "#d29922", idle: "#8b949e", disconnected: "#6e7681", starting: "#d29922", exited: "#f85149", error: "#f85149" };
export default function TopBar({ onOpen }: { onOpen: () => void }) {
  const { name, root } = useRepo();
  const { branch, files, isRepo, state } = useGit();
  const { state: oc, error } = useTerm();
  return (
    <div className="h-11 flex items-center gap-3 px-3 border-b border-[#36281e] bg-[#231a14] text-sm shrink-0">
      <span className="font-semibold text-amber-500">Wan Cockpit</span>
      <span className="text-[#5c4737]">|</span>
      <span className="text-[#ece1d8] font-medium">{name ?? "No repo"}</span>
      {root && <span className="text-xs text-[#9e8b7d] truncate max-w-[280px]">{root}</span>}
      <span className="flex items-center gap-1 text-xs text-[#c2ab99]"><GitBranch size={13} />{branch ?? "—"}</span>
      <span className="text-xs px-1.5 py-0.5 rounded bg-[#2e2118] border border-[#36281e] text-[#d9cbbf]">{isRepo ? (state === "clean" ? "clean" : state + ` · ${files.length}`) : "no git"}</span>
      <div className="flex-1" />
      <span className="flex items-center gap-1.5 text-xs text-[#c2ab99]" title={error ?? oc}><Circle size={9} fill={colors[oc] ?? "#f85149"} color={colors[oc] ?? "#f85149"} />OpenCode {oc === "error" && error?.toLowerCase().includes("not found") ? "not found — install first" : oc}</span>
      <button onClick={onOpen} className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-[#2e2118] border border-[#36281e] hover:bg-[#4a3627] text-[#ece1d8]"><FolderOpen size={13} />Open</button>
      <button onClick={() => { useRepo.getState().load(); useGit.getState().refresh(); }} className="p-1.5 rounded hover:bg-[#2e2118] text-[#c2ab99] hover:text-[#ece1d8]" title="Refresh"><RefreshCw size={13} /></button>
    </div>
  );
}
