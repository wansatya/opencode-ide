import express from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs/promises";
import { createServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import Ignore from "ignore";
import { getWorkspaceRoot, setWorkspaceRoot } from "./workspace.js";
import { buildTree, readFileSafe, writeFileSafe, createFileSafe, createDirectorySafe, deletePathSafe, resolveSafe } from "../filesystem/FileService.js";
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
// (COCKPIT_ROOT). The workspace stays exactly what the user opened — the git
// toplevel is only used internally by GitService for git commands. Watcher
// teardown + git root detection run concurrently.
async function openWorkspace(dir: string) {
  const root = await setWorkspaceRoot(dir);
  const [, ] = await Promise.all([
    gitService.setRoot(root),
    watcherService.stop(),
  ]);
  await watcherService.start(root);
  return { root, selected: root, isRepo: gitService.isRepo };
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
    const { tree, truncated } = await buildTree(root, await gitignoreFn(root));
    res.json({ root, tree, truncated });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get("/api/file", async (req, res) => {
  const root = requireRoot(res); if (!root) return;
  const rel = String(req.query.path ?? "");
  try { res.json(await readFileSafe(root, rel)); }
  catch (e: any) {
    if ((e as any).code === "ENOENT") return res.status(404).json({ error: "Not found" });
    res.status((e as any).status ?? 500).json({ error: e.message });
  }
});
app.put("/api/file", async (req, res) => {
  const root = requireRoot(res); if (!root) return;
  const { path: rel, content } = req.body ?? {};
  if (typeof rel !== "string" || typeof content !== "string") return res.status(400).json({ error: "path+content required" });
  try { res.json(await writeFileSafe(root, rel, content)); broadcast({ type: "file.modified", path: rel }); }
  catch (e: any) { res.status((e as any).status ?? 500).json({ error: e.message }); }
});

app.post("/api/fs/file", async (req, res) => {
  const root = requireRoot(res); if (!root) return;
  const { path: rel, content } = req.body ?? {};
  if (typeof rel !== "string") return res.status(400).json({ error: "path required" });
  try {
    const r = await createFileSafe(root, rel, typeof content === "string" ? content : "");
    broadcast({ type: "file.created", path: r.path });
    res.json(r);
  } catch (e: any) {
    if (e.code === "ENOENT") return res.status(400).json({ error: e.message });
    res.status(e.status ?? 500).json({ error: e.message });
  }
});

app.post("/api/fs/directory", async (req, res) => {
  const root = requireRoot(res); if (!root) return;
  const { path: rel } = req.body ?? {};
  if (typeof rel !== "string") return res.status(400).json({ error: "path required" });
  try {
    const r = await createDirectorySafe(root, rel);
    broadcast({ type: "directory.created", path: r.path });
    res.json(r);
  } catch (e: any) {
    res.status(e.status ?? 500).json({ error: e.message });
  }
});

app.delete("/api/fs", async (req, res) => {
  const root = requireRoot(res); if (!root) return;
  const rel = typeof req.query.path === "string" ? req.query.path : (req.body as any)?.path;
  if (typeof rel !== "string") return res.status(400).json({ error: "path required" });
  try {
    const r = await deletePathSafe(root, rel);
    broadcast({ type: r.type === "directory" ? "directory.deleted" : "file.deleted", path: r.path });
    res.json(r);
  } catch (e: any) {
    res.status(e.status ?? 500).json({ error: e.message });
  }
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
app.get("/api/git/opencode-branches", async (_req, res) => {
  const root = requireRoot(res); if (!root) return;
  try {
    const branches = await gitService.listOpencodeBranches();
    res.json({ branches, lastBranch: branches[0] ?? null, isGitRepository: gitService.isRepo });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

function isAutoBranchEnabled(bodyVal?: unknown): boolean {
  const raw = (process.env.COCKPIT_AUTO_BRANCH ?? "").trim().toLowerCase();
  // default true when env not set
  let enabled = true;
  if (["0", "false", "off", "no", "disable", "disabled"].includes(raw)) enabled = false;
  if (bodyVal === false || bodyVal === 0 || bodyVal === "0" || bodyVal === "false" || bodyVal === "off" || bodyVal === "no") enabled = false;
  else if (bodyVal === true || bodyVal === 1 || bodyVal === "1" || bodyVal === "true" || bodyVal === "on") enabled = true;
  return enabled;
}

app.get("/api/opencode/check", async (_req, res) => {
  try { res.json(await openCodeService.check()); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});
app.get("/api/opencode/status", (_req, res) => res.json(openCodeService.status()));
app.post("/api/opencode/start", async (req, res) => {
  const root = requireRoot(res); if (!root) return;
  try {
    const { cols, rows, args, autoBranch, branchChoice } = req.body ?? {};
    // Auto-branch: each opencode session gets an isolated branch so `main`/`master`
    // is never overwritten directly. Must be merged manually. Default ON.
    // Opt-out via `COCKPIT_AUTO_BRANCH=0` or `{autoBranch:false}` in request.
    // If branches with opencode/* prefix exist, require an explicit choice:
    // `branchChoice: "new"` to create a fresh session branch, or
    // `branchChoice: "continue"` (or a specific `opencode/...` name) to reuse.
    let branchInfo: { created: boolean; branch: string | null; previous: string | null; error?: string } | null = null;
    let continuedBranch: string | null = null;
    if (isAutoBranchEnabled(autoBranch)) {
      try {
        if (gitService.isRepo) {
          const existing = await gitService.listOpencodeBranches();
          if (existing.length > 0) {
            const choiceRaw = branchChoice as unknown;
            const choice = typeof choiceRaw === "string" ? choiceRaw.trim() : choiceRaw;
            // No explicit choice -> ask caller to choose (409 anchored by frontend dialog)
            if (choice === undefined || choice === null || choice === "") {
              return res.status(409).json({
                error: "Existing opencode branches found — choose to create new or continue last",
                code: "BRANCH_CHOICE_REQUIRED",
                branches: existing,
                lastBranch: existing[0] ?? null,
              });
            }
            if (choice === "new" || choice === "create") {
              branchInfo = await gitService.createSessionBranch();
            } else if (choice === "continue" || choice === "last" || choice === "existing") {
              const target = existing[0];
              const co = await gitService.checkoutBranch(target);
              if (co.error) throw Object.assign(new Error(`Failed to checkout ${target}: ${co.error}`), { status: 500, code: "BRANCH_CHECKOUT_FAILED" });
              continuedBranch = target;
              branchInfo = { created: false, branch: target, previous: co.previous };
              console.log(`auto-branch: continue ${co.previous ?? "(detached)"} -> ${target}`);
              broadcast({ type: "git.branch_created", branch: target, previous: co.previous });
              broadcast({ type: "git.status_changed" });
            } else if (typeof choice === "string" && choice.startsWith("opencode/")) {
              if (!existing.includes(choice)) {
                throw Object.assign(new Error(`Branch ${choice} not found among opencode branches`), { status: 404, code: "BRANCH_NOT_FOUND" });
              }
              const co = await gitService.checkoutBranch(choice);
              if (co.error) throw Object.assign(new Error(`Failed to checkout ${choice}: ${co.error}`), { status: 500, code: "BRANCH_CHECKOUT_FAILED" });
              continuedBranch = choice;
              branchInfo = { created: false, branch: choice, previous: co.previous };
              console.log(`auto-branch: continue ${co.previous ?? "(detached)"} -> ${choice}`);
              broadcast({ type: "git.branch_created", branch: choice, previous: co.previous });
              broadcast({ type: "git.status_changed" });
            } else {
              throw Object.assign(new Error(`Invalid branchChoice: ${String(choice)} — expected "new" or "continue" or an opencode/* branch name`), { status: 400, code: "INVALID_BRANCH_CHOICE" });
            }
            if (branchInfo?.created && branchInfo.branch) {
              console.log(`auto-branch: ${branchInfo.previous ?? "(detached)"} -> ${branchInfo.branch}`);
              broadcast({ type: "git.status_changed" });
              broadcast({ type: "git.branch_created", branch: branchInfo.branch, previous: branchInfo.previous });
            } else if (branchInfo?.error) {
              throw Object.assign(new Error(`Failed to create session branch: ${branchInfo.error}. Disable with COCKPIT_AUTO_BRANCH=0 or {autoBranch:false}.`), { status: 500, code: "BRANCH_CREATE_FAILED" });
            }
          } else {
            // No existing opencode branches — create fresh one as before
            branchInfo = await gitService.createSessionBranch();
            if (branchInfo.created && branchInfo.branch) {
              console.log(`auto-branch: ${branchInfo.previous ?? "(detached)"} -> ${branchInfo.branch}`);
              broadcast({ type: "git.status_changed" });
              broadcast({ type: "git.branch_created", branch: branchInfo.branch, previous: branchInfo.previous });
            } else if (branchInfo.error) {
              if (gitService.isRepo) {
                throw Object.assign(new Error(`Failed to create session branch: ${branchInfo.error}. Disable with COCKPIT_AUTO_BRANCH=0 or {autoBranch:false}.`), { status: 500, code: "BRANCH_CREATE_FAILED" });
              }
            }
          }
        }
      } catch (e: any) {
        if (e?.code === "BRANCH_CHOICE_REQUIRED" || e?.code === "BRANCH_CREATE_FAILED" || e?.code === "BRANCH_CHECKOUT_FAILED" || e?.code === "BRANCH_NOT_FOUND" || e?.code === "INVALID_BRANCH_CHOICE") throw e;
        // creation failure outside repo is non-fatal; inside repo surface as warning but still allow start? We choose to warn.
        console.error(`auto-branch warning: ${e?.message ?? e}`);
      }
    }
    const r = await openCodeService.start(root, cols ?? 120, rows ?? 30, args ?? []);
    if (openCodeService.state !== "running") throw Object.assign(new Error(openCodeService.lastError ?? "opencode failed to stay running"), { status: 500, code: "NOT_RUNNING" });
    broadcast({ type: "opencode.state", state: "connected" });
    // also refresh git status for the new branch visibility
    if (branchInfo?.created) broadcast({ type: "git.status_changed" });
    if (continuedBranch) broadcast({ type: "git.status_changed" });
    res.json({ ...r, state: openCodeService.state, bin: openCodeService.bin, version: openCodeService.version, branch: branchInfo?.branch ?? null, previousBranch: branchInfo?.previous ?? null, continued: !!continuedBranch });
  } catch (e: any) {
    // Don't broadcast a terminal error for a branch choice prompt — it's a normal flow
    if (e?.code !== "BRANCH_CHOICE_REQUIRED") broadcast({ type: "opencode.state", state: "error", error: e.message, code: e.code });
    const status = e.status ?? (e.code === "BRANCH_CHOICE_REQUIRED" ? 409 : 500);
    const payload: any = { error: e.message, code: e.code, exitCode: e.exitCode };
    if (e.code === "BRANCH_CHOICE_REQUIRED") { payload.branches = e.branches ?? undefined; payload.lastBranch = e.lastBranch ?? undefined; }
    // Include branches on 409 from early return already handled; for thrown errors also forward if present
    if (e.branches) payload.branches = e.branches;
    if (e.lastBranch) payload.lastBranch = e.lastBranch;
    res.status(status).json(payload);
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
