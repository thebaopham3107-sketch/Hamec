# 01 — Cài công cụ nền (1 lần)

## Windows (khuyên dùng — có launcher sẵn)

1. **Node.js ≥ 18** — tải bản LTS ở nodejs.org. Kiểm: `node -v`.
2. **Python 3.10–3.12** — cách gọn nhất là cài **uv** (tự tải Python):
   ```powershell
   powershell -c "irm https://astral.sh/uv/install.ps1 | iex"
   ```
   Hoặc tải Python ở python.org (tick **Add Python to PATH**).
3. **ffmpeg:** `winget install Gyan.FFmpeg` → mở PowerShell mới, kiểm `ffmpeg -version`.
4. **lark-cli:** `npm i -g @larksuite/cli` → đăng nhập app của bạn (`--as bot`).
5. **claude (Claude Code CLI):** cài + đăng nhập, kiểm `claude --version`.

Rồi chạy **install.ps1** để dựng môi trường Python riêng + cài Whisper/edge-tts:
```powershell
cd scripts
powershell -ExecutionPolicy Bypass -File install.ps1
```
Script tự: tạo `.venv`, cài `faster-whisper` + `edge-tts` + `python-dotenv`,
**tự cài cuBLAS/cuDNN nếu phát hiện GPU NVIDIA**, và điền `PYTHON_BIN` vào `.env`.

## macOS / Linux (không có start.ps1)
Cài Node 18+, `uv` (hoặc python3), `ffmpeg`, `lark-cli`, `claude`. Rồi:
```bash
cd scripts
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python -r requirements.txt
cp .env.example .env      # điền OWNER_OPEN_ID, CONTROL_CHAT_ID, PYTHON_BIN=.venv/bin/python
node whoami.mjs           # lấy 2 giá trị
node check-setup.mjs
node lark-voice-bridge.mjs
```

## GPU NVIDIA (tuỳ chọn, nghe nhanh hơn + dùng được `medium`)
`install.ps1` tự cài `nvidia-cublas-cu12` + `nvidia-cudnn-cu12` nếu có `nvidia-smi`.
Cài tay:
```powershell
uv pip install --python .venv\Scripts\python.exe nvidia-cublas-cu12 nvidia-cudnn-cu12
```
> Thiếu 2 gói này thì Whisper nạp được trên GPU nhưng **nghe ra rỗng** → bot báo "Nghe không rõ".
> `whisper-server.py` có bước warmup: nếu GPU vẫn lỗi thì tự lùi CPU.
