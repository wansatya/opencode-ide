import { memo, useMemo } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import type { FileNode } from "../../types";
import { useRepo } from "../../stores/repository";
import { useGit } from "../../stores/git";
import { getFileIcon, getFolderIcon } from "./fileIcons";
function badge(s?: string) {
  if (!s) return null;
  const map: Record<string, string> = { modified: "M", added: "A", untracked: "?", deleted: "D", renamed: "R", conflicted: "!" };
  return <span className="ml-auto text-[10px] px-1 rounded bg-[#36271c] border border-[#4a3627] text-amber-400 font-medium">{map[s] ?? s[0]}</span>;
}
// Memoized + narrowly subscribed: previously every Node subscribed to the
// whole repo/git stores, so expanding one folder or selecting one file
// re-rendered all N nodes (opening a large repo froze the UI after the tree
// arrived). Now each Node only re-renders when its own slice changes.
type Ctx = { x: number; y: number; dir: string; target: string | null; targetType: "file" | "directory" | null };

const Node = memo(function Node({ node, depth, onContextMenu }: { node: FileNode; depth: number; onContextMenu?: (x: number, y: number, dir: string, target: string | null, targetType: "file" | "directory" | null) => void }) {
  const open = useRepo((s) => !!s.expanded[node.path]);
  const active = useRepo((s) => s.selectedFile === node.path);
  const st = useGit((s) => s.statusMap[node.path]?.status);
  const deleted = st === "deleted";
  if (node.type === "directory") {
    const { Icon, className } = getFolderIcon(node.name, open);
    return (
      <div>
        <button
          onClick={() => useRepo.getState().toggle(node.path)}
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onContextMenu?.(e.clientX, e.clientY, node.path, node.path, "directory"); }}
          className="w-full flex items-center gap-1 px-1 py-[3px] text-[13px] hover:bg-[#281f18] rounded text-[#ece1d8]" style={{ paddingLeft: 6 + depth * 12 }}>
          {open ? <ChevronDown size={13} className="text-[#9e8b7d]" /> : <ChevronRight size={13} className="text-[#9e8b7d]" />}
          <Icon size={14} className={`${className} shrink-0`} />
          <span className="truncate">{node.name}</span>
        </button>
        {open && node.children?.map((c) => <Node key={c.path} node={c} depth={depth + 1} onContextMenu={onContextMenu} />)}
      </div>
    );
  }
  const { Icon: FileGlyph, className: fileClass } = getFileIcon(node.name);
  const parentDir = node.path.includes("/") ? node.path.substring(0, node.path.lastIndexOf("/")) : "";
  return (
    <button
      onClick={() => useRepo.getState().select(node.path)} onDoubleClick={() => useRepo.getState().select(node.path)}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onContextMenu?.(e.clientX, e.clientY, parentDir, node.path, "file"); }}
      className={`w-full flex items-center gap-1.5 px-1 py-[3px] text-[13px] rounded ${active ? "bg-[#453225] text-amber-100 font-medium" : "hover:bg-[#281f18] text-[#c2ab99]"} ${deleted ? "line-through opacity-60" : ""}`}
      style={{ paddingLeft: 6 + depth * 12 + 14 }}>
      <FileGlyph size={14} className={`${fileClass} shrink-0`} />
      <span className="truncate">{node.name}</span>
      {badge(st)}
    </button>
  );
});
export default function FileTree({ onContextMenu }: { onContextMenu?: (x: number, y: number, dir: string, target: string | null, targetType: "file" | "directory" | null) => void }) {
  const tree = useRepo((s) => s.tree);
  const items = useMemo(() => tree, [tree]);
  return <div className="py-1">{items.map((n) => <Node key={n.path} node={n} depth={0} onContextMenu={onContextMenu} />)}</div>;
}
