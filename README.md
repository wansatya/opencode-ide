# OpenCode Cockpit v0.1.0

Local-first visual cockpit for [OpenCode](https://opencode.ai) CLI. Three resizable panels — **Repository tree** (left), **Monaco code/diff** (center), **live OpenCode PTY** (right) — with file-watching, Git awareness and isolated session branches. The filesystem + Git are the source of truth.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ TopBar: Wan Cockpit | my-app  ~/projects/my-app  [branch ▾]  clean · 0 │
├──────────────┬──────────────────────────────┬─────────────────────────────┤
│ Repository   │ Editor (tabs + toolbar)      │ OpenCode Terminal (xterm)   │
│ ▼ src        │ App.tsx  [Code|Diff] [Find] │ > opencode                  │
│  Button.tsx M│  1 import ...                │ > Reading ...               │
│ package.json │                              │ $ npm test  ✓ 42 passed     │
├──────────────┴──────────────────────────────┴─────────────────────────────┤
│ StatusBar: 2 changed · 0 added · 2 modified | branch: main | Merge [▾] → main [Merge] [ ]delete after | process running │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Features

### Layout
- Three columns `240px | flex | 560px`, draggable dividers (`180px / 400px / 280px` min), `localStorage` persistence (`leftW` `rightW`), toggles (`Ctrl+B` / `Ctrl+Shift+B`). Dark brown theme, Lucide icons, responsive.

### Top Bar
- App name, repo name + root path, **branch dropdown** (`GitBranch`) → `GET /api/git/branches`, `POST /api/git/checkout` (with `git checkout` error surfacing, blocked-on-dirty handling), Git state badge (`clean`/`modified`/`conflicts`/`detached` + file count), OpenCode status (`disconnected`/`starting`/`connected`/`working`/`idle`/`exited`/`error` with colored `Circle`), **Open** repo picker, **Refresh** (tree+git).

### Status Bar (footer) — One-click merge
- Left: `N changed · A added · M modified`, current branch.
- Center (when `isGitRepository`): **Merge** control — `select` of other local branches (`api.gitBranches()` filtered `≠ current` → `Max 160px`), `→ current`, **Merge** button, **delete after** checkbox (**default off / not delete**; when checked sends `deleteAfter=true` → `git branch -d` after successful `git merge`).
- Inline feedback (`Check` success / `AlertTriangle` error, auto-dismiss 5–7s), reloads tree + git + branch list, surfaces conflict output (`CONFLICT` detection).
- Right: OpenCode `state` (`process running` when `connected`/`working`).

### Repository Panel
- File tree (`FileTree`) with file-type icons (`fileIcons.ts`), folder expand/collapse, Git status badges (`M/A/D/R/?/conflicted`), respects `.gitignore` via bridge `Ignore`, truncated warning (`20k files / 10 levels` → use Quick Open).
- Context menu (right-click file/dir/empty): **New File** / **New Folder** (supports `a/b/c.txt` nesting, auto-expands parents), **Delete File/Folder** (recursive folder delete, closes affected editor tabs, clears selection, collapses expanded state).
- Toolbar: **New File** (`FilePlus`) / **New Folder** (`FolderPlus`) at root.

### Editor Panel (Monaco)
- `monaco-editor` dark-brown theme, `fontSize 13`, minimap off, bracket matching, folding, sticky scroll, semantic diagnostics disabled (no false `Cannot find module 'react'`), `allowJs`/JSX.
- **Tabs**: multi-file, `•` dirty marker, click to switch, `X` close, context menu `Close` / `Close Others` / `Close All`, right-click empty bar → `Close All`.
- **Code vs Diff**: `DiffEditor` (`HEAD` vs `working tree`; untracked/added → empty base via `git show HEAD:<path>`), toggle with `GitCompare` button (only when `gitSt !== untracked`).
- **Find & Replace**: `Ctrl+F` (find), `Ctrl+H` (replace row), match-info `N/M`, `ChevronUp/Down` next/prev, `Aa` case, `Ab|` whole-word, `.*` regex (with validation + `$1` capture groups), `Replace` / `Replace All` (reverse-sorted edits), `X`/`Esc` close, viewport decorations (`findMatchBg`).
- **Indentation**: `Settings2` dropdown → `Spaces`/`Tabs` + `Tab size 2|4`, applied to all editors via `tabSize`/`insertSpaces` (`detectIndentation:false`), persisted in `localStorage` (`editorTabSize` `editorInsertSpaces`).
- **Save**: `Save •` (amber) when dirty, `Ctrl+S`, `PUT /api/file` → `writeFileSafe` + hash, marks clean, refreshes Git.
- **Binary / Large file guards**: `Binary file` / `Large file (>5MB)` placeholders, `binary`/`tooLarge` detection from `readFileSafe`.
- **External-change handling**: filesystem/PTy bursts debounced (`250ms`), if current file → reload or `External change detected` dialog (`Compare` → diff, `Keep Mine`, `Reload From Disk`), if dirty in background → toast `OpenCode updated … — opened in background` without stealing focus, otherwise auto-focus last modified file + auto-switch to `diff` after `400ms` git refresh, preloads earlier paths as background tabs.

### Terminal Panel (xterm.js)
- `xterm@5`, `addon-fit`, `scrollback 5000`, cursor blink, brown theme, `FitAddon`.
- **PTY mirror** via `node-pty` (`OpenCodeService`) + `WS /api/opencode/terminal` (`ws` + `node-pty`), raw forwarding `onData`/`onBinary`, `input`/`resize` JSON, `getBuffer` replay, trailing `[process exited N]` suppressed, PTY exit → `opencode.state` broadcast.
- **Start/Stop**: `Play`/`Square` buttons, `starting` → `Starting opencode…` + spinner (`StartupVisualization`), `Stop` clears scrollback, `exited` → `Press Start to relaunch`. Auto-start on workspace open, `cockpit:opencode-autostart`/`restart` events, `api.ocCheck`/`ocStatus` probes (`opencode not found` banner).
- **Auto-branch isolation** (default ON): each `POST /api/opencode/start` creates `opencode/session-YYYYMMDD-HHMMSS-rand` from `HEAD` via `git checkout -b` (dirty tree carried over). If `opencode/*` branches exist → `409 BRANCH_CHOICE_REQUIRED` with `branches`/`lastBranch`, frontend `BranchChoiceDialog` prompts **Create new branch** vs **Continue last/selected branch** (`git checkout <chosen>`). Bypass with `COCKPIT_AUTO_BRANCH=0` or `--no-branch` / `{autoBranch:false}`.
- **Resize**: `ResizeObserver` + `window resize` throttled (`50ms`), `fit.proposeDimensions()` → `WS resize` + `POST /api/opencode/resize`.

### Git Integration
- `simple-git` + direct `git` subprocesses, `rev-parse --show-toplevel`, prefix mapping (`workspacePrefix`) so opening a subfolder (`~/my-app/src`) keeps its tree/watcher/PTY `cwd` there while Git commands run at toplevel.
- `GET /api/git/status` → `branch` `files[]` (`path` `index` `working` `status` `from?`) `ahead` `behind` `state` (`clean`/`modified`/`conflicts`/`detached`), toplevel→workspace path translation.
- `GET /api/git/diff?path=&cached=` , `GET /api/git/head?path=`, `GET /api/git/branches` (`current` `branches[]` `detached` + `isGitRepository`, current-first sorted, fallback `branchLocal()`), `GET /api/git/opencode-branches` (`opencode/*` sorted by `committerdate` then lexical descending), `POST /api/git/checkout` (validates `branch` name, `git checkout`, broadcasts `git.status_changed` + `git.branch_changed`), `POST /api/git/merge` (`git merge <branch>`, conflict detection via `CONFLICT`/`Automatic merge failed`, optional `deleteAfter` → `git branch -d <source>` with `deleted`/`deleteError`), `POST /api/git/branch/delete`.
- Guards: `Not a git repository` paths still work (tree+editor+terminal remain, merges disabled).

### Workspace & Filesystem
- **Open Repository** (`RepositoryPicker`): typed path + `Go` + `Up`/`Home` + folder list (`GET /api/browse` → `parent` `home` `entries[]` with concurrent `stat`, dotfiles hidden), validates dir, refuses `/` / `home` / `/home` / `/root` (`Refusing to open …: pick a project folder`), `POST /api/workspace/open` → `setWorkspaceRoot` + `gitService.setRoot` ∥ `watcherService.stop` → `watcherService.start(root)`, kills lingering PTY, broadcasts `repository.opened` + `git.status_changed`, then `GET /api/tree` + `GET /api/workspace`.
- **File API** (`FileService`): `GET /api/tree` (`buildTree` ignoring `node_modules/.git/dist/...` + `.gitignore`, truncation), `GET /api/file` (`readFileSafe` + `binary`/`tooLarge`/`hash`/`size`/`modifiedAt`), `PUT /api/file` (`writeFileSafe` + broadcast `file.modified`), `POST /api/fs/file` (`createFileSafe`), `POST /api/fs/directory` (`createDirectorySafe`), `DELETE /api/fs?path=` (`deletePathSafe`, recursive), all via `resolveSafe` (`traversal`/`symlink`/`absolute` protection, root containment).
- **Watcher**: `chokidar` recursive, debounced bursts, `watcherService.onEvent` → `WS /api/events` (`file.created/modified/deleted` `directory.created/deleted` `git.status_changed` `git.branch_changed` `opencode.state`), `onGitRefresh` debounced Git scans (`250–500ms`).

### Palettes & Navigation
- `Ctrl+P` **Quick Open** (`QuickOpen`, `flatFiles` + `getFileIcon`, filter includes on lower-case, `Enter` → select, `Esc` close, `20` hits).
- `Ctrl+Shift+P` **Command Palette** (`CommandPalette`): `Open Repository`, `Refresh Repository`, `Refresh Git Status`, `Focus Terminal`, `Restart/Stop OpenCode`.
- `Ctrl+B` / `Ctrl+Shift+B` toggle left/right, `` Ctrl+` `` focus terminal, `Ctrl+Shift+D` toggle diff for selected file, `Ctrl+W` close active tab, `Ctrl+F`/`Ctrl+H`/`Esc` for find, `Ctrl+S` save.

### Backend (Bridge)
- Express `3101`, `cors`, `10mb` json, `WebSocketServer` (`/api/events` + `/api/opencode/terminal`), `GET /api/health`, static `../web/dist`, `COCKPIT_ROOT` / `--root=` pre-open (`initInitialRoot`), graceful `SIGINT`/`SIGTERM` shutdown (stop watcher, kill PTY). Services: `WorkspaceService` `FileService` `GitService` `WatcherService` `OpenCodeService`.

---

## Install (one line)

```sh
curl -fsSL https://raw.githubusercontent.com/wansatya/opencode-ide/main/install.sh | bash
# options: --repo URL --dir PATH --bin-dir PATH --no-build
# clones to ~/.opencode-ide, npm install, npm run build, links ~/.local/bin/cockpit
```

Requires `Node 20+`, `npm`, `git`, `opencode` CLI (`https://opencode.ai`). Ensure `~/.local/bin` on `PATH`: `export PATH="$HOME/.local/bin:$PATH"`.

## Run

```sh
cockpit start ~/projects/my-app          # dev: vite :5173 + bridge :3101, opens browser
cockpit start ~/projects/my-app --prod   # prod: bridge serves web/dist on :3101
cockpit start . --no-branch              # work directly on current branch (auto-branch OFF)
cockpit start --foreground               # foreground (no nohup)
cockpit stop | cockpit status | cockpit logs -f
COCKPIT_AUTO_BRANCH=0 cockpit start .    # env disable isolation
```

Manual equivalent:

```sh
npm run install:all        # workspaces install
npm run dev                # concurrently web+bridge
npm run build && npm start # prod: tsc+vite build + bridge dist/server/index.js
npm test                   # bridge: Node test (filesystem security)
```

Open UI → type repo path (or `Open` → browse) → **Start** in terminal panel (handles branch choice if `opencode/*` exist) → PTY interactive.

## CLI — `bin/cockpit`

```
cockpit start [path] [--prod] [--no-browser] [--no-branch|--branch] [-f|--foreground]
cockpit stop | status | logs [-f] | restart | --help | --version
```

`--prod` requires `apps/web/dist` + `apps/bridge/dist`; builds automatically if missing. Kills stale `:5173/:3101` via `lsof`/`fuser`, detaches with `setsid nohup`, `RUNTIME_DIR=$XDG_STATE_HOME/cockpit` (`cockpit.log` `cockpit.pid`), reuses macOS tab via `osascript` (Chrome/Chromium/Brave/Edge/Arc/Vivaldi/Opera + Safari) else `BROWSER`/`xdg-open`/`wslview`, waits `90s` for `/` health.

## API

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | `{"ok":true}` |
| `GET` | `/api/workspace` | `{"root":string|null,"name":string|null}` |
| `GET` | `/api/browse?path=` | `{"path","parent","home","entries":[{"name","path"}]}` |
| `POST` | `/api/workspace/open` | `{"path":string}` → `{"root","selected","isGitRepository"}` + broadcasts |
| `GET` | `/api/tree` | `{"root","tree":FileNode[],"truncated":bool}` |
| `GET` | `/api/file?path=` | `{"path","content?","binary?","tooLarge?","size","modifiedAt","hash?"}` |
| `PUT` | `/api/file` | `{"path","content"}` → `{"hash"}` |
| `POST` | `/api/fs/file` | `{"path","content?"}` → `{"path","hash"}` |
| `POST` | `/api/fs/directory` | `{"path"}` → `{"path"}` |
| `DELETE` | `/api/fs?path=` | `{"path","type":"file\|directory"}` |
| `GET` | `/api/git/status` | `{"isGitRepository":bool,"branch":string|null,"files":GitFile[],"ahead","behind","state"}` |
| `GET` | `/api/git/diff?path=&cached=` | `{"diff":string}` |
| `GET` | `/api/git/head?path=` | `{"content":string|null}` |
| `GET` | `/api/git/branches` | `{"current":string|null,"branches":string[],"detached":bool,"isGitRepository":bool}` |
| `POST` | `/api/git/checkout` | `{"branch"}` → `{"ok":true,"branch","previous"}` / `409 {error}` |
| `POST` | `/api/git/merge` | `{"branch":string,"deleteAfter":bool}` → `{"ok":true,"branch","previous","output","deleted?","deleteError?"}` / `409 {error,output,conflict}` |
| `POST` | `/api/git/branch/delete` | `{"branch"}` → `{"ok":true,"branch","deleted":true}` / `409` |
| `GET` | `/api/git/opencode-branches` | `{"branches":string[],"lastBranch":string|null,"isGitRepository":bool}` |
| `GET` | `/api/opencode/check` | `{"found":bool,"path":string|null,"version":string|null,"hint?"}` |
| `GET` | `/api/opencode/status` | `{"state","pid":number|null,"exitCode":number|null,"lastError":string|null,"bin":string|null,"version":string|null}` |
| `POST` | `/api/opencode/start` | `{"cols","rows","branchChoice?":"new\|continue\|opencode/...","autoBranch?":bool}` → `409 {code:"BRANCH_CHOICE_REQUIRED",branches,lastBranch}` or `{"state","branch","previousBranch",...}` |
| `POST` | `/api/opencode/resize` | `{"cols","rows"}` → `{"ok":true}` |
| `POST` | `/api/opencode/stop` | → `{"ok":true}` |
| `WS` | `/api/events` | `{"type":"file.created\|file.modified\|file.deleted\|directory.created\|directory.deleted\|git.status_changed\|git.branch_changed\|git.branch_created\|repository.opened\|opencode.state","path?","state?","error?","code?"}` |
| `WS` | `/api/opencode/terminal` | PTY mirror: `{"type":"input","data":string}` / `{"type":"resize","cols","rows"}` ↔ raw + `[process exited N]` filtered |

Frontend helpers: `apps/web/src/lib/api.ts:14` `api.*` + `wsUrl()` (http→ws). Local IPC narrowed, `resolveSafe` prevents `../`/symlink/absolute traversal.

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `Ctrl+P` | Quick Open (`Search files...`) |
| `Ctrl+Shift+P` | Command Palette |
| `Ctrl+S` | Save current file |
| `Ctrl+W` | Close active tab |
| `Ctrl+F` | Toggle Find |
| `Ctrl+H` | Toggle Replace |
| `Enter` / `Shift+Enter` | Find next / prev (Replace All via `Ctrl+Enter` when focused) |
| `Esc` | Close find / palette / branch dropdown / picker |
| `Ctrl+Shift+D` | Toggle Code/Diff for selected file |
| `Ctrl+B` | Toggle Repository panel |
| `Ctrl+Shift+B` | Toggle Terminal panel |
| `Ctrl+`` | Focus terminal |

## Project Structure

```
opencode-cockpit/
├── apps/web/                # React 18 + Vite 6 + Zustand 5 + Monaco + xterm + Lucide
│   ├── src/components/layout/{TopBar,StatusBar}
│   ├── src/components/repository/{RepositoryPanel,FileTree,fileIcons}
│   ├── src/components/editor/EditorPanel
│   ├── src/components/terminal/{TerminalPanel,StartupVisualization}
│   ├── src/components/common/Dialogs (RepositoryPicker, QuickOpen, CommandPalette, BranchChoiceDialog)
│   ├── src/stores/{repository,git,editor,terminal,ui}
│   ├── src/lib/{api, singleTab}
│   └── src/types/index.ts (FileNode, GitStatus, GitFile, OpenCodeState, ProcState)
├── apps/bridge/             # Express 4 + ws + chokidar + simple-git + node-pty + Ignore
│   ├── src/filesystem/FileService (buildTree, read/write/create/delete, hashContent, resolveSafe)
│   ├── src/git/GitService (getStatus, getBranch/Diff/Head, listBranches/OpencodeBranches, checkoutBranch, mergeBranch, deleteBranch, createSessionBranch)
│   ├── src/opencode/OpenCodeService (start/write/resize/kill/onData/onExit/check/status)
│   ├── src/watcher/WatcherService (start/stop, onEvent, onGitRefresh)
│   └── src/server/{index,workspace}
├── bin/cockpit              # launcher (dev/prod, ports :5173/:3101, COCKPIT_ROOT, auto-branch)
├── install.sh               # curl-pipeable installer (Node 20+ guard)
├── SPEC.md                  # MVP spec (layout, flows, persistence, non-goals)
└── README.md
```

## Build / Dev

```sh
npm run dev          # web :5173 (vite) + bridge :3101 (tsx watch) — uses direct tsx/vite bins to avoid ENOSPC
npm run build        # web: tsc + vite build → dist/ ; bridge: tsc → dist/
npm run dev:web | dev:bridge
npm test             # apps/bridge: filesystem security (traversal guards)
```

Tech: `TypeScript 5`, `Tailwind 3`, `Zustand`, `simple-git`, `node-pty`, `ignore`, `concurrently`. Local-first, no cloud, privileged bridge validated against workspace root.

## Non-Goals (MVP)

AI chat, LLM provider, completion, debugger, preview, extensions, cloud sync, collaboration, code indexing — stays small, OpenCode owns task understanding/tool use.

## License

MIT — see `LICENSE`.
