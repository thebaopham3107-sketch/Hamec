# 05 — Sự cố thường gặp (đúc kết từ triển khai thật)

| Hiện tượng | Nguyên nhân & cách xử lý |
|---|---|
| **Double-click start.ps1 → cửa sổ "tắt phụt"** | File `.ps1` có dấu tiếng Việt/ký tự đặc biệt → PowerShell 5.1 đọc theo mã ANSI, vỡ cú pháp. `start.ps1` trong gói đã **thuần ASCII**; đừng thêm dấu vào. Nếu tự sửa, giữ ASCII. |
| **Shortcut Desktop "mở không được"** | Shortcut trỏ đường mạng UNC (`\\...`) → Windows chặn ngầm ở Explorer. Trỏ tới **đường nội bộ** (ổ C:...). Xem `04-chay-va-24-7.md`. |
| **Nói xong không thấy trả lời** | (1) App Lark chưa **Publish** version / chưa bật event `im.message.receive_v1`; (2) sai `CONTROL_CHAT_ID`/`OWNER_OPEN_ID`; (3) bot chưa vào nhóm. Xem cửa sổ bridge có log không. |
| **Bot báo "❌ Nghe không rõ" với MỌI câu** | GPU thiếu **cuBLAS/cuDNN** (Whisper nạp được nhưng suy luận lỗi ngầm). Chạy lại `install.ps1` (tự cài nếu có GPU) hoặc `uv pip install --python .venv\Scripts\python.exe nvidia-cublas-cu12 nvidia-cudnn-cu12`. `whisper-server.py` warmup sẽ tự lùi CPU nếu vẫn lỗi. |
| **Nghe sai chữ nhiều** | `WHISPER_MODEL=small` nghe tiếng Việt chưa chuẩn. Có GPU → đổi `medium` trong `.env`. |
| **Trả lời bằng CHỮ thay vì giọng** | edge-tts lỗi mạng tạm, hoặc thiếu **ffmpeg** → bridge tự rớt về chữ. Kiểm `ffmpeg -version`; thử lại sau. |
| **`check-setup.mjs` báo thiếu Python/gói** | Chưa chạy `install.ps1`, hoặc `PYTHON_BIN` trong `.env` sai. Chạy lại `install.ps1`. |
| **lark-cli báo lỗi auth** | Đăng nhập lại lark-cli với app của bạn; `lark-cli profile list` phải có `active: true`. |
| **`whoami.mjs` không in gì khi nhắn** | App chưa Publish / chưa bật event / bot chưa vào nhóm (xem `02-tao-app-lark.md`). |
| **Windows không có `python`** | Chỉ có stub Microsoft Store → dùng `uv` (install.ps1 ưu tiên uv) và `PYTHON_BIN` trỏ tới `.venv`. |

## Chế độ test không tốn token
Đặt `DRY_RUN=true` trong `.env` → bridge nhận tin, chạy STT/TTS nhưng **không gọi Claude thật** (chỉ vọng lại). Test luồng Lark/giọng nói mà không tốn token.
