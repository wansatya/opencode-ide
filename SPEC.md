# OpenCode Visual Cockpit

**Status:** MVP Specification
**Version:** 0.1.0
**Type:** Local-first developer application
**Primary goal:** Make OpenCode's repository activity visible, inspectable, and controllable without replacing OpenCode itself.

---

# 1. Product Definition

OpenCode Visual Cockpit is a local developer UI that sits beside the OpenCode CLI.

It provides exactly three primary surfaces:

1. **Repository File Tree** — left
2. **Code / Diff Viewer using Monaco** — center
3. **Live OpenCode Terminal Mirror** — right

The application does **not** attempt to become a full IDE.

OpenCode remains responsible for:

* understanding the user's task
* reading files
* modifying files
* running commands
* running tests
* using tools
* interacting with the underlying project

The application is responsible for:

* displaying repository structure
* detecting filesystem changes
* displaying current file contents
* displaying Git changes
* displaying diffs
* mirroring the OpenCode terminal
* providing interactive terminal input
* keeping UI state synchronized with the real filesystem

## Core principle

> The filesystem and Git state are the source of truth. Never infer repository state solely from OpenCode terminal output.

---

# 2. Problem

AI coding agents are effective but opaque.

A developer can ask OpenCode to:

> "Add authentication."

OpenCode may then:

* inspect 20 files
* create 4 files
* modify 8 files
* install dependencies
* execute shell commands
* modify configuration
* run tests

The developer should be able to immediately answer:

* What files changed?
* What exactly changed?
* Which files are new?
* Which files were deleted?
* What command is OpenCode running?
* Is OpenCode currently working?
* Did the agent modify something I did not expect?
* What does the repository look like now?
* What is the Git diff?

The application solves this visibility problem.

---

# 3. Non-Goals

Do NOT implement these in MVP:

* AI chat interface
* custom LLM provider
* AI model selection
* code completion
* inline AI suggestions
* debugger
* browser preview
* extension marketplace
* plugin marketplace
* full IDE functionality
* project management
* cloud synchronization
* collaborative editing
* remote repositories
* GitHub authentication
* code indexing
* semantic code search
* autonomous agent
* replacing OpenCode
* parsing OpenCode's internal implementation

The application should remain small.

---

# 4. Target User

Primary user:

> A developer who already uses OpenCode CLI for vibe coding and wants visual awareness of what the agent is doing to their repository.

The user is technically capable and has:

* Node.js installed
* Git installed
* OpenCode CLI installed
* one or more local repositories

---

# 5. UX Architecture

Desktop layout:

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ TOP BAR                                                                  │
│                                                                         │
│  OpenCode Cockpit   ~/projects/my-app   main   ● OpenCode Connected     │
├────────────────┬───────────────────────────────────┬────────────────────┤
│                │                                   │                    │
│ REPOSITORY     │ CODE / DIFF                       │ OPENCODE           │
│                │                                   │                    │
│ ▼ src          │ App.tsx                           │ > opencode         │
│   ▼ components │                                   │                    │
│     Button.tsx │ 1 import React from "react"      │ > Reading...       │
│     Header.tsx │ 2                                 │ > Editing...       │
│   App.tsx      │ 3 function App() {               │                    │
│   main.tsx     │ 4   return (...)                 │ $ npm test         │
│                │ 5 }                               │ ✓ 42 passed        │
│ ▼ public       │                                   │                    │
│ package.json   │                                   │                    │
│ README.md      │                                   │                    │
│                │                                   │                    │
├────────────────┴───────────────────────────────────┴────────────────────┤
│ STATUS BAR                                                               │
│ 7 changed files · 2 added · 5 modified · branch: main · clean process   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

# 6. Layout Requirements

Use a three-column layout.

Default widths:

```text
Left repository: 240px
Center editor: flexible
Right terminal: 380px
```

Allow resizing columns using draggable separators.

Minimum widths:

```text
Repository: 180px
Editor: 400px
Terminal: 280px
```

The center editor must receive remaining horizontal space.

The application must work at minimum:

```text
1280 × 720
```

Target:

```text
1440 × 900
1920 × 1080
```

---

# 7. Top Navigation

Top bar contains:

```text
[App Logo / Name]
[Repository Name]
[Current Branch]
[Git Status]
[OpenCode Status]
```

Example:

```text
OpenCode Cockpit
my-app
main
7 changes
● OpenCode connected
```

Status states:

```text
OpenCode:
- disconnected
- starting
- connected
- working
- idle
- exited
- error

Git:
- clean
- modified
- conflicts
- detached
```

---

# 8. Repository Panel

The left panel is a filesystem tree.

## Requirements

Display:

* folders
* files
* nesting
* expand/collapse
* file icons
* folder icons
* Git status indicators

Example:

```text
▼ src
  ▼ components
    Button.tsx
    Header.tsx
  App.tsx
  main.tsx

▼ public
  favicon.svg

package.json
README.md
```

## Git indicators

Use subtle indicators:

```text
M   modified
A   added
D   deleted
R   renamed
?   untracked
```

Example:

```text
src/
  App.tsx        M
  auth.ts        A
  old-auth.ts    D
```

The file tree must reflect actual filesystem state.

---

# 9. File Tree Behavior

Clicking a file:

1. Read the file from disk.
2. Open it in Monaco.
3. Display current content.
4. Highlight if modified.
5. Mark the file as active.

Clicking a folder:

* expand
* collapse

Double-clicking a file:

* open/focus file tab

Deleted file:

* keep visible when Git knows about the deletion
* show deleted state
* opening it displays its last known Git version if available

---

# 10. Ignore Rules

Do not display ignored/generated directories by default.

Respect:

```text
.gitignore
```

Default ignored examples:

```text
node_modules
.git
dist
build
coverage
.cache
.next
.nuxt
target
```

Do not hardcode this as the only mechanism.

Use `.gitignore` where possible.

Provide future support for custom ignore configuration.

---

# 11. Editor Panel

Use **Monaco Editor**.

The editor supports two modes:

```text
CODE
DIFF
```

Default mode:

```text
CODE
```

When a modified Git file is selected:

```text
[ Code ] [ Diff ]
```

The user can switch between them.

---

# 12. Monaco Requirements

Configure Monaco with:

* syntax highlighting
* line numbers
* minimap
* bracket matching
* folding
* automatic indentation
* word wrapping OFF by default
* dark theme
* read/write filesystem synchronization

Recommended:

```text
font size: 13-14px
line height: 20-22px
minimap: enabled on desktop
sticky scroll: enabled if supported
```

Do not implement an in-browser compiler.

---

# 13. File Editing Model

The editor is a direct view of the filesystem.

If the user edits a file:

```text
Monaco
  ↓
save
  ↓
filesystem
```

The application must not maintain a completely independent shadow repository.

The disk is authoritative.

---

# 14. External File Changes

This is a critical requirement.

OpenCode can modify files directly.

Example:

```text
OpenCode
    ↓
App.tsx changes on disk
    ↓
filesystem watcher
    ↓
UI event
    ↓
Monaco refresh
```

Use a filesystem watcher such as:

```text
chokidar
```

When an external file changes:

1. Detect change.
2. Determine whether the file is currently open.
3. Read latest content.
4. Update Monaco.
5. Preserve cursor/scroll where reasonably possible.
6. Update Git status.
7. Update file tree indicators.

---

# 15. Unsaved Editor Changes

If Monaco contains unsaved changes and the same file changes externally:

DO NOT silently overwrite user changes.

Show a conflict state:

```text
External change detected

This file was modified outside the editor.

[ Compare ] [ Keep Mine ] [ Reload From Disk ]
```

Default:

```text
Compare
```

Never silently destroy local editor changes.

---

# 16. Diff Viewer

Use Monaco's diff editor.

For modified files:

```text
┌─────────────────────┬─────────────────────┐
│ BASE                │ CURRENT             │
├─────────────────────┼─────────────────────┤
│ old code            │ new code            │
│                     │ + new code          │
└─────────────────────┴─────────────────────┘
```

The diff baseline should be determined from Git.

For tracked modified files:

```text
HEAD version
vs
working tree
```

For staged files:

Support:

```text
HEAD vs index
index vs working tree
```

MVP may initially show:

```text
HEAD vs working tree
```

---

# 17. New Files

For an untracked file:

```text
Git baseline = empty
Current = filesystem contents
```

Display:

```text
all lines as additions
```

---

# 18. Deleted Files

For deleted files:

```text
Current = empty
Baseline = HEAD version
```

Display the deleted content as a diff.

---

# 19. Git Integration

Use Git CLI or a Git library.

Preferred implementation:

```text
simple-git
```

or direct Git subprocesses.

Required operations:

```text
git status --short
git branch --show-current
git diff
git diff --cached
git rev-parse --show-toplevel
git show HEAD:<file>
```

Do not implement a complete Git client.

---

# 20. Git State Refresh

Git state should refresh:

* on application startup
* after filesystem changes
* after OpenCode commands
* after a short debounce period
* when the user manually refreshes

Avoid executing Git commands for every individual filesystem event.

Debounce:

```text
250–500ms
```

---

# 21. OpenCode Integration

OpenCode is an external CLI process.

The application launches OpenCode using a pseudo-terminal.

Use:

```text
node-pty
```

The process must behave like a real interactive terminal.

Do NOT use:

```text
child_process.exec()
```

for the primary interactive session.

---

# 22. OpenCode Process

Conceptually:

```text
spawn(
  "opencode",
  [],
  {
    cwd: repositoryPath,
    cols,
    rows
  }
)
```

The exact command-line arguments must be configurable.

Do not hardcode assumptions about OpenCode's internal protocol.

---

# 23. Terminal UI

Use:

```text
xterm.js
```

The right panel mirrors the OpenCode PTY.

Requirements:

* ANSI colors
* cursor movement
* command input
* output streaming
* resize support
* scrollback
* copy
* paste
* clear
* keyboard input

The terminal should visually behave like a normal terminal.

---

# 24. Terminal Resize

When the right panel is resized:

```text
UI width/height
      ↓
xterm dimensions
      ↓
PTY resize
```

Use the actual xterm rows/columns.

Never simply resize the CSS container.

---

# 25. Terminal Interaction

The terminal is interactive.

User can:

* type prompts
* press Enter
* use Ctrl+C
* use arrow keys
* use keyboard shortcuts supported by the PTY
* paste text

All input is forwarded to OpenCode.

---

# 26. Terminal Output

PTY output is streamed to:

```text
xterm.js
```

Do not attempt to reconstruct terminal formatting manually.

PTY output should remain raw as much as possible.

---

# 27. OpenCode Status

Do not depend exclusively on parsing terminal text to determine state.

Primary process states:

```text
STARTING
RUNNING
EXITED
ERROR
```

Optional activity states may be inferred from process output:

```text
IDLE
WORKING
```

But these are advisory.

The UI must clearly distinguish:

```text
process state
```

from:

```text
agent activity inference
```

---

# 28. Repository Selection

On first launch show:

```text
Open Repository
```

Options:

```text
[ Select Folder ]
```

After selection:

1. validate directory
2. detect Git repository
3. determine repository root
4. load tree
5. initialize Git state
6. launch OpenCode in repository root
7. connect terminal
8. render UI

If selected directory is not a Git repository:

Display:

```text
This directory is not a Git repository.

[ Open Anyway ] [ Cancel ]
```

The application should still work without Git, except Git-specific features.

---

# 29. Repository Root

If user selects:

```text
~/projects/my-app/src
```

the application uses exactly that directory as the workspace root — tree,
watcher, file APIs, and the OpenCode PTY cwd all stay there. The Git
toplevel (here `~/projects/my-app`) is used internally only: GitService maps
status/diff/head paths between the toplevel and the workspace via a
path prefix, so Git badges keep working for subdirectories.

Rationale: jumping to the Git toplevel breaks the "opened repo is the
browsed repo" expectation (e.g. a home-directory monorepo would hijack every
open). Never replace the user's selected directory with an ancestor.

The top bar should display repository name.

---

# 30. Local-First Architecture

The application must work without a cloud backend.

No mandatory:

* login
* account
* API key
* cloud database
* cloud synchronization

Everything required for MVP runs locally.

---

# 31. Security Boundary

The application has access to the user's repository and terminal.

Treat this as a privileged local application.

Never expose filesystem APIs directly to arbitrary browser origins.

The architecture should be:

```text
Browser/UI
   ↓
Authenticated/local IPC or controlled WebSocket
   ↓
Local Bridge
   ↓
Filesystem / Git / PTY
```

Do not create an unrestricted endpoint such as:

```text
POST /read-file?path=/etc/passwd
```

without path validation.

---

# 32. Filesystem Security

All filesystem operations must be constrained to the selected workspace.

Before reading/writing:

```text
resolve requested path
resolve workspace root
verify requested path is inside workspace
```

Protect against:

```text
../
symlinks
absolute path traversal
```

Special care must be taken with symlinks.

---

# 33. Event Architecture

Use an event-driven architecture.

Core events:

```text
repository.opened
repository.closed

file.created
file.modified
file.deleted
file.renamed

git.status_changed
git.diff_changed

editor.file_opened
editor.file_changed
editor.file_saved
editor.conflict

opencode.started
opencode.output
opencode.input
opencode.resized
opencode.exited
opencode.error
```

---

# 34. Frontend State

Use Zustand.

Suggested stores:

```text
repositoryStore
editorStore
gitStore
terminalStore
uiStore
```

Do not put the entire application state into one giant Zustand store.

---

# 35. repositoryStore

Responsible for:

```text
workspaceRoot
repositoryRoot
repositoryName
fileTree
selectedFile
expandedFolders
loading
error
```

Actions:

```text
openRepository()
refreshTree()
selectFile()
toggleFolder()
```

---

# 36. gitStore

Responsible for:

```text
branch
status
changedFiles
isGitRepository
ahead
behind
```

Actions:

```text
refreshStatus()
getDiff()
getHeadFile()
```

---

# 37. editorStore

Responsible for:

```text
openFiles
activeFile
editorMode
dirtyFiles
externalConflicts
```

Actions:

```text
openFile()
closeFile()
saveFile()
showDiff()
resolveConflict()
```

---

# 38. terminalStore

Responsible for:

```text
connected
processState
rows
cols
sessionId
```

The terminal output itself should primarily remain inside xterm.js rather than being stored indefinitely in React/Zustand state.

---

# 39. Backend API

If using a local Node bridge, expose a narrow API.

Example:

```text
GET  /api/workspace
GET  /api/tree
GET  /api/file
PUT  /api/file
GET  /api/git/status
GET  /api/git/diff
GET  /api/git/head
POST /api/opencode/start
POST /api/opencode/resize
POST /api/opencode/stop
WS   /api/opencode/terminal
WS   /api/events
```

Exact transport may be changed if the implementation uses Tauri IPC.

The API contract must remain narrow.

---

# 40. File API

Read:

```text
GET /api/file?path=src/App.tsx
```

Response:

```json
{
  "path": "src/App.tsx",
  "content": "...",
  "encoding": "utf-8",
  "size": 1234,
  "modifiedAt": 123456789
}
```

Write:

```text
PUT /api/file
```

Payload:

```json
{
  "path": "src/App.tsx",
  "content": "..."
}
```

---

# 41. WebSocket Events

Filesystem and Git changes should be pushed to the frontend.

Example:

```json
{
  "type": "file.modified",
  "path": "src/App.tsx"
}
```

Git:

```json
{
  "type": "git.status_changed"
}
```

OpenCode:

```json
{
  "type": "opencode.state",
  "state": "working"
}
```

---

# 42. File Watcher Rules

Watcher must:

* recursively watch workspace
* respect ignored paths
* debounce bursts
* normalize paths
* distinguish add/change/delete
* handle rename-like events
* avoid watching `.git` internals where unnecessary

Never trigger infinite loops.

Example:

```text
Monaco save
   ↓
write file
   ↓
watcher detects change
   ↓
UI event
```

This must not cause:

```text
save → reload → save → reload → ...
```

---

# 43. Change Detection

Use file metadata and/or content hashes where useful.

For open files maintain:

```text
loadedContentHash
diskContentHash
editorContentHash
```

This allows detection of:

```text
clean
dirty
external-change
conflict
```

---

# 44. Application Startup

Startup flow:

```text
START
  ↓
load persisted settings
  ↓
show repository selector if no workspace
  ↓
resolve repository root
  ↓
load file tree
  ↓
initialize Git
  ↓
initialize filesystem watcher
  ↓
initialize WebSocket
  ↓
launch OpenCode
  ↓
initialize xterm
  ↓
render READY
```

---

# 45. Application Shutdown

When closing:

1. stop filesystem watcher
2. terminate OpenCode gracefully
3. close PTY
4. close WebSockets
5. flush UI preferences
6. exit

Do not leave orphaned OpenCode processes.

---

# 46. Persistence

Persist only local UI preferences in MVP.

Examples:

```text
lastRepository
leftPanelWidth
rightPanelWidth
theme
editorSettings
terminalFontSize
```

Do not persist source code outside the repository.

Do not create a hidden copy of the repository.

---

# 47. Theme

MVP should use a dark developer-oriented theme.

Visual hierarchy:

```text
background       very dark
panels            slightly lighter
borders           subtle
primary text      high contrast
secondary text    muted
changed           visible but restrained
error             obvious
success           obvious
```

Do not over-design.

The UI should feel like a serious developer tool.

---

# 48. Icons

Use:

```text
Lucide React
```

or FontAwesome if already configured.

Useful icons:

```text
Folder
FolderOpen
File
GitBranch
GitCompare
Terminal
RefreshCw
ChevronRight
ChevronDown
Circle
AlertTriangle
X
```

Avoid decorative icons.

---

# 49. Typography

Use a UI sans-serif for application chrome.

Use a monospace font for:

* Monaco
* terminal
* Git diff metadata where appropriate

Example:

```text
UI:
Inter/system sans

Code:
Monaco configured monospace font
```

---

# 50. Keyboard Shortcuts

MVP:

```text
Ctrl/Cmd + P
    Quick file open

Ctrl/Cmd + S
    Save current file

Ctrl/Cmd + W
    Close active editor tab

Ctrl/Cmd + Shift + P
    Command palette

Ctrl/Cmd + `
    Focus terminal

Ctrl/Cmd + Shift + D
    Toggle diff mode

Ctrl/Cmd + B
    Toggle repository panel

Ctrl/Cmd + Shift + B
    Toggle terminal panel
```

Do not implement every VS Code shortcut.

---

# 51. Quick File Open

`Ctrl/Cmd + P` opens:

```text
┌──────────────────────────────────────┐
│ Search files...                      │
├──────────────────────────────────────┤
│ src/App.tsx                          │
│ src/main.tsx                         │
│ src/components/Header.tsx            │
└──────────────────────────────────────┘
```

Search filenames/path strings.

No semantic search required.

---

# 52. Command Palette

`Ctrl/Cmd + Shift + P`

Commands:

```text
Open Repository
Refresh Repository
Refresh Git Status
Toggle Diff
Focus Repository
Focus Editor
Focus Terminal
Restart OpenCode
Stop OpenCode
```

---

# 53. Error Handling

Errors must be visible but not disruptive.

Examples:

```text
Unable to read file
OpenCode failed to start
Git command failed
Repository no longer exists
File was deleted externally
Terminal disconnected
```

Use non-blocking notifications where possible.

---

# 54. OpenCode Failure

If OpenCode fails to start:

```text
OpenCode
● Failed to start

[ Retry ]
```

The repository and editor remain usable.

Do not crash the entire application.

---

# 55. Git Failure

If Git is unavailable:

```text
Git unavailable

Repository browsing and terminal remain available.
Git diff/status features are disabled.
```

Do not make Git mandatory for basic filesystem functionality.

---

# 56. File Encoding

MVP assumes UTF-8.

Binary files should not be opened in Monaco.

Detect binary files where practical.

For binary files:

```text
Binary file

This file cannot be displayed in the editor.
```

Do not corrupt binary files by treating them as UTF-8 text.

---

# 57. Large Files

Avoid loading extremely large files into Monaco.

MVP threshold:

```text
5 MB
```

For files above threshold:

```text
Large file

This file is too large to safely display in the editor.
```

Configurable later.

---

# 58. Generated Files

File tree should visually distinguish common generated directories.

Example:

```text
node_modules/   ignored
dist/           ignored
```

Do not allow generated files to flood the tree.

---

# 59. Empty States

No repository:

```text
Open a repository to begin.

[ Open Repository ]
```

No file selected:

```text
Select a file from the repository.
```

No Git changes:

```text
Working tree clean.
```

OpenCode disconnected:

```text
OpenCode is not running.

[ Start OpenCode ]
```

---

# 60. Core User Flow

## Flow A — Open Repository

```text
User launches app
        ↓
Open Repository
        ↓
select ~/projects/my-app
        ↓
detect Git root
        ↓
load tree
        ↓
load Git status
        ↓
start watcher
        ↓
start OpenCode
        ↓
terminal becomes interactive
```

---

# 61. Core User Flow — Agent Editing

```text
User types prompt into OpenCode terminal

"Add dark mode"

        ↓

OpenCode reads repository

        ↓

OpenCode modifies files

        ↓

filesystem changes

        ↓

watcher detects changes

        ↓

Git status refresh

        ↓

file tree indicators update

        ↓

Monaco updates

        ↓

user clicks Diff

        ↓

HEAD vs working tree displayed
```

---

# 62. Core User Flow — User Editing

```text
User selects App.tsx

        ↓

Monaco loads file

        ↓

User changes code

        ↓

Ctrl/Cmd + S

        ↓

filesystem write

        ↓

Git status refresh

        ↓

tree shows M

        ↓

Diff becomes available
```

---

# 63. Core User Flow — External Change Conflict

```text
User edits App.tsx in Monaco
        ↓
unsaved local editor changes
        ↓
OpenCode modifies App.tsx
        ↓
watcher detects external change
        ↓
editor detects dirty + external modification
        ↓
CONFLICT
        ↓
Compare / Keep Mine / Reload
```

---

# 64. Performance Requirements

The application should remain responsive for repositories containing approximately:

```text
10,000 files
```

Do not render all tree nodes simultaneously.

Use:

* lazy folder expansion
* memoized tree nodes
* debounced filesystem events
* virtualized lists where necessary

Do not repeatedly scan the entire repository after every event.

---

# 65. Terminal Performance

Do not put every terminal character into React state.

Use:

```text
PTY → xterm.js
```

directly.

React should manage:

```text
terminal connection state
terminal dimensions
process state
```

not the entire terminal buffer.

---

# 66. Diff Performance

Do not calculate every repository diff continuously.

Only calculate:

```text
selected file
```

when necessary.

Cache recent diffs if useful.

---

# 67. Path Representation

Frontend paths should be relative to repository root.

Use:

```text
src/App.tsx
```

not:

```text
/home/user/projects/my-app/src/App.tsx
```

Absolute paths should remain backend-only.

---

# 68. Platform Requirements

Design for:

```text
Linux
macOS
Windows
```

MVP development priority:

```text
Linux
macOS
Windows
```

Do not assume:

```text
bash
```

is available.

The PTY implementation must use the platform's appropriate shell/process behavior.

---

# 69. Suggested Project Structure

```text
opencode-cockpit/
├── apps/
│   ├── web/
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── layout/
│   │   │   │   ├── repository/
│   │   │   │   ├── editor/
│   │   │   │   ├── terminal/
│   │   │   │   └── common/
│   │   │   ├── stores/
│   │   │   ├── hooks/
│   │   │   ├── lib/
│   │   │   ├── types/
│   │   │   └── App.tsx
│   │   └── package.json
│   │
│   └── bridge/
│       ├── src/
│       │   ├── filesystem/
│       │   ├── git/
│       │   ├── opencode/
│       │   ├── websocket/
│       │   └── server/
│       └── package.json
│
├── package.json
├── README.md
└── SPEC.md
```

---

# 70. Frontend Components

Required components:

```text
AppShell
TopBar
StatusBar

RepositoryPanel
FileTree
FileTreeNode
GitStatusBadge

EditorPanel
EditorTabs
CodeEditor
DiffEditor
EditorToolbar

TerminalPanel
TerminalToolbar
OpenCodeTerminal
TerminalStatus

RepositoryPicker
QuickOpen
CommandPalette

Toast
ConfirmDialog
ConflictDialog
```

---

# 71. Component Responsibility

Components should remain presentational where possible.

Example:

```text
FileTree
```

should not directly execute Git commands.

Instead:

```text
FileTree
  ↓
repositoryStore
  ↓
bridge API
```

Keep process/filesystem logic outside React components.

---

# 72. TypeScript Types

Define explicit shared types.

Example:

```ts
type FileNode = {
  path: string
  name: string
  type: "file" | "directory"
  children?: FileNode[]
  gitStatus?: GitStatus
}

type GitStatus =
  | "modified"
  | "added"
  | "deleted"
  | "renamed"
  | "untracked"
  | "conflicted"

type OpenCodeState =
  | "disconnected"
  | "starting"
  | "connected"
  | "working"
  | "idle"
  | "exited"
  | "error"
```

---

# 73. Backend Service Separation

Separate services:

```text
WorkspaceService
FileService
GitService
WatcherService
OpenCodeService
WebSocketService
```

Do not create one giant backend service.

---

# 74. OpenCodeService

Responsibilities:

```text
start()
write()
resize()
kill()
restart()
onData()
onExit()
```

It owns the PTY.

It must not know anything about React.

---

# 75. WatcherService

Responsibilities:

```text
start(root)
stop()
onFileEvent()
```

It emits normalized repository events.

It must not manipulate Monaco directly.

---

# 76. GitService

Responsibilities:

```text
isRepository()
getRoot()
getStatus()
getDiff(path)
getHeadFile(path)
getBranch()
```

It must not own UI state.

---

# 77. FileService

Responsibilities:

```text
read(path)
write(path, content)
exists(path)
stat(path)
```

Every path must be validated against workspace root.

---

# 78. Testing Requirements

Write tests for:

### Filesystem

* path traversal rejected
* read file
* write file
* missing file
* binary file detection

### Git

* repository detection
* branch detection
* modified file
* added file
* deleted file
* untracked file

### Watcher

* create
* modify
* delete
* debounce
* ignored paths

### OpenCode

* process starts
* process exits
* input forwarding
* output forwarding
* resize
* cleanup

### Editor

* open file
* save
* dirty state
* external change
* conflict detection

---

# 79. Acceptance Criteria

MVP is complete when all of the following work.

## Repository

* [ ] User can select a local directory.
* [ ] Git root is detected.
* [ ] File tree renders.
* [ ] Folders expand/collapse.
* [ ] Files can be opened.
* [ ] Git status appears beside changed files.

## Monaco

* [ ] Files open in Monaco.
* [ ] Syntax highlighting works.
* [ ] User can edit files.
* [ ] Ctrl/Cmd+S saves to disk.
* [ ] External changes update the editor.
* [ ] Unsaved external conflicts are detected.
* [ ] Diff view works.

## OpenCode

* [ ] OpenCode launches in repository root.
* [ ] PTY works.
* [ ] Terminal renders correctly.
* [ ] User can type into OpenCode.
* [ ] OpenCode output streams live.
* [ ] Terminal resizing works.
* [ ] OpenCode can be stopped/restarted.

## Synchronization

* [ ] OpenCode edits appear in file tree.
* [ ] OpenCode edits appear in Monaco.
* [ ] Git status updates automatically.
* [ ] Diff reflects current working tree.
* [ ] No stale repository state after agent edits.

## Reliability

* [ ] OpenCode crash does not crash UI.
* [ ] Git failure does not crash UI.
* [ ] Missing file does not crash UI.
* [ ] Repository deletion is handled.
* [ ] OpenCode process is cleaned up on exit.

---

# 80. Definition of Done

The user should be able to perform this complete scenario:

```text
1. Launch Cockpit.

2. Open an existing Git repository.

3. See the repository tree on the left.

4. See OpenCode running on the right.

5. Type:

   "Add a settings page."

6. OpenCode reads and modifies the repository.

7. Changed files immediately receive Git indicators.

8. User clicks one changed file.

9. Monaco displays the latest file contents.

10. User clicks Diff.

11. Monaco displays:

       HEAD → Working Tree

12. User can inspect exactly what OpenCode changed.

13. User can return to the terminal and continue
    interacting with OpenCode.

14. User edits a file manually.

15. Save.

16. OpenCode sees the same filesystem state.

17. Git status updates immediately.
```

If this works reliably, the MVP succeeds.

---

# 81. Implementation Order

Implement in this exact order.

### Phase 1 — Shell

```text
Vite
React
Tailwind
Three-column layout
Resizable panels
```

### Phase 2 — Repository

```text
folder picker
filesystem service
file tree
file opening
```

### Phase 3 — Monaco

```text
Monaco
tabs
editing
saving
external file synchronization
```

### Phase 4 — Git

```text
repository detection
branch
status
diff
```

### Phase 5 — OpenCode

```text
node-pty
OpenCode process
xterm.js
interactive input/output
resize
```

### Phase 6 — Synchronization

```text
watcher
events
Git refresh
editor refresh
conflict handling
```

### Phase 7 — Polish

```text
keyboard shortcuts
quick open
command palette
error states
loading states
performance
```

Do not implement later phases before the earlier phase is stable.

---

# 82. Important Engineering Rules

## Rule 1

Never fake repository state.

Use the filesystem.

## Rule 2

Never parse terminal output when filesystem/Git state can provide the required information.

## Rule 3

Never silently overwrite unsaved user changes.

## Rule 4

Never expose unrestricted filesystem access.

## Rule 5

Never store the entire repository in frontend state.

## Rule 6

Never put the entire terminal output stream into React state.

## Rule 7

Keep OpenCode independent from the UI.

## Rule 8

The application is a cockpit, not another AI agent.

## Rule 9

Prefer simple local mechanisms over unnecessary infrastructure.

## Rule 10

If a feature does not improve visibility, inspection, or control of the repository/agent loop, defer it.

---

# 83. Future Direction

The architecture should allow future capabilities without requiring a rewrite.

Potential future features:

```text
Agent Activity Timeline
Change Approval
Command Approval
Dangerous Command Guardrails
Secret Detection
Protected Files
Protected Directories
Test Gates
Git Commit Review
Rollback
Checkpoint
Multiple OpenCode Sessions
Multiple Repositories
Agent Session Recording
Session Replay
Team Policies
Remote Repository Support
```

These are NOT MVP requirements.

---

# 84. Long-Term Product Thesis

The product starts as:

> **A visual cockpit for OpenCode.**

It can evolve into:

> **A control plane for autonomous software engineering.**

Long-term architecture:

```text
                 AI Coding Agent
                       │
                       ▼
              ┌─────────────────┐
              │  Agent Control  │
              │     Plane       │
              ├─────────────────┤
              │ filesystem      │
              │ Git             │
              │ commands        │
              │ secrets         │
              │ policies        │
              │ tests           │
              │ approvals       │
              └────────┬────────┘
                       │
                       ▼
                  Repository
```

The MVP must not prematurely implement this vision.

Build the smallest reliable visual control plane first.

---

# 85. Final Product Principle

The application should answer one question better than OpenCode alone:

> **"What exactly is happening to my repository right now?"**

The left panel answers:

> **Where?**

The center answers:

> **What changed?**

The right panel answers:

> **What is the agent doing?**

Together:

```text
LEFT                CENTER                 RIGHT

Repository          Reality                Agent

Where?              What changed?          What is happening?
```

That is the entire MVP.