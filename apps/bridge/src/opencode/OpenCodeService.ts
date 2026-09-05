import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const execFileAsync = promisify(execFile);

export type ProcState = "starting" | "running" | "exited" | "error";
export type Listener = (data: string) => void;
type Pty = { write(d: string): void; resize(c: number, r: number): void; kill(): void; onData(cb: (d: string) => void): void; onExit(cb: (e: { exitCode: number }) => void): void; pid: number };

export const OPENCODE_INSTALL_HINT =
  "opencode not found. Install it first: https://opencode.ai (e.g. `npm i -g opencode-ai` or `bun i -g opencode-ai`), then restart the bridge so `opencode` is on PATH. Override with OPENCODE_BIN=/path/to/opencode.";

function candidateBins(): string[] {
  const out: string[] = [];
  if (process.env.OPENCODE_BIN) out.push(process.env.OPENCODE_BIN);
  const pathDirs = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  const extra = [
    path.join(os.homedir(), ".bun", "bin"),
    path.join(os.homedir(), ".local", "bin"),
    "/usr/local/bin",
    "/opt/homebrew/bin",
  ];
  for (const d of [...pathDirs, ...extra]) out.push(path.join(d, process.platform === "win32" ? "opencode.exe" : "opencode"));
  return [...new Set(out)];
}

export class OpenCodeService {
  private pty: Pty | null = null;
  private listeners = new Set<Listener>();
  private exitListeners = new Set<(code: number) => void>();
  state: ProcState = "exited";
  cwd: string | null = null;
  cols = 80; rows = 24;
  pid: number | null = null;
  exitCode: number | null = null;
  lastError: string | null = null;
  bin: string | null = null;
  version: string | null = null;
  private earlyOutput = "";
  private buffer = "";
  private static readonly BUFFER_LIMIT = 200_000;

  /**
   * Answer terminal capability queries that xterm.js does not reply to on its
   * own (OSC 10/11/4 color queries, XTVERSION, Kitty keyboard, DECRQM, DSR
   * fallback, winpos, primary DA, Kitty graphics probe). Without these the
   * real opencode TUI stalls after its initial probe burst and the web
   * terminal stays blank, showing only "Starting opencode...".
   * Replies are canned but well-formed; duplicates with xterm.js's own
   * automatic replies (e.g. DSR) are tolerated by the client.
   */
  private answerQueries(chunk: string) {
    const pty = this.pty;
    if (!pty || this.state !== "running") return;
    const out: string[] = [];
    // Query foreground color: OSC 10 ; ? BEL/ST
    if (chunk.includes("]10;?")) out.push("\x1b]10;rgb:ffffff/ffffff/ffffff\x1b\\");
    // Query background color: OSC 11 ; ?
    if (chunk.includes("]11;?")) out.push("\x1b]11;rgb:0000/0000/0000\x1b\\");
    // Query cursor color etc.: OSC 12/13/14/15/16/17/19 ; ?
    for (const n of [12, 13, 14, 15, 16, 17, 19]) {
      if (chunk.includes(`]${n};?`)) out.push(`\x1b]${n};rgb:ffffff/ffffff/ffffff\x1b\\`);
    }
    // Palette query: OSC 4 ; <idx> ; ?  (may appear many times in one chunk)
    const pal = chunk.match(/\]4;(\d+);\?/g);
    if (pal) {
      const idxs = new Set<string>();
      for (const m of chunk.matchAll(/\]4;(\d+);\?/g)) idxs.add(m[1]);
      for (const i of idxs) out.push(`\x1b]4;${i};rgb:0000/0000/0000\x1b\\`);
    }
    // XTVERSION: CSI > 0 q
    if (chunk.includes("[>0q") || chunk.includes(">0q")) out.push("\x1bP>|xterm(0)\x1b\\");
    // DSR (cursor position request): CSI 6 n — xterm.js also answers, but
    // reply here as fallback so headless/smoke clients still unblock.
    if (chunk.includes("[6n")) out.push("\x1b[1;1R");
    // Window size in pixels: CSI 14 t -> CSI 4 ; <h> ; <w> t
    if (chunk.includes("[14t")) out.push(`\x1b[4;${this.rows * 16};${this.cols * 8}t`);
    // Primary device attributes: ESC [ c
    if (chunk.includes("\x1b[c")) out.push("\x1b[?62c");
    // Kitty keyboard progressive-enhancement query: CSI ? u
    if (chunk.includes("?u")) out.push("\x1b[?0u");
    // DECRQM (request mode): CSI ? <mode> $ p — answer "not recognized"
    for (const m of chunk.matchAll(/\?(\d+)\$p/g)) out.push(`\x1b[?${m[1]};0$y`);
    // Kitty graphics probe: ESC _ G i=<id> ... a=q ... ESC \ -> OK
    for (const m of chunk.matchAll(/_Gi=(\d+)[^\\]*?a=q/g)) out.push(`\x1b_Gi=${m[1]};A=OK\x1b\\`);
    if (out.length === 0) return;
    const reply = out.join("");
    // Defer one tick so the app's own read loop is ready; keep it fast.
    setTimeout(() => { try { this.pty?.write(reply); } catch {} }, 5);
  }

  getBuffer(): string { return this.buffer; }

  onData(cb: Listener) { this.listeners.add(cb); return () => { this.listeners.delete(cb); }; }
  onExit(cb: (code: number) => void) { this.exitListeners.add(cb); return () => { this.exitListeners.delete(cb); }; }
  private emit(data: string) { for (const l of this.listeners) { try { l(data); } catch {} } }
  private emitExit(code: number) { for (const l of this.exitListeners) { try { l(code); } catch {} } }

  async resolveBin(): Promise<string | null> {
    for (const c of candidateBins()) {
      try {
        const st = await fs.stat(c);
        if (st.isFile()) { this.bin = c; return c; }
      } catch {}
    }
    try {
      const cmd = process.platform === "win32" ? "where" : "command";
      const args = process.platform === "win32" ? ["opencode"] : ["-v", "opencode"];
      const { stdout } = await execFileAsync(cmd, args, { timeout: 5000 });
      const p = stdout.trim().split("\n")[0]?.trim();
      if (p) { this.bin = p; return p; }
    } catch {}
    return null;
  }

  async check(): Promise<{ found: boolean; path: string | null; version: string | null; hint?: string }> {
    const bin = this.bin ?? await this.resolveBin();
    if (!bin) return { found: false, path: null, version: null, hint: OPENCODE_INSTALL_HINT };
    try {
      const { stdout } = await execFileAsync(bin, ["--version"], { timeout: 8000 });
      this.version = stdout.trim().slice(0, 100) || null;
    } catch { this.version = null; }
    return { found: true, path: bin, version: this.version };
  }

  status() {
    return { state: this.state, pid: this.pid, exitCode: this.exitCode, lastError: this.lastError, bin: this.bin, version: this.version, cwd: this.cwd };
  }

  async start(cwd: string, cols = 120, rows = 30, args: string[] = []) {
    if (this.pty) this.kill();
    this.state = "starting"; this.cwd = cwd; this.cols = cols; this.rows = rows;
    this.exitCode = null; this.lastError = null; this.pid = null; this.earlyOutput = ""; this.buffer = "";

    const bin = this.bin ?? await this.resolveBin();
    if (!bin) {
      this.state = "error";
      this.lastError = OPENCODE_INSTALL_HINT;
      throw Object.assign(new Error(OPENCODE_INSTALL_HINT), { status: 412, code: "OPENCODE_NOT_FOUND" });
    }
    this.bin = bin;
    try {
      const { stdout } = await execFileAsync(bin, ["--version"], { timeout: 8000 });
      this.version = stdout.trim().slice(0, 100) || null;
    } catch {}

    let ptyMod: any;
    try { ptyMod = await import("node-pty"); }
    catch (e) {
      this.state = "error";
      this.lastError = "node-pty unavailable: " + String(e);
      throw Object.assign(new Error(this.lastError), { status: 500, code: "PTY_UNAVAILABLE" });
    }
    try {
      const spawnFn = ptyMod.spawn ?? ptyMod.default?.spawn;
      if (!spawnFn) throw new Error("node-pty has no spawn export");
      this.pty = spawnFn(bin, args, { name: "xterm-256color", cols, rows, cwd, env: { ...process.env, TERM: "xterm-256color", COLORTERM: "truecolor" } });
    } catch (e: any) {
      this.state = "error";
      this.lastError = `Failed to spawn opencode (${bin}): ${e?.message ?? e}`;
      throw Object.assign(new Error(this.lastError), { status: 500, code: "SPAWN_FAILED" });
    }
    this.state = "running";
    this.pid = this.pty!.pid ?? null;
    const pty = this.pty!;
    pty.onData((d: string) => {
      if (this.earlyOutput.length < 4000) this.earlyOutput += d;
      this.buffer += d;
      if (this.buffer.length > OpenCodeService.BUFFER_LIMIT) this.buffer = this.buffer.slice(-OpenCodeService.BUFFER_LIMIT);
      this.emit(d);
      try { this.answerQueries(d); } catch {}
    });
    pty.onExit(({ exitCode }: any) => {
      this.state = "exited";
      this.exitCode = exitCode ?? 0;
      if (exitCode !== 0 && this.earlyOutput) this.lastError = this.earlyOutput.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, "").trim().slice(0, 500) || `opencode exited with code ${exitCode}`;
      this.emitExit(exitCode ?? 0);
    });

    await new Promise((r) => setTimeout(r, 400));
    if ((this.state as ProcState) === "exited") {
      const detail = this.lastError ? `: ${this.lastError}` : "";
      const msg = this.exitCode !== 0
        ? `opencode exited immediately (code ${this.exitCode})${detail}. Check that \`${bin}\` runs in this terminal.`
        : `opencode exited immediately${detail}`;
      this.state = "error";
      this.lastError = msg;
      throw Object.assign(new Error(msg), { status: 500, code: "EARLY_EXIT", exitCode: this.exitCode });
    }
    return { pid: this.pid };
  }

  write(data: string) { this.pty?.write(data); }
  resize(cols: number, rows: number) { this.cols = cols; this.rows = rows; try { this.pty?.resize(cols, rows); } catch {} }
  kill() { try { this.pty?.kill(); } catch {} this.pty = null; if (this.state === "running" || this.state === "starting") { this.state = "exited"; this.emitExit(0); } }
  restart() { if (this.cwd) return this.start(this.cwd, this.cols, this.rows); throw new Error("No cwd"); }
}
export const openCodeService = new OpenCodeService();
