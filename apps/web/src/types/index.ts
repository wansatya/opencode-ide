export type FileNode = { path: string; name: string; type: "file" | "directory"; children?: FileNode[] };
export type GitStatus = "modified"|"added"|"deleted"|"renamed"|"untracked"|"conflicted"|"staged";
export type GitFile = { path: string; index: string; working: string; status: GitStatus };
export type OpenCodeState = "disconnected"|"starting"|"connected"|"working"|"idle"|"exited"|"error";
export type ProcState = "starting"|"running"|"exited"|"error";
