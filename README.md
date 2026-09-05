# OpenCode Cockpit v0.1.0
Local-first visual cockpit for OpenCode CLI. Three panels: repo tree (left), Monaco code/diff (center), live OpenCode PTY (right).
## Install (one line)
```sh
curl -fsSL https://raw.githubusercontent.com/wansatya/opencode-ide/main/install.sh | bash
```
This clones to `~/.opencode-ide`, installs deps, builds, and links the `cockpit` command to `~/.local/bin/cockpit` (make sure it's on your `PATH`).
## Run
```sh
cockpit start ~/projects/my-app   # kills :5173/:3101, starts servers, opens http://localhost:5173
cockpit start ~/projects/my-app --prod  # serve production build on http://localhost:3101
cockpit stop | cockpit status | cockpit logs -f
```
Manual equivalent:
```sh
npm run install:all
npm run dev      # web :5173 + bridge :3101
npm run build && npm start   # production (bridge serves web/dist)
```
Open the UI, enter a repo path (e.g. this directory), and press Start in the terminal panel to launch `opencode`.
## API
`GET /api/tree` `GET /api/file?path=` `PUT /api/file` `GET /api/git/status|diff|head` `POST /api/opencode/start|resize|stop` `WS /api/events` `WS /api/opencode/terminal`
Filesystem is source of truth; paths validated against workspace root.
