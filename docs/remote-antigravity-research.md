# Remote Antigravity Instance — Nghiên cứu khả thi

## Bối cảnh & Vấn đề

**Quan sát:** Antigravity Agent Manager cho phép làm việc với **nhiều project cùng lúc**, nhưng tất cả các agent đều dùng **cùng 1 model** (ví dụ Gemini 3 Pro). Không thể chạy 2 model khác nhau song song trong cùng 1 instance.

**Mục tiêu:** Chạy một bản Antigravity thứ 2 trên máy chủ Ubuntu, dùng model nhẹ hơn (ví dụ Gemini Flash) cho các tác vụ đơn giản, và điều khiển từ xa qua Telegram Bridge.

---

## Kiến trúc đề xuất

```
┌─────────────────────────────────────────────────────────────┐
│                     TELEGRAM BOT                            │
│                  (Single Bot Token)                          │
└────────────────┬──────────────────┬──────────────────────────┘
                 │                  │
        ┌────────▼────────┐  ┌──────▼───────────┐
        │   Mac (Local)   │  │  Ubuntu (Remote)  │
        │   Antigravity   │  │   Antigravity     │
        │                 │  │                   │
        │  Model: Gemini  │  │  Model: Flash     │
        │  3 Pro (heavy)  │  │  (lightweight)    │
        │                 │  │                   │
        │  Bridge: Master │  │  Bridge: Worker   │
        │  Port: local    │  │  Port: SSH tunnel │
        └─────────────────┘  └───────────────────┘
```

---

## 3 Phương án khả thi

### Phương án 1: SSH Tunnel + IPC qua TCP (⭐ Khuyến nghị)

**Ý tưởng:** Mở rộng IPC hiện tại từ Unix Socket → TCP Socket, cho phép worker ở remote server kết nối qua SSH tunnel.

**Cách hoạt động:**
1. Trên Ubuntu: Chạy Antigravity với Xvfb (virtual display)
2. Cài Telegram Bridge extension trên cả 2 máy
3. Mac là Master (giữ Telegram Bot), Ubuntu là Worker
4. Kết nối qua SSH tunnel: `ssh -L 9999:localhost:9999 ubuntu-server`

**Thay đổi code cần thiết:**

```typescript
// ipc.ts — Mở rộng để hỗ trợ TCP
const IPC_MODE = process.env.ANTIGRAVITY_IPC_MODE || 'socket'; // 'socket' | 'tcp'
const TCP_PORT = parseInt(process.env.ANTIGRAVITY_IPC_PORT || '19876');

function getConnectionTarget(): string | number {
    if (IPC_MODE === 'tcp') return TCP_PORT;
    return SOCKET_PATH; // Unix socket (hiện tại)
}
```

**Ưu điểm:**
- ✅ Tận dụng kiến trúc IPC Master/Worker hiện tại
- ✅ SSH tunnel = bảo mật tốt, không cần mở port
- ✅ Thay đổi code ít nhất (~50 lines)
- ✅ Worker tự đăng ký workspace, Master route tin nhắn

**Nhược điểm:**
- ⚠️ Cần duy trì SSH tunnel ổn định (autossh)
- ⚠️ Latency cao hơn local socket
- ⚠️ Cần Xvfb trên Ubuntu để chạy Antigravity

**Effort:** ~2-3 ngày

---

### Phương án 2: VS Code Server + Remote Tunnel (Chính thống)

**Ý tưởng:** Dùng `code tunnel` CLI trên Ubuntu server, kết nối từ Mac qua VS Code Remote Tunnel.

**Cách hoạt động:**
1. Trên Ubuntu: `code tunnel --name ubuntu-ag`
2. Trên Mac: VS Code → Remote Explorer → Connect to Tunnel
3. Extension Telegram Bridge chạy trên remote server

**Ưu điểm:**
- ✅ Chính thống, được Microsoft hỗ trợ
- ✅ Không cần SSH hay mở port
- ✅ Extensions chạy native trên remote

**Nhược điểm:**
- ❌ **Antigravity KHÔNG PHẢI VS Code thuần** — là fork riêng, chưa chắc `code tunnel` hoạt động
- ❌ Cần Google account auth cho tunnel
- ❌ Antigravity extension (agent panel, brain, etc.) có thể không tương thích với Remote mode
- ⚠️ Phức tạp: 2 lớp extension (local UI + remote backend)

**Effort:** Rủi ro cao, cần thử nghiệm 3-5 ngày, có thể fail

---

### Phương án 3: Standalone Remote Bridge (Đơn giản nhất)

**Ý tưởng:** Chạy instance Antigravity hoàn toàn độc lập trên Ubuntu, với Telegram Bridge riêng kết nối về cùng Telegram Bot.

**Cách hoạt động:**
1. Ubuntu chạy Antigravity + Bridge với **bot token riêng** (bot thứ 2)
2. Hoặc: Dùng cùng bot nhưng route bằng prefix command (`/remote ...`)
3. Mỗi instance tự quản lý brain directory riêng

```
User gửi: /remote viết unit test cho module X
→ Bot route qua Ubuntu instance
→ Ubuntu Antigravity (Flash model) xử lý
→ Response quay về Telegram
```

**Ưu điểm:**
- ✅ Hoàn toàn độc lập, không cần thay đổi IPC
- ✅ Dễ triển khai: chỉ cần cài Antigravity trên Ubuntu
- ✅ 2 model khác nhau, 2 instance riêng biệt

**Nhược điểm:**
- ⚠️ Cần 2 Telegram bot token (hoặc routing phức tạp hơn trong 1 bot)
- ⚠️ Không share context/conversation giữa 2 instance
- ⚠️ Cần Xvfb + desktop environment giả trên Ubuntu

**Effort:** ~1-2 ngày (nếu Antigravity cài được trên Ubuntu)

---

## Yêu cầu kỹ thuật cho Ubuntu Server

### Cài Antigravity trên Ubuntu (headless)

```bash
# 1. Cài dependencies
sudo apt update
sudo apt install -y xvfb libgtk-3-0 libnss3 libxss1 libasound2 libgbm1

# 2. Download Antigravity (giả sử có .deb hoặc AppImage)
# wget https://antigravity-download-url/antigravity-linux.deb
# sudo dpkg -i antigravity-linux.deb

# 3. Tạo virtual display
export DISPLAY=:99
Xvfb :99 -screen 0 1920x1080x24 &

# 4. Chạy Antigravity
antigravity --user-data-dir=/home/user/.antigravity-remote &

# 5. Cài extension Telegram Bridge
antigravity --install-extension ./antigravity-telegram-bridge-0.5.6.vsix
```

### Giữ SSH Tunnel ổn định

```bash
# Dùng autossh để tự reconnect
sudo apt install autossh

# Tạo reverse tunnel từ Ubuntu → Mac
autossh -M 0 -f -N -R 19876:localhost:19876 user@mac-ip \
  -o "ServerAliveInterval 30" \
  -o "ServerAliveCountMax 3"
```

### Systemd Service

```ini
# /etc/systemd/system/antigravity-remote.service
[Unit]
Description=Antigravity Remote Instance
After=network.target

[Service]
User=ubuntu
Environment=DISPLAY=:99
ExecStartPre=/usr/bin/Xvfb :99 -screen 0 1920x1080x24 &
ExecStart=/usr/bin/antigravity --user-data-dir=/home/ubuntu/.antigravity-remote
Restart=always

[Install]
WantedBy=multi-user.target
```

---

## So sánh tổng hợp

| Tiêu chí | PA1: SSH Tunnel + IPC | PA2: VS Code Tunnel | PA3: Standalone |
|----------|----------------------|---------------------|-----------------|
| **Effort** | 2-3 ngày | 3-5 ngày (rủi ro cao) | 1-2 ngày |
| **Rủi ro** | Thấp | Cao (Antigravity ≠ VS Code) | Thấp |
| **Share context** | ✅ Qua IPC | ✅ Native | ❌ Riêng biệt |
| **Routing linh hoạt** | ✅ Master route | ⚠️ Phức tạp | ✅ Prefix command |
| **Bảo mật** | ✅ SSH tunnel | ✅ Microsoft tunnel | ⚠️ Cần cấu hình |
| **Bảo trì** | Trung bình | Cao | Thấp |
| **2 model cùng lúc** | ✅ | ✅ | ✅ |
| **Xvfb cần thiết** | ✅ | ❌ | ✅ |

---

## Khuyến nghị

### Bước 1: Bắt đầu với Phương án 3 (Standalone)
- Cài Antigravity trên Ubuntu server
- Kiểm tra xem có chạy được với Xvfb không
- Cấu hình model nhẹ (Flash)
- Tạo Telegram bot thứ 2 để test

### Bước 2: Nâng cấp lên Phương án 1 (SSH Tunnel + IPC)
- Mở rộng `ipc.ts` để hỗ trợ TCP
- Kết nối Ubuntu worker vào Mac master
- 1 Telegram bot, routing thông minh qua `/list` và `/conv`

### Bước 3: Tối ưu
- Auto-routing: tác vụ nhẹ → Flash, tác vụ nặng → Pro
- Shared clipboard/file sync giữa 2 instance
- Health monitoring qua `/status`

---

## Rủi ro chính cần verify

1. **Antigravity có chạy được trên Ubuntu headless không?**
   - Cần thử: download Antigravity Linux build, chạy với Xvfb
   - Nếu không → cần tìm cách khác (Docker? Wine?)

2. **Model switching có cần cấu hình qua UI không?**
   - Hiện tại chỉ đổi model qua GUI (xem research note v0.4.0)
   - Cần verify: có CLI flag hoặc settings.json nào set model không?
   - Ví dụ: `"antigravity.defaultModel": "gemini-flash"` trong settings

3. **Brain directory conflict**
   - 2 instance cùng dùng `~/.gemini/antigravity/brain/` sẽ conflict
   - Giải pháp: Ubuntu dùng `--user-data-dir` riêng

4. **Licensing / Rate limiting**
   - 2 instance = 2x API calls, cần check quota Google AI

---

*Tạo: 2026-03-16 | Tác giả: Antigravity Agent*
