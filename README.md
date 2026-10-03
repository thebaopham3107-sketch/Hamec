# hamec-ai-assistant — TÔM Voice 🎙️

Trợ lý AI **điều khiển Claude Code bằng GIỌNG NÓI (hoặc chữ) ngay trong Lark**.
Bạn **bấm micro nói** trong một nhóm Lark → vài giây sau **nghe TÔM trả lời bằng giọng tiếng Việt**;
gõ chữ cũng được. Chạy **tại máy của bạn** (không cần server, không cần public URL).

```
Bạn nói (Lark voice) ──► [Whisper] giọng→chữ ──► [Claude Code] xử lý + chạy việc
                                                              │
   Bạn nghe (Lark audio) ◄── [edge-tts] chữ→giọng ◄── câu trả lời ┘
```

- **STT** faster-whisper (chạy GPU nếu có, tự lùi CPU) · **TTS** edge-tts (Microsoft, **miễn phí**, giọng Việt).
- Nghe Lark qua `lark-cli event consume` **long-connection** — không cần webhook/ngrok.
- **Chỉ CHỦ** (`OWNER_OPEN_ID`) ra lệnh được; bot chỉ hoạt động trong **NHÓM ĐIỀU KHIỂN**.

---

## Hai đường cài (chuẩn ITTO)

### ⚡ Đường NHANH NHẤT (làm tay, ~20–30')
Đọc theo thứ tự trong `docs/`:
1. `docs/00-PHIEU-INPUT.md` — **điền xong là chạy** (checklist Input I).
2. `docs/01-cai-dat-nen.md` — Node, Python/uv, ffmpeg, lark-cli, claude.
3. `docs/02-tao-app-lark.md` — tạo App Lark + scope + bật event + nhóm điều khiển.
4. `docs/03-lay-openid-chatid.md` — `node whoami.mjs` lấy 2 giá trị điền `.env`.
5. `docs/04-chay-va-24-7.md` — bật `start.ps1`, và (tuỳ chọn) watchdog 24/7.

Rút gọn trên Windows:
```powershell
cd scripts
powershell -ExecutionPolicy Bypass -File install.ps1   # tạo venv + cài whisper/edge-tts (+CUDA nếu có GPU)
# đăng nhập lark-cli --as bot + thêm bot vào nhóm điều khiển
node whoami.mjs            # nhắn 1 tin vào nhóm → copy OWNER_OPEN_ID + CONTROL_CHAT_ID vào .env
node check-setup.mjs       # cổng chốt: phải XANH
powershell -ExecutionPolicy Bypass -File start.ps1     # bật TÔM
```

### 🤖 Đường TIỆN NHẤT (để AI tự dẫn)
Đưa cho Claude Code prompt trong `docs/PROMPT-TRIEN-KHAI.md`. AI đọc `itto.yaml`, tự cài,
tự hỏi đúng 3 giá trị Input còn thiếu, tự chạy cổng chốt.

---

## Cổng chốt (chạy trước khi bật)
```bash
node check-itto.mjs                 # gói đủ mảnh? (zero-dep)
node scripts/check-setup.mjs        # môi trường + Lark + .env đã sẵn? (XANH mới chạy)
```

## Dùng hằng ngày
- **Bật:** double-click `scripts/start.ps1` (hoặc shortcut trỏ tới nó).
- **Nói/gõ** trong nhóm điều khiển → TÔM trả lời.
- **Lệnh nhanh:** `/ping` · `/voice on|off` · `/help`.
- **Tắt:** đóng cửa sổ (Ctrl+C).

## Cấu trúc
```
hamec-ai-assistant/
├── itto.yaml            # hợp đồng ITTO (Input/Tech/Tool/Output)
├── check-itto.mjs       # cổng chốt gói (zero-dep)
├── docs/                # hướng dẫn cài + PHIẾU INPUT + PROMPT triển khai
└── scripts/
    ├── lark-voice-bridge.mjs   # cầu nối chính (Lark ↔ Claude)
    ├── whisper-server.py       # STT thường trú (GPU→CPU tự lùi)
    ├── text_to_mp3.py          # TTS edge-tts (mặc định)
    ├── text_to_mp3_vbee.py     # TTS Vbee (tuỳ chọn, cần key)
    ├── install.ps1  start.ps1  check-setup.mjs  whoami.mjs  watchdog.mjs
    ├── requirements.txt   .env.example
```

> ⚠️ **Bảo mật:** không commit `.env`. `bypassPermissions` cho TÔM chạy thẳng lệnh máy — **chỉ bật trên máy của bạn**. App Secret Lark chỉ nằm trong lark-cli, không vào repo.
