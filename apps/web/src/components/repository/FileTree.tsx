import { memo, useMemo } from "react";
import { ChevronRight, ChevronDown, Folder, FolderOpen, File } from "lucide-react";
import type { FileNode } from "../../types";
import { useRepo } from "../../stores/repository";
import { useGit } from "../../stores/git";
function badge(s?: string) {
  if (!s) return null;
  const map: Record<string, string> = { modified: "M", added: "A", untracked: "?", deleted: "D", renamed: "R", conflicted: "!" };
  return <span className="ml-auto text-[10px] px-1 rounded bg-[#232d45] text-amber-300">{map[s] ?? s[0]}</span>;
}
// Memoized + narrowly subscribed: previously every Node subscribed to the
// whole repo/git stores, so expanding one folder or selecting one file
// re-rendered all N nodes (opening a large repo froze the UI after the tree
// arrived). Now each Node only re-renders when its own slice changes.
const Node = memo(function Node({ node, depth }: { node: FileNode; depth: number }) {
  const open = useRepo((s) => !!s.expanded[node.path]);
  const active = useRepo((s) => s.selectedFile === node.path);
  const st = useGit((s) => s.statusMap[node.path]?.status);
  const deleted = st === "deleted";
  if (node.type === "directory") {
    return (
      <div>
        <button onClick={() => useRepo.getState().toggle(node.path)} className="w-full flex items-center gap-1 px-1 py-[3px] text-[13px] hover:bg-[#161d2c] rounded text-gray-200" style={{ paddingLeft: 6 + depth * 12 }}>
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          {open ? <FolderOpen size={14} className="text-sky-400" /> : <Folder size={14} className="text-sky-400" />}
          <span className="truncate">{node.name}</span>
        </button>
        {open && node.children?.map((c) => <Node key={c.path} node={c} depth={depth + 1} />)}
      </div>
    );
  }
  return (
    <button onClick={() => useRepo.getState().select(node.path)} onDoubleClick={() => useRepo.getState().select(node.path)}
      className={`w-full flex items-center gap-1.5 px-1 py-[3px] text-[13px] rounded ${active ? "bg-[#1d2a45] text-white" : "hover:bg-[#161d2c] text-gray-300"} ${deleted ? "line-through opacity-60" : ""}`}
      style={{ paddingLeft: 6 + depth * 12 + 14 }}>
      <File size={13} className="text-gray-500 shrink-0" />
      <span className="truncate">{node.name}</span>
      {badge(st)}
    </button>
  );
});
export default function FileTree() {
  const tree = useRepo((s) => s.tree);
  const items = useMemo(() => tree, [tree]);
  return <div className="py-1">{items.map((n) => <Node key={n.path} node={n} depth={0} />)}</div>;
}
