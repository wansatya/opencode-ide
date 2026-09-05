import { useGit } from "../../stores/git";
import { useTerm } from "../../stores/terminal";
export default function StatusBar() {
  const { files, branch } = useGit();
  const { state } = useTerm();
  const added = files.filter((f) => f.status === "added" || f.status === "untracked").length;
  const mod = files.filter((f) => f.status === "modified").length;
  return (
    <div className="h-7 flex items-center gap-3 px-3 text-xs text-[#9e8b7d] border-t border-[#36281e] bg-[#231a14] shrink-0">
      <span>{files.length} changed · {added} added · {mod} modified</span>
      <span>branch: {branch ?? "—"}</span>
      <div className="flex-1" />
      <span>{state === "connected" || state === "working" ? "process running" : state}</span>
    </div>
  );
}
