#!/bin/zsh
# NGHE launcher for macOS (tuong duong start.ps1). Double-click de bat.
export PATH="$HOME/.local/bin:/usr/local/bin:/opt/homebrew/bin:$PATH"
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then echo "[X] node not found. Install Node.js >= 18."; read "?Press Enter to close"; exit 1; fi
if [ ! -f .env ]; then echo "[X] Missing .env (copy .env.example -> .env)."; read "?Press Enter to close"; exit 1; fi
echo "[*] Starting NGHE (Lark <-> Claude)... (Ctrl+C to stop)"
echo "    Working dir: $(pwd)"
node lark-voice-bridge.mjs
echo ""
echo "[!] Bridge stopped (node exited)."
read "?Press Enter to close"
