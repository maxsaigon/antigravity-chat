# v0.5 — Agent Manager Control via Telegram (Final)

## Mục tiêu
Control được Antigravity Agent Manager từ Telegram một cách **đơn giản nhất có thể**.
Giảm số lượng commands, gom các chức năng liên quan, ưu tiên daily workflow.

---

## Triết lý thiết kế

> **"Ít lệnh, mỗi lệnh làm nhiều việc"**

| Nguyên tắc | Áp dụng |
|------------|---------|
| Tối giản | 7 lệnh chính thay vì 12+ |
| Smart defaults | Commands tự chọn strategy phù hợp |
| Gom chức năng | `/status` = status + diagnostics + trace |
| Loại bỏ debug | `/probe`, `/probe_conv`, `/dump` → chỉ dev dùng, không expose |
| Inline keyboard | Dùng nút bấm thay vì phải gõ ID dài |

---

## Kiến trúc

```
Telegram → extension.ts (command router) → agent-manager.ts → vscode.commands.executeCommand()
                                                ↓
                                        ipc.ts (Master→Worker routing)
```

**Files:**
- `src/agent-manager.ts` — AgentManagerController class (đã có)
- `src/extension.ts` — command router (đã có, cần refactor)
- `src/ipc.ts` — IPC routing (đã có)

---

## Commands v0.5 Final — Chỉ 7 lệnh chính

### 📋 Bảng tổng hợp

| # | Command | Mô tả | Trạng thái |
|---|---------|--------|------------|
| 1 | `/ok` | ✅ Accept all pending code changes | 🔧 Rename từ `/accept` |
| 2 | `/no` | ❌ Reject all pending code changes | 🔧 Rename từ `/reject` |
| 3 | `/stop` | 🛑 Cancel AI task + clear diffs | 🔧 Rename từ `/cancel` |
| 4 | `/status` | 📊 Tổng hợp: trạng thái + trace + diagnostics | 🔧 Nâng cấp |
| 5 | `/list` | 📁 Danh sách projects (inline keyboard) | ✅ Giữ nguyên |
| 6 | `/conv` | 💬 Danh sách conversations (inline keyboard switch) | 🔧 Rút gọn từ `/conversations` + `/conversation` |
| 7 | `/new` | 🆕 Tạo conversation mới | ✅ Giữ nguyên |

### 🔧 Lệnh phụ (ẩn khỏi /start menu, vẫn hoạt động)

| Command | Mô tả | Ghi chú |
|---------|--------|---------|
| `/fetch` | Lấy response qua clipboard (fallback) | Legacy, ít dùng |
| `/review` | Mở review changes panel | Niche |
| `/notifications` | Bật/tắt thông báo | Settings |
| `/open <path>` | Thêm folder vào workspace | Power user |
| `/probe [group\|cmd]` | API testing tool | Dev only |
| `/dump` | Export VS Code commands | Dev only |

---

## Chi tiết từng command

### 1. `/ok` — Accept Changes
**Thay thế:** `/accept`
**Lý do đổi tên:** Gõ nhanh hơn, dễ nhớ, giống "OK"

```
Cascading strategy (giữ nguyên logic):
1. chatEditing.acceptAllFiles ✅ (primary)
2. antigravity.prioritized.agentAcceptAllInFile ✅ (backup)
```

**Response format:**
```
✅ Code accepted (45ms)
```

### 2. `/no` — Reject Changes
**Thay thế:** `/reject`
**Lý do đổi tên:** Ngắn gọn, trực quan

```
Cascading strategy:
1. chatEditing.discardAllFiles ✅ (primary)
2. antigravity.prioritized.agentRejectAllInFile ✅ (backup)
```

**Response format:**
```
❌ Code rejected (38ms)
```

### 3. `/stop` — Cancel Task
**Thay thế:** `/cancel`
**Lý do đổi tên:** Trực quan hơn "cancel"

```
Strategy:
1. antigravity.closeAllDiffZones ✅ (clear pending diffs)
2. Nếu fail → gợi ý dùng /new
```

**Response format:**
```
🛑 Task stopped (52ms)
— hoặc —
⚠️ Không thể stop. Dùng /new để tạo conversation mới.
```

### 4. `/status` — Enhanced Status (GOM 3 lệnh)
**Gom từ:** `/status` + `/trace` + `/diagnostics`
**Logic:** Hiển thị tất cả thông tin quan trọng trong 1 message

```
📊 Antigravity Status

🤖 Agents:
📌 antigravity-chat: ⚡ Working... (2m ago)
🔹 buonme-payload: 💤 Idle (15m ago)

💬 Conversation: fa03561e... (3 files)
🧠 Brain Watcher: ✅ Active
📡 IPC: Master (2 agents)

📜 Trace: [tóm tắt ngắn hoặc "No active trace"]
```

### 5. `/list` — Projects (giữ nguyên)
Hiển thị danh sách projects + inline keyboard để switch.

### 6. `/conv` — Conversations (RÚT GỌN)
**Gom từ:** `/conversations` + `/conversation <id>`
**Cách dùng:**
- `/conv` → Hiển thị 10 conversations gần nhất + inline keyboard
- `/conv <id>` → Switch trực tiếp đến conversation
- Inline keyboard buttons → Switch không cần gõ ID

### 7. `/new` — New Conversation (giữ nguyên)

---

## Refactor Plan

### Phase 1: Đổi tên commands → Aliases
Giữ backward compatibility — cả tên cũ và mới đều hoạt động.

```typescript
// Command aliases mapping
const COMMAND_ALIASES: Record<string, string> = {
  '/ok': '/accept',
  '/no': '/reject', 
  '/stop': '/cancel',
  '/conv': '/conversations',
};
```

**Files thay đổi:** `extension.ts`
- [ ] Thêm alias resolver ở đầu message handler
- [ ] `/ok`, `/no`, `/stop` trỏ vào cùng logic `/accept`, `/reject`, `/cancel`
- [ ] `/conv` xử lý cả list và switch

### Phase 2: Enhanced `/status`
- [ ] Gom logic từ `/status` + `/trace` vào 1 message
- [ ] Gọi `getDiagnostics()` + `getManagerTrace()` song song
- [ ] Format gọn, chỉ hiển thị thông tin quan trọng

### Phase 3: Giản lược `/start` menu
- [ ] Chỉ hiển thị 7 lệnh chính trong `/start`
- [ ] Thêm dòng "Gõ /help để xem tất cả lệnh" cho advanced users

### Phase 4: Cleanup agent-manager.ts
- [ ] Loại bỏ các strategies ❌ (commandAccept, commandReject, acceptStep, rejectStep)
- [ ] Giữ lại chỉ ✅ confirmed working commands
- [ ] Đơn giản hoá `switchConversation()` — bỏ các JSON payload probe vô nghĩa
- [ ] Xoá `probeConversationPicker()` — chỉ debug

---

## API Probe Results (2026-03-15) — Reference

### ✅ Working Commands (chỉ giữ lại)

| Command | Dùng cho |
|---------|----------|
| `chatEditing.acceptAllFiles` | `/ok` primary |
| `chatEditing.discardAllFiles` | `/no` primary |
| `antigravity.prioritized.agentAcceptAllInFile` | `/ok` backup |
| `antigravity.prioritized.agentRejectAllInFile` | `/no` backup |
| `antigravity.closeAllDiffZones` | `/stop` |
| `antigravity.getManagerTrace` | `/status` trace section |
| `antigravity.getDiagnostics` | `/status` diagnostics section |
| `antigravity.openReviewChanges` | `/review` |
| `antigravity.startNewConversation` | `/new` |
| `workbench.action.focusAgentManager.continueConversation` | `/conv <id>` |

### ❌ Confirmed Not Working (loại bỏ khỏi cascading)

| Command | Lý do |
|---------|-------|
| `antigravity.command.accept/reject` | Not found |
| `antigravity.agent.acceptAgentStep/rejectAgentStep` | Not found |
| `antigravity.terminalCommand.*` | All not found |
| `antigravity.sendChatActionMessage` | Not found |
| `conversationPicker.showConversationPicker` | Chỉ mở UI picker, không programmatic |

---

## TODO — Remaining Work

### ✅ Đã xong
- [x] Agent Manager Controller class
- [x] Accept/Reject cascading strategy
- [x] Cancel via closeAllDiffZones
- [x] Conversation listing & switching
- [x] Probe system for API discovery
- [x] IPC multi-project routing
- [x] Brain Watcher output capture

### 🔧 Phase 1: Command Simplification (ưu tiên cao)
- [ ] Thêm alias `/ok`, `/no`, `/stop`, `/conv`
- [ ] Gom `/status` + `/trace`
- [ ] Update `/start` menu — chỉ 7 lệnh
- [ ] Cleanup cascading strategies (bỏ ❌ commands)

### 🧪 Phase 2: Live Testing
- [ ] Test `/ok` khi có pending changes thực sự
- [ ] Test `/no` khi có pending changes thực sự
- [ ] Test `/stop` khi AI đang chạy
- [ ] Test `/conv` inline keyboard → switch thực sự
- [ ] Test multi-project IPC routing end-to-end

### 💡 Phase 3: Nice-to-have (sau v0.5)
- [ ] Accept/reject per-file: `/ok <filename>`
- [ ] Auto-accept policy (tự động accept sau N giây)
- [ ] Quick reply buttons sau mỗi AI response (OK / No / Stop)
- [ ] `/run` — chạy terminal command approve từ xa

---

## Build & Deploy

```bash
cd antigravity-telegram-bridge
npm run compile
npx vsce package --no-dependencies
# Install: Cmd+Shift+P → "Extensions: Install from VSIX..."
```

> **Cache busting:** Mỗi lần build cần bump version trong `package.json`, nếu không Antigravity sẽ cache file cũ.

---

## Changelog

| Version | Thay đổi |
|---------|----------|
| 0.5.0 | Agent Manager commands: accept, reject, cancel, trace |
| 0.5.1 | Conversations list + inline keyboard |
| 0.5.2 | Review changes, probe system |
| 0.5.3 | Deep probe conversation picker |
| 0.5.4 | Stabilize probe results |
| **0.5.5** | **Command simplification: /ok, /no, /stop, /conv, enhanced /status** |
