# 00 — PHIẾU INPUT (điền xong là chạy)

> Đây là phần **Input** của hợp đồng gói (`goi.yaml`): mọi thứ CON NGƯỜI phải chuẩn bị TRƯỚC khi bật.
> Điền hết ô dưới, qua `node scripts/check-setup.mjs` **XANH** thì mới bật `start.ps1`.

## 1. Công cụ nền (cài 1 lần) — xem `01-cai-dat-nen.md`
| Cần | Kiểm tra | Có chưa |
|---|---|---|
| Node.js ≥ 18 | `node -v` | ☐ |
| Python 3.10–3.12 (hoặc `uv`) | `uv --version` / `python --version` | ☐ |
| ffmpeg trên PATH | `ffmpeg -version` | ☐ |
| lark-cli | `lark-cli --version` | ☐ |
| claude (Claude Code CLI) | `claude --version` | ☐ |

## 2. App Lark (xem `02-tao-app-lark.md`)
| Cần | Giá trị của bạn |
|---|---|
| `LARK_APP_ID` (open.larksuite.com → Credentials) | `cli_____________` |
| `LARK_APP_SECRET` (bí mật — chỉ dùng đăng nhập lark-cli, KHÔNG vào .env/repo) | `________________` |
| Đã bật event `im.message.receive_v1` + scope `im:message`, `im:message:send_as_bot`, `im:resource` + **PUBLISH** version | ☐ |
| Đã đăng nhập `lark-cli` bằng app này (`--as bot`) | ☐ |

## 3. Nhóm điều khiển
- ☐ Tạo **1 nhóm Lark riêng** (chỉ bạn) → đây là "nhóm điều khiển NGHÉ".
- ☐ **Thêm Bot** (app vừa tạo) vào nhóm này.

## 4. Hai giá trị lấy bằng `whoami.mjs` (xem `03-lay-openid-chatid.md`)
```bash
cd scripts && node whoami.mjs      # nhắn 1 tin vào nhóm → nó in ra 2 dòng dưới
```
| Điền vào `.env` | Giá trị |
|---|---|
| `OWNER_OPEN_ID` | `ou_____________` |
| `CONTROL_CHAT_ID` | `oc_____________` |

## 5. Chọn cấu hình (trong `.env`)
| Biến | Gợi ý |
|---|---|
| `BRAIN_ROOT` | thư mục bạn muốn Claude thao tác (để trống = thư mục cha repo) |
| `WHISPER_MODEL` | `small` (CPU/máy yếu) · `medium` (GPU + đã cài cuBLAS/cuDNN) |
| `VOICE_CODE` | `vi-VN-HoaiMyNeural` (nữ) · `vi-VN-NamMinhNeural` (nam) |
| `CLAUDE_MODEL` | `sonnet` (mặc định) · `opus` (thông minh hơn) · `haiku` (rẻ/nhanh) |

## 6. Cổng chốt (cả hai phải XANH)
```bash
node check-goi.mjs                 # gói đủ mảnh?
node scripts/check-setup.mjs        # môi trường + Lark + .env sẵn sàng?
```
XANH hết → `powershell -ExecutionPolicy Bypass -File scripts/start.ps1`.
