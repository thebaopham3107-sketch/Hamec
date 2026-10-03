# -*- coding: utf-8 -*-
"""
whisper-server.py — Máy chủ STT thường trú cho lark-bridge.
Nạp model faster-whisper MỘT LẦN vào VRAM rồi phục vụ nhiều clip qua HTTP nội bộ
→ mỗi câu voice chỉ tốn ~1-2s thay vì nạp lại model mỗi lần (rất hợp khi lái xe).

Chạy:  python whisper-server.py [model] [port]
  model: tiny|base|small|medium|large-v3  (mặc định: small — nhanh, đủ tốt cho câu lệnh ngắn)
  port : cổng localhost (mặc định 8765)

API:
  GET  /health           -> {"ok":true,"model":...,"device":...}
  POST /stt  {"path": "<file audio>", "language":"vi"}  -> {"ok":true,"text":"..."}

In ra stdout dòng "WHISPER_READY" khi model nạp xong (để bridge biết đã sẵn sàng).
"""
import os, sys, glob, json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

# Nạp CUDA DLL (cuBLAS/cuDNN cài qua pip) cho GPU NVIDIA
try:
    import ctranslate2
    nvidia_base = os.path.join(os.path.dirname(os.path.dirname(ctranslate2.__file__)), "nvidia")
    for bindir in glob.glob(os.path.join(nvidia_base, "*", "bin")):
        os.add_dll_directory(bindir)
        os.environ["PATH"] = bindir + os.pathsep + os.environ.get("PATH", "")
except Exception:
    pass

from faster_whisper import WhisperModel

MODEL_SIZE = sys.argv[1] if len(sys.argv) > 1 else os.getenv("WHISPER_MODEL", "small")
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else int(os.getenv("WHISPER_PORT", "8765"))

import numpy as np


def _load(device):
    """Nạp model + CHẠY NÓNG 1 lần suy luận để lộ lỗi thư viện (cuBLAS/cuDNN) NGAY.
    faster-whisper suy luận lười — lỗi thiếu DLL chỉ ném khi lặp segments. Nếu không
    ép chạy nóng ở đây, GPU sẽ lỗi ngầm mỗi lần nghe → trả rỗng → 'Nghe không rõ'."""
    m = WhisperModel(MODEL_SIZE, device=device, compute_type="int8")
    segs, _ = m.transcribe(np.zeros(16000, dtype=np.float32), language="vi")
    list(segs)  # BẮT BUỘC lặp để kích hoạt suy luận thật (nơi lỗi DLL xuất hiện)
    return m


print(f"[whisper] Đang nạp model '{MODEL_SIZE}'...", file=sys.stderr, flush=True)
try:
    MODEL = _load("cuda")
    DEVICE = "GPU"
except Exception as e:
    print(f"[whisper] GPU không dùng được ({type(e).__name__}: {e}) -> CPU.", file=sys.stderr, flush=True)
    MODEL = _load("cpu")
    DEVICE = "CPU"
print(f"[whisper] Sẵn sàng trên {DEVICE}, cổng {PORT}.", file=sys.stderr, flush=True)
print("WHISPER_READY", flush=True)  # marker cho bridge


def transcribe(path, language="vi"):
    segments, _ = MODEL.transcribe(
        path, language=language, vad_filter=True,
        vad_parameters=dict(min_silence_duration_ms=500),
    )
    return " ".join(s.text.strip() for s in segments).strip()


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):  # tắt log mặc định cho gọn
        pass

    def do_GET(self):
        if self.path == "/health":
            return self._send(200, {"ok": True, "model": MODEL_SIZE, "device": DEVICE})
        self._send(404, {"ok": False, "error": "not found"})

    def do_POST(self):
        if self.path != "/stt":
            return self._send(404, {"ok": False, "error": "not found"})
        try:
            n = int(self.headers.get("Content-Length", "0"))
            req = json.loads(self.rfile.read(n) or b"{}")
            path = req.get("path")
            lang = req.get("language", "vi")
            if not path or not os.path.isfile(path):
                return self._send(400, {"ok": False, "error": f"file không tồn tại: {path}"})
            text = transcribe(path, lang)
            self._send(200, {"ok": True, "text": text})
        except Exception as e:
            self._send(500, {"ok": False, "error": f"{type(e).__name__}: {e}"})


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
