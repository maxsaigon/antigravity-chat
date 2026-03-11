# Antigravity Chat (Telegram Bridge)

Đây là mã nguồn hỗ trợ kết nối và trò chuyện với Antigravity AI (thông qua Telegram Bridge) nhằm đem lại trải nghiệm AI Agentic trực tiếp trên giao diện chat của Telegram.

## 🌟 Chức năng (Features)

- **Nhận tin nhắn từ Telegram**: Chuyển tiếp các truy vấn từ người dùng qua bot Telegram gửi trực tiếp tới Antigravity trong VS Code.
- **Phản hồi tự động**: Lấy kết quả từ Antigravity (thường ghi vào tệp `telegram_response.md`) sau đó trả kết quả về cho người dùng qua Telegram. 
- **Đồng bộ liên tục**: Tự động capture lại các tác vụ tự động của AI và thông báo trạng thái.
- **Tiện ích và mở rộng**: Cung cấp cách thức dễ dàng để mở rộng và giao tiếp với Antigravity nội bộ thông qua command của VS Code.

## 💻 Khả năng tương thích (Compatibility)

- ✅ **macOS**: Dự án **đã được test hoàn hảo** và chạy ổn định trên môi trường macOS (bao gồm cả AppleScript cho việc tập trung cửa sổ, gửi phím nhận dạng nâng cao, v.v.).
- ⚠️ **Windows / Các hệ điều hành khác**: Hiện tại **VẪN CHƯA ĐƯỢC TEST**. Các tính năng liên quan đến macro điều khiển cửa sổ hoặc command path có thể cần phải được tinh chỉnh thêm để tương thích hoàn toàn.

## 🚀 Hướng dẫn cài đặt (Installation)

1. Tải về hoặc định vị file cài đặt Extension (đuôi `.vsix`) mới nhất trong thư mục `antigravity-telegram-bridge` (hiện tại là file `antigravity-telegram-bridge-0.2.1.vsix`).
2. Mở **Visual Studio Code**.
3. Đi tới tab **Extensions** (`Cmd+Shift+X` trên macOS).
4. Nhấn vào biểu tượng dấu ba chấm `...` ở góc trên cùng bên phải của panel Extensions.
5. Chọn **"Install from VSIX..."** trong danh sách thả xuống.
6. Duyệt tới file `.vsix` đã chuẩn bị và nhấn **Install**.
7. Đợi thông báo cài đặt thành công từ VS Code (có thể khởi động lại VS Code nếu cần).

*(Cấu hình Token và thiết lập Bot Telegram có thể thực hiện thông qua cài đặt Extension của VS Code hoặc file môi trường được mô tả chi tiết sau).*
