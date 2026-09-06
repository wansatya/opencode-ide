import { useState, useEffect, useCallback } from "react";
import { FilePlus, FolderPlus, File, Folder, Trash2 } from "lucide-react";
import FileTree from "./FileTree";
import { useRepo } from "../../stores/repository";
import { useEditor } from "../../stores/editor";
import { api } from "../../lib/api";

type Menu = { x: number; y: number; dir: string; target: string | null; targetType: "file" | "directory" | null } | null;
type Prompt = { type: "file" | "directory"; parent: string } | null;
type ConfirmDelete = { path: string; type: "file" | "directory" } | null;

function joinPath(parent: string, name: string) {
  const n = name.trim().replace(/^\/+/, "");
  if (!parent) return n;
  return parent + "/" + n;
}

export default function RepositoryPanel() {
  const { loading, error, truncated, root } = useRepo();
  const [menu, setMenu] = useState<Menu>(null);
  const [prompt, setPrompt] = useState<Prompt>(null);
  const [name, setName] = useState("");
  const [promptError, setPromptError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmDelete>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const closeMenu = useCallback(() => setMenu(null), []);
  useEffect(() => {
    if (!menu) return;
    const h = () => closeMenu();
    window.addEventListener("click", h);
    window.addEventListener("contextmenu", h);
    return () => { window.removeEventListener("click", h); window.removeEventListener("contextmenu", h); };
  }, [menu, closeMenu]);

  const openPrompt = useCallback((type: "file" | "directory", parent: string) => {
    setMenu(null);
    setPrompt({ type, parent });
    setName("");
    setPromptError(null);
  }, []);

  const submit = useCallback(async () => {
    if (!prompt || creating) return;
    const trimmed = name.trim();
    if (!trimmed) { setPromptError("Name required"); return; }
    if (trimmed.includes("\0")) { setPromptError("Invalid name"); return; }
    const full = joinPath(prompt.parent, trimmed);
    setCreating(true);
    setPromptError(null);
    try {
      if (prompt.type === "file") await api.createFile(full);
      else await api.createDirectory(full);
      // expand parent chain so new item is visible
      const dir = full.includes("/") ? full.substring(0, full.lastIndexOf("/")) : "";
      if (dir) {
        const parts = dir.split("/");
        const toExpand: Record<string, boolean> = {};
        let cur = "";
        for (const p of parts) {
          cur = cur ? cur + "/" + p : p;
          toExpand[cur] = true;
        }
        useRepo.setState({ expanded: { ...useRepo.getState().expanded, ...toExpand } });
      }
      await useRepo.getState().load();
      if (prompt.type === "file") useRepo.getState().select(full);
      setPrompt(null);
    } catch (e: any) {
      setPromptError(e.message ?? "Failed to create");
    } finally {
      setCreating(false);
    }
  }, [prompt, name, creating]);

  const handleContextMenu = useCallback((x: number, y: number, dir: string, target: string | null = null, targetType: "file" | "directory" | null = null) => {
    if (!root) return;
    setMenu({ x, y, dir, target, targetType });
  }, [root]);

  const confirmDelete = useCallback(() => {
    if (!menu?.target || !menu.targetType) return;
    setConfirm({ path: menu.target, type: menu.targetType });
    setMenu(null);
    setDeleteError(null);
  }, [menu]);

  const doDelete = useCallback(async () => {
    if (!confirm || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.deletePath(confirm.path);
      // close editors for deleted paths
      const editorState = useEditor.getState();
      if (confirm.type === "file") {
        if (editorState.openFiles.includes(confirm.path)) editorState.close(confirm.path);
        if (useRepo.getState().selectedFile === confirm.path) useRepo.getState().select(null);
      } else {
        // directory: close any open files inside it
        const prefix = confirm.path + "/";
        for (const f of [...editorState.openFiles]) {
          if (f === confirm.path || f.startsWith(prefix)) editorState.close(f);
        }
        if (useRepo.getState().selectedFile?.startsWith(prefix)) useRepo.getState().select(null);
        // collapse expanded state for deleted dir and its children
        const expanded = { ...useRepo.getState().expanded };
        for (const k of Object.keys(expanded)) {
          if (k === confirm.path || k.startsWith(prefix)) delete expanded[k];
        }
        useRepo.setState({ expanded });
      }
      await useRepo.getState().load();
      setConfirm(null);
    } catch (e: any) {
      setDeleteError(e.message ?? "Failed to delete");
    } finally {
      setDeleting(false);
    }
  }, [confirm, deleting]);

  return (
    <div className="h-full flex flex-col bg-[#1a130f] overflow-hidden">
      <div className="flex items-center gap-1 px-2 pt-2 pb-1 shrink-0">
        <div className="flex-1 text-[11px] uppercase tracking-wide text-[#9e8b7d] font-medium">Repository</div>
        <button
          title="New File"
          disabled={!root}
          onClick={() => openPrompt("file", "")}
          className="p-1 rounded hover:bg-[#2e2118] text-[#9e8b7d] hover:text-[#ece1d8] disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <FilePlus size={14} />
        </button>
        <button
          title="New Folder"
          disabled={!root}
          onClick={() => openPrompt("directory", "")}
          className="p-1 rounded hover:bg-[#2e2118] text-[#9e8b7d] hover:text-[#ece1d8] disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <FolderPlus size={14} />
        </button>
      </div>
      {loading && <div className="px-3 text-xs text-[#9e8b7d]">Loading…</div>}
      {error && <div className="px-3 text-xs text-red-400">{error}</div>}
      {truncated && <div className="px-3 py-1 text-[11px] text-amber-300/90">Large repo — tree truncated (20k files / 10 levels). Use Quick Open (Ctrl+P) for deeper files.</div>}
      <div className="flex-1 overflow-auto" onContextMenu={(e) => { e.preventDefault(); handleContextMenu(e.clientX, e.clientY, "", null, null); }}>
        <FileTree onContextMenu={handleContextMenu} />
      </div>

      {menu && (
        <div
          className="fixed z-40 min-w-[160px] bg-[#231a14] border border-[#36281e] rounded-md shadow-xl py-1 text-sm text-[#ece1d8]"
          style={{ left: Math.min(menu.x, window.innerWidth - 170), top: Math.min(menu.y, window.innerHeight - 120) }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1 text-[11px] text-[#9e8b7d] truncate max-w-[180px]">{menu.target ? menu.target : (menu.dir ? menu.dir : "/")}</div>
          <button
            onClick={() => openPrompt("file", menu.dir)}
            className="flex items-center gap-2 w-full text-left px-3 py-1.5 hover:bg-[#2e2118] text-[#c2ab99] hover:text-[#ece1d8]"
          >
            <File size={14} className="text-[#9e8b7d]" /> New File
          </button>
          <button
            onClick={() => openPrompt("directory", menu.dir)}
            className="flex items-center gap-2 w-full text-left px-3 py-1.5 hover:bg-[#2e2118] text-[#c2ab99] hover:text-[#ece1d8]"
          >
            <Folder size={14} className="text-[#9e8b7d]" /> New Folder
          </button>
          {menu.target && menu.targetType && (
            <>
              <div className="mx-2 my-1 border-t border-[#36281e]" />
              <button
                onClick={confirmDelete}
                className="flex items-center gap-2 w-full text-left px-3 py-1.5 hover:bg-red-900/30 text-red-400 hover:text-red-300"
              >
                <Trash2 size={14} className="text-red-400" /> Delete {menu.targetType === "directory" ? "Folder" : "File"}
              </button>
            </>
          )}
        </div>
      )}

      {confirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => !deleting && setConfirm(null)}>
          <div className="bg-[#231a14] border border-[#36281e] rounded-lg p-4 w-[380px] text-[#ece1d8] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-medium text-amber-200 mb-1">Delete {confirm.type === "directory" ? "Folder" : "File"}</h3>
            <p className="text-sm text-[#c2ab99] mb-1 break-all">
              Are you sure you want to delete <span className="text-[#ece1d8] font-medium">{confirm.path}</span>?
            </p>
            {confirm.type === "directory" && <p className="text-xs text-red-400 mb-2">This will recursively delete all contents.</p>}
            {deleteError && <div className="text-xs text-red-400 mt-2">{deleteError}</div>}
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => setConfirm(null)} disabled={deleting} className="px-3 py-1.5 text-sm rounded bg-[#2e2118] border border-[#36281e] hover:bg-[#4a3627] text-[#ece1d8] disabled:opacity-40">Cancel</button>
              <button
                onClick={doDelete}
                disabled={deleting}
                onKeyDown={(e) => { if (e.key === "Enter") doDelete(); }}
                className="px-3 py-1.5 text-sm rounded bg-red-700 hover:bg-red-600 text-white font-medium disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {prompt && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => !creating && setPrompt(null)}>
          <div className="bg-[#231a14] border border-[#36281e] rounded-lg p-4 w-[380px] text-[#ece1d8] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-medium text-amber-200 mb-1">{prompt.type === "file" ? "New File" : "New Folder"}</h3>
            <p className="text-xs text-[#9e8b7d] mb-2">
              {prompt.parent ? <>in <span className="text-[#c2ab99]">{prompt.parent}</span></> : "at repository root"} — you can include subfolders (e.g. a/b/c.txt)
            </p>
            <input
              autoFocus
              value={name}
              disabled={creating}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") setPrompt(null); }}
              placeholder={prompt.type === "file" ? "filename.ts" : "folder name"}
              className="w-full px-2 py-1.5 rounded bg-[#140f0c] border border-[#36281e] text-sm text-[#ece1d8] outline-none focus:border-[#d97706] disabled:opacity-60"
            />
            {promptError && <div className="text-xs text-red-400 mt-2">{promptError}</div>}
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => setPrompt(null)} disabled={creating} className="px-3 py-1.5 text-sm rounded bg-[#2e2118] border border-[#36281e] hover:bg-[#4a3627] text-[#ece1d8] disabled:opacity-40">Cancel</button>
              <button onClick={submit} disabled={creating || !name.trim()} className="px-3 py-1.5 text-sm rounded bg-amber-700 hover:bg-amber-600 text-white font-medium disabled:opacity-50">
                {creating ? "Creating…" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
