import { useEffect, useState, useRef } from "react";
import TopBar from "./components/layout/TopBar";
import StatusBar from "./components/layout/StatusBar";
import RepositoryPanel from "./components/repository/RepositoryPanel";
import EditorPanel from "./components/editor/EditorPanel";
import TerminalPanel from "./components/terminal/TerminalPanel";
import { RepositoryPicker, QuickOpen, CommandPalette } from "./components/common/Dialogs";
import { useRepo } from "./stores/repository";
import { useGit } from "./stores/git";
import { useTerm } from "./stores/terminal";
import { useUI } from "./stores/ui";
import { useEditor } from "./stores/editor";
import { wsUrl } from "./lib/api";

export default function App() {
  const [picker, setPicker] = useState(false);
  const { leftW, rightW, setLeft, setRight, showLeft, showRight } = useUI();
  const drag = useRef<"l" | "r" | null>(null);

  useEffect(() => {
    // Tree scan and git status are independent — run them concurrently
    // instead of awaiting the tree before starting git.
    useRepo.getState().load();
    useGit.getState().refresh();
    let closed = false;
    let retry = 0;
    let retryT = 0;
    let ws: WebSocket | null = null;
    const connectEvents = () => {
      if (closed) return;
      const sock = new WebSocket(wsUrl("/api/events"));
      ws = sock;
      sock.onmessage = (e) => {
        try {
          const m = JSON.parse(e.data);
          if (m.type?.startsWith("file.")) window.dispatchEvent(new CustomEvent("cockpit:file-event", { detail: m.path }));
          else if (m.type === "git.status_changed") useGit.getState().refresh();
          else if (m.type === "opencode.state") {
            retry = 0;
            const s = m.state === "running" ? "connected" : m.state;
            useTerm.getState().set(s, m.error ?? null);
            if (m.code === "OPENCODE_NOT_FOUND" || /not found/i.test(m.error ?? "")) useTerm.getState().setCheck(false);
            if (s !== "exited" && s !== "error") useGit.getState().refresh();
          }
        } catch {}
      };
      sock.onerror = () => {};
      sock.onclose = () => {
        if (closed) return;
        if (ws === sock) ws = null;
        retry = Math.min(retry + 1, 20);
        retryT = window.setTimeout(connectEvents, Math.min(500 * retry, 3000));
      };
    };
    connectEvents();
    const openRepo = () => setPicker(true);
    window.addEventListener("cockpit:open-repo", openRepo);
    return () => { closed = true; if (retryT) clearTimeout(retryT); try { ws?.close(); } catch {} window.removeEventListener("cockpit:open-repo", openRepo); };
  }, []);

  useEffect(() => {
    useRepo.getState().load().then(() => {
      if (!useRepo.getState().root) setPicker(true);
    });
    const h = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "p" && !e.shiftKey) { e.preventDefault(); useUI.getState().setQuickOpen(true); }
      if (mod && e.shiftKey && e.key.toLowerCase() === "p") { e.preventDefault(); useUI.getState().setPalette(true); }
      if (mod && e.key.toLowerCase() === "b" && !e.shiftKey) { e.preventDefault(); useUI.getState().toggleLeft(); }
      if (mod && e.shiftKey && e.key.toLowerCase() === "b") { e.preventDefault(); useUI.getState().toggleRight(); }
      if (mod && e.key === "`") { e.preventDefault(); document.querySelector<HTMLElement>(".xterm-screen")?.focus(); }
      if (mod && e.shiftKey && e.key.toLowerCase() === "d") { e.preventDefault(); const s = useRepo.getState().selectedFile; if (s) { const m = useEditor.getState().mode[s] ?? "code"; useEditor.getState().setMode(s, m === "code" ? "diff" : "code"); } }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  useEffect(() => {
    const mv = (e: MouseEvent) => {
      if (drag.current === "l") setLeft(Math.min(500, Math.max(180, e.clientX)));
      if (drag.current === "r") setRight(Math.min(700, Math.max(280, window.innerWidth - e.clientX)));
    };
    const up = () => (drag.current = null);
    window.addEventListener("mousemove", mv);
    window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); };
  }, [setLeft, setRight]);

  const msg = useEditor((s) => s.message);
  return (
    <div className="h-full flex flex-col">
      <TopBar onOpen={() => setPicker(true)} />
      <div className="flex-1 flex min-h-0">
        {showLeft && <div style={{ width: leftW }} className="border-r border-[#1c2230] bg-[#0d121b] shrink-0 overflow-hidden"><RepositoryPanel /></div>}
        <div onMouseDown={() => (drag.current = "l")} className="w-1 cursor-col-resize hover:bg-sky-700 shrink-0" />
        <div className="flex-1 min-w-[400px] min-h-0 bg-[#0b0e14] relative"><EditorPanel /></div>
        <div onMouseDown={() => (drag.current = "r")} className="w-1 cursor-col-resize hover:bg-sky-700 shrink-0" />
        {showRight && <div style={{ width: rightW }} className="border-l border-[#1c2230] bg-[#0b0e14] shrink-0 min-h-0"><TerminalPanel /></div>}
      </div>
      <StatusBar />
      <RepositoryPicker open={picker} onClose={() => setPicker(false)} />
      <QuickOpen />
      <CommandPalette />
      {msg && <div className="fixed bottom-10 left-1/2 -translate-x-1/2 text-xs bg-[#2a1620] border border-red-500/40 rounded px-3 py-2 z-50">{msg}<button className="ml-2 underline" onClick={() => useEditor.getState().notify(null)}>dismiss</button></div>}
    </div>
  );
}
