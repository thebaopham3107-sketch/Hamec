# PROMPT TRIỂN KHAI — dán cho Claude Code trên MÁY MỚI

> Mở **Claude Code** ngay trong thư mục đã `git clone` gói này, rồi dán nguyên khối dưới đây.
> AI sẽ đọc `goi.yaml`, tự cài, chỉ hỏi bạn 3 giá trị Input còn thiếu, và tự chạy cổng chốt.

---

Bạn đang ở thư mục gốc của gói **hamec-ai-assistant** (NGHÉ — trợ lý điều khiển
Claude Code bằng giọng nói/chữ qua Lark). Hãy triển khai gói này trên MÁY NÀY theo đúng
hợp đồng **`goi.yaml`** (đọc file đó trước — nó mô tả Input/Tech/Tool/Output). Làm tuần tự:

1. **Đọc `goi.yaml` + `docs/00-PHIEU-INPUT.md`.** Tóm tắt cho tôi 3 việc CON NGƯỜI phải tự làm
   (tôi không tự động hoá được): (a) tạo/publish App Lark + bật event `im.message.receive_v1`
   + scope `im:message`, `im:message:send_as_bot`, `im:resource`; (b) đăng nhập `lark-cli --as bot`;
   (c) tạo nhóm điều khiển và thêm bot vào. Hỏi tôi đã xong (a)(b)(c) chưa; nếu chưa, dẫn tôi theo
   `docs/02-tao-app-lark.md` rồi mới đi tiếp.

2. **Kiểm công cụ nền** (Node ≥ 18, ffmpeg, lark-cli, claude, và Python/uv). Thiếu cái nào thì
   chỉ tôi lệnh cài (theo `docs/01-cai-dat-nen.md`). ĐỪNG tự cài phần mềm hệ thống nếu chưa hỏi.

3. **Chạy cài đặt Python:** `powershell -ExecutionPolicy Bypass -File scripts/install.ps1`
   (tạo venv, cài faster-whisper + edge-tts, tự cài cuBLAS/cuDNN nếu có GPU, điền `PYTHON_BIN` vào `.env`).
   Trên macOS/Linux thì làm theo phần tương ứng trong `docs/01-cai-dat-nen.md`.

4. **Lấy 2 giá trị Lark:** chạy `node scripts/whoami.mjs`, bảo tôi nhắn 1 tin vào nhóm điều khiển,
   rồi ghi `OWNER_OPEN_ID` và `CONTROL_CHAT_ID` vào `scripts/.env`.

5. **Hỏi tôi cấu hình** (điền vào `.env`): `BRAIN_ROOT` (thư mục bạn muốn Claude thao tác),
   `WHISPER_MODEL` (`small` nếu không có GPU, `medium` nếu có GPU), `VOICE_CODE` (nữ HoaiMy / nam NamMinh).

6. **Cổng chốt — BẮT BUỘC XANH mới đi tiếp:**
   `node check-goi.mjs` và `node scripts/check-setup.mjs`. Còn ĐỎ thì sửa theo gợi ý rồi chạy lại.
   ĐỪNG bật bridge khi cổng chốt còn đỏ.

7. **Bàn giao:** hướng dẫn tôi bật bằng `powershell -ExecutionPolicy Bypass -File scripts/start.ps1`
   (KHÔNG tự chạy tiến trình thường trú này giúp tôi — nó là AI toàn quyền chạy nền, phải để CON NGƯỜI
   tự bấm). Tạo giúp tôi shortcut Desktop trỏ tới `start.ps1` bằng đường dẫn NỘI BỘ (không dùng UNC).
   Nếu tôi muốn 24/7, dẫn tôi phần watchdog trong `docs/04-chay-va-24-7.md`.

Nguyên tắc: đọc `docs/05-su-co.md` khi gặp lỗi; KHÔNG commit `.env`; báo tôi rõ mắt xích nào XANH/ĐỎ
sau mỗi bước. Ngôn ngữ: tiếng Việt.
