<p align="center">
  <img alt="Jarvis Control Center" src="docs/readme/banner.png" width="100%" />
</p>

<p align="center">
  <a href="https://github.com/LuiInventions/jarvis-control-center/stargazers"><img alt="GitHub stars" src="https://img.shields.io/github/stars/LuiInventions/jarvis-control-center?style=for-the-badge&labelColor=1c1730&color=c4b5fd" /></a>
  <a href="https://github.com/LuiInventions/jarvis-control-center/forks"><img alt="GitHub forks" src="https://img.shields.io/github/forks/LuiInventions/jarvis-control-center?style=for-the-badge&labelColor=1c1730&color=c4b5fd" /></a>
  <a href="https://github.com/LuiInventions/jarvis-control-center/issues"><img alt="GitHub issues" src="https://img.shields.io/github/issues/LuiInventions/jarvis-control-center?style=for-the-badge&labelColor=1c1730&color=c4b5fd" /></a>
  <a href="https://github.com/LuiInventions/jarvis-control-center/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/github/license/LuiInventions/jarvis-control-center?style=for-the-badge&labelColor=1c1730&color=c4b5fd" /></a>
  <a href="https://github.com/LuiInventions/jarvis-control-center/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/LuiInventions/jarvis-control-center?style=for-the-badge&labelColor=1c1730&color=c4b5fd" /></a>
</p>

<p align="center">
  One window for <b>Claude Code</b>, <b>Grok</b>, and <b>ChatGPT Codex</b>.<br />
  Run them on this PC, in a cloned GitHub repo, or over SSH.<br />
  <b>REA</b> reverse-engineers a program in its own workspace.<br />
  A built-in <b>MCP server</b> lets Jarvis manage the window and your sessions.
</p>

<p align="center">
  <a href="https://github.com/LuiInventions/jarvis-control-center/releases/latest"><img alt="Download the Windows installer" src="https://img.shields.io/badge/Download-Windows%20installer-2ea44f?style=for-the-badge&logo=windows&logoColor=white" /></a>
</p>

<p align="center">
  <b>v1.9.28</b> · installer <code>jarvis-control-center-Setup-1.9.28.exe</code> · <a href="CHANGELOG.md">Changelog</a><br />
  The app listens only on <code>127.0.0.1</code>. The window is in German.
</p>

---

## Contents

- [The window](#the-window)
- [Jarvis](#jarvis)
- [Remote](#remote)
- [GitHub](#github)
- [Local](#local)
- [REA](#rea)
- [Repos](#repos)
- [Sessions](#sessions)
- [Settings](#settings)
- [MCP server](#mcp-server)
- [Quick start](#quick-start)
- [Requirements](#requirements)
- [Configuration](#configuration)
- [How it works](#how-it-works)
- [Security](#security)
- [License](#license)

---

## The window

The sidebar, top to bottom, is **Jarvis**, **Remote**, **GitHub**, **Local**, **REA**, **Repos**, **Sessions**, then **Settings**.

Jarvis is the chat. The three launchers start the code CLI you picked in Settings. REA is a separate workspace for [Reverse Engineer Anything](https://github.com/morluto/rea). Repos is the GitHub account. Sessions draws every running agent in a pixel office.

VS Codium is not in the sidebar.

---

## Jarvis

<img alt="Jarvis chat. Tool calls are marked in the reply, and the MCP panel on the right shows the live session." src="docs/readme/jarvis.png" width="100%" />

Jarvis talks to **GPT 6 Luna** at low reasoning effort. The OpenAI key is entered on this tab with **API-Key** and stored with Windows DPAPI. It is not asked for on the first-run screen.

The reply names each tool call. The panel on the right is the local MCP server: arguments in, result out. From the chat, Jarvis can open a tab, start a CLI, read what that session just printed, and send the next prompt. You stay in the conversation. The window follows.

---

## Remote

<img alt="Remote tab. Enter user@IP, then connect. The password and 2FA appear only when SSH asks." src="docs/readme/remote.png" width="100%" />

Remote runs the code CLI on a machine that is not this PC.

1. Enter **user@IP**, or pick a saved server, and press **Verbinden**. The password field appears when SSH asks, and the 2FA field when it asks for a code. The code is not stored.
2. **Starten** opens 1–6 terminals in the folder in **Ordner**. They reuse the SSH login that is already open.
3. **Dateien hochladen** and **Bild hochladen** send files into that folder. **Herunterladen** saves a file or folder on this PC.

**Bild hochladen** puts pictures in an `image_set` folder, up to 10 images. Choosing a set copies `in {folder} sind die bilder:` so you can paste it into the CLI.

---

## GitHub

<img alt="GitHub tab. A cloned repo is selected, with session count, Start, and the repo file tree." src="docs/readme/github.png" width="100%" />

GitHub starts the code CLI inside a repo you already cloned. Pick the repo, set the session count from 1 to 6, and press **Starten**. The same CLI from Settings is used here.

**Dateien** and **Sessions** switch the main area between the file tree and the terminals. A left-click opens a file in that area. **Dateien hochladen** and **Bild hochladen** write into the folder on this PC.

The account, the clone, and the push live on **Repos**.

---

## Local

<img alt="Local tab. Session count, the folder on this PC, Start, and a file open in the editor." src="docs/readme/local.png" width="100%" />

Local is the same launcher against a folder on this PC. **Ordner** is that folder. **Starten** opens the selected code CLI there. Clicking a subfolder writes that path into **Ordner**.

Text opens in the editor and can be saved. Images, PDF, audio, and video use the viewer. A Claude Code session shows the usage bar.

---

## REA

<img alt="REA starten. Every installed program is listed, and a software name can be typed by hand." src="docs/readme/rea.png" width="100%" />

REA is its own workspace. Sessions started here stay off Local and GitHub.

You create an instance or point it at a folder, then copy the setup text into the session. That text tells the session to look at [Reverse Engineer Anything](https://github.com/morluto/rea) and to check whether the MCP server or the plugin is already installed.

**REA starten** lists every program on this PC: uninstall entries, Start menu, and Microsoft Store apps, including a program that has no executable. A name can be typed next to that list. The next step is one of three:

- **Features kopieren** traces one feature and asks for the project it should be built into.
- **Ganze App kopieren** traces the whole program and asks for the clone name.
- **Selber prompten** fills only the agent role and the program name. You write the rest.

The prompt opens in a tall editor. The MCP server numbers those sessions with `list_active_rea_sessions` and reads one with `get_session_x_info`.

---

## Repos

<img alt="Repos tab. The connected GitHub account, repository cards, and Update." src="docs/readme/repos.png" width="100%" />

Repos is the account. Paste a personal access token, and the app lists the repositories you can see, clones the ones that are missing, and can create a new one.

**New repo** creates `<clones folder>/<name>` only. That path is fixed. A name must match `[A-Za-z0-9][A-Za-z0-9._-]{0,99}`.

**Update** shows the changed files. **Pushen** then:

1. Commits a dirty tree with the message `Update via Control Center`.
2. Fetches and merges. A conflict aborts the merge and does not push.
3. Pushes to `origin`.

The token is sent as an auth header. It is not written into `.git/config`. `git user.name` and `git user.email` have to be set, or the commit stops.

Clones live in `%LOCALAPPDATA%\Jarvis Control Center\github_repos`, outside the folder the installer replaces. A source checkout uses `github_repos` in the working directory.

---

## Sessions

<img alt="Sessions tab. Running agents as characters in a pixel office." src="docs/readme/sessions.png" width="100%" />

Every launcher session that is still running is a character in a pixel office, in the style of [pixel-agents](https://github.com/pixel-agents-hq/pixel-agents). The label above the name is where it was started. Clicking the name opens that tab. The pose follows the live tool, and in-session subagents are their own small characters.

---

## Settings

<img alt="Settings. Theme, code CLI, projects folder, and the loopback address." src="docs/readme/settings.png" width="100%" />

- **Code CLI** is Claude Code (`claude`), Grok (`grok`), or ChatGPT Codex (`codex`). Local, GitHub, and REA start this binary. Remote can use its own.
- **Theme** is Ink, Dusk, Moss, Tide, Clay, or Plum. Dusk is the default.
- **Projects folder** is the directory Local starts from.

The first-run screen asks for the projects folder and the code CLI. It does not ask for an API key.

---

## MCP server

Jarvis Control Center starts a stateless **Streamable HTTP** MCP server on the same loopback listener as the window. The path is `/mcp`. While the app is running, the live URL is written to `.data/mcp.json` and cleared on shutdown.

```json
{
  "name": "jarvis-control-center",
  "transport": "streamable-http",
  "url": "http://127.0.0.1:3100/mcp"
}
```

The port is 3100 unless that port is taken. Read `url` from the file. Do not hard-code a port.

Jarvis calls this server on every turn. The same URL is how **Claude Code**, **Grok**, or **Codex** can drive the program from a session: show a tab, open 1–6 terminals, read session 1, send the next line, copy a file, or commit a repo after you confirm. The session keeps running until something calls `session_stop`. Secrets, tokens, passwords, and 2FA codes are never returned.

<img alt="Mind map of the 88 Jarvis MCP tools, grouped by window, settings, sessions, REA, GitHub, repos, local, files, and remote." src="docs/readme/mindmap.png" width="100%" />

Call `app_status` first. Use ids, paths, and repo names from tool results. Uploads and downloads through these tools cap at 64 MB. Image uploads cap at 10 images and return the `in {folder} sind die bilder:` sentence.

### Window

| Tool | What it does |
|---|---|
| `app_status` | Version, MCP URL, code CLI, folders, GitHub, SSH, and how many sessions are live. |
| `app_navigate` | Show Remote, GitHub, Local, REA, Repos, Sessions, or Settings. |
| `app_sections` | The sidebar sections and what each one is for. |

### Settings

| Tool | What it does |
|---|---|
| `settings_get` | Public settings. No API keys. |
| `settings_update` | Change the projects folder, code CLI, theme, or setup flag. |
| `secrets_status` | Which keys are stored. Values stay hidden. |
| `secrets_set` | Store or clear one provider key. |
| `providers_test` | Check that a stored key works. |
| `models_list` | Models for the active provider. |
| `usage_get` | Claude Code rate-limit windows tracked by this app. |
| `index_status` | When the local project index was last built. |
| `index_rebuild` | Rescan the projects folder. |

### Sessions

| Tool | What it does |
|---|---|
| `session_list` | Every code-CLI PTY still in memory. |
| `session_start` | Start Claude Code, Grok, or Codex in one PTY. |
| `session_send` | Send a follow-up and wait until output settles. |
| `session_write` | Send raw keys, such as Ctrl+C. |
| `session_read` | Readable tail of one session, with ANSI removed. |
| `session_resize` | Set the terminal grid. |
| `session_stop` | Stop one PTY. This cannot be resumed. |
| `session_history` | Saved launcher history. This is not the live list. |
| `session_history_delete` | Remove one history row. Does not stop a live PTY. |
| `session_review` | A markdown report of live sessions from the configured model. |
| `prompt_improve` | Rewrite a prompt using the folder on disk. Does not start a session. |
| `prompt_split` | Split one task into 1–6 prompts. |
| `list_active_github_sessions` | Number the running GitHub sessions. Session 1 is the oldest. |
| `list_active_local_sessions` | Number the running Local sessions. |
| `list_active_rea_sessions` | Number the running REA sessions. |
| `list_active_remote_sessions` | Number the running Remote sessions. |
| `get_session_x_info` | Read session `x` for `github`, `local`, `rea`, or `remote`, and copy that text. |

### GitHub

| Tool | What it does |
|---|---|
| `github_cloned_repos` | Clones that are already on disk. |
| `github_select_repo` | Show one clone on the GitHub tab. |
| `github_session_start` | Open 1–6 sessions in that clone. |
| `github_search` | Search file and folder names inside the clone. |
| `github_read_file` | Read a text file in the clone. |
| `github_save_file` | Save a text file. This does not commit. |
| `github_copy_path` | Copy a path inside the clone to the clipboard. |
| `github_upload` | Copy files and folders into the clone. |
| `github_upload_images` | Copy up to 10 images into an `image_set` folder. |

### Repos

| Tool | What it does |
|---|---|
| `github_status` | The signed-in user's repositories. |
| `github_repo` | Git summary and the files Update would ship. |
| `github_connect` | Store a personal access token and clone what is missing. |
| `github_disconnect` | Forget the token. Clones stay on disk. |
| `github_refresh` | Refresh the list and fast-forward clones that are on disk. |
| `github_create_repo` | Create a repository in the clones folder. |
| `github_update_repo` | Commit, merge, and push. `confirm` must be true. |
| `github_set_visibility` | Make a repository private or public. |

### Local

| Tool | What it does |
|---|---|
| `local_get_path` | The folder selected on Local. |
| `local_select_path` | Choose that folder. |
| `local_set_projects_dir` | Change the projects folder in Settings. |
| `local_session_start` | Open 1–6 sessions in the selected folder. |
| `local_search` | Search names under that folder. |
| `local_read_file` | Read a text file there. |
| `local_save_file` | Save a text file there. |
| `local_copy_path` | Copy a path to the clipboard. |
| `local_upload` | Copy files and folders into that folder. |
| `local_upload_images` | Copy images into an `image_set` folder. |
| `projects_list` | Subfolders of the projects directory. |
| `project_detail` | Stack, git, and README for one project. |
| `find_folder` | Search this PC for a folder by name. |
| `folders_roots` | The projects folder and the clones folder. |

### Files

| Tool | What it does |
|---|---|
| `files_list` | List a folder on this PC. Omit the path to list drives. |
| `files_read` | Read a text file. |
| `files_write` | Replace a UTF-8 text file. |
| `files_preview` | Preview a file, or a folder's README. |
| `local_copy_file` | Copy one file into a folder. |
| `reveal_in_explorer` | Open a path in Windows Explorer. |
| `image_sets_list` | Local copies of `image_set` folders. |
| `image_set_delete` | Delete one `image_set` folder and its cache. |

### Remote

| Tool | What it does |
|---|---|
| `remote_status` | The SSH login, the folder, and whether a password or code is needed. |
| `remote_saved_servers` | Saved servers. Passwords are not included. |
| `remote_start_saved` | Connect to a saved server. |
| `remote_connect` | Start SSH to a new host. |
| `remote_submit_password` | Answer the password prompt. `useSaved` sends the stored one. |
| `remote_submit_otp` | Answer the 2FA prompt. The code is not stored. |
| `remote_disconnect` | Close the SSH login. |
| `remote_set_dir` | Choose the remote folder. |
| `remote_login_tail` | Read the login terminal. Password and code characters are redacted. |
| `remote_session_start` | Open 1–6 sessions on the connected server. |
| `remote_list` | List a remote folder. |
| `remote_search` | Search names on the server. |
| `remote_read_file` | Read a remote text file. |
| `remote_write_file` | Save a remote text file. |
| `remote_mkdir` | Create one remote folder. Parents are not created for you. |
| `remote_copy_path` | Copy a remote path to the clipboard. |
| `remote_upload` | Copy files and folders to the server. |
| `remote_upload_file` | Copy one file to the server. |
| `remote_upload_images` | Copy images into a remote `image_set` folder. |
| `remote_download` | Save a remote file or folder onto this PC. |

There is also a prompt, `drive-jarvis`, with the same operating notes the server gives a client.

---

## Quick start

### Desktop app

The installer does not need Node.

1. Download **`jarvis-control-center-Setup-<version>.exe`** from the [latest release](https://github.com/LuiInventions/jarvis-control-center/releases/latest).
2. Run it. It installs per user and adds a Start-menu shortcut.
3. On first launch, pick the projects folder and the code CLI. The OpenAI key for Jarvis is entered later, on the Jarvis tab.

The app is published by **LT Digital Concepts (Luis Kleemann)**. Until the build is signed, Windows SmartScreen can say the publisher is unknown. **More info → Run anyway**. Signing is described in [`build/SIGNING.md`](build/SIGNING.md).

An update runs the welcome screen once so you can confirm the projects folder and the code CLI. The GitHub token, the Jarvis key, saved SSH logins, and the clones stay.

You still install the code CLI you selected and log in to it. Remote needs the **OpenSSH Client**.

<details>
<summary><strong>Build the installer yourself</strong></summary>

```powershell
npm install
npm run electron:build
```

The NSIS installer is written to `build/dist/`. `npm run electron:dev` runs the desktop shell from source.

</details>

### From source

```powershell
git clone https://github.com/LuiInventions/jarvis-control-center
cd jarvis-control-center
.\setup.ps1
npm run dev
```

Then open **http://127.0.0.1:3100**. If PowerShell blocks the script:

```powershell
powershell -ExecutionPolicy Bypass -File .\setup.ps1
```

`setup.ps1` checks Node.js and git, runs `npm install`, and asks for the projects folder. In a source checkout, clones land in `github_repos` inside the working directory.

<details>
<summary><strong>Manual install</strong></summary>

```powershell
npm install
copy .env.example .env.local
npm run dev
```

</details>

---

## Requirements

- **Windows 11**. A source checkout needs **Node.js ≥ 20.9**. The installer does not.
- **git** on `PATH`, with `user.name` and `user.email` set.
- One code CLI, installed and logged in: [Claude Code](https://docs.anthropic.com/en/docs/claude-code), [Grok](https://x.ai/cli), or ChatGPT Codex (`codex`).
- **OpenSSH Client** (`ssh.exe`) for Remote.
- An **OpenAI API key**, entered on the Jarvis tab, for the GPT 6 Luna chat.

---

## Configuration

Settings come from `.env.local` or the in-app Settings page. Precedence, highest first: **Settings** (`.data/settings.json`) → **environment** → **built-in default**.

| Variable | What it controls | Default |
|---|---|---|
| `OPENAI_API_KEY` | Optional fallback for the Jarvis key. Server-side only. | – |
| `PROJECTS_DIR` | Folder Local starts from, until you pick another | `./projects` |
| `HOST` | Bind address. Leave this. | `127.0.0.1` |
| `PORT` | Port | `3100` |
| `CLAUDE_BIN` | Explicit path to the Claude CLI | auto |

The code CLI is `codeCli` in `.data/settings.json`: `claude`, `grok`, or `codex`.

The desktop app sets `CCC_GITHUB_DIR` to `%LOCALAPPDATA%\Jarvis Control Center\github_repos` before the server starts. A dev run uses `<cwd>/github_repos`.

In a source checkout the Jarvis key is in a gitignored `.data/secrets.json`. In the desktop build it is encrypted with Windows DPAPI. The GitHub token is stored the same way.

---

## How it works

`server.ts` binds to `127.0.0.1` and hosts Next.js, a `ws` server, and the MCP endpoint on one port. Code-CLI sessions are `node-pty` PTYs, so they survive a reload.

Remote opens one `ssh.exe` session. After login, a broker inside that session starts the CLI and moves files. A second SSH connection is not opened.

Repos → Update calls commit (when the tree is dirty), fetch, merge, and push. The token rides on the git command as an HTTP header.

```text
server.ts                         Next + ws + /mcp, binds 127.0.0.1
lib/server/mcp/                   88 tools, stateless Streamable HTTP
lib/server/jarvis/                GPT 6 Luna chat, tool calls, MCP panel
lib/server/claude-pty.ts          PTY registry
lib/server/remote-broker.ts       one SSH session
app/components/sections/          Jarvis, Remote, GitHub, Local, REA, Repos, Sessions
build/                            Electron main, preload, NSIS installer
```

---

## Security

- The server binds to `127.0.0.1`. A request to `/mcp` from anywhere else is refused.
- There is no login of its own. The app is for one person on this PC.
- Remote is outbound SSH. The password can be saved. The 2FA code is not.
- Sessions started here skip the CLI's own permission prompts: Claude Code uses `--dangerously-skip-permissions`, Grok uses `--permission-mode bypassPermissions`, Codex uses `--dangerously-bypass-approvals-and-sandbox`.
- `github_update_repo` pushes only when `confirm` is true. The button does the same thing after you press **Pushen**.
- The UI reports whether a key is set. Tool results do not include the key, the token, the password, or the 2FA code.

---

## License

MIT. See [LICENSE](LICENSE).
