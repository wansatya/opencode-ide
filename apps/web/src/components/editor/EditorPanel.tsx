import { useEffect, useRef, useState, useCallback } from "react";
import Editor, { DiffEditor } from "@monaco-editor/react";
import { X, GitCompare, Save, Search, Replace, ChevronUp, ChevronDown, WrapText, Settings2 } from "lucide-react";
import { api } from "../../lib/api";
import { useRepo } from "../../stores/repository";
import { useEditor } from "../../stores/editor";
import { useGit } from "../../stores/git";
import { useUI } from "../../stores/ui";

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

function isWordChar(ch: string) { return /[A-Za-z0-9_]/.test(ch); }

export default function EditorPanel() {
  const { selectedFile } = useRepo();
  const ed = useEditor();
  const { statusMap, refresh } = useGit();
  const { editorTabSize, editorInsertSpaces, setTabSize, setInsertSpaces } = useUI();
  const [meta, setMeta] = useState<{ binary?: boolean; tooLarge?: boolean } | null>(null);
  const [base, setBase] = useState<string | null>(null);
  const val = selectedFile ? ed.contents[selectedFile] ?? "" : "";
  const mode = selectedFile ? ed.mode[selectedFile] ?? "code" : "code";
  const pendingRef = useRef<string[]>([]);
  const timerRef = useRef<number | null>(null);

  // ---- Monaco refs & settings ----
  const monacoRef = useRef<any>(null);
  const editorRef = useRef<any>(null);
  const diffModifiedRef = useRef<any>(null);
  const diffOriginalRef = useRef<any>(null);
  const decorationsRef = useRef<string[]>([]);
  const findMatchesRef = useRef<any[]>([]);

  // ---- Search / Replace state ----
  const [showFind, setShowFind] = useState(false);
  const [showReplaceRow, setShowReplaceRow] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [replaceQuery, setReplaceQuery] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [matchCount, setMatchCount] = useState(0);
  const [regexError, setRegexError] = useState<string | null>(null);
  const [showIndent, setShowIndent] = useState(false);
  const [tabMenu, setTabMenu] = useState<{ x: number; y: number; file: string | null } | null>(null);

  const getActiveEditor = useCallback(() => {
    if (mode === "diff") return diffModifiedRef.current;
    return editorRef.current;
  }, [mode]);

  const clearDecorations = useCallback(() => {
    const e = getActiveEditor();
    if (e && decorationsRef.current.length) {
      try { e.deltaDecorations(decorationsRef.current, []); } catch {}
      decorationsRef.current = [];
    }
    findMatchesRef.current = [];
    setMatchCount(0);
  }, [getActiveEditor]);

  const revealIdx = useCallback((idx: number, matches?: any[]) => {
    const e = getActiveEditor();
    const ms = matches ?? findMatchesRef.current;
    if (!e || ms.length === 0) return;
    const m = ms[idx];
    if (!m) return;
    try {
      e.setSelection(m.range);
      e.revealRangeInCenter(m.range);
      e.focus();
    } catch {}
  }, [getActiveEditor]);

  const updateDecorations = useCallback((matches: any[], idx: number) => {
    const e = getActiveEditor();
    if (!e) return;
    const monaco = monacoRef.current;
    // Clear previous
    const newDec = matches.map((m, i) => ({
      range: m.range,
      options: {
        inlineClassName: i === idx ? "findMatchCurrent" : "findMatch",
        overviewRuler: { color: i === idx ? "#f59e0b" : "#d97706", position: 4 } as any,
      },
    }));
    // We add own CSS for findMatch via monaco theme? Use inline decorations with class
    // Fallback: use simple highlight via decoration
    try {
      // remove old
      decorationsRef.current = e.deltaDecorations(decorationsRef.current, newDec.map((d: any) => ({
        range: d.range,
        options: {
          inlineClassName: d.options.inlineClassName === "findMatchCurrent" ? "findMatchCurrentBg" : "findMatchBg",
          overviewRuler: d.options.overviewRuler,
        }
      })));
    } catch {}
    // Also ensure monaco CSS exists once
    if (monaco && !document.getElementById("cockpit-find-style")) {
      const s = document.createElement("style");
      s.id = "cockpit-find-style";
      s.textContent = `.findMatchBg{background: #4a362780; border: 1px solid #d97706; } .findMatchCurrentBg{background: #f59e0b50; border: 1px solid #f59e0b; }`;
      document.head.appendChild(s);
    }
  }, [getActiveEditor]);

  const runFind = useCallback(() => {
    const e = getActiveEditor();
    const monaco = monacoRef.current;
    if (!e || !monaco) return;
    const model = e.getModel();
    if (!model) return;
    if (!findQuery) {
      clearDecorations();
      setRegexError(null);
      return;
    }
    let rawMatches: any[] = [];
    setRegexError(null);
    try {
      // validate regex
      if (useRegex) new RegExp(findQuery, matchCase ? "" : "i");
      rawMatches = model.findMatches(findQuery, false, useRegex, matchCase, null, false);
    } catch (err: any) {
      setRegexError(err.message ?? "Invalid regex");
      clearDecorations();
      return;
    }
    // wholeWord filter
    if (wholeWord) {
      rawMatches = rawMatches.filter((m: any) => {
        const r = m.range;
        const line = model.getLineContent(r.startLineNumber);
        const before = r.startColumn > 1 ? line[r.startColumn - 2] : "";
        const after = r.endColumn - 1 < line.length ? line[r.endColumn - 1] : "";
        const beforeIsWord = before ? isWordChar(before) : false;
        const afterIsWord = after ? isWordChar(after) : false;
        return !beforeIsWord && !afterIsWord;
      });
    }
    findMatchesRef.current = rawMatches;
    setMatchCount(rawMatches.length);
    const idx = rawMatches.length ? 0 : 0;
    setCurrentIdx(idx);
    if (rawMatches.length) updateDecorations(rawMatches, idx);
    else clearDecorations();
  }, [getActiveEditor, findQuery, useRegex, matchCase, wholeWord, clearDecorations, updateDecorations]);

  // clear stale decorations when file switches
  useEffect(() => {
    clearDecorations();
    if (showFind && selectedFile) setTimeout(runFind, 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFile]);

  // recompute when query/options or file value change
  useEffect(() => {
    if (!showFind) return;
    runFind();
  }, [runFind, showFind, val]);

  // when navigating idx change, update decorations and reveal
  useEffect(() => {
    if (!showFind || matchCount === 0) return;
    updateDecorations(findMatchesRef.current, currentIdx);
    revealIdx(currentIdx);
  }, [currentIdx]); // eslint-disable-line react-hooks/exhaustive-deps

  const goNext = useCallback(() => {
    if (findMatchesRef.current.length === 0) return;
    const n = (currentIdx + 1) % findMatchesRef.current.length;
    setCurrentIdx(n);
    updateDecorations(findMatchesRef.current, n);
    revealIdx(n);
  }, [currentIdx, updateDecorations, revealIdx]);

  const goPrev = useCallback(() => {
    if (findMatchesRef.current.length === 0) return;
    const n = (currentIdx - 1 + findMatchesRef.current.length) % findMatchesRef.current.length;
    setCurrentIdx(n);
    updateDecorations(findMatchesRef.current, n);
    revealIdx(n);
  }, [currentIdx, updateDecorations, revealIdx]);

  const replaceOne = useCallback(() => {
    const e = getActiveEditor();
    if (!e || findMatchesRef.current.length === 0) return;
    const m = findMatchesRef.current[currentIdx];
    if (!m) return;
    const model = e.getModel();
    const matchedText = model.getValueInRange(m.range);
    let repl = replaceQuery;
    if (useRegex) {
      try {
        const flags = matchCase ? "g" : "gi";
        const re = new RegExp(findQuery, flags);
        // For single match we want replacement with capture groups processed
        // Use String.replace on matchedText with regex (without global would still capture)
        // But to correctly honor $1 etc we do matchedText.replace(re, replaceQuery) - however re global may replace multiple times if matchedText contains pattern again.
        // Safer: create regex without g for single
        const singleFlags = matchCase ? "" : "i";
        const singleRe = new RegExp(findQuery, singleFlags);
        repl = matchedText.replace(singleRe, replaceQuery);
      } catch { repl = replaceQuery; }
    }
    // Include insertSpaces handling? just execute
    e.executeEdits("replace", [{ range: m.range, text: repl }]);
    // content change will trigger onDidChangeModelContent which updates store dirty
    // After edit, recompute matches shortly
    setTimeout(() => runFind(), 50);
  }, [getActiveEditor, currentIdx, replaceQuery, useRegex, matchCase, findQuery, runFind]);

  const replaceAll = useCallback(() => {
    const e = getActiveEditor();
    if (!e || findMatchesRef.current.length === 0) return;
    if (!findQuery) return;
    const model = e.getModel();
    const matches = [...findMatchesRef.current].sort((a, b) => {
      if (a.range.startLineNumber !== b.range.startLineNumber) return b.range.startLineNumber - a.range.startLineNumber;
      return b.range.startColumn - a.range.startColumn;
    });
    const edits = matches.map((m: any) => {
      let repl = replaceQuery;
      if (useRegex) {
        const matchedText = model.getValueInRange(m.range);
        try {
          const singleFlags = matchCase ? "" : "i";
          const singleRe = new RegExp(findQuery, singleFlags);
          repl = matchedText.replace(singleRe, replaceQuery);
        } catch { repl = replaceQuery; }
      }
      return { range: m.range, text: repl };
    });
    e.executeEdits("replaceAll", edits);
    setTimeout(() => runFind(), 50);
  }, [getActiveEditor, findQuery, replaceQuery, useRegex, matchCase, runFind]);

  // apply indentation when store values change
  const applyIndent = useCallback(() => {
    const e = editorRef.current;
    const de = diffModifiedRef.current;
    const oe = diffOriginalRef.current;
    const opts = { tabSize: editorTabSize, insertSpaces: editorInsertSpaces, detectIndentation: false } as any;
    try { e?.updateOptions(opts); e?.getModel()?.updateOptions({ tabSize: editorTabSize, insertSpaces: editorInsertSpaces }); } catch {}
    try { de?.updateOptions(opts); de?.getModel()?.updateOptions({ tabSize: editorTabSize, insertSpaces: editorInsertSpaces }); } catch {}
    try { oe?.updateOptions(opts); oe?.getModel()?.updateOptions({ tabSize: editorTabSize, insertSpaces: editorInsertSpaces }); } catch {}
  }, [editorTabSize, editorInsertSpaces]);

  useEffect(() => { applyIndent(); }, [applyIndent, mode, val]);

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

  // external-change refresh + auto-open opencode-written files
  useEffect(() => {
    const h = (e: any) => {
      let p: string | null = null;
      let type: string | undefined;
      const d = e.detail;
      if (typeof d === "string") p = d;
      else if (d && typeof d.path === "string") { p = d.path; type = d.type; }
      if (!p) return;

      // directory events: just refresh tree/git, no auto-open
      if (type?.startsWith("directory")) {
        refresh();
        useRepo.getState().load();
        return;
      }
      // deleted file: remove from editor tabs and clear selection if needed
      if (type === "file.deleted" || type === "directory.deleted") {
        refresh();
        useRepo.getState().load();
        const editorState = useEditor.getState();
        const isDir = type === "directory.deleted";
        if (isDir) {
          const prefix = p + "/";
          for (const f of [...editorState.openFiles]) {
            if (f === p || f.startsWith(prefix)) editorState.close(f);
          }
          if (useRepo.getState().selectedFile === p || useRepo.getState().selectedFile?.startsWith(prefix)) {
            const remaining = useEditor.getState().openFiles;
            useRepo.getState().select(remaining[remaining.length - 1] ?? null);
          }
          // collapse expanded state for deleted dir
          const expanded = { ...useRepo.getState().expanded };
          for (const k of Object.keys(expanded)) {
            if (k === p || k.startsWith(prefix)) delete expanded[k];
          }
          useRepo.setState({ expanded });
        } else {
          if (editorState.openFiles.includes(p)) editorState.close(p);
          if (useRepo.getState().selectedFile === p) {
            const remaining = useEditor.getState().openFiles;
            useRepo.getState().select(remaining[remaining.length - 1] ?? null);
          }
        }
        return;
      }

      refresh();
      useRepo.getState().load();
      const selected = useRepo.getState().selectedFile;
      if (p === selected) { load(p); return; }

      // Auto-open: opencode (or any external) created/modified a file not currently focused.
      // Debounce burst writes: collect paths, then focus last, preload others as background tabs.
      if (!pendingRef.current.includes(p)) pendingRef.current.push(p);
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        const paths = [...pendingRef.current];
        pendingRef.current = [];
        timerRef.current = null;
        if (paths.length === 0) return;

        // preload earlier paths as background tabs without stealing focus
        for (const pp of paths.slice(0, -1)) {
          const s = useEditor.getState();
          if (!s.openFiles.includes(pp)) {
            useEditor.setState({ openFiles: [...s.openFiles, pp] });
          }
          api.file(pp).then((f) => {
            if (!f.binary && !f.tooLarge) useEditor.getState().setContent(pp, f.content ?? "", f.hash);
          }).catch(() => {});
        }
        const last = paths[paths.length - 1];
        const curSelected = useRepo.getState().selectedFile;
        const isDirty = curSelected ? !!useEditor.getState().dirty[curSelected] : false;
        // If user has unsaved changes in current file, don't steal focus — background open + toast
        if (isDirty && curSelected && curSelected !== last) {
          const s = useEditor.getState();
          if (!s.openFiles.includes(last)) useEditor.setState({ openFiles: [...s.openFiles, last] });
          api.file(last).then((f) => {
            if (!f.binary && !f.tooLarge) useEditor.getState().setContent(last, f.content ?? "", f.hash);
          }).catch(() => {});
          useEditor.getState().notify(`OpenCode updated ${last} — opened in background`);
          return;
        }
        // Auto-focus last modified file so user sees diff
        useRepo.getState().select(last);
        // After git status refresh, switch to diff so change is obvious
        setTimeout(async () => {
          try {
            await useGit.getState().refresh();
            const st = useGit.getState().statusMap[last]?.status;
            if (st === "modified" || st === "added" || st === "untracked" || st === "renamed") {
              useEditor.getState().setMode(last, "diff");
              return;
            }
            // fallback: if content differs from HEAD, show diff
            const head = await useGit.getState().head(last).catch(() => null);
            const cur = useEditor.getState().contents[last];
            if (head !== null && head !== cur) useEditor.getState().setMode(last, "diff");
          } catch {}
        }, 400);
      }, 250);
    };
    const gitH = () => refresh();
    window.addEventListener("cockpit:file-event", h);
    window.addEventListener("cockpit:git", gitH);
    return () => {
      window.removeEventListener("cockpit:file-event", h);
      window.removeEventListener("cockpit:git", gitH);
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
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
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === "s") { e.preventDefault(); save(); }
      if (mod && e.key.toLowerCase() === "f" && !e.shiftKey) {
        e.preventDefault();
        setShowFind(true);
        setShowReplaceRow(false);
        setTimeout(() => document.getElementById("cockpit-find-input")?.focus(), 30);
      }
      if (mod && e.key.toLowerCase() === "h") {
        e.preventDefault();
        setShowFind(true);
        setShowReplaceRow(true);
        setTimeout(() => document.getElementById("cockpit-find-input")?.focus(), 30);
      }
      if (e.key === "Escape" && showFind) {
        // only close if find focused or no input
        setShowFind(false);
        clearDecorations();
        getActiveEditor()?.focus();
      }
      if (mod && e.key.toLowerCase() === "f" && e.shiftKey) {
        // alternative?
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [save, showFind, clearDecorations, getActiveEditor]);

  // close indent dropdown on outside click
  useEffect(() => {
    if (!showIndent) return;
    const h = (e: MouseEvent) => {
      const el = document.getElementById("cockpit-indent-dropdown");
      const btn = document.getElementById("cockpit-indent-btn");
      if (el && !el.contains(e.target as Node) && btn && !btn.contains(e.target as Node)) setShowIndent(false);
    };
    window.addEventListener("mousedown", h);
    return () => window.removeEventListener("mousedown", h);
  }, [showIndent]);

  // close tab context menu on outside click / Escape / scroll
  useEffect(() => {
    if (!tabMenu) return;
    const close = (e: MouseEvent) => {
      const el = document.getElementById("cockpit-tab-menu");
      if (el && !el.contains(e.target as Node)) setTabMenu(null);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setTabMenu(null); };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    window.addEventListener("scroll", () => setTabMenu(null), true);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
      window.removeEventListener("scroll", () => setTabMenu(null), true);
    };
  }, [tabMenu]);

  const closeTab = useCallback((file: string) => {
    const wasSelected = file === useRepo.getState().selectedFile;
    const remaining = useEditor.getState().openFiles.filter((x) => x !== file);
    useEditor.getState().close(file);
    if (wasSelected) useRepo.getState().select(remaining[remaining.length - 1] ?? null);
    setTabMenu(null);
  }, []);

  const closeOthers = useCallback((file: string) => {
    const openFiles = [...useEditor.getState().openFiles];
    for (const f of openFiles) if (f !== file) useEditor.getState().close(f);
    useRepo.getState().select(file);
    setTabMenu(null);
  }, []);

  const closeAll = useCallback(() => {
    useEditor.getState().reset();
    useRepo.getState().select(null);
    setTabMenu(null);
  }, []);

  if (!selectedFile) return <div className="h-full flex items-center justify-center text-sm text-[#9e8b7d] bg-[#140f0c]">Select a file from the repository.</div>;
  const gitSt = statusMap[selectedFile]?.status;
  const activeToggleClass = (on: boolean) => on ? "bg-amber-700 text-white border-amber-600" : "bg-[#2e2118] text-[#9e8b7d] border-[#36281e] hover:text-[#ece1d8] hover:bg-[#4a3627]";
  return (
    <div className="h-full flex flex-col bg-[#140f0c]">
      <div className="flex items-center gap-1 px-2 h-9 border-b border-[#36281e] bg-[#231a14] shrink-0 relative z-40"
        onContextMenu={(e) => {
          // right-click on empty tab bar background -> show Close All only
          if ((e.target as HTMLElement).closest("[data-tab]")) return;
          e.preventDefault();
          if (ed.openFiles.length === 0) return;
          setTabMenu({ x: e.clientX, y: e.clientY, file: null });
        }}>
        <div className="flex items-center gap-1 overflow-x-auto flex-1 min-w-0">
          {ed.openFiles.map((f) => (
            <span key={f} data-tab={f} onClick={() => useRepo.getState().select(f)}
              onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setTabMenu({ x: e.clientX, y: e.clientY, file: f }); }}
              className={`flex items-center gap-1 px-2 py-1 text-xs rounded cursor-pointer whitespace-nowrap shrink-0 ${f === selectedFile ? "bg-[#453225] text-amber-100 font-medium" : "text-[#9e8b7d] hover:bg-[#281f18] hover:text-[#ece1d8]"}`}>
              {f.split("/").pop()}{ed.dirty[f] ? " •" : ""}
              <X size={12} className="hover:text-red-400" onClick={(e) => {
                e.stopPropagation();
                const wasSelected = f === useRepo.getState().selectedFile;
                const remaining = ed.openFiles.filter((x) => x !== f);
                ed.close(f);
                if (wasSelected) {
                  const next = remaining[remaining.length - 1] ?? null;
                  useRepo.getState().select(next);
                }
              }} />
            </span>
          ))}
        </div>
        {tabMenu && (
          <div id="cockpit-tab-menu" style={{ left: tabMenu.x, top: tabMenu.y }} className="fixed z-50 min-w-[180px] rounded-md border border-[#36281e] bg-[#231a14] shadow-xl py-1 text-sm text-[#ece1d8] -translate-x-1 -translate-y-1"
            onClick={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()}>
            {tabMenu.file && (
              <>
                <button onClick={() => closeTab(tabMenu.file!)} className="w-full text-left px-3 py-1.5 hover:bg-[#4a3627] text-xs">Close</button>
                <button onClick={() => closeOthers(tabMenu.file!)} disabled={ed.openFiles.length <= 1} className="w-full text-left px-3 py-1.5 hover:bg-[#4a3627] text-xs disabled:opacity-40 disabled:cursor-not-allowed">Close Others</button>
                <div className="my-1 border-t border-[#36281e]" />
              </>
            )}
            <button onClick={closeAll} className="w-full text-left px-3 py-1.5 hover:bg-[#4a3627] text-xs">Close All</button>
          </div>
        )}
        <div className="flex items-center gap-1 shrink-0">
        {/* Indentation control */}
        <div className="relative">
          <button id="cockpit-indent-btn" onClick={() => setShowIndent((v) => !v)}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-[#2e2118] border border-[#36281e] hover:bg-[#4a3627] text-[#ece1d8]" title="Indentation settings">
            <Settings2 size={12} />{editorInsertSpaces ? `Spaces: ${editorTabSize}` : `Tabs: ${editorTabSize}`}
          </button>
          {showIndent && (
            <div id="cockpit-indent-dropdown" className="absolute top-8 right-0 bg-[#231a14] border border-[#36281e] rounded shadow-xl p-3 z-50 w-56">
              <div className="text-xs font-medium text-amber-200 mb-2 flex items-center gap-1"><WrapText size={12}/>Indentation</div>
              <div className="flex gap-1 mb-3">
                <button onClick={() => setInsertSpaces(true)} className={`flex-1 text-xs px-2 py-1 rounded border ${editorInsertSpaces ? "bg-amber-700 text-white border-amber-600" : "bg-[#2e2118] text-[#ece1d8] border-[#36281e] hover:bg-[#4a3627]"}`}>Spaces</button>
                <button onClick={() => setInsertSpaces(false)} className={`flex-1 text-xs px-2 py-1 rounded border ${!editorInsertSpaces ? "bg-amber-700 text-white border-amber-600" : "bg-[#2e2118] text-[#ece1d8] border-[#36281e] hover:bg-[#4a3627]"}`}>Tabs</button>
              </div>
              <div className="text-xs text-[#9e8b7d] mb-1">Tab size</div>
              <div className="flex gap-1">
                {[2, 4].map((sz) => (
                  <button key={sz} onClick={() => setTabSize(sz)} className={`flex-1 text-xs px-2 py-1 rounded border ${editorTabSize === sz ? "bg-amber-700 text-white border-amber-600" : "bg-[#2e2118] text-[#ece1d8] border-[#36281e] hover:bg-[#4a3627]"}`}>{sz}</button>
                ))}
              </div>
              <div className="text-[11px] text-[#7c6a5c] mt-2 leading-tight">Applies to all open editors. Saved locally. Uses Monaco's insertSpaces/tabSize.</div>
            </div>
          )}
        </div>
        <button onClick={() => {
          setShowFind((v) => !v);
          if (!showFind) setTimeout(() => document.getElementById("cockpit-find-input")?.focus(), 30);
          else clearDecorations();
        }}
          className={`flex items-center gap-1 text-xs px-2 py-1 rounded border ${showFind ? "bg-amber-700 text-white border-amber-600" : "bg-[#2e2118] text-[#ece1d8] border-[#36281e] hover:bg-[#4a3627]"}`} title="Find & Replace (Ctrl+F / Ctrl+H)">
          <Search size={12} />{showFind ? "Find ✓" : "Find"}
        </button>
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
      </div>
      {showFind && (
        <div className="flex flex-col gap-2 px-2 py-2 border-b border-[#36281e] bg-[#1a130f] shrink-0">
          <div className="flex items-center gap-1">
            <Search size={14} className="text-[#9e8b7d] shrink-0" />
            <input id="cockpit-find-input" value={findQuery} onChange={(e) => setFindQuery(e.target.value)} onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); if (e.shiftKey) goPrev(); else goNext(); }
              if (e.key === "Escape") { setShowFind(false); clearDecorations(); }
            }} placeholder="Find" className="flex-1 min-w-0 px-2 py-1 rounded bg-[#140f0c] border border-[#36281e] text-sm text-[#ece1d8] outline-none focus:border-[#d97706] placeholder:text-[#635245]" />
            <span className="text-xs text-[#9e8b7d] min-w-[48px] text-right whitespace-nowrap">{findQuery ? `${matchCount ? currentIdx + 1 : 0} / ${matchCount}` : ""}</span>
            <button onClick={goPrev} disabled={matchCount === 0} title="Previous (Shift+Enter)" className="p-1 rounded bg-[#2e2118] border border-[#36281e] hover:bg-[#4a3627] text-[#ece1d8] disabled:opacity-40"><ChevronUp size={14} /></button>
            <button onClick={goNext} disabled={matchCount === 0} title="Next (Enter)" className="p-1 rounded bg-[#2e2118] border border-[#36281e] hover:bg-[#4a3627] text-[#ece1d8] disabled:opacity-40"><ChevronDown size={14} /></button>
            <button onClick={() => setMatchCase((v) => !v)} title="Match Case" className={`px-1.5 py-1 rounded border text-xs font-mono ${activeToggleClass(matchCase)}`}>Aa</button>
            <button onClick={() => setWholeWord((v) => !v)} title="Match Whole Word" className={`px-1.5 py-1 rounded border text-xs font-mono ${activeToggleClass(wholeWord)}`}>Ab|</button>
            <button onClick={() => setUseRegex((v) => !v)} title="Use Regular Expression" className={`px-1.5 py-1 rounded border text-xs font-mono ${activeToggleClass(useRegex)}`}>.*</button>
            <button onClick={() => setShowReplaceRow((v) => !v)} title="Toggle Replace" className={`p-1 rounded border ${activeToggleClass(showReplaceRow)}`}><Replace size={14} /></button>
            <button onClick={() => { setShowFind(false); clearDecorations(); }} title="Close (Esc)" className="p-1 rounded bg-[#2e2118] border border-[#36281e] hover:bg-[#4a3627] text-[#ece1d8]"><X size={14} /></button>
          </div>
          {showReplaceRow && (
            <div className="flex items-center gap-1">
              <Replace size={14} className="text-[#9e8b7d] shrink-0" />
              <input value={replaceQuery} onChange={(e) => setReplaceQuery(e.target.value)} onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); replaceAll(); }
                if (e.key === "Escape") setShowFind(false);
              }} placeholder="Replace" className="flex-1 min-w-0 px-2 py-1 rounded bg-[#140f0c] border border-[#36281e] text-sm text-[#ece1d8] outline-none focus:border-[#d97706] placeholder:text-[#635245]" />
              <button onClick={replaceOne} disabled={matchCount === 0} className="text-xs px-2 py-1 rounded bg-[#2e2118] border border-[#36281e] hover:bg-[#4a3627] text-[#ece1d8] disabled:opacity-40">Replace</button>
              <button onClick={replaceAll} disabled={matchCount === 0} className="text-xs px-2 py-1 rounded bg-amber-700 hover:bg-amber-600 text-white disabled:opacity-40">Replace All</button>
            </div>
          )}
          {regexError && <div className="text-xs text-red-400 px-1">{regexError}</div>}
          <div className="text-[11px] text-[#7c6a5c] px-1">Enter ↵ next · Shift+Enter prev · Ctrl/Cmd+H toggles replace · Replace All supports $1 capture groups in regex mode</div>
        </div>
      )}
      {meta?.binary && <div className="p-6 text-sm text-[#9e8b7d]">Binary file — This file cannot be displayed in the editor.</div>}
      {meta?.tooLarge && <div className="p-6 text-sm text-[#9e8b7d]">Large file — This file is too large to safely display in the editor.</div>}
      {!meta?.binary && !meta?.tooLarge && (
        mode === "diff" ? (
          <DiffEditor height="100%" theme="dark-brown" beforeMount={(m) => { monacoRef.current = m; handleBeforeMount(m); }} original={base ?? ""} modified={val} language={langOf(selectedFile)}
            onMount={(e) => {
              diffModifiedRef.current = e.getModifiedEditor();
              diffOriginalRef.current = e.getOriginalEditor();
              applyIndent();
              e.getModifiedEditor().onDidChangeModelContent(() => {
                const v = e.getModifiedEditor().getValue();
                ed.setContent(selectedFile, v); ed.markDirty(selectedFile, true);
              });
              // sync search when modified model changes
              e.getModifiedEditor().onDidChangeModelContent(() => { if (showFind && findQuery) setTimeout(runFind, 50); });
            }}
            options={{ fontSize: 13, minimap: { enabled: false }, readOnly: false, originalEditable: false, renderSideBySide: true, tabSize: editorTabSize, insertSpaces: editorInsertSpaces, detectIndentation: false } as any} />
        ) : (
          <Editor height="100%" theme="dark-brown" beforeMount={(m) => { monacoRef.current = m; handleBeforeMount(m); }} language={langOf(selectedFile)} value={val}
            onMount={(edInst, monaco) => {
              monacoRef.current = monaco;
              editorRef.current = edInst;
              applyIndent();
              // keep search in sync on content change
              edInst.onDidChangeModelContent(() => { if (showFind && findQuery) { /* debounced via val effect */ } });
            }}
            onChange={(v) => { ed.setContent(selectedFile, v ?? ""); ed.markDirty(selectedFile, true); }}
            options={{ fontSize: 13, minimap: { enabled: false }, folding: true, matchBrackets: "always", autoIndent: "full", wordWrap: "off", readOnly: false, domReadOnly: false, stickyScroll: { enabled: true } as any, tabSize: editorTabSize, insertSpaces: editorInsertSpaces, detectIndentation: false }} />
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
