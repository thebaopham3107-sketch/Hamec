# 03 — Lấy OWNER_OPEN_ID + CONTROL_CHAT_ID (10 giây)

`lark-voice-bridge.mjs` chỉ nghe lệnh của ĐÚNG `open_id` chủ, và chỉ hoạt động trong
ĐÚNG `chat_id` nhóm điều khiển. Lấy 2 giá trị này như sau:

1. Đảm bảo **lark-cli đã đăng nhập** (`--as bot`) và **bot đã ở trong nhóm điều khiển**.
2. Trong thư mục `scripts/`:
   ```bash
   node whoami.mjs
   ```
3. Vào **nhóm điều khiển** trên Lark → **nhắn 1 tin bất kỳ** (vd "test").
4. Màn hình in ra:
   ```
   OWNER_OPEN_ID=ou_xxxxxxxx
   CONTROL_CHAT_ID=oc_xxxxxxxx
   ```
5. Copy 2 dòng đó vào `.env`. Ctrl+C để thoát `whoami.mjs`.

> Nếu chạy `whoami.mjs` mà không thấy gì khi bạn nhắn: kiểm lại app đã **Publish** version,
> đã bật event `im.message.receive_v1`, và bot đã được **thêm vào nhóm**.
