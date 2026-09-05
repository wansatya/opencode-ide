import path from "node:path";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";

const MAX_FILE_SIZE = 5 * 1024 * 1024;

export function resolveSafe(workspaceRoot: string, relPath: string): string {
  const root = path.resolve(workspaceRoot);
  const resolved = path.resolve(root, relPath);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw Object.assign(new Error("Path traversal rejected"), { status: 403 });
  }
  return resolved;
}

export function hashContent(content: string | Buffer): string {
  return createHash("sha1").update(content).digest("hex");
}

export async function isBinary(filePath: string): Promise<boolean> {
  const fh = await fs.open(filePath, "r");
  try {
    const buf = Buffer.alloc(8000);
    const { bytesRead } = await fh.read(buf, 0, 8000, 0);
    const sample = buf.subarray(0, bytesRead);
    if (sample.includes(0)) return true;
    const text = sample.toString("utf8");
    if (text.includes("\uFFFD")) return true;
    return false;
  } finally {
    await fh.close();
  }
}

export async function readFileSafe(workspaceRoot: string, relPath: string) {
  const abs = resolveSafe(workspaceRoot, relPath);
  const stat = await fs.stat(abs);
  if (stat.isDirectory()) throw Object.assign(new Error("Is a directory"), { status: 400 });
  if (stat.size > MAX_FILE_SIZE) {
    return { path: relPath, tooLarge: true as const, size: stat.size, modifiedAt: stat.mtimeMs };
  }
  if (await isBinary(abs)) {
    return { path: relPath, binary: true as const, size: stat.size, modifiedAt: stat.mtimeMs };
  }
  const content = await fs.readFile(abs, "utf8");
  return { path: relPath, content, encoding: "utf-8" as const, size: stat.size, modifiedAt: stat.mtimeMs, hash: hashContent(content) };
}

export async function writeFileSafe(workspaceRoot: string, relPath: string, content: string) {
  const abs = resolveSafe(workspaceRoot, relPath);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content, "utf8");
  const stat = await fs.stat(abs);
  return { path: relPath, size: stat.size, modifiedAt: stat.mtimeMs, hash: hashContent(content) };
}

export type FileNode = {
  path: string;
  name: string;
  type: "file" | "directory";
  children?: FileNode[];
};

const DEFAULT_IGNORES = new Set([
  "node_modules", ".git", "dist", "build", "coverage", ".cache", ".next", ".nuxt", "target", ".venv", "__pycache__",
]);

// Safety caps so opening a huge directory (e.g. home dir) can't starve the
// bridge event loop (which also serves /api/health and WS upgrades).
const MAX_FILES = 20000;
const MAX_DEPTH = 10;
// Dot-directories (e.g. ~/.cache, ~/.config) explode scan size; only allow
// ones that are typically useful in a project view.
const DOT_DIR_ALLOW = new Set([".github", ".vscode"]);

export async function buildTree(workspaceRoot: string, gitignoreMatcher?: (p: string) => boolean): Promise<{ tree: FileNode[]; truncated: boolean }> {
  let count = 0;
  let truncated = false;
  async function walk(dirAbs: string, dirRel: string, depth: number): Promise<FileNode[]> {
    let entries;
    try {
      entries = await fs.readdir(dirAbs, { withFileTypes: true });
    } catch {
      return [];
    }
    const nodes: FileNode[] = [];
    const subdirs: { abs: string; rel: string; name: string }[] = [];
    for (const e of entries) {
      if (truncated) break;
      if (DEFAULT_IGNORES.has(e.name)) continue;
      // Skip dot-directories (except allowlist) to avoid ~/.cache-style blowups.
      if (e.name.startsWith(".") && e.isDirectory() && !DOT_DIR_ALLOW.has(e.name)) continue;
      const rel = dirRel ? `${dirRel}/${e.name}` : e.name;
      if (gitignoreMatcher && gitignoreMatcher(rel)) continue;
      if (e.isSymbolicLink()) continue;
      if (count >= MAX_FILES) { truncated = true; break; }
      if (e.isDirectory()) {
        if (depth >= MAX_DEPTH) { truncated = true; continue; }
        // Defer recursion: collect first so sibling subdirs scan concurrently.
        count += 1;
        subdirs.push({ abs: path.join(dirAbs, e.name), rel, name: e.name });
      } else if (e.isFile()) {
        nodes.push({ path: rel, name: e.name, type: "file" });
        count += 1;
      }
    }
    // Scan subdirectories in parallel instead of one-by-one. This is the
    // dominant cost when opening a repo (hundreds of readdir roundtrips),
    // and concurrency cuts wall time several-fold on large trees.
    if (subdirs.length > 0 && !truncated) {
      const childLists = await Promise.all(
        subdirs.map((s) => walk(s.abs, s.rel, depth + 1)),
      );
      for (let i = 0; i < subdirs.length; i++) {
        nodes.push({ path: subdirs[i].rel, name: subdirs[i].name, type: "directory", children: childLists[i] });
      }
    } else if (subdirs.length > 0) {
      for (const s of subdirs) {
        nodes.push({ path: s.rel, name: s.name, type: "directory", children: [] });
      }
    }
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return nodes;
  }
  const tree = await walk(path.resolve(workspaceRoot), "", 0);
  return { tree, truncated };
}

export function flattenPaths(nodes: FileNode[]): string[] {
  const out: string[] = [];
  for (const n of nodes) {
    out.push(n.path);
    if (n.children) out.push(...flattenPaths(n.children));
  }
  return out;
}
