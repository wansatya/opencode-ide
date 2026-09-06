export type ApiError = Error & { code?: string; exitCode?: number };
async function j<T>(r: Response): Promise<T> {
  if (!r.ok) {
    const body = await r.json().catch(() => ({ error: r.statusText }));
    const e = new Error(body.error ?? r.statusText) as ApiError;
    e.code = body.code;
    e.exitCode = body.exitCode;
    throw e;
  }
  return r.json();
}
export const api = {
  workspace: () => fetch("/api/workspace").then(j<{ root: string | null; name: string | null }>),
  openWorkspace: (path: string) => fetch("/api/workspace/open", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path }) }).then(j<{ root: string; isGitRepository: boolean }>),
  tree: () => fetch("/api/tree").then(j<{ root: string; tree: import("../types").FileNode[]; truncated?: boolean }>),
  file: (p: string) => fetch("/api/file?path=" + encodeURIComponent(p)).then(j<{ path: string; content?: string; binary?: boolean; tooLarge?: boolean; size: number; modifiedAt: number; hash?: string }>),
  saveFile: (p: string, content: string) => fetch("/api/file", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: p, content }) }).then(j<{ hash: string }>) ,
  gitStatus: () => fetch("/api/git/status").then(j<{ isGitRepository: boolean; branch: string | null; files: import("../types").GitFile[]; ahead: number; behind: number; state: string }>),
  gitDiff: (p: string) => fetch("/api/git/diff?path=" + encodeURIComponent(p)).then(j<{ diff: string }>),
  gitHead: (p: string) => fetch("/api/git/head?path=" + encodeURIComponent(p)).then(j<{ content: string | null }>),
  ocStart: (cols: number, rows: number) => fetch("/api/opencode/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cols, rows }) }).then(j<{ state: string; pid?: number; bin?: string; version?: string }>),
  ocStop: () => fetch("/api/opencode/stop", { method: "POST" }).then(j<{ ok: boolean }>),
  ocResize: (cols: number, rows: number) => fetch("/api/opencode/resize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cols, rows }) }).catch(() => ({})),
  ocCheck: () => fetch("/api/opencode/check").then(j<{ found: boolean; path: string | null; version: string | null; hint?: string }>),
  ocStatus: () => fetch("/api/opencode/status").then(j<{ state: string; pid: number | null; exitCode: number | null; lastError: string | null; bin: string | null; version: string | null }>),
  browse: (p?: string) => fetch("/api/browse" + (p ? "?path=" + encodeURIComponent(p) : "")).then(j<{ path: string; parent: string | null; home: string; entries: { name: string; path: string }[] }>),
  createFile: (p: string, content?: string) => fetch("/api/fs/file", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: p, content: content ?? "" }) }).then(j<{ path: string; hash: string }>) ,
  createDirectory: (p: string) => fetch("/api/fs/directory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: p }) }).then(j<{ path: string }>) ,
  deletePath: (p: string) => fetch("/api/fs?path=" + encodeURIComponent(p), { method: "DELETE" }).then(j<{ path: string; type: string }>) ,
};
export function wsUrl(p: string) { const proto = location.protocol === "https:" ? "wss:" : "ws:"; return proto + "//" + location.host + p; }
