import { useEffect, useRef, useState, useCallback } from "react";
import Editor, { DiffEditor } from "@monaco-editor/react";
import { X, GitCompare, Save } from "lucide-react";
import { api } from "../../lib/api";
import { useRepo } from "../../stores/repository";
import { useEditor } from "../../stores/editor";
import { useGit } from "../../stores/git";

function langOf(p: string) {
  const e = p.split(".").pop()?.toLowerCase();
  const m: Record<string, string> = { ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript", json: "json", md: "markdown", py: "python", rs: "rust", go: "go", css: "css", html: "html", yml: "yaml", yaml: "yaml", toml: "toml", sh: "shell" };
  return m[e ?? ""] ?? "plaintext";
}

const handleBeforeMount = (monaco: any) => {
  monaco.editor.defineTheme("dark-brown", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "", background: "140f0c", foreground: "ece1d8" },
      { token: "comment", foreground: "7c6a5c", fontStyle: "italic" },
      { token: "keyword", foreground: "e58e26", fontStyle: "bold" },
      { token: "string", foreground: "c29b62" },
      { token: "number", foreground: "e09f67" },
      { token: "type", foreground: "ddb274" },
      { token: "function", foreground: "f3b367" },
      { token: "variable", foreground: "ece1d8" },
      { token: "delimiter", foreground: "9e8b7d" },
    ],
    colors: {
      "editor.background": "#140f0c",
      "editor.foreground": "#ece1d8",
      "editor.lineHighlightBackground": "#231a14",
      "editorCursor.foreground": "#f59e0b",
      "editorWhitespace.foreground": "#36281e",
      "editor.selectionBackground": "#4a3627",
      "editor.inactiveSelectionBackground": "#33251a",
      "editorLineNumber.foreground": "#635245",
      "editorLineNumber.activeForeground": "#d97706",
      "editorGutter.background": "#140f0c",
      "diffEditor.insertedTextBackground": "#2a3d2480",
      "diffEditor.removedTextBackground": "#4d232380",
    },
  });
};

export default function EditorPanel() {
  const { selectedFile } = useRepo();
  const ed = useEditor();
  const { statusMap, refresh } = useGit();
  const [meta, setMeta] = useState<{ binary?: boolean; tooLarge?: boolean } | null>(null);
  const [base, setBase] = useState<string | null>(null);
  const val = selectedFile ? ed.contents[selectedFile] ?? "" : "";
  const mode = selectedFile ? ed.mode[selectedFile] ?? "code" : "code";

  const load = useCallback(async (p: string) => {
    try {
      const f = await api.file(p);
      if (f.binary) { setMeta({ binary: true }); return; }
      if (f.tooLarge) { setMeta({ tooLarge: true }); return; }
      setMeta(null);
      const curDirty = useEditor.getState().dirty[p];
      if (curDirty) {
        const disk = f.content ?? "";
        if (disk !== useEditor.getState().contents[p]) {
          useEditor.getState().setConflict({ path: p, diskContent: disk });
          return;
        }
      }
      ed.setContent(p, f.content ?? "", f.hash);
      ed.markDirty(p, false);
    } catch (e: any) { ed.notify(e.message); }
    // load git base for diff
    try {
      const st = useGit.getState().statusMap[p]?.status;
      if (st === "untracked" || st === "added") setBase("");
      else setBase(await useGit.getState().head(p));
    } catch { setBase(null); }
  }, []);

  useEffect(() => {
    if (selectedFile) { ed.open(selectedFile); load(selectedFile); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFile]);

  // external-change refresh via custom event
  useEffect(() => {
    const h = (e: any) => {
      const p = e.detail as string;
      if (p === useRepo.getState().selectedFile) load(p);
      refresh();
      useRepo.getState().load();
    };
    window.addEventListener("cockpit:file-event", h);
    window.addEventListener("cockpit:git", () => refresh());
    return () => { window.removeEventListener("cockpit:file-event", h); };
  }, [load, refresh]);

  const save = useCallback(async () => {
    const p = useRepo.getState().selectedFile;
    if (!p) return;
    try {
      const content = useEditor.getState().contents[p] ?? "";
      const r = await api.saveFile(p, content);
      ed.setContent(p, content, r.hash);
      ed.markDirty(p, false);
      refresh();
    } catch (e: any) { ed.notify(e.message); }
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); save(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [save]);

  if (!selectedFile) return <div className="h-full flex items-center justify-center text-sm text-[#9e8b7d] bg-[#140f0c]">Select a file from the repository.</div>;
  const gitSt = statusMap[selectedFile]?.status;
  return (
    <div className="h-full flex flex-col bg-[#140f0c]">
      <div className="flex items-center gap-1 px-2 h-9 border-b border-[#36281e] bg-[#231a14] overflow-x-auto shrink-0">
        {ed.openFiles.map((f) => (
          <span key={f} onClick={() => useRepo.getState().select(f)}
            className={`flex items-center gap-1 px-2 py-1 text-xs rounded cursor-pointer whitespace-nowrap ${f === selectedFile ? "bg-[#453225] text-amber-100 font-medium" : "text-[#9e8b7d] hover:bg-[#281f18] hover:text-[#ece1d8]"}`}>
            {f.split("/").pop()}{ed.dirty[f] ? " •" : ""}
            <X size={12} className="hover:text-red-400" onClick={(e) => { e.stopPropagation(); ed.close(f); }} />
          </span>
        ))}
        <div className="flex-1" />
        {selectedFile && ed.dirty[selectedFile] && (
          <button onClick={save}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-amber-700 hover:bg-amber-600 text-white font-medium shadow-sm" title="Save (Ctrl/Cmd+S)">
            <Save size={12} />Save •
          </button>
        )}
        {gitSt && gitSt !== "untracked" && (
          <button onClick={() => ed.setMode(selectedFile, mode === "code" ? "diff" : "code")}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-[#2e2118] border border-[#36281e] hover:bg-[#4a3627] text-[#ece1d8]">
            <GitCompare size={12} />{mode === "code" ? "Diff" : "Code"}
          </button>
        )}
      </div>
      {meta?.binary && <div className="p-6 text-sm text-[#9e8b7d]">Binary file — This file cannot be displayed in the editor.</div>}
      {meta?.tooLarge && <div className="p-6 text-sm text-[#9e8b7d]">Large file — This file is too large to safely display in the editor.</div>}
      {!meta?.binary && !meta?.tooLarge && (
        mode === "diff" ? (
          <DiffEditor height="100%" theme="dark-brown" beforeMount={handleBeforeMount} original={base ?? ""} modified={val} language={langOf(selectedFile)}
            onMount={(e) => e.getModifiedEditor().onDidChangeModelContent(() => {
              const v = e.getModifiedEditor().getValue();
              ed.setContent(selectedFile, v); ed.markDirty(selectedFile, true);
            })}
            options={{ fontSize: 13, minimap: { enabled: false }, readOnly: false, originalEditable: false, renderSideBySide: true }} />
        ) : (
          <Editor height="100%" theme="dark-brown" beforeMount={handleBeforeMount} language={langOf(selectedFile)} value={val}
            onChange={(v) => { ed.setContent(selectedFile, v ?? ""); ed.markDirty(selectedFile, true); }}
            options={{ fontSize: 13, minimap: { enabled: false }, folding: true, matchBrackets: "always", autoIndent: "full", wordWrap: "off", readOnly: false, domReadOnly: false, stickyScroll: { enabled: true } as any }} />
        )
      )}
      {ed.conflict && ed.conflict.path === selectedFile && (
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 bg-[#281d16] border border-amber-500/40 rounded-lg p-4 shadow-xl text-sm text-[#ece1d8]">
          <div className="font-medium mb-1 text-amber-300">External change detected</div>
          <div className="text-[#9e8b7d] mb-3">This file was modified outside the editor.</div>
          <div className="flex gap-2">
            <button className="px-2 py-1 rounded bg-[#36271c] hover:bg-[#4a3627] text-[#ece1d8]" onClick={() => ed.setMode(selectedFile, "diff")}>Compare</button>
            <button className="px-2 py-1 rounded bg-[#36271c] hover:bg-[#4a3627] text-[#ece1d8]" onClick={() => { ed.setConflict(null); ed.markDirty(selectedFile, true); }}>Keep Mine</button>
            <button className="px-2 py-1 rounded bg-amber-700 hover:bg-amber-600 text-white" onClick={() => { ed.setContent(selectedFile, ed.conflict!.diskContent); ed.markDirty(selectedFile, false); ed.setConflict(null); }}>Reload From Disk</button>
          </div>
        </div>
      )}
    </div>
  );
}
