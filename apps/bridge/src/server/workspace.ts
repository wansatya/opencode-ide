import path from "node:path";
import fs from "node:fs/promises";
let workspaceRoot: string | null = null;
export function getWorkspaceRoot() { return workspaceRoot; }
export async function setWorkspaceRoot(p: string) {
  const resolved = path.resolve(p);
  const st = await fs.stat(resolved);
  if (!st.isDirectory()) throw Object.assign(new Error("Not a directory"), { status: 400 });
  workspaceRoot = resolved;
  return workspaceRoot;
}
