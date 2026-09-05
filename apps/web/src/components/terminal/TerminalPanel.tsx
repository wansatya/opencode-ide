import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { api, wsUrl } from "../../lib/api";
import { useTerm } from "../../stores/terminal";
import { Play, Square } from "lucide-react";

const INSTALL_MSG = "opencode not found — install it first (https://opencode.ai), then restart the bridge.";
const IDLE_MSG = "opencode is not running — press Start to launch it in the open repository.";

function isRunning(s: string) { return s === "connected" || s === "working" || s === "idle"; }

export default function TerminalPanel() {
  const ref = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const startingRef = useRef(false);
  const disposedRef = useRef(false);
  const { state, set, error, found, bin, setCheck } = useTerm();

  const safeFit = () => {
    if (disposedRef.current) return false;
    const fit = fitRef.current;
    const term = termRef.current;
    const el = ref.current;
    if (!fit || !term || !el) return false;
    // Never fit a hidden/zero-size container: xterm's viewport ends up
    // without dimensions and later writes crash in syncScrollArea.
    if (el.clientWidth < 10 || el.clientHeight < 10) return false;
    try {
      fit.fit();
      return true;
    } catch { return false; }
  };

  const dims = () => {
    try {
      if (!disposedRef.current && (ref.current?.clientWidth ?? 0) >= 10) {
        const p = fitRef.current?.proposeDimensions();
        if (p && p.cols > 2 && p.rows > 1) return p;
      }
    } catch { }
    return { cols: termRef.current?.cols ?? 120, rows: termRef.current?.rows ?? 30 };
  };

  const sendResize = () => {
    if (disposedRef.current) return;
    const d = dims();
    try {
      if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify({ type: "resize", cols: d.cols, rows: d.rows }));
    } catch { }
    void api.ocResize(d.cols, d.rows);
  };

  const start = async (auto = false) => {
    if (startingRef.current) return;
    const cur = useTerm.getState().state;
    if (isRunning(cur) || cur === "starting") return;
    if (auto) {
      try {
        const w = await api.workspace();
        if (!w.root) return;
      } catch { return; }
    }
    startingRef.current = true;
    set("starting");
    if (!disposedRef.current) termRef.current?.writeln("\x1b[90mStarting opencode…\x1b[0m");
    try {
      safeFit();
      const d = dims();
      const r = await api.ocStart(d.cols, d.rows);
      if (disposedRef.current) return;
      set("connected");
      setCheck(true, r.bin ?? useTerm.getState().bin);
      termRef.current?.focus();
      setTimeout(() => { if (!disposedRef.current) sendResize(); }, 150);
    } catch (e: any) {
      if (disposedRef.current) return;
      const msg = e.message ?? "Failed to start";
      const notFound = e.code === "OPENCODE_NOT_FOUND" || /not found/i.test(msg);
      if (notFound) setCheck(false);
      set("error", msg);
      termRef.current?.writeln("\x1b[31m" + msg + "\x1b[0m");
      if (notFound) termRef.current?.writeln("\x1b[33m" + INSTALL_MSG + "\x1b[0m");
    } finally { startingRef.current = false; }
  };

  const restart = async () => {
    if (startingRef.current) return;
    try { await api.ocStop(); } catch { }
    if (!disposedRef.current) {
      set("exited");
      try { termRef.current?.clear(); } catch { }
      termRef.current?.writeln("\x1b[90mSwitching repository — restarting opencode…\x1b[0m");
    }
    await start(false);
  };

  useEffect(() => {
    disposedRef.current = false;
    const el = ref.current;
    if (!el) return;
    // StrictMode remounts on the same div: clear stale xterm DOM first.
    el.innerHTML = "";
    const term = new Terminal({
      fontSize: 13,
      theme: {
        background: "#140f0c",
        foreground: "#ece1d8",
        cursor: "#f59e0b",
        cursorAccent: "#140f0c",
        selectionBackground: "#4a3627",
        black: "#231a14",
        red: "#ef5350",
        green: "#4caf50",
        yellow: "#f59e0b",
        blue: "#c87a32",
        magenta: "#d3709c",
        cyan: "#5eb3a6",
        white: "#ece1d8",
        brightBlack: "#5c4b3e",
        brightRed: "#f27370",
        brightGreen: "#66bb6a",
        brightYellow: "#fbbf24",
        brightBlue: "#e58e26",
        brightMagenta: "#e082b2",
        brightCyan: "#76c7c0",
        brightWhite: "#ffffff",
      },
      scrollback: 5000,
      cursorBlink: true,
      allowProposedApi: false,
    });
    const fit = new FitAddon();
    fitRef.current = fit;
    term.loadAddon(fit);
    term.open(el);
    termRef.current = term;
    const write = (data: string | Uint8Array) => {
      if (disposedRef.current || !termRef.current) return;
      try { term.write(data); } catch { }
    };
    // Wait a frame so flex layout settles before first fit (0-size fit
    // corrupts the viewport and crashes later in syncScrollArea).
    let raf = 0;
    raf = requestAnimationFrame(() => {
      if (disposedRef.current) return;
      safeFit();
      try { term.focus(); } catch { }
      onResize();
    });
    const wsUrlStr = wsUrl("/api/opencode/terminal");
    let retry = 0;
    let retryT = 0;
    const connectWs = () => {
      if (disposedRef.current) return;
      const ws = new WebSocket(wsUrlStr);
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;
      ws.onmessage = (e) => {
        if (disposedRef.current) return;
        const data = e.data as unknown;
        if (typeof data === "string") { write(data); return; }
        if (data instanceof ArrayBuffer) { write(new Uint8Array(data)); return; }
        if (data instanceof Blob) {
          void data.text().then((t) => { write(t); });
          return;
        }
      };
      // Swallow errors: a failed upgrade (bridge down) must not throw
      // unhandled; onclose below schedules a retry.
      ws.onerror = () => { };
      ws.onopen = () => { retry = 0; };
      ws.onclose = () => {
        if (disposedRef.current) return;
        if (wsRef.current === ws) wsRef.current = null;
        // Bridge may be down or restarting — keep retrying with capped
        // backoff instead of leaving the terminal dead after 10 tries.
        retry = Math.min(retry + 1, 20);
        retryT = window.setTimeout(connectWs, Math.min(500 * retry, 3000));
      };
    };
    connectWs();
    const dataDisp = term.onData((d) => {
      if (disposedRef.current) return;
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        try { ws.send(JSON.stringify({ type: "input", data: d })); } catch { }
      }
    });
    // Binary/keyboard reports (e.g. Kitty-enhanced keys, paste with high
    // bytes) must also be mirrored to the real PTY, otherwise input stalls.
    const binDisp = term.onBinary((d) => {
      if (disposedRef.current) return;
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        try { ws.send(JSON.stringify({ type: "input", data: d })); } catch { }
      }
    });
    let roT = 0;
    const onResize = () => {
      if (disposedRef.current) return;
      if (!safeFit()) return;
      try {
        const d = fitRef.current?.proposeDimensions();
        if (d && d.cols > 2 && d.rows > 1) {
          const ws = wsRef.current;
          if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "resize", cols: d.cols, rows: d.rows }));
          void api.ocResize(d.cols, d.rows);
        }
      } catch { }
    };
    const onResizeThrottled = () => {
      if (disposedRef.current) return;
      if (roT) return;
      roT = window.setTimeout(() => { roT = 0; onResize(); }, 50);
    };
    window.addEventListener("resize", onResizeThrottled);
    const ro = new ResizeObserver(onResizeThrottled);
    ro.observe(el);
    const t1 = setTimeout(() => { if (!disposedRef.current) onResize(); }, 150);
    const t2 = setTimeout(() => { if (!disposedRef.current) onResize(); }, 500);
    api.ocCheck().then((c) => { if (!disposedRef.current) setCheck(c.found, c.path); }).catch(() => { });
    api.ocStatus().then((s) => {
      if (disposedRef.current) return;
      if (s.state === "running") { set("connected"); setTimeout(() => { if (!disposedRef.current) onResize(); }, 100); }
      else if (s.state === "error") { set("error", s.lastError); if (s.lastError) write("\x1b[31m" + s.lastError + "\x1b[0m"); }
      else { write("\x1b[90m" + IDLE_MSG + "\x1b[0m"); void start(true); }
    }).catch(() => { if (!disposedRef.current) write("\x1b[90m" + IDLE_MSG + "\x1b[0m"); });
    const auto = () => void start(true);
    window.addEventListener("cockpit:opencode-autostart", auto);
    const doRestart = () => void restart();
    window.addEventListener("cockpit:opencode-restart", doRestart);
    const focus = () => { if (!disposedRef.current) { try { term.focus(); } catch { } } };
    el.addEventListener("click", focus);
    return () => {
      disposedRef.current = true;
      window.removeEventListener("resize", onResizeThrottled);
      window.removeEventListener("cockpit:opencode-autostart", auto);
      window.removeEventListener("cockpit:opencode-restart", doRestart);
      el.removeEventListener("click", focus);
      ro.disconnect();
      if (roT) clearTimeout(roT);
      cancelAnimationFrame(raf);
      clearTimeout(t1); clearTimeout(t2);
      try { dataDisp.dispose(); } catch { }
      try { binDisp.dispose(); } catch { }
      if (retryT) clearTimeout(retryT);
      // Detach handlers first; closing a CONNECTING socket logs
      // "closed before the connection is established", so only close
      // OPEN sockets and just drop connecting ones.
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws) {
        ws.onmessage = null;
        ws.onclose = null;
        ws.onerror = null;
        ws.onopen = null;
        try {
          if (ws.readyState === WebSocket.OPEN) ws.close();
        } catch { }
      }
      try { term.dispose(); } catch { }
      termRef.current = null;
      fitRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (disposedRef.current) return;
    if (state === "exited") termRef.current?.writeln("\r\n\x1b[90mopencode exited. Press Start to relaunch.\x1b[0m");
    if (isRunning(state)) {
      safeFit();
      setTimeout(() => { if (!disposedRef.current) sendResize(); }, 50);
      try { termRef.current?.focus(); } catch { }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const stop = async () => { try { await api.ocStop(); } catch { } set("exited"); };

  const running = isRunning(state);
  return (
    <div className="h-full flex flex-col bg-[#140f0c]">
      <div className="flex items-center gap-2 px-2 h-9 border-b border-[#36281e] bg-[#231a14] text-xs shrink-0">
        <span className="uppercase tracking-wide text-[#9e8b7d] font-medium">OpenCode</span>
        <span className="text-[#c2ab99]">{state}{bin ? ` · ${bin.split("/").pop()}` : ""}</span>
        <div className="flex-1 px-2" />
        {running ? (
          <button onClick={stop} className="flex items-center gap-1 px-2 py-1 rounded bg-[#3a1b18] hover:bg-[#4a2424] text-red-200 border border-red-500/30"><Square size={12} />Stop</button>
        ) : (
          <button onClick={() => start(false)} disabled={state === "starting"} className="flex items-center gap-1 px-2 py-1 rounded bg-[#1b3a20] hover:bg-[#244a2b] text-emerald-200 border border-emerald-500/30 disabled:opacity-50"><Play size={12} />{state === "starting" ? "Starting…" : "Start"}</button>
        )}
      </div>
      {state === "error" && error && (
        <div className="px-2 py-1.5 text-xs bg-[#3a1b18] border-b border-red-500/40 text-red-200 shrink-0">{error}</div>
      )}
      {found === false && state !== "starting" && (
        <div className="px-2 py-1.5 text-xs bg-[#382b1c] border-b border-amber-500/40 text-amber-200 shrink-0">{INSTALL_MSG}</div>
      )}
      <div ref={ref} className="flex-1 min-h-0 bg-[#140f0c]" />
    </div>
  );
}
