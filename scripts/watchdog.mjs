#!/usr/bin/env node
// watchdog.mjs — Tự phát hiện và khởi động lại bridge nếu chết hoặc treo
// Chạy bởi Windows Scheduled Task mỗi 3 phút.
//
// Logic:
//   1. Đọc bridge.pid → kiểm tra process còn sống
//   2. Đọc bridge.heartbeat → kiểm tra cập nhật trong 35 phút qua
//   3. Nếu chết HOẶC tim ngừng đập → kill PID cũ → spawn bridge mới → notify Lark
//
// Zero-dependency, Node >= 18.

import fs from "node:fs";
import path from "node:path";
import { execSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BRIDGE_SCRIPT = path.join(__dirname, "lark-voice-bridge.mjs");
const PID_FILE     = path.join(__dirname, "bridge.pid");
const HB_FILE      = path.join(__dirname, "bridge.heartbeat");

// Đọc LARK_WEBHOOK từ .env để gửi cảnh báo
const WEBHOOK = (() => {
  try {
    for (const line of fs.readFileSync(path.join(__dirname, ".env"), "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*LARK_WEBHOOK\s*=\s*(.*)\s*$/);
      if (m) return m[1].trim().replace(/^["']|["']$/g, "");
    }
  } catch {}
  return "";
})();

const now = () => new Date().toISOString().replace("T", " ").slice(0, 19);
const LOG_DIR  = path.join(__dirname, "logs");
const LOG_FILE = path.join(LOG_DIR, `watchdog-${new Date().toISOString().slice(0, 10)}.log`);
function log(...x) {
  try { fs.mkdirSync(LOG_DIR, { recursive: true }); } catch {}
  const line = `[${now()}] [watchdog] ${x.join(" ")}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + "\n"); } catch {}
}

async function notify(msg) {
  if (!WEBHOOK) return;
  try {
    await fetch(WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ msg_type: "text", content: { text: msg } }),
    });
  } catch (e) { log("notify lỗi:", e.message); }
}

// Kiểm tra PID còn tồn tại không (Windows + Linux)
function isAlive(pid) {
  if (!pid || isNaN(pid)) return false;
  try {
    if (process.platform === "win32") {
      const out = execSync(`tasklist /FI "PID eq ${pid}" /NH 2>NUL`, { timeout: 8000 }).toString();
      return out.includes(String(pid));
    }
    process.kill(pid, 0);
    return true;
  } catch { return false; }
}

function killPid(pid) {
  if (!pid || isNaN(pid)) return;
  try {
    if (process.platform === "win32") execSync(`taskkill /PID ${pid} /T /F 2>NUL`, { timeout: 10000 });
    else process.kill(pid, "SIGTERM");
  } catch {}
}

function startBridge() {
  const child = spawn(process.execPath, [BRIDGE_SCRIPT], {
    cwd: __dirname,
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
  log(`▶ Đã spawn bridge mới (node PID ${child.pid}).`);
}

// ── MAIN ─────────────────────────────────────────────────────────────────────
// Heartbeat tối đa 35 phút = timeout Claude (25 phút) + buffer 10 phút
const MAX_HB_AGE_MS = 35 * 60 * 1000;

let bridgePid = null;
try { bridgePid = parseInt(fs.readFileSync(PID_FILE, "utf8").trim(), 10); } catch {}
const alive = isAlive(bridgePid);

let hbAgeMs = Infinity;
try {
  const hbStr = fs.readFileSync(HB_FILE, "utf8").trim();
  // bridge ghi ISO-like "YYYY-MM-DD HH:MM:SS" — convert về Date
  const hbDate = new Date(hbStr.replace(" ", "T") + "Z"); // UTC
  hbAgeMs = Date.now() - hbDate.getTime();
} catch {}

const hbMin = hbAgeMs === Infinity ? "∞" : Math.round(hbAgeMs / 60000);
log(`pid=${bridgePid ?? "?"} alive=${alive} heartbeat=${hbMin}m cũ`);

if (!alive) {
  log("⚠ Bridge không chạy → khởi động lại…");
  startBridge();
  await notify("⚠️ [NGHÉ Watchdog] Bridge Lark không chạy — đã tự khởi động lại.");
} else if (hbAgeMs > MAX_HB_AGE_MS) {
  log(`⚠ Heartbeat cũ ${hbMin} phút (> 35) → bridge có thể bị treo → kill + restart…`);
  killPid(bridgePid);
  await new Promise(r => setTimeout(r, 3000));
  startBridge();
  await notify(`⚠️ [NGHÉ Watchdog] Bridge bị treo ${hbMin} phút — đã kill PID ${bridgePid} và khởi động lại.`);
} else {
  log("✅ Bridge OK — không cần can thiệp.");
}
