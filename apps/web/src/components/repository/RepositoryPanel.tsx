import FileTree from "./FileTree";
import { useRepo } from "../../stores/repository";
export default function RepositoryPanel() {
  const { loading, error, truncated } = useRepo();
  return (
    <div className="h-full overflow-auto bg-[#1a130f]">
      <div className="px-2 pt-2 pb-1 text-[11px] uppercase tracking-wide text-[#9e8b7d] font-medium">Repository</div>
      {loading && <div className="px-3 text-xs text-[#9e8b7d]">Loading…</div>}
      {error && <div className="px-3 text-xs text-red-400">{error}</div>}
      {truncated && <div className="px-3 py-1 text-[11px] text-amber-300/90">Large repo — tree truncated (20k files / 10 levels). Use Quick Open (Ctrl+P) for deeper files.</div>}
      <FileTree />
    </div>
  );
}
