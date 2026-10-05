# 02 — Tạo App Lark + Bot + Event (1 lần)

1. Vào **open.larksuite.com** (bản .cn: open.feishu.cn) → **Developer Console** → **Create Custom App**.
2. **Add features → Bot**: bật tính năng Bot.
3. **Permissions & Scopes** — bật tối thiểu:
   - `im:message` — nhận tin
   - `im:message:send_as_bot` — gửi tin thay bot
   - `im:resource` — tải/gửi file, ảnh, audio (BẮT BUỘC cho voice)
4. **Events & Callbacks**:
   - Chế độ **Long Connection** (không cần URL công khai).
   - Subscribe event **`im.message.receive_v1`**.
5. **Version Management & Release → Create version → Publish** (bản nháp chưa publish thì event/scope chưa có hiệu lực).
6. Lấy **App ID** + **App Secret** ở mục **Credentials & Basic Info**.

## Đăng nhập lark-cli bằng app này
```bash
lark-cli --version                 # chắc chắn đã cài (npm i -g @larksuite/cli)
# đăng nhập app (làm theo hướng dẫn lark-cli của bạn), chọn brand:
#   lark (quốc tế, larksuite.com)  hoặc  feishu (.cn)
lark-cli profile list              # phải thấy app của bạn "active": true
```

## Thêm Bot vào NHÓM ĐIỀU KHIỂN
- Tạo 1 nhóm Lark riêng (chỉ bạn) → **Add members → thêm Bot** (app vừa tạo).
- Đây là nhóm duy nhất NGHÉ lắng nghe (khoá bằng `CONTROL_CHAT_ID`).

> **3 cái bẫy hay gặp:** (1) quên **Publish** version → event/scope không hiệu lực;
> (2) thiếu `im:resource` → gửi/nhận audio hỏng; (3) mỗi app có `open_id` RIÊNG cho cùng một người —
> đổi app phải lấy lại `OWNER_OPEN_ID` bằng `whoami.mjs`.
