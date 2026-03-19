# Antigravity Telegram Bridge

A native VS Code / Antigravity extension that bridges your Telegram Bot to Antigravity AI. Chat with your AI assistant, manage workspaces, and send commands from your phone — anywhere, anytime.

## Architecture

```
📱 Telegram ──→ Bot API ──→ Extension ──→ sendPromptToAgentPanel ──→ 🧠 AI
                                              ↑
🧠 AI ──→ writes artifacts ──→ Brain Watcher detects ──→ sends to Telegram 📱
```

## Features & Achievements 🚀

### v0.6.0 — Bot Pause Mode (Current)

- **✅ Default PAUSED:** Bot starts in **PAUSED** mode — no messages or notifications while you work on PC.
- **✅ `/start` to Activate:** Send `/start` on Telegram to resume the bot from paused state.
- **✅ `/pause` to Silence:** Send `/pause` to mute the bot without disconnecting from Telegram.
- **✅ `autoStart` Config:** Set `telegramBridge.autoStart: true` to restore old auto-start behavior.
- **✅ Three States:** STOPPED (polling off) → PAUSED (polling on, silent) → ACTIVE (fully operational).

### v0.5.5 — Simplified Commands

- **✅ Simplified Command Set:** Reduced from 12+ commands to **7 main commands** for daily workflow.
- **✅ `/ok` & `/no`:** Quick accept/reject code changes (replaces verbose `/accept` & `/reject`).
- **✅ `/stop`:** Cancel AI task + clear diffs (replaces `/cancel`).
- **✅ `/conv`:** List conversations with inline keyboard + switch directly (replaces `/conversations` + `/conversation`).
- **✅ Enhanced `/status`:** Consolidated status + trace + diagnostics into one command.
- **✅ Backward Compatible:** Old commands (`/accept`, `/reject`, `/cancel`, `/conversations`) still work as aliases.
- **✅ Hidden Dev Commands:** `/probe`, `/dump`, `/review`, `/fetch` still available but removed from `/start` menu.

### v0.5.0 — Agent Manager Control

- **✅ Agent Manager Integration:** Full Antigravity Agent Manager control from Telegram — accept/reject code changes, cancel tasks, manage conversations.
- **✅ Cascading Accept/Reject Strategy:** Uses `chatEdit.acceptAllFiles` → `ag.p.agentAcceptAllInFile` fallback.
- **✅ Conversation Management:** List, switch, and create conversations with inline keyboards.
- **✅ AgentManagerController Module:** Dedicated `agent-manager.ts` module wrapping all Agent Manager VS Code commands.
- **✅ API Probe System:** `/probe` tool for discovering and testing Agent Manager APIs.

### v0.3.0 — AI Status Tracking & Typing Indicators

- **✅ AI Status System:** Supports tracking AI activity states (Online, Idle, Thinking, Working, Typing, Offline).
- **✅ Typing Indicators:** Automatically displays "typing" status on Telegram when AI is processing or generating content.
- **✅ Proactive Notifications:** Status change notifications pushed to Telegram (toggleable).

### v0.2.0 — Native API + Brain Watcher

- **✅ Direct API Input:** Fully replaces AppleScript with `antigravity.sendPromptToAgentPanel` — cross-platform, zero-delay, background execution.
- **✅ Brain Watcher Output Capture:** Automatically monitors `~/.gemini/antigravity/brain/` to catch AI response artifacts, parses content, and sends to Telegram in real-time.
- **✅ Prompt Injection:** Automatically adds instruction to the prompt requiring AI to write responses to a `telegram_response.md` file → Brain Watcher captures it.
- **✅ Smart Content Cleaning:** Removes prompt echoes, `render_diffs()`, `file:///` links before sending to Telegram.
- **✅ Auto Message Splitting:** Automatically splits responses > 4000 chars into multiple parts for Telegram.
- **✅ Per-file Debounce:** Waits for the file to stabilize for 3s before reading, avoiding sending incomplete content.

### v0.1.0 — Foundation

- **✅ Multi-Window IPC:** Master/Worker architecture solves Telegram `409 Conflict` when opening multiple windows.
- **✅ Workspace Routing:** `/list` & inline keyboard to select workspace target.
- **✅ Telegram Bot Security:** User ID authentication, blocks unauthorized access.
- **✅ Legacy Clipboard Fallback:** AppleScript input injection when API fails (macOS).

## Bot States

```
STOPPED ──(VS Code: BOT Start)──→ ACTIVE
PAUSED  ──(/start on Telegram)──→ ACTIVE
ACTIVE  ──(/pause on Telegram)──→ PAUSED
ANY     ──(VS Code: BOT Stop)───→ STOPPED
```

| State | Polling | /start | Other cmds | Brain Watcher | Notifications |
|-------|---------|--------|-----------|---------------|---------------|
| **STOPPED** | ❌ | ❌ | ❌ | ❌ | ❌ |
| **PAUSED** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **ACTIVE** | ✅ | ✅ | ✅ | ✅ | ✅ |

## Telegram Commands

### Main Commands

| Command | Description |
|---------|-------------|
| `/start` | ▶️ Activate bot from PAUSED / show help |
| `/pause` | ⏸️ Silence bot (no messages, no notifications) |
| `/ok` | ✅ Accept all pending code changes |
| `/no` | ❌ Reject all pending code changes |
| `/stop` | 🛑 Cancel AI task + clear diffs |
| `/status` | 📊 Status + trace + diagnostics (all-in-one) |
| `/list` | 📁 List projects (inline keyboard to switch) |
| `/conv` | 💬 List conversations (inline keyboard) |
| `/new` | 🆕 Create new conversation |
| `<any text>` | 💬 Send directly to AI → response auto-sent back |

### Hidden Commands (power users / dev)

| Command | Description |
|---------|-------------|
| `/conv <id>` | Switch to specific conversation |
| `/review` | Open review changes panel in VS Code |
| `/fetch` | Get response via clipboard (fallback) |
| `/notifications` | Toggle status change notifications |
| `/open <path>` | Add folder to workspace |
| `/probe [group\|cmd]` | API testing / probing tool |
| `/dump` | Export VS Code commands list |
| `/trace` | Standalone trace (also in `/status`) |

> **Aliases:** `/accept` = `/ok`, `/reject` = `/no`, `/cancel` = `/stop`, `/conversations` = `/conv`

## Setup

1. Install `.vsix` into Antigravity (`Cmd+Shift+P` → `Extensions: Install from VSIX...`)
2. Configure settings:
   ```json
   {
       "telegramBridge.botToken": "YOUR_BOT_TOKEN",
       "telegramBridge.userId": "YOUR_TELEGRAM_USER_ID",
       "telegramBridge.autoStart": false
   }
   ```
3. Reload window → Bot starts in **PAUSED** mode
4. Send `/start` on Telegram to activate

> **Tip:** Set `"telegramBridge.autoStart": true` to auto-activate on VS Code startup (old behavior).

## Project Structure

```
antigravity-telegram-bridge/
├── src/
│   ├── extension.ts       # Main: Telegram bot, input/output pipelines, commands
│   ├── agent-manager.ts   # Agent Manager controller & API probing
│   ├── ipc.ts             # Master/Worker IPC via Unix domain sockets
│   └── test_pending.ts    # Test file for /ok and /no commands
├── package.json           # Extension manifest & dependencies
└── README.md
```

## Known Limitations

- **Output capture** only works when AI is in **agentic mode** (writing files/artifacts). Simple text responses require the `/fetch` fallback.
- **Clipboard fallback** (`/fetch`) only supports macOS (AppleScript).
- **IPC** does not auto-reconnect when Master crashes yet.

## Build & Deploy

```bash
cd antigravity-telegram-bridge
npm run compile
npx vsce package --no-dependencies
# Install: Cmd+Shift+P → "Extensions: Install from VSIX..."
```

> **Cache busting:** Mỗi lần build cần bump version trong `package.json`, nếu không Antigravity sẽ cache file cũ.

## Tech Stack

- **Runtime:** VS Code Extension Host (Node.js)
- **Telegram:** `node-telegram-bot-api`
- **IPC:** Unix domain sockets (newline-delimited JSON)
- **Output Capture:** `fs.watch` recursive on brain directory
- **Input:** `antigravity.sendPromptToAgentPanel` native API

## Changelog

| Version | Changes |
|---------|---------|
| 0.1.0 | Foundation: IPC, Multi-window, Bot security |
| 0.2.0 | Native API input + Brain Watcher output capture |
| 0.3.0 | AI status tracking + typing indicators |
| 0.5.0 | Agent Manager control: accept, reject, cancel, trace |
| 0.5.1 | Conversations list + inline keyboard |
| 0.5.2 | Review changes, probe system |
| 0.5.3 | Deep probe conversation picker |
| 0.5.4 | Stabilize probe results |
| 0.5.5 | Command simplification: /ok, /no, /stop, /conv, enhanced /status |
| 0.5.6 | README update, code cleanup |
| **0.6.0** | **Bot PAUSED mode: default silent, /start to activate, /pause to silence** |
