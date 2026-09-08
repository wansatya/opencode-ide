import path from "node:path";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import Ignore from "ignore";

const execFileP = promisify(execFileCb);

export async function createGitignoreMatcher(root: string) {
  try {
    const gi = await fs.readFile(path.join(root, ".gitignore"), "utf8");
    const ig = Ignore().add(gi);
    return (rel: string) => { try { return ig.ignores(rel); } catch { return false; } };
  } catch { return undefined; }
}

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

function validateRelPath(relPath: string) {
  if (!relPath || !relPath.trim()) throw Object.assign(new Error("Name required"), { status: 400 });
  if (relPath.includes("\0")) throw Object.assign(new Error("Invalid name"), { status: 400 });
  // disallow absolute or backslash-traversal; resolveSafe will catch ".." but give clearer message
  if (relPath.startsWith("/") || relPath.startsWith("\\")) throw Object.assign(new Error("Name must be relative"), { status: 400 });
}

export async function createFileSafe(workspaceRoot: string, relPath: string, content = "") {
  validateRelPath(relPath);
  // reject trailing slash which indicates directory intent
  if (relPath.endsWith("/") || relPath.endsWith(path.sep)) throw Object.assign(new Error("File name must not end with slash"), { status: 400 });
  const abs = resolveSafe(workspaceRoot, relPath);
  try {
    await fs.stat(abs);
    throw Object.assign(new Error("Already exists"), { status: 409 });
  } catch (e: any) {
    if (e.status === 409) throw e;
    if (e.code !== "ENOENT") throw e;
  }
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content, "utf8");
  const stat = await fs.stat(abs);
  return { path: relPath, size: stat.size, modifiedAt: stat.mtimeMs, hash: hashContent(content) };
}

export async function createDirectorySafe(workspaceRoot: string, relPath: string) {
  validateRelPath(relPath);
  // normalize: strip trailing slashes for existence check
  const normalized = relPath.replace(/\/+$/, "");
  if (!normalized) throw Object.assign(new Error("Name required"), { status: 400 });
  const abs = resolveSafe(workspaceRoot, normalized);
  try {
    const st = await fs.stat(abs);
    if (st) throw Object.assign(new Error("Already exists"), { status: 409 });
  } catch (e: any) {
    if (e.status === 409) throw e;
    if (e.code !== "ENOENT") throw e;
  }
  await fs.mkdir(abs, { recursive: true });
  const stat = await fs.stat(abs);
  return { path: normalized, size: stat.size, modifiedAt: stat.mtimeMs };
}

export async function deletePathSafe(workspaceRoot: string, relPath: string) {
  validateRelPath(relPath);
  const normalized = relPath.replace(/\/+$/, "");
  if (!normalized) throw Object.assign(new Error("Cannot delete workspace root"), { status: 400 });
  const abs = resolveSafe(workspaceRoot, normalized);
  const rootAbs = path.resolve(workspaceRoot);
  if (abs === rootAbs) throw Object.assign(new Error("Cannot delete workspace root"), { status: 400 });
  let st: any;
  try {
    st = await fs.lstat(abs);
  } catch (e: any) {
    if (e.code === "ENOENT") throw Object.assign(new Error("Not found"), { status: 404 });
    throw e;
  }
  if (st.isSymbolicLink()) {
    await fs.unlink(abs);
    return { path: normalized, type: "symlink" as const };
  }
  if (st.isDirectory()) {
    await fs.rm(abs, { recursive: true, force: true });
    return { path: normalized, type: "directory" as const };
  }
  if (st.isFile()) {
    await fs.unlink(abs);
    return { path: normalized, type: "file" as const };
  }
  // fallback for other types (FIFO, socket, etc.)
  await fs.rm(abs, { recursive: true, force: true });
  return { path: normalized, type: "file" as const };
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

export type SearchMatch = {
  line: number;
  column: number;
  text: string;
  matchLength: number;
};

export type SearchFileResult = {
  path: string;
  matches: SearchMatch[];
};

export type SearchOptions = {
  matchCase?: boolean;
  useRegex?: boolean;
  maxResults?: number;
  isGitRepo?: boolean;
};

export async function searchWorkspace(
  workspaceRoot: string,
  query: string,
  options: SearchOptions = {}
): Promise<{
  query: string;
  totalMatches: number;
  filesCount: number;
  results: SearchFileResult[];
  truncated: boolean;
}> {
  const trimmed = query.trim();
  if (!trimmed) {
    return { query: "", totalMatches: 0, filesCount: 0, results: [], truncated: false };
  }

  const matchCase = !!options.matchCase;
  const useRegex = !!options.useRegex;
  const maxResults = options.maxResults ?? 500;
  const rootAbs = path.resolve(workspaceRoot);

  // Attempt git grep if workspace is a git repo
  if (options.isGitRepo) {
    try {
      const gitArgs = [
        "grep",
        "-n",
        "-I",
        "--full-name",
        matchCase ? "--no-ignore-case" : "-i",
        useRegex ? "-E" : "-F",
        "-e",
        trimmed,
      ];
      const { stdout } = await execFileP("git", gitArgs, {
        cwd: rootAbs,
        maxBuffer: 10 * 1024 * 1024,
      });

      const lines = stdout.split("\n");
      const resultsMap = new Map<string, SearchMatch[]>();
      let totalMatches = 0;
      let truncated = false;

      for (const line of lines) {
        if (!line) continue;
        // Output format: relative/file/path:lineNum:lineContent
        const firstColon = line.indexOf(":");
        if (firstColon === -1) continue;
        const secondColon = line.indexOf(":", firstColon + 1);
        if (secondColon === -1) continue;

        const relPath = line.substring(0, firstColon);
        const lineNumStr = line.substring(firstColon + 1, secondColon);
        const lineNum = Number(lineNumStr);
        if (!lineNum || isNaN(lineNum)) continue;

        const lineText = line.substring(secondColon + 1);

        // Find match column
        let col = 1;
        let matchLength = trimmed.length;
        if (useRegex) {
          try {
            const re = new RegExp(trimmed, matchCase ? "" : "i");
            const m = re.exec(lineText);
            if (m) {
              col = m.index + 1;
              matchLength = m[0].length;
            }
          } catch {}
        } else {
          const idx = matchCase
            ? lineText.indexOf(trimmed)
            : lineText.toLowerCase().indexOf(trimmed.toLowerCase());
          if (idx !== -1) col = idx + 1;
        }

        if (totalMatches >= maxResults) {
          truncated = true;
          break;
        }

        if (!resultsMap.has(relPath)) {
          resultsMap.set(relPath, []);
        }
        resultsMap.get(relPath)!.push({
          line: lineNum,
          column: col,
          text: lineText,
          matchLength,
        });
        totalMatches++;
      }

      const resultsList: SearchFileResult[] = Array.from(resultsMap.entries()).map(
        ([p, matches]) => ({ path: p, matches })
      );

      return {
        query: trimmed,
        totalMatches,
        filesCount: resultsList.length,
        results: resultsList,
        truncated,
      };
    } catch (e: any) {
      // git grep exit code 1 means no matches found
      if (e.code === 1 && typeof e.stdout === "string" && e.stdout.trim() === "") {
        return { query: trimmed, totalMatches: 0, filesCount: 0, results: [], truncated: false };
      }
      // If error wasn't code 1 (no match), fall back to manual directory scanner below
    }
  }

  // Fallback: Node.js file system scanner
  const resultsMap = new Map<string, SearchMatch[]>();
  let totalMatches = 0;
  let truncated = false;
  const gitignoreMatcher = await createGitignoreMatcher(rootAbs);

  let searchRegex: RegExp | null = null;
  if (useRegex) {
    try {
      searchRegex = new RegExp(trimmed, matchCase ? "g" : "gi");
    } catch {
      return { query: trimmed, totalMatches: 0, filesCount: 0, results: [], truncated: false };
    }
  }

  async function scanDir(dirAbs: string, dirRel: string, depth: number) {
    if (truncated || depth > 10) return;
    let entries;
    try {
      entries = await fs.readdir(dirAbs, { withFileTypes: true });
    } catch {
      return;
    }

    for (const e of entries) {
      if (truncated) break;
      if (DEFAULT_IGNORES.has(e.name)) continue;
      if (e.name.startsWith(".") && e.isDirectory() && !DOT_DIR_ALLOW.has(e.name)) continue;
      const rel = dirRel ? `${dirRel}/${e.name}` : e.name;
      if (gitignoreMatcher && gitignoreMatcher(rel)) continue;
      if (e.isSymbolicLink()) continue;

      const fullAbs = path.join(dirAbs, e.name);

      if (e.isDirectory()) {
        await scanDir(fullAbs, rel, depth + 1);
      } else if (e.isFile()) {
        try {
          const stat = await fs.stat(fullAbs);
          if (stat.size > 2 * 1024 * 1024) continue; // Skip files > 2MB
          if (await isBinary(fullAbs)) continue;

          const content = await fs.readFile(fullAbs, "utf8");
          const lines = content.split("\n");

          for (let i = 0; i < lines.length; i++) {
            const lineText = lines[i];
            if (useRegex && searchRegex) {
              searchRegex.lastIndex = 0;
              let match: RegExpExecArray | null;
              while ((match = searchRegex.exec(lineText)) !== null) {
                if (totalMatches >= maxResults) {
                  truncated = true;
                  break;
                }
                if (!resultsMap.has(rel)) resultsMap.set(rel, []);
                resultsMap.get(rel)!.push({
                  line: i + 1,
                  column: match.index + 1,
                  text: lineText,
                  matchLength: match[0].length,
                });
                totalMatches++;
                if (match[0].length === 0) break; // prevent infinite loop on empty match
              }
            } else {
              const target = matchCase ? trimmed : trimmed.toLowerCase();
              const source = matchCase ? lineText : lineText.toLowerCase();
              let idx = source.indexOf(target);
              while (idx !== -1) {
                if (totalMatches >= maxResults) {
                  truncated = true;
                  break;
                }
                if (!resultsMap.has(rel)) resultsMap.set(rel, []);
                resultsMap.get(rel)!.push({
                  line: i + 1,
                  column: idx + 1,
                  text: lineText,
                  matchLength: trimmed.length,
                });
                totalMatches++;
                idx = source.indexOf(target, idx + target.length);
              }
            }
            if (truncated) break;
          }
        } catch {}
      }
    }
  }

  await scanDir(rootAbs, "", 0);

  const resultsList: SearchFileResult[] = Array.from(resultsMap.entries()).map(
    ([p, matches]) => ({ path: p, matches })
  );

  return {
    query: trimmed,
    totalMatches,
    filesCount: resultsList.length,
    results: resultsList,
    truncated,
  };
}

