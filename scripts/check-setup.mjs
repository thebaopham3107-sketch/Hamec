#!/usr/bin/env node
/**
 * check-setup.mjs — CỔNG CHỐT runtime cho TÔM Voice (mục "preflight" của ITTO).
 * Soát mọi mắt xích TRƯỚC khi bật bridge. Exit ≠ 0 nếu còn đỏ ⇒ đừng chạy thật vội.
 * Zero-dependency, Node >= 18.
 *
 * Chạy:  node check-setup.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const isWin = process.platform === "win32";
let fail = 0;
const ok = (b) => (b ? "✔" : "✘");
function line(pass, msg, hint) {
  console.log(`${ok(pass)} ${msg}`);
  if (!pass) { fail++; if (hint) console.log(`    → ${hint}`); }
}

// ── .env ──────────────────────────────────────────────────────────────────
const envPath = path.join(HERE, ".env");
const env = {};
if (fs.existsSync(envPath)) {
  for (const l of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}
console.log("== check-setup ==\n");
line(fs.existsSync(envPath), ".env tồn tại", "copy .env.example → .env (hoặc chạy install.ps1)");
line(!!env.OWNER_OPEN_ID, "OWNER_OPEN_ID đã điền", "chạy `node whoami.mjs` rồi dán vào .env");
line(!!env.CONTROL_CHAT_ID, "CONTROL_CHAT_ID đã điền", "chạy `node whoami.mjs` rồi dán vào .env");

// ── Node ──────────────────────────────────────────────────────────────────
const nodeMajor = parseInt(process.versions.node.split(".")[0], 10);
line(nodeMajor >= 18, `Node ${process.versions.node} (>=18)`, "cài Node.js 18+ từ nodejs.org");

// ── Tiện ích spawn ──────────────────────────────────────────────────────────
const run = (bin, args, shell = false) =>
  spawnSync(bin, args, { shell, encoding: "utf8", timeout: 30000, windowsHide: true });
const onPath = (bin) => {
  const r = run(isWin ? "where" : "which", [bin], false);
  return r.status === 0;
};

// ── Python venv + gói ───────────────────────────────────────────────────────
const py = env.PYTHON_BIN || (isWin ? path.join(HERE, ".venv", "Scripts", "python.exe")
                                     : path.join(HERE, ".venv", "bin", "python"));
const pyExists = fs.existsSync(py);
line(pyExists, `Python venv: ${py}`, "chạy install.ps1 để tạo .venv + điền PYTHON_BIN");
if (pyExists) {
  const r = run(py, ["-c", "import faster_whisper, edge_tts, dotenv; print('ok')"], false);
  line(r.status === 0 && /ok/.test(r.stdout || ""), "Python: faster-whisper + edge-tts + dotenv",
    "cài gói: uv pip install --python <venv> -r requirements.txt");
}

// ── ffmpeg ──────────────────────────────────────────────────────────────────
line(onPath(env.FFMPEG_BIN || "ffmpeg"), "ffmpeg trên PATH", "winget install Gyan.FFmpeg");

// ── lark-cli đăng nhập bot ─────────────────────────────────────────────────
const lark = env.LARK_CLI_BIN || "lark-cli";
const larkOnPath = onPath(lark);
line(larkOnPath, "lark-cli có mặt", "npm i -g @larksuite/cli");
if (larkOnPath) {
  const r = run(lark, ["profile", "list"], isWin);
  let hasActive = false;
  try { hasActive = JSON.parse((r.stdout || "").slice((r.stdout || "").indexOf("["))).some((p) => p.active); } catch {}
  line(hasActive, "lark-cli có profile đang active (đăng nhập bot)",
    "đăng nhập app Lark của bạn với lark-cli, thêm bot vào nhóm điều khiển");
}

// ── claude CLI ──────────────────────────────────────────────────────────────
line(onPath(env.CLAUDE_BIN || "claude"), "claude (Claude Code CLI) có mặt",
  "cài Claude Code + đăng nhập: claude --version");

console.log(fail
  ? `\n✘ Còn ${fail} mục ĐỎ — sửa xong hãy chạy lại. (Chưa nên bật bridge.)`
  : `\n✔ Tất cả XANH — chạy được:  powershell -File start.ps1`);
process.exit(fail ? 1 : 0);
