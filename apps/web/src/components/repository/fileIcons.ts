import type { LucideIcon } from "lucide-react";
import {
  Binary,
  BookMarked,
  BookOpen,
  Boxes,
  Container,
  Database,
  File,
  FileArchive,
  FileAudio,
  FileCode2,
  FileCog,
  FileDiff,
  FileImage,
  FileJson2,
  FileKey,
  FileSpreadsheet,
  FileTerminal,
  FileText,
  FileType,
  FileVideo,
  Folder,
  FolderCog,
  FolderGit2,
  FolderOpen,
  Globe,
  KeyRound,
  Lock,
  Package,
  Palette,
  Presentation,
  Scale,
  ScrollText,
  Wrench,
  Github,
} from "lucide-react";

export type IconSpec = { Icon: LucideIcon; className: string };

const CODE_BLUE = "text-blue-400";
const CODE_YELLOW = "text-yellow-400";
const CODE_GREEN = "text-green-400";
const CODE_RED = "text-red-400";
const MUTED = "text-gray-500";

// Exact filenames (lowercased). Checked before the extension fallback.
const EXACT: Record<string, IconSpec> = {
  "dockerfile": { Icon: Container, className: "text-sky-400" },
  "docker-compose.yml": { Icon: Container, className: "text-sky-400" },
  "docker-compose.yaml": { Icon: Container, className: "text-sky-400" },
  "compose.yml": { Icon: Container, className: "text-sky-400" },
  "compose.yaml": { Icon: Container, className: "text-sky-400" },
  "makefile": { Icon: Wrench, className: "text-gray-400" },
  "cmakelists.txt": { Icon: Wrench, className: "text-gray-400" },
  "package.json": { Icon: Package, className: "text-red-400" },
  "package-lock.json": { Icon: Lock, className: MUTED },
  "pnpm-lock.yaml": { Icon: Lock, className: MUTED },
  "yarn.lock": { Icon: Lock, className: MUTED },
  "bun.lock": { Icon: Lock, className: MUTED },
  "bun.lockb": { Icon: Lock, className: MUTED },
  ".gitignore": { Icon: Github, className: MUTED },
  ".gitattributes": { Icon: Github, className: MUTED },
  ".gitmodules": { Icon: Github, className: MUTED },
  "readme.md": { Icon: BookOpen, className: "text-sky-400" },
  "readme": { Icon: BookOpen, className: "text-sky-400" },
  "changelog.md": { Icon: BookOpen, className: "text-sky-400" },
  "changelog": { Icon: BookOpen, className: "text-sky-400" },
  "contributing.md": { Icon: BookOpen, className: "text-sky-400" },
  "license": { Icon: Scale, className: "text-amber-400" },
  "license.md": { Icon: Scale, className: "text-amber-400" },
  "license.txt": { Icon: Scale, className: "text-amber-400" },
  "licence": { Icon: Scale, className: "text-amber-400" },
};

const EXT: Record<string, IconSpec> = {
  // Code — TypeScript blue, JavaScript yellow, systems/orange-green accents
  "ts": { Icon: FileCode2, className: CODE_BLUE },
  "mts": { Icon: FileCode2, className: CODE_BLUE },
  "cts": { Icon: FileCode2, className: CODE_BLUE },
  "tsx": { Icon: FileCode2, className: CODE_BLUE },
  "js": { Icon: FileCode2, className: CODE_YELLOW },
  "mjs": { Icon: FileCode2, className: CODE_YELLOW },
  "cjs": { Icon: FileCode2, className: CODE_YELLOW },
  "jsx": { Icon: FileCode2, className: CODE_YELLOW },
  "py": { Icon: FileCode2, className: CODE_GREEN },
  "pyi": { Icon: FileCode2, className: CODE_GREEN },
  "pyw": { Icon: FileCode2, className: CODE_GREEN },
  "rs": { Icon: FileCode2, className: "text-orange-400" },
  "go": { Icon: FileCode2, className: "text-sky-300" },
  "java": { Icon: FileCode2, className: CODE_RED },
  "kt": { Icon: FileCode2, className: CODE_RED },
  "kts": { Icon: FileCode2, className: CODE_RED },
  "scala": { Icon: FileCode2, className: CODE_RED },
  "rb": { Icon: FileCode2, className: CODE_RED },
  "php": { Icon: FileCode2, className: "text-indigo-400" },
  "swift": { Icon: FileCode2, className: "text-orange-400" },
  "c": { Icon: FileCode2, className: "text-slate-400" },
  "h": { Icon: FileCode2, className: "text-slate-400" },
  "cpp": { Icon: FileCode2, className: "text-slate-300" },
  "hpp": { Icon: FileCode2, className: "text-slate-300" },
  "cc": { Icon: FileCode2, className: "text-slate-300" },
  "cs": { Icon: FileCode2, className: CODE_GREEN },
  "lua": { Icon: FileCode2, className: "text-indigo-300" },
  "r": { Icon: FileCode2, className: "text-sky-400" },
  "pl": { Icon: FileCode2, className: "text-amber-300" },
  "pm": { Icon: FileCode2, className: "text-amber-300" },
  "vue": { Icon: FileCode2, className: CODE_GREEN },
  "svelte": { Icon: FileCode2, className: "text-orange-500" },
  "astro": { Icon: FileCode2, className: "text-orange-300" },
  // Web
  "html": { Icon: Globe, className: "text-orange-400" },
  "htm": { Icon: Globe, className: "text-orange-400" },
  "xhtml": { Icon: Globe, className: "text-orange-400" },
  "xml": { Icon: FileCode2, className: "text-orange-300" },
  "css": { Icon: Palette, className: "text-blue-400" },
  "scss": { Icon: Palette, className: "text-pink-400" },
  "sass": { Icon: Palette, className: "text-pink-400" },
  "less": { Icon: Palette, className: "text-blue-300" },
  "pcss": { Icon: Palette, className: "text-blue-400" },
  // Data / config
  "json": { Icon: FileJson2, className: "text-amber-400" },
  "jsonc": { Icon: FileJson2, className: "text-amber-400" },
  "json5": { Icon: FileJson2, className: "text-amber-400" },
  "geojson": { Icon: FileJson2, className: "text-amber-400" },
  "yml": { Icon: FileCog, className: MUTED },
  "yaml": { Icon: FileCog, className: MUTED },
  "toml": { Icon: FileCog, className: MUTED },
  "ini": { Icon: FileCog, className: MUTED },
  "cfg": { Icon: FileCog, className: MUTED },
  "conf": { Icon: FileCog, className: MUTED },
  "properties": { Icon: FileCog, className: MUTED },
  // Docs / text
  "md": { Icon: FileText, className: "text-gray-400" },
  "mdx": { Icon: FileText, className: "text-gray-400" },
  "markdown": { Icon: FileText, className: "text-gray-400" },
  "txt": { Icon: FileText, className: MUTED },
  "rst": { Icon: FileText, className: MUTED },
  "adoc": { Icon: FileText, className: MUTED },
  "tex": { Icon: FileText, className: MUTED },
  "pdf": { Icon: BookMarked, className: CODE_RED },
  "doc": { Icon: FileText, className: "text-blue-400" },
  "docx": { Icon: FileText, className: "text-blue-400" },
  "odt": { Icon: FileText, className: "text-blue-400" },
  "rtf": { Icon: FileText, className: "text-blue-400" },
  "log": { Icon: ScrollText, className: MUTED },
  "diff": { Icon: FileDiff, className: "text-amber-400" },
  "patch": { Icon: FileDiff, className: "text-amber-400" },
  // Data tables / slides
  "csv": { Icon: FileSpreadsheet, className: "text-green-500" },
  "tsv": { Icon: FileSpreadsheet, className: "text-green-500" },
  "xls": { Icon: FileSpreadsheet, className: CODE_GREEN },
  "xlsx": { Icon: FileSpreadsheet, className: CODE_GREEN },
  "xlsm": { Icon: FileSpreadsheet, className: CODE_GREEN },
  "ods": { Icon: FileSpreadsheet, className: CODE_GREEN },
  "ppt": { Icon: Presentation, className: "text-orange-400" },
  "pptx": { Icon: Presentation, className: "text-orange-400" },
  "odp": { Icon: Presentation, className: "text-orange-400" },
  // Database
  "sql": { Icon: Database, className: "text-emerald-400" },
  "sqlite": { Icon: Database, className: "text-emerald-400" },
  "sqlite3": { Icon: Database, className: "text-emerald-400" },
  "db": { Icon: Database, className: "text-emerald-400" },
  // Shell
  "sh": { Icon: FileTerminal, className: CODE_GREEN },
  "bash": { Icon: FileTerminal, className: CODE_GREEN },
  "zsh": { Icon: FileTerminal, className: CODE_GREEN },
  "fish": { Icon: FileTerminal, className: CODE_GREEN },
  "ps1": { Icon: FileTerminal, className: "text-sky-400" },
  "bat": { Icon: FileTerminal, className: MUTED },
  "cmd": { Icon: FileTerminal, className: MUTED },
  // Media
  "png": { Icon: FileImage, className: "text-purple-400" },
  "jpg": { Icon: FileImage, className: "text-purple-400" },
  "jpeg": { Icon: FileImage, className: "text-purple-400" },
  "gif": { Icon: FileImage, className: "text-purple-400" },
  "webp": { Icon: FileImage, className: "text-purple-400" },
  "ico": { Icon: FileImage, className: "text-purple-400" },
  "bmp": { Icon: FileImage, className: "text-purple-400" },
  "tiff": { Icon: FileImage, className: "text-purple-400" },
  "tif": { Icon: FileImage, className: "text-purple-400" },
  "avif": { Icon: FileImage, className: "text-purple-400" },
  "heic": { Icon: FileImage, className: "text-purple-400" },
  "svg": { Icon: FileImage, className: "text-purple-300" },
  "mp4": { Icon: FileVideo, className: "text-pink-400" },
  "webm": { Icon: FileVideo, className: "text-pink-400" },
  "mov": { Icon: FileVideo, className: "text-pink-400" },
  "mkv": { Icon: FileVideo, className: "text-pink-400" },
  "avi": { Icon: FileVideo, className: "text-pink-400" },
  "m4v": { Icon: FileVideo, className: "text-pink-400" },
  "mp3": { Icon: FileAudio, className: "text-teal-400" },
  "wav": { Icon: FileAudio, className: "text-teal-400" },
  "ogg": { Icon: FileAudio, className: "text-teal-400" },
  "oga": { Icon: FileAudio, className: "text-teal-400" },
  "flac": { Icon: FileAudio, className: "text-teal-400" },
  "m4a": { Icon: FileAudio, className: "text-teal-400" },
  "aac": { Icon: FileAudio, className: "text-teal-400" },
  "opus": { Icon: FileAudio, className: "text-teal-400" },
  // Archives — jar/war are zip-based
  "zip": { Icon: FileArchive, className: "text-orange-400" },
  "tar": { Icon: FileArchive, className: "text-orange-400" },
  "gz": { Icon: FileArchive, className: "text-orange-400" },
  "tgz": { Icon: FileArchive, className: "text-orange-400" },
  "bz2": { Icon: FileArchive, className: "text-orange-400" },
  "xz": { Icon: FileArchive, className: "text-orange-400" },
  "7z": { Icon: FileArchive, className: "text-orange-400" },
  "rar": { Icon: FileArchive, className: "text-orange-400" },
  "jar": { Icon: FileArchive, className: "text-orange-400" },
  "war": { Icon: FileArchive, className: "text-orange-400" },
  // Fonts
  "ttf": { Icon: FileType, className: MUTED },
  "otf": { Icon: FileType, className: MUTED },
  "woff": { Icon: FileType, className: MUTED },
  "woff2": { Icon: FileType, className: MUTED },
  "eot": { Icon: FileType, className: MUTED },
  // Binaries
  "wasm": { Icon: Binary, className: "text-violet-400" },
  "so": { Icon: Binary, className: MUTED },
  "dll": { Icon: Binary, className: MUTED },
  "dylib": { Icon: Binary, className: MUTED },
  "exe": { Icon: Binary, className: MUTED },
  "bin": { Icon: Binary, className: MUTED },
  "o": { Icon: Binary, className: MUTED },
  "obj": { Icon: Binary, className: MUTED },
  // Secrets / keys
  "pem": { Icon: FileKey, className: "text-yellow-500" },
  "key": { Icon: FileKey, className: "text-yellow-500" },
  "crt": { Icon: FileKey, className: "text-yellow-500" },
  "cer": { Icon: FileKey, className: "text-yellow-500" },
  "p12": { Icon: FileKey, className: "text-yellow-500" },
  "pfx": { Icon: FileKey, className: "text-yellow-500" },
  "pub": { Icon: FileKey, className: "text-yellow-500" },
  "asc": { Icon: FileKey, className: "text-yellow-500" },
  "gpg": { Icon: FileKey, className: "text-yellow-500" },
};

const FALLBACK: IconSpec = { Icon: File, className: MUTED };

/** Per-filename icon for the repo tree (exact name → suffix rules → extension). */
export function getFileIcon(fileName: string): IconSpec {
  const lower = fileName.toLowerCase();
  const exact = EXACT[lower];
  if (exact) return exact;
  // Secrets / environment files: .env, .env.local, prod.env …
  if (lower === ".env" || lower.startsWith(".env.")) return { Icon: KeyRound, className: "text-yellow-500" };
  if (lower.endsWith(".env")) return { Icon: KeyRound, className: "text-yellow-500" };
  // Build-tool configs read as config even though they end in .js/.ts
  if (/^(tsconfig|jsconfig)\..*/.test(lower)) return { Icon: FileCog, className: CODE_BLUE };
  if (/(^|[.-])(vite|tailwind|postcss|eslint|prettier|babel)(\..*)?\.?(config|cfg)\./.test(lower))
    return { Icon: FileCog, className: MUTED };
  const dot = lower.lastIndexOf(".");
  if (dot > 0 && dot < lower.length - 1) {
    const hit = EXT[lower.slice(dot + 1)];
    if (hit) return hit;
  }
  return FALLBACK;
}

const FOLDER_EXACT: Record<string, IconSpec> = {
  ".git": { Icon: FolderGit2, className: "text-orange-400" },
  ".github": { Icon: FolderGit2, className: "text-orange-400" },
  "node_modules": { Icon: Boxes, className: "text-amber-600" },
  "dist": { Icon: Package, className: MUTED },
  "build": { Icon: Package, className: MUTED },
  "out": { Icon: Package, className: MUTED },
  "target": { Icon: Package, className: MUTED },
  ".next": { Icon: Package, className: MUTED },
  ".output": { Icon: Package, className: MUTED },
  "vendor": { Icon: Package, className: MUTED },
  "coverage": { Icon: Package, className: MUTED },
  ".vscode": { Icon: FolderCog, className: MUTED },
  ".idea": { Icon: FolderCog, className: MUTED },
  ".opencode": { Icon: FolderCog, className: MUTED },
};

const FOLDER_TINT: Record<string, string> = {
  "public": "text-purple-400",
  "static": "text-purple-400",
  "assets": "text-purple-400",
  "images": "text-purple-400",
  "img": "text-purple-400",
  "icons": "text-purple-400",
  "fonts": "text-purple-400",
  "media": "text-purple-400",
  "test": "text-green-400",
  "tests": "text-green-400",
  "__tests__": "text-green-400",
  "spec": "text-green-400",
  "specs": "text-green-400",
  "e2e": "text-green-400",
  "docs": "text-blue-300",
  "doc": "text-blue-300",
};

/** Folder icon for the repo tree; open state flips the generic folder glyph. */
export function getFolderIcon(folderName: string, open: boolean): IconSpec {
  const special = FOLDER_EXACT[folderName.toLowerCase()];
  if (special) return special;
  const tint = FOLDER_TINT[folderName.toLowerCase()] ?? "text-sky-400";
  return { Icon: open ? FolderOpen : Folder, className: tint };
}
