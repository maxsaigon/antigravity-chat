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

- **✅ AI Status System:** Hỗ trợ theo dõi các trạng thái hoạt động của AI (Online, Idle, Thinking, Working, Typing, Offline).
- **✅ Typing Indicators:** Tự động hiển thị trạng thái "đang gõ" (typing) trên Telegram khi AI đang xử lý hoặc xuất nội dung.
- **✅ Lệnh `/status`:** Cho phép kiểm tra trạng thái kết nối và hoạt động hiện tại của Bridge & Antigravity AI nhanh chóng.

### v0.2.0 — Native API + Brain Watcher

- **✅ Direct API Input:** Thay thế hoàn toàn AppleScript bằng `antigravity.sendPromptToAgentPanel` — cross-platform, zero-delay, hoạt động ở background
- **✅ Brain Watcher Output Capture:** Tự động monitor `~/.gemini/antigravity/brain/` để bắt AI response artifacts, parse nội dung, và gửi về Telegram real-time
- **✅ Prompt Injection:** Tự động thêm instruction vào prompt yêu cầu AI ghi response ra file `telegram_response.md` → Brain Watcher bắt được
- **✅ Smart Content Cleaning:** Loại bỏ prompt echoes, `render_diffs()`, `file:///` links trước khi gửi Telegram
- **✅ Auto Message Splitting:** Tự chia response > 4000 chars thành nhiều phần cho Telegram
- **✅ Per-file Debounce:** Chờ file ổn định 3s trước khi đọc, tránh gửi content chưa hoàn chỉnh

### v0.1.0 — Foundation

- **✅ Multi-Window IPC:** Master/Worker architecture giải quyết Telegram `409 Conflict` khi mở nhiều cửa sổ
- **✅ Workspace Routing:** `/list` & inline keyboard để chọn workspace target
- **✅ Telegram Bot Security:** Xác thực User ID, chặn unauthorized access
- **✅ Legacy Clipboard Fallback:** AppleScript input injection khi API fail (macOS)

## Telegram Commands

| Command | Mô tả |
|---------|--------|
| `/start` | Hướng dẫn sử dụng |
| `/list` | Danh sách workspaces (inline keyboard) |
| `/new` | Tạo conversation mới |
| `/status` | Kiểm tra trạng thái bridge & AI |
| `/fetch` | Lấy response via clipboard (fallback) |
| `/open <path>` | Thêm folder vào workspace |
| `/dump` | Export VS Code commands list |
| `<any text>` | Gửi trực tiếp tới AI → response tự động gửi về |

## Setup

1. Install `.vsix` vào Antigravity (`Cmd+Shift+P` → `Extensions: Install from VSIX...`)
2. Cấu hình settings:
   ```json
   {
       "telegramBridge.botToken": "YOUR_BOT_TOKEN",
       "telegramBridge.userId": "YOUR_TELEGRAM_USER_ID"
   }
   ```
3. Reload window — Bot tự khởi động

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

- **Output capture** chỉ hoạt động khi AI ở **agentic mode** (viết file/artifacts). Simple text responses cần dùng `/fetch` fallback
- **Clipboard fallback** (`/fetch`) chỉ hỗ trợ macOS (AppleScript)
- **IPC** chưa có auto-reconnect khi Master crash

## Tech Stack

- **Runtime:** VS Code Extension Host (Node.js)
- **Telegram:** `node-telegram-bot-api`
- **IPC:** Unix domain sockets (newline-delimited JSON)
- **Output Capture:** `fs.watch` recursive on brain directory
- **Input:** `antigravity.sendPromptToAgentPanel` native API
