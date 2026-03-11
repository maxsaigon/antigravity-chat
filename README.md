# Antigravity Telegram Bridge

A native VS Code / Antigravity extension that bridges your Telegram Bot to Antigravity AI. Chat with your AI assistant, manage workspaces, and send commands from your phone — anywhere, anytime.

## Architecture

```
📱 Telegram ──→ Bot API ──→ Extension ──→ sendPromptToAgentPanel ──→ 🧠 AI
                                              ↑
🧠 AI ──→ writes artifacts ──→ Brain Watcher detects ──→ sends to Telegram 📱
```

## Features & Achievements 🚀

### v0.3.0 — AI Status Tracking & Typing Indicators (Current)

- **✅ AI Status System:** Supports tracking AI activity states (Online, Idle, Thinking, Working, Typing, Offline).
- **✅ Typing Indicators:** Automatically displays "typing" status on Telegram when AI is processing or generating content.
- **✅ `/status` Command:** Allows quick checking of the current connection and activity status of the Bridge & Antigravity AI.

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

## Telegram Commands

| Command | Description |
|---------|--------|
| `/start` | Usage guide |
| `/list` | List workspaces (inline keyboard) |
| `/new` | Create new conversation |
| `/status` | Check bridge & AI status |
| `/fetch` | Get response via clipboard (fallback) |
| `/open <path>` | Add folder to workspace |
| `/dump` | Export VS Code commands list |
| `<any text>` | Send directly to AI → response is automatically sent back |

## Setup

1. Install `.vsix` into Antigravity (`Cmd+Shift+P` → `Extensions: Install from VSIX...`)
2. Configure settings:
   ```json
   {
       "telegramBridge.botToken": "YOUR_BOT_TOKEN",
       "telegramBridge.userId": "YOUR_TELEGRAM_USER_ID"
   }
   ```
3. Reload window — Bot starts automatically

## Project Structure

```
antigravity-telegram-bridge/
├── src/
│   ├── extension.ts   # Main: Telegram bot, input/output pipelines, commands
│   └── ipc.ts         # Master/Worker IPC via Unix domain sockets
├── package.json       # Extension manifest & dependencies
└── README.md
```

## Known Limitations

- **Output capture** only works when AI is in **agentic mode** (writing files/artifacts). Simple text responses require the `/fetch` fallback.
- **Clipboard fallback** (`/fetch`) only supports macOS (AppleScript).
- **IPC** does not auto-reconnect when Master crashes yet.

## Tech Stack

- **Runtime:** VS Code Extension Host (Node.js)
- **Telegram:** `node-telegram-bot-api`
- **IPC:** Unix domain sockets (newline-delimited JSON)
- **Output Capture:** `fs.watch` recursive on brain directory
- **Input:** `antigravity.sendPromptToAgentPanel` native API
