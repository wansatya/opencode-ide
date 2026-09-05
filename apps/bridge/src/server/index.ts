import express from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs/promises";
import { createServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import Ignore from "ignore";
import { getWorkspaceRoot, setWorkspaceRoot } from "./workspace.js";
import { buildTree, readFileSafe, writeFileSafe, resolveSafe } from "../filesystem/FileService.js";
import { gitService } from "../git/GitService.js";
import { watcherService } from "../watcher/WatcherService.js";
import { openCodeService } from "../opencode/OpenCodeService.js";

const PORT = Number(process.env.PORT || 3101);
const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

function requireRoot(res: any): string | null {
  const root = getWorkspaceRoot();
  if (!root) { res.status(400).json({ error: "No workspace open" }); return null; }
  return root;
}

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.get("/api/workspace", (_req, res) => {
  const root = getWorkspaceRoot();
  res.json({ root, name: root ? path.basename(root) : null });
});
app.get("/api/browse", async (req, res) => {
  try {
    const os = await import("node:os");
    const start = String(req.query.path ?? "").trim() || os.homedir();
    const dir = path.resolve(start);
    const st = await fs.stat(dir);
    if (!st.isDirectory()) return res.status(400).json({ error: "Not a directory" });
    const names = await fs.readdir(dir);
    const visible = names.filter((n) => !n.startsWith("."));
    // Stat entries concurrently: sequential stat was the dominant cost when
    // browsing folders with many entries.
    const stats = await Promise.all(
      visible.map(async (n) => {
        try {
          const full = path.join(dir, n);
          const s = await fs.stat(full);
          return s.isDirectory() ? { name: n, path: full } : null;
        } catch { return null; }
      }),
    );
    const entries = (stats.filter(Boolean) as { name: string; path: string }[])
      .sort((a, b) => a.name.localeCompare(b.name));
    res.json({ path: dir, parent: path.dirname(dir) === dir ? null : path.dirname(dir), home: os.homedir(), entries });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});
app.post("/api/workspace/open", async (req, res) => {
  try {
    const { path: p } = req.body ?? {};
    if (!p) return res.status(400).json({ error: "path required" });
    // Guard: opening home/system root scans tens of thousands of files and
    // starves the bridge (health + WS upgrades time out). Refuse early.
    try {
      const os = await import("node:os");
      const resolved = path.resolve(String(p));
      const home = path.resolve(os.homedir());
      if (resolved === "/" || resolved === home || resolved === "/home" || resolved === "/root") {
        return res.status(400).json({ error: `Refusing to open ${resolved}: pick a project folder, not home/system root.` });
      }
    } catch {}
    const opened = await openWorkspace(p);
    // Refresh session: exit any running opencode after switching repos so
    // the old PTY (bound to the previous cwd) doesn't linger. Frontend
    // restarts it fresh in the new root on `cockpit:opencode-restart`.
    if (openCodeService.state === "running" || openCodeService.state === "starting") {
      openCodeService.kill();
      broadcast({ type: "opencode.state", state: "exited" });
    }
    broadcast({ type: "repository.opened", root: opened.root });
    broadcast({ type: "git.status_changed" });
    res.json({ root: opened.root, selected: opened.selected, isGitRepository: opened.isRepo });
  } catch (e: any) { res.status(e.status ?? 500).json({ error: e.message }); }
});

// Shared open logic used by the HTTP route and by startup pre-open
// (COCKPIT_ROOT). Watcher teardown + git root detection run concurrently.
async function openWorkspace(dir: string) {
  const root = await setWorkspaceRoot(dir);
  const [info] = await Promise.all([
    gitService.setRoot(root),
    watcherService.stop(),
  ]);
  await watcherService.start(info.root ?? root);
  return { root: info.root ?? root, selected: root, isRepo: info.isRepo };
}

async function gitignoreFn(root: string) {
  try {
    const gi = await fs.readFile(path.join(root, ".gitignore"), "utf8");
    const ig = Ignore().add(gi);
    return (rel: string) => { try { return ig.ignores(rel); } catch { return false; } };
  } catch { return undefined; }
}

app.get("/api/tree", async (_req, res) => {
  const root = requireRoot(res); if (!root) return;
  try {
    const effRoot = gitService.root ?? root;
    const { tree, truncated } = await buildTree(effRoot, await gitignoreFn(effRoot));
    res.json({ root: effRoot, tree, truncated });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get("/api/file", async (req, res) => {
  const root = requireRoot(res); if (!root) return;
  const rel = String(req.query.path ?? "");
  try { res.json(await readFileSafe(gitService.root ?? root, rel)); }
  catch (e: any) {
    if ((e as any).code === "ENOENT") return res.status(404).json({ error: "Not found" });
    res.status((e as any).status ?? 500).json({ error: e.message });
  }
});
app.put("/api/file", async (req, res) => {
  const root = requireRoot(res); if (!root) return;
  const { path: rel, content } = req.body ?? {};
  if (typeof rel !== "string" || typeof content !== "string") return res.status(400).json({ error: "path+content required" });
  try { res.json(await writeFileSafe(gitService.root ?? root, rel, content)); broadcast({ type: "file.modified", path: rel }); }
  catch (e: any) { res.status((e as any).status ?? 500).json({ error: e.message }); }
});

app.get("/api/git/status", async (_req, res) => {
  const root = requireRoot(res); if (!root) return;
  try { res.json(await gitService.getStatus()); } catch (e: any) { res.status(500).json({ error: e.message }); }
});
app.get("/api/git/diff", async (req, res) => {
  const root = requireRoot(res); if (!root) return;
  try { res.json({ diff: await gitService.getDiff(String(req.query.path ?? ""), req.query.cached === "1") }); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});
app.get("/api/git/head", async (req, res) => {
  const root = requireRoot(res); if (!root) return;
  try { res.json({ content: await gitService.getHeadFile(String(req.query.path ?? "")) }); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get("/api/opencode/check", async (_req, res) => {
  try { res.json(await openCodeService.check()); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});
app.get("/api/opencode/status", (_req, res) => res.json(openCodeService.status()));
app.post("/api/opencode/start", async (req, res) => {
  const root = requireRoot(res); if (!root) return;
  try {
    const { cols, rows, args } = req.body ?? {};
    const effRoot = gitService.root ?? root;
    const r = await openCodeService.start(effRoot, cols ?? 120, rows ?? 30, args ?? []);
    if (openCodeService.state !== "running") throw Object.assign(new Error(openCodeService.lastError ?? "opencode failed to stay running"), { status: 500, code: "NOT_RUNNING" });
    broadcast({ type: "opencode.state", state: "connected" });
    res.json({ ...r, state: openCodeService.state, bin: openCodeService.bin, version: openCodeService.version });
  } catch (e: any) {
    broadcast({ type: "opencode.state", state: "error", error: e.message, code: e.code });
    res.status(e.status ?? 500).json({ error: e.message, code: e.code, exitCode: e.exitCode });
  }
});
app.post("/api/opencode/resize", (req, res) => {
  const { cols, rows } = req.body ?? {};
  openCodeService.resize(Number(cols) || 80, Number(rows) || 24);
  res.json({ ok: true });
});
app.post("/api/opencode/stop", (_req, res) => {
  openCodeService.kill();
  broadcast({ type: "opencode.state", state: "exited" });
  res.json({ ok: true });
});

// static web
const webDist = path.resolve(process.cwd(), "../web/dist");
fs.stat(webDist).then(() => { app.use(express.static(webDist)); }).catch(() => {});

const server = createServer(app);
const wssEvents = new WebSocketServer({ noServer: true });
const wssTerm = new WebSocketServer({ noServer: true });
server.on("upgrade", (req, socket, head) => {
  const pathname = (req.url ?? "").split("?")[0];
  if (pathname === "/api/events") wssEvents.handleUpgrade(req, socket, head, (ws) => wssEvents.emit("connection", ws, req));
  else if (pathname === "/api/opencode/terminal") wssTerm.handleUpgrade(req, socket, head, (ws) => wssTerm.emit("connection", ws, req));
  else socket.destroy();
});
const eventClients = new Set<WebSocket>();
export function broadcast(msg: unknown) {
  const s = JSON.stringify(msg);
  for (const c of eventClients) if (c.readyState === WebSocket.OPEN) c.send(s);
}
wssEvents.on("connection", (ws) => {
  eventClients.add(ws);
  ws.send(JSON.stringify({ type: "opencode.state", state: openCodeService.state === "running" ? "connected" : openCodeService.state, error: openCodeService.lastError }));
  ws.on("close", () => eventClients.delete(ws));
});
wssTerm.on("connection", (ws) => {
  try {
    const buf = openCodeService.getBuffer();
    if (buf && ws.readyState === WebSocket.OPEN) ws.send(buf);
  } catch {}
  const off = openCodeService.onData((d) => { if (ws.readyState === WebSocket.OPEN) { try { ws.send(d); } catch {} } });
  const offExit = openCodeService.onExit((code) => { try { ws.send("\r\n[process exited " + code + "]\r\n"); } catch {} });
  ws.on("message", (m, isBinary) => {
    const raw = Buffer.isBuffer(m) ? m.toString("utf8") : String(m);
    if (isBinary) { openCodeService.write(raw); return; }
    try {
      const msg = JSON.parse(raw);
      if (msg && typeof msg === "object" && typeof msg.type === "string") {
        if (msg.type === "input" && typeof msg.data === "string") { openCodeService.write(msg.data); return; }
        if (msg.type === "resize") { openCodeService.resize(Number(msg.cols) || 80, Number(msg.rows) || 24); return; }
      }
      openCodeService.write(raw);
    } catch { openCodeService.write(raw); }
  });
  ws.on("close", () => { off(); offExit(); });
});
watcherService.onEvent = (e) => broadcast(e);
watcherService.onGitRefresh = () => broadcast({ type: "git.status_changed" });
openCodeService.onExit((code) => broadcast({ type: "opencode.state", state: code === 0 ? "exited" : "error", error: openCodeService.lastError, exitCode: code }));

async function shutdown() {
  watcherService.stop().catch(() => {});
  openCodeService.kill();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Pre-open a workspace when launched via `cockpit start ~/repo`, which sets
// COCKPIT_ROOT (or passes --root=<dir>), so the UI lands in that repo
// instead of showing the picker.
async function initInitialRoot() {
  const arg = process.argv.find((a) => a.startsWith("--root="))?.slice("--root=".length);
  const initial = (process.env.COCKPIT_ROOT ?? arg ?? "").trim();
  if (!initial) return;
  try {
    const opened = await openWorkspace(initial);
    console.log(`workspace: ${opened.root}`);
  } catch (e: any) {
    console.error(`COCKPIT_ROOT ignored (${initial}): ${e.message ?? e}`);
  }
}
await initInitialRoot();
server.listen(PORT, () => console.log(`bridge listening on :${PORT}`));
