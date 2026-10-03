#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// whoami.mjs — Lấy open_id (CHỦ) + chat_id (NHÓM ĐIỀU KHIỂN) trong 10 giây.
//
// Vì sao cần: lark-voice-bridge.mjs chỉ nghe lệnh của ĐÚNG open_id chủ, gửi về
//   ĐÚNG chat_id nhóm. Lần đầu cài, học viên chưa biết 2 giá trị này. Script này
//   nghe Lark, in ra ngay khi học viên nhắn 1 tin bất kỳ vào nhóm điều khiển.
//
// Chạy:  node whoami.mjs
//   → mở script, vào Lark nhắn 1 tin vào nhóm điều khiển → script in:
//        OWNER_OPEN_ID=ou_xxxxxxxx
//        CONTROL_CHAT_ID=oc_xxxxxxxx
//     → copy 2 dòng đó vào .env rồi tắt script (Ctrl+C).
//
// Yêu cầu: lark-cli đã đăng nhập (--as bot), bot đã được THÊM vào nhóm.
// ─────────────────────────────────────────────────────────────────────────────

import { spawn } from "node:child_process";
import readline from "node:readline";

const isWin = process.platform === "win32";
const LARK_CLI = process.env.LARK_CLI_BIN || "lark-cli";

console.log("▶ Đang nghe Lark… Hãy vào nhóm điều khiển và NHẮN 1 TIN bất kỳ.");
console.log("  (Bot phải đã được thêm vào nhóm. Ctrl+C để thoát.)\n");

const child = spawn(LARK_CLI, ["event", "consume", "im.message.receive_v1", "--as", "bot"], {
  shell: isWin, windowsHide: true, stdio: ["pipe", "pipe", "pipe"],
});

readline.createInterface({ input: child.stdout }).on("line", (line) => {
  line = line.trim();
  if (!line || line[0] !== "{") return;
  let ev;
  try { ev = JSON.parse(line); } catch { return; }
  const open = ev.sender_id?.open_id || ev.sender_id || ev.open_id || "(không thấy)";
  const chat = ev.chat_id || "(không thấy)";
  console.log("──────────── ĐÃ BẮT ĐƯỢC TIN ────────────");
  console.log("OWNER_OPEN_ID=" + open);
  console.log("CONTROL_CHAT_ID=" + chat);
  console.log("──────────────────────────────────────────");
  console.log("→ Copy 2 dòng trên vào file .env, rồi Ctrl+C để thoát.\n");
});

child.stderr.on("data", (d) => {
  const s = d.toString().trim();
  if (s.includes("ready")) console.log("✅ Đã kết nối Lark, đang chờ tin nhắn của bạn…");
});
child.on("close", (code) => { console.log(`Listener thoát (mã ${code}).`); process.exit(0); });
process.on("SIGINT", () => { try { child.kill(); } catch {} process.exit(0); });
