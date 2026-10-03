# /// script
# requires-python = ">=3.10"
# dependencies = ["edge-tts", "python-dotenv"]
# ///
"""Chữ → MP3 bằng edge-tts (Microsoft Edge TTS) — MIỄN PHÍ, không cần key.

Đây là script TTS MẶC ĐỊNH của bridge (lark-voice-bridge.mjs tự gọi text_to_mp3.py).
Bản Vbee (trả phí) để ở text_to_mp3_vbee.py — trỏ tới nó qua env VBEE_SCRIPT nếu cần.

    python text_to_mp3.py "Xin chào" -o out.mp3
    python text_to_mp3.py "Xin chào" -o out.mp3 --voice_code vi-VN-NamMinhNeural
    python text_to_mp3.py --file bai.txt -o out.mp3

Giọng tiếng Việt có sẵn:
    vi-VN-HoaiMyNeural   (nữ)  ← mặc định
    vi-VN-NamMinhNeural  (nam)

Giọng lấy từ env VOICE_CODE trong .env, ghi đè bằng --voice_code khi gọi.
Các tham số riêng của Vbee (--bitrate, --audio_type, --callback_url, --keep_source)
vẫn được NHẬN nhưng bỏ qua, để tương thích giao diện dòng lệnh với bản Vbee.
"""

import argparse
import asyncio
import os
import sys
import time
from pathlib import Path

import edge_tts
from dotenv import load_dotenv

# Tự chứa: tìm file .env gần nhất, bắt đầu từ thư mục script rồi leo lên.
_here = Path(__file__).resolve().parent
for _cand in [_here, *_here.parents]:
    if (_cand / ".env").exists():
        load_dotenv(_cand / ".env")
        break

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

FALLBACK_VOICE = "vi-VN-HoaiMyNeural"
DEFAULT_VOICE = os.getenv("VOICE_CODE") or FALLBACK_VOICE
DEFAULT_SPEED = "1.0"
MAX_TRIES = 3


def speed_to_rate(speed_rate: str) -> str:
    """Vbee dùng hệ số ('1.0', '1.2'); edge-tts dùng phần trăm ('+0%', '+20%')."""
    try:
        pct = round((float(speed_rate) - 1.0) * 100)
    except (TypeError, ValueError):
        pct = 0
    return f"{pct:+d}%"


async def synth(text: str, out: Path, voice: str, rate: str) -> None:
    communicate = edge_tts.Communicate(text, voice, rate=rate)
    await communicate.save(str(out))


def text_to_mp3(
    text: str,
    output_path: str,
    voice_code: str = DEFAULT_VOICE,
    speed_rate: str = DEFAULT_SPEED,
) -> dict:
    out = Path(output_path).expanduser().resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    rate = speed_to_rate(speed_rate)

    print(f"edge-tts: {len(text)} ký tự, giọng={voice_code}, tốc độ={rate}", file=sys.stderr)

    last_err = None
    for attempt in range(1, MAX_TRIES + 1):
        try:
            asyncio.run(synth(text, out, voice_code, rate))
            if out.exists() and out.stat().st_size > 0:
                break
            last_err = "file rỗng"
        except Exception as e:  # mạng chập chờn / Microsoft chặn tạm
            last_err = f"{type(e).__name__}: {e}"
        # dọn file hỏng để lần sau không tưởng là thành công
        try:
            if out.exists() and out.stat().st_size == 0:
                out.unlink()
        except OSError:
            pass
        if attempt < MAX_TRIES:
            print(f"  lần {attempt} hỏng ({last_err}) — thử lại…", file=sys.stderr)
            time.sleep(1.5 * attempt)
    else:
        print(f"Lỗi: edge-tts hỏng sau {MAX_TRIES} lần. {last_err}", file=sys.stderr)
        sys.exit(1)

    return {
        "output_path": str(out),
        "size_mb": round(out.stat().st_size / (1024 * 1024), 3),
        "char_count": len(text),
        "voice_code": voice_code,
        "rate": rate,
    }


def main() -> None:
    p = argparse.ArgumentParser(description="edge-tts → MP3 (thay Vbee, miễn phí)")
    src = p.add_mutually_exclusive_group(required=True)
    src.add_argument("text", nargs="?", help="Nội dung cần đọc")
    src.add_argument("--file", help="Đường dẫn file .txt chứa nội dung")
    p.add_argument("-o", "--output", required=True, help="Đường dẫn MP3 xuất ra")
    p.add_argument("--voice_code", default=DEFAULT_VOICE, help=f"Mã giọng (mặc định: {DEFAULT_VOICE})")
    p.add_argument("--speed_rate", default=DEFAULT_SPEED, help="Tốc độ đọc, 1.0 = bình thường")
    # Nhận cho tương thích Vbee rồi bỏ qua — edge-tts không dùng tới.
    p.add_argument("--bitrate", type=int, default=128, help=argparse.SUPPRESS)
    p.add_argument("--audio_type", default="mp3", choices=["mp3", "wav"], help=argparse.SUPPRESS)
    p.add_argument("--callback_url", default="", help=argparse.SUPPRESS)
    p.add_argument("--keep_source", action="store_true", help=argparse.SUPPRESS)
    args = p.parse_args()

    if args.file:
        text = Path(args.file).expanduser().read_text(encoding="utf-8").strip()
    else:
        text = (args.text or "").strip()
    if not text:
        print("Lỗi: nội dung rỗng", file=sys.stderr)
        sys.exit(1)

    result = text_to_mp3(
        text=text,
        output_path=args.output,
        voice_code=args.voice_code,
        speed_rate=args.speed_rate,
    )
    print("OK")
    for k, v in result.items():
        print(f"  {k}: {v}")


if __name__ == "__main__":
    main()
