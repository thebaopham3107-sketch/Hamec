#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// lark-bridge.mjs — Cây cầu nối Lark ↔ Claude Code (điều khiển từ xa, CHẠY THẲNG)
//
// Ý tưởng: Anh nhắn 1 lệnh vào NHÓM ĐIỀU KHIỂN trên Lark → bridge nghe được
//   → chạy `claude -p` headless ngay trên máy (full skill/wiki/sub-agent, tự duyệt
//   quyền) → gửi kết quả trả lại nhóm qua webhook. Nhóm Lark = terminal từ xa.
//
// Zero-dependency, Node >= 18. Chạy ngầm 24/7 trên máy này.
//
//   node lark-bridge.mjs            # đọc cấu hình từ .env cùng thư mục
//
// AN TOÀN: chỉ NHẬN lệnh từ đúng OWNER_OPEN_ID (open_id của anh). Tin của người
//   khác trong nhóm bị bỏ qua. Reply chỉ gửi về đúng webhook nhóm điều khiển.
// ─────────────────────────────────────────────────────────────────────────────

import { spawn } from "node:child_process";
import readline from "node:readline";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isWin = process.platform === "win32";
const LOG_DIR = path.join(__dirname, "logs");
try { fs.mkdirSync(LOG_DIR, { recursive: true }); } catch {}

// ── Nạp .env thủ công (zero-dep) ─────────────────────────────────────────────
function loadEnv() {
  const p = path.join(__dirname, ".env");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}
loadEnv();
process.env.PYTHONUTF8 = "1"; // ép python con in UTF-8 (path dự án có tiếng Việt)

const CFG = {
  // open_id của CHỦ — CHỈ người này ra lệnh được. BẮT BUỘC điền OWNER_OPEN_ID trong .env
  // (lấy open_id: nhắn 1 tin vào nhóm rồi xem log bridge dòng "sender=ou_...").
  ownerOpenId: process.env.OWNER_OPEN_ID || "",
  // Webhook custom-bot của nhóm điều khiển (BẮT BUỘC) — nơi gửi kết quả về
  webhook: process.env.LARK_WEBHOOK || "",
  // Khoá vào đúng 1 nhóm. Để trống → bridge tự học chat_id từ tin đầu tiên của chủ.
  controlChatId: process.env.CONTROL_CHAT_ID || "",
  // Lệnh gọi lark-cli / claude (cho phép override path tuyệt đối)
  larkCli: process.env.LARK_CLI_BIN || "lark-cli",
  claudeBin: process.env.CLAUDE_BIN || "claude",
  // Model & quyền cho claude headless
  model: process.env.CLAUDE_MODEL || "sonnet",
  permissionMode: process.env.PERMISSION_MODE || "bypassPermissions",
  // Thư mục làm việc của claude = gốc HOA BRAIN (2 cấp trên file này)
  brainRoot: process.env.BRAIN_ROOT || path.resolve(__dirname, "..", ".."),
  // Giữ mạch hội thoại giữa các lệnh (resume session riêng của bridge)
  keepSession: (process.env.KEEP_SESSION || "true") !== "false",
  // Trần thời gian 1 lệnh (ms). 0 = không giới hạn.
  timeoutMs: Number(process.env.CLAUDE_TIMEOUT_MS || 25 * 60 * 1000),
  // DRY_RUN: không gọi claude thật, chỉ echo — để test luồng Lark trước.
  dryRun: (process.env.DRY_RUN || "false") === "true",

  // ── VOICE (nói chuyện bằng giọng nói khi lái xe) ──
  voiceReply: (process.env.VOICE_REPLY || "true") !== "false", // tin voice → trả lời bằng voice
  whisperPort: Number(process.env.WHISPER_PORT || 8765),
  whisperModel: process.env.WHISPER_MODEL || "medium",         // tiny|base|small|medium|large-v3 (medium = chuẩn tiếng Việt)
  pythonBin: process.env.PYTHON_BIN || "python",
  voiceCode: process.env.VOICE_CODE || "",                     // để trống = giọng mặc định script VBee
  // ── CHĂM SÓC KHÁCH external (nháp → anh duyệt → gửi) ──
  careMode: (process.env.CARE_MODE || "true") !== "false",     // bật xử lý tin khách external (chat 1-1)
  careModel: process.env.CARE_MODEL || "haiku",                // model cho Claude-chăm-sóc (rẻ/nhanh; đổi sonnet nếu cần chất hơn)
};
// Script TTS VBee (giọng Việt) đi KÈM trong bộ này. Key VBEE_API + VBEE_APP_ID đặt trong .env cùng thư mục.
CFG.vbeeScript = process.env.VBEE_SCRIPT || path.join(__dirname, "text_to_mp3.py");
// Thư mục file tạm cho voice (dưới thư mục bridge)
const VOICE_TMP = path.join(__dirname, "voice-tmp");
try { fs.mkdirSync(VOICE_TMP, { recursive: true }); } catch {}
// Đường dẫn tương đối từ brainRoot (lark-cli yêu cầu path tương đối trong cwd, dùng "/")
const relFromBrain = (abs) => path.relative(CFG.brainRoot, abs).split(path.sep).join("/");
// Sandbox cho Claude-chăm-sóc-khách: cwd RIÊNG, không secret, không quyền máy
const CARE_DIR = path.join(__dirname, "customer-care");
try { fs.mkdirSync(CARE_DIR, { recursive: true }); } catch {}
// File query-params cố định để GỬI tin vào nhóm (lark-cli api cần receive_id_type qua --params)
const QPARAMS_FILE = path.join(VOICE_TMP, "_q_chatid.json");
try { fs.writeFileSync(QPARAMS_FILE, '{"receive_id_type":"chat_id"}'); } catch {}

if (!CFG.webhook) {
  console.error("✖ Thiếu LARK_WEBHOOK trong .env — đây là webhook custom-bot của nhóm điều khiển.");
  process.exit(1);
}
if (!CFG.ownerOpenId) {
  console.error("✖ Thiếu OWNER_OPEN_ID trong .env — bắt buộc khai báo open_id của CHỦ để chỉ chủ ra lệnh được.");
  console.error("   Cách lấy: nhắn 1 tin vào nhóm điều khiển, xem log bridge ('sender=ou_...') rồi dán vào .env.");
  process.exit(1);
}

// ── Bộ nhớ đệm BỀN VỮNG (nhớ bối cảnh giữa các lệnh & qua cả khi restart) ─────
const MEM_FILE = path.join(__dirname, "memory.json");
let sessionId = null;   // phiên Claude (dùng --resume để nối ngữ cảnh)
let history = [];       // transcript: [{ t, cmd, result, ok }]

function loadMem() {
  try {
    const m = JSON.parse(fs.readFileSync(MEM_FILE, "utf8"));
    sessionId = m.sessionId || null;
    history = Array.isArray(m.history) ? m.history : [];
    if (sessionId || history.length) log(`🧠 Khôi phục nhớ đệm: phiên ${sessionId ? sessionId.slice(0, 8) + "…" : "(mới)"}, ${history.length} lượt.`);
  } catch { /* chưa có file → bắt đầu mới */ }
}
function saveMem() {
  try {
    fs.writeFileSync(MEM_FILE, JSON.stringify({ sessionId, updatedAt: now(), history: history.slice(-80) }, null, 2));
  } catch (e) { log("✖ lưu nhớ đệm:", e.message); }
}
function remember(cmd, result, ok) {
  const entry = { t: now(), cmd, result: String(result || "").slice(0, 1200), ok };
  history.push(entry);
  if (history.length > 80) history = history.slice(-80);
  saveMem();
  // Ghi lịch sử hằng ngày không giới hạn (bền vững qua restart)
  try { fs.appendFileSync(path.join(LOG_DIR, `history-${entry.t.slice(0, 10)}.jsonl`), JSON.stringify(entry) + "\n"); } catch {}
}
// Dựng đoạn "bối cảnh gần đây" để nhắc lại Claude khi KHÔNG resume được phiên cũ
function contextPreamble(n = 6) {
  const recent = history.slice(-n);
  if (!recent.length) return "";
  const lines = recent.map((h, i) => `(${i + 1}) Anh: ${h.cmd}\n    → Em đã trả: ${String(h.result).replace(/\s+/g, " ").slice(0, 220)}`).join("\n");
  return `# Bối cảnh hội thoại gần đây (từ nhớ đệm — để bạn không quên ngữ cảnh các lệnh trước):\n${lines}\n\n# Yêu cầu MỚI của anh:\n`;
}

// Hàng đợi: chạy tuần tự từng lệnh, không chồng chéo
let busy = false;
const queue = [];
// Chống xử lý trùng (Lark có thể giao lại event)
const seen = new Set();

const now = () => new Date().toISOString().replace("T", " ").slice(0, 19);
const getLogFile = () => { const d = new Date(); return path.join(LOG_DIR, `bridge-${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}.log`); };
const log = (...x) => { const line = `[${now()}] ${x.join(" ")}`; console.log(line); try { fs.appendFileSync(getLogFile(), line + "\n"); } catch {} };

// ── Gửi tin về nhóm Lark qua webhook (card hoặc text), tự chia nhỏ nếu dài ────
async function sendCard(title, body, template = "blue") {
  const MAX = 3500; // giới hạn an toàn / 1 div lark_md
  const chunks = [];
  let s = String(body || "").trim() || "(rỗng)";
  while (s.length > MAX) {
    let cut = s.lastIndexOf("\n", MAX);
    if (cut < MAX * 0.6) cut = MAX;
    chunks.push(s.slice(0, cut));
    s = s.slice(cut);
  }
  chunks.push(s);

  // Nếu quá nhiều mảnh → gửi thành nhiều card liên tiếp
  for (let g = 0; g < chunks.length; g += 4) {
    const part = chunks.slice(g, g + 4);
    const elements = [];
    part.forEach((c, i) => {
      elements.push({ tag: "div", text: { tag: "lark_md", content: c } });
      if (i < part.length - 1) elements.push({ tag: "hr" });
    });
    const head = chunks.length > 4 ? `${title} (${g / 4 + 1})` : title;
    const card = {
      msg_type: "interactive",
      card: {
        config: { wide_screen_mode: true },
        header: { template, title: { tag: "plain_text", content: head } },
        elements,
      },
    };
    await postWebhook(card);
  }
}

async function postWebhook(payload) {
  try {
    const res = await fetch(CFG.webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j = await res.json().catch(() => ({}));
    if (!(j.code === 0 || j.StatusCode === 0 || j.success)) {
      log("✖ webhook trả lỗi:", JSON.stringify(j).slice(0, 200));
    }
  } catch (e) {
    log("✖ webhook ném lỗi:", e.message);
  }
}

// ── Gọi Claude headless ──────────────────────────────────────────────────────
function runClaude(prompt, useResume = true) {
  if (CFG.dryRun) {
    return Promise.resolve({ ok: true, result: `[DRY_RUN] Đã nhận lệnh (chưa gọi Claude thật):\n\n${prompt}` });
  }
  const args = ["-p", "--output-format", "json", "--permission-mode", CFG.permissionMode];
  if (CFG.model) args.push("--model", CFG.model);
  const willResume = useResume && CFG.keepSession && !!sessionId;
  if (willResume) args.push("--resume", sessionId);

  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(CFG.claudeBin, args, {
        cwd: CFG.brainRoot,
        shell: isWin, // Windows cần shell để chạy claude.cmd
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (e) {
      return resolve({ ok: false, result: "", error: `spawn claude lỗi: ${e.message}` });
    }
    let out = "", err = "", timer = null;
    if (CFG.timeoutMs > 0) {
      timer = setTimeout(() => { try { child.kill(); } catch {} resolve({ ok: false, result: "", error: `Hết thời gian ${CFG.timeoutMs}ms` }); }, CFG.timeoutMs);
    }
    child.stdout.on("data", d => out += d.toString());
    child.stderr.on("data", d => err += d.toString());
    child.on("error", e => { if (timer) clearTimeout(timer); resolve({ ok: false, result: "", error: `Không chạy được claude: ${e.message}` }); });
    child.on("close", code => {
      if (timer) clearTimeout(timer);
      try {
        const j = JSON.parse(out);
        if (j.session_id) { sessionId = j.session_id; saveMem(); } // nhớ phiên (bền vững)
        resolve({ ok: !j.is_error, result: j.result ?? j.message ?? out, usedResume: willResume });
      } catch {
        if (code !== 0 && !out) return resolve({ ok: false, result: "", error: `claude thoát mã ${code}: ${err.slice(0, 400)}`, usedResume: willResume });
        resolve({ ok: true, result: out.trim(), usedResume: willResume });
      }
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

// ── VOICE: tiến trình con + STT (whisper) + TTS (VBee) + nhận/gửi audio ───────
const FFMPEG = process.env.FFMPEG_BIN || "ffmpeg";
let whisperReady = false;

// Spawn tiến trình con, gom stdout/stderr.
// shell=true cho lark-cli/claude (.cmd cần shell); shell=false cho python/ffmpeg (.exe)
// → mảng tham số tự xử lý dấu cách/tiếng Việt trong path, không bị cmd.exe cắt vụn.
function runProc(bin, args, { timeoutMs = 180000, cwd = CFG.brainRoot, shell = isWin, input = null } = {}) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(bin, args, { cwd, shell, windowsHide: true, stdio: [input != null ? "pipe" : "ignore", "pipe", "pipe"] });
    } catch (e) { return resolve({ code: -1, stdout: "", stderr: `spawn lỗi: ${e.message}` }); }
    let out = "", err = "", timer = null;
    if (timeoutMs > 0) timer = setTimeout(() => { try { child.kill(); } catch {} resolve({ code: -1, stdout: out, stderr: `timeout ${timeoutMs}ms` }); }, timeoutMs);
    child.stdout.on("data", d => out += d.toString());
    child.stderr.on("data", d => err += d.toString());
    child.on("error", e => { if (timer) clearTimeout(timer); resolve({ code: -1, stdout: out, stderr: e.message }); });
    child.on("close", code => { if (timer) clearTimeout(timer); resolve({ code, stdout: out, stderr: err }); });
    if (input != null) { try { child.stdin.write(input); child.stdin.end(); } catch {} }
  });
}

// ── GỬI TIN qua MỘT bot duy nhất (app "Miss Áo Dài"), dạng REPLY gắn vào tin của anh.
// Body đẩy qua STDIN (--data -) nên text tuỳ ý KHÔNG vỡ shell. Mỗi yêu cầu = đúng 1 tin trả lời.
async function larkApi(method, apiPath, bodyObj) {
  const r = await runProc(CFG.larkCli, ["api", method, apiPath, "--data", "-", "--as", "bot"], { timeoutMs: 60000, input: JSON.stringify(bodyObj) });
  const raw = r.stdout + r.stderr;
  const ok = /"code"\s*:\s*0|message_id/.test(raw);
  if (!ok) log("✖ larkApi lỗi:", raw.slice(-300));
  return ok;
}
// Như larkApi nhưng kèm query params (qua --params @file để không vỡ shell)
async function larkApiParams(method, apiPath, paramsArg, bodyObj) {
  const r = await runProc(CFG.larkCli, ["api", method, apiPath, "--params", paramsArg, "--data", "-", "--as", "bot"], { timeoutMs: 60000, input: JSON.stringify(bodyObj) });
  const raw = r.stdout + r.stderr;
  const ok = /"code"\s*:\s*0|message_id/.test(raw);
  if (!ok) log("✖ larkApiParams lỗi:", raw.slice(-300));
  return ok;
}
// Trả lời (reply) tin của anh bằng TEXT
function replyText(triggerMsgId, text) {
  const body = { msg_type: "text", content: JSON.stringify({ text: String(text || "").slice(0, 12000) || "(rỗng)" }) };
  return larkApi("POST", `/open-apis/im/v1/messages/${triggerMsgId}/reply`, body);
}
// Trả lời tin của anh bằng AUDIO (giọng nói) — upload + reply 1 lệnh
async function replyAudio(triggerMsgId, absOpus) {
  const r = await runProc(CFG.larkCli, ["im", "+messages-reply", "--message-id", triggerMsgId, "--audio", relFromBrain(absOpus), "--as", "bot"], { timeoutMs: 60000 });
  const ok = /message_id|"code"\s*:\s*0|"ok"\s*:\s*true/i.test(r.stdout + r.stderr);
  if (!ok) log("✖ reply audio lỗi:", (r.stdout + r.stderr).slice(-300));
  return ok;
}
// Gửi tin thường vào nhóm điều khiển (không gắn vào tin nào — dùng cho thẻ duyệt khách)
function sendChatText(text) {
  const body = { receive_id: CFG.controlChatId, msg_type: "text", content: JSON.stringify({ text: String(text || "") }) };
  return larkApiParams("POST", "/open-apis/im/v1/messages", `@${relFromBrain(QPARAMS_FILE)}`, body);
}

// Lấy file_key của tin audio (raw OpenAPI). Node spawn nên KHÔNG dính path-mangling.
async function getAudioFileKey(messageId) {
  const r = await runProc(CFG.larkCli, ["api", "GET", `/open-apis/im/v1/messages/${messageId}`, "--as", "bot"], { timeoutMs: 30000 });
  const raw = r.stdout + r.stderr;
  // Cách chuẩn: parse JSON → items[0].body.content (lại là chuỗi JSON) → file_key
  try {
    const j = JSON.parse(raw.slice(raw.indexOf("{")));
    const content = j?.data?.items?.[0]?.body?.content;
    if (content) {
      const c = typeof content === "string" ? JSON.parse(content) : content;
      if (c.file_key) return c.file_key;
    }
  } catch {}
  // Dự phòng: regex chịu được dấu nháy bị escape (\"file_key\":\"file_...\")
  const m = raw.match(/file_key[\\"':\s]*?(file_[A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}
// Tải file audio của tin về local (.opus)
async function downloadVoice(messageId, fileKey, absOut) {
  await runProc(CFG.larkCli, ["im", "+messages-resources-download", "--message-id", messageId, "--file-key", fileKey, "--type", "file", "--output", relFromBrain(absOut), "--as", "bot"], { timeoutMs: 60000 });
  return fs.existsSync(absOut) ? absOut : null;
}
// STT qua whisper server nội bộ (chờ server sẵn sàng tối đa 40s)
async function sttTranscribe(absPath) {
  const deadline = Date.now() + 40000;
  while (!whisperReady && Date.now() < deadline) await new Promise(r => setTimeout(r, 500));
  try {
    const res = await fetch(`http://127.0.0.1:${CFG.whisperPort}/stt`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: absPath, language: "vi" }),
    });
    const j = await res.json();
    return j.ok ? (j.text || "").trim() : "";
  } catch (e) { log("✖ STT lỗi:", e.message); return ""; }
}
// TTS: text → mp3 (VBee) → opus (ffmpeg, chuẩn Lark: mono 16k libopus)
async function ttsToOpus(text, tag) {
  const mp3 = path.join(VOICE_TMP, `tts-${tag}.mp3`);
  const opus = path.join(VOICE_TMP, `tts-${tag}.opus`);
  const args = [CFG.vbeeScript, text, "-o", mp3];
  if (CFG.voiceCode) args.push("--voice_code", CFG.voiceCode);
  const t = await runProc(CFG.pythonBin, args, { timeoutMs: 120000, shell: false });
  if (!fs.existsSync(mp3)) { log("✖ TTS VBee lỗi:", (t.stderr || "").slice(-300)); return null; }
  await runProc(FFMPEG, ["-y", "-loglevel", "error", "-i", mp3, "-ac", "1", "-ar", "16000", "-c:a", "libopus", "-b:a", "24k", opus], { timeoutMs: 60000, shell: false });
  try { fs.unlinkSync(mp3); } catch {}
  return fs.existsSync(opus) ? opus : null;
}
// Gửi tin AUDIO vào nhóm (lark-cli --as bot; webhook không gửi audio được)
async function sendVoice(absOpus) {
  const r = await runProc(CFG.larkCli, ["im", "+messages-send", "--chat-id", CFG.controlChatId, "--audio", relFromBrain(absOpus), "--as", "bot"], { timeoutMs: 60000 });
  const ok = /"ok"\s*:\s*true|message_id|"code"\s*:\s*0/i.test(r.stdout + r.stderr);
  if (!ok) log("✖ gửi voice lỗi:", (r.stdout + r.stderr).slice(-300));
  return ok;
}
// Làm sạch text để đọc bằng giọng (bỏ markdown/emoji/link)
function speakable(s) {
  return String(s || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/https?:\/\/\S+/g, "đường liên kết")
    .replace(/[*_`#>|~]/g, "")
    .replace(/\s+/g, " ").trim().slice(0, 700);
}
// Whisper STT server thường trú (nạp model 1 lần, tự khởi động lại)
function startWhisper() {
  const script = path.join(__dirname, "whisper-server.py");
  log("▶ khởi động whisper STT:", CFG.whisperModel, "cổng", CFG.whisperPort);
  const child = spawn(CFG.pythonBin, [script, CFG.whisperModel, String(CFG.whisperPort)], {
    cwd: __dirname, shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
  });
  readline.createInterface({ input: child.stdout }).on("line", (line) => {
    if (line.includes("WHISPER_READY")) { whisperReady = true; log("✅ whisper STT sẵn sàng."); }
  });
  child.stderr.on("data", d => { const s = d.toString().trim(); if (s) log("whisper:", s.slice(0, 160)); });
  child.on("close", (code) => { whisperReady = false; log(`⚠ whisper thoát (mã ${code}). Khởi động lại sau 5s…`); setTimeout(startWhisper, 5000); });
  child.on("error", e => log("✖ whisper lỗi:", e.message));
}

// ── CHĂM SÓC KHÁCH external: Claude bị NHỐT soạn nháp → anh duyệt → gửi ────────
const CARE_PREAMBLE =
  "Bạn là CHUYÊN VIÊN CHĂM SÓC KHÁCH HÀNG của Hoàng Minh Hóa. Hãy soạn MỘT tin nhắn trả lời khách bằng tiếng Việt: lịch sự, ấm áp, ngắn gọn, hữu ích, xưng \"em\" gọi khách \"anh/chị\". CHỈ trả về đúng nội dung tin nhắn để gửi khách — không giải thích, không markdown, không tiết lộ bạn là AI. Dựa vào file kien-thuc.md trong thư mục hiện tại nếu cần. TUYỆT ĐỐI không chạy lệnh hệ thống.\n\nTin nhắn của khách:\n";

let careSeq = 0;
const pendingCare = new Map(); // "K1" → { customerMsgId, customerOpenId, draft }

// Claude-chăm-sóc: KHÔNG bypassPermissions, cwd sandbox CARE_DIR, không MCP, không resume phiên owner
async function runCareClaude(custText) {
  const args = ["-p", "--output-format", "json", "--permission-mode", "default", "--strict-mcp-config", "--max-turns", "3", "--model", CFG.careModel];
  const r = await runProc(CFG.claudeBin, args, { cwd: CARE_DIR, timeoutMs: 180000, shell: isWin, input: CARE_PREAMBLE + custText });
  try { const j = JSON.parse(r.stdout); return (j.result || j.message || "").trim(); }
  catch { return (r.stdout || "").trim(); }
}

// Tin khách → soạn nháp → đẩy thẻ duyệt vào nhóm điều khiển
async function processCustomer(job) {
  const draft = await runCareClaude(job.text).catch(e => { log("✖ care claude:", e.message); return ""; });
  if (!draft) { log("✖ care: nháp rỗng"); await sendChatText(`⚠️ Khách nhắn nhưng chưa soạn được nháp:\n"${job.text.slice(0, 300)}"\nAnh trả lời tay nhé.`); return; }
  careSeq++;
  const key = "K" + careSeq;
  pendingCare.set(key, { customerMsgId: job.customerMsgId, customerOpenId: job.customerOpenId, draft });
  await sendChatText(`🆕 KHÁCH nhắn (#${key}):\n"${job.text.slice(0, 500)}"\n\n✍️ Nháp trả lời:\n${draft}\n\n→ Duyệt: «${key} ok» để gửi · «${key} sửa: nội dung mới» · «${key} bỏ»`);
}

// Owner duyệt nháp khách trong nhóm điều khiển. Trả true nếu đã xử lý.
async function handleCareApproval(cmd) {
  const m = cmd.match(/^\s*(K\d+)\b\s*(ok|duyệt|gửi|gui|bỏ|bo|huỷ|hủy|huy|sửa|sua)?\s*[:：]?\s*([\s\S]*)$/i);
  if (!m) return false;
  const key = m[1].toUpperCase();
  const item = pendingCare.get(key);
  if (!item) return false; // không có nháp tương ứng → không phải lệnh duyệt
  const action = (m[2] || "").toLowerCase();
  const extra = (m[3] || "").trim();
  if (["bỏ", "bo", "huỷ", "hủy", "huy"].includes(action)) { pendingCare.delete(key); await sendChatText(`🗑️ Đã bỏ nháp ${key}.`); return true; }
  const text = (["sửa", "sua"].includes(action) || extra) ? (extra || item.draft) : item.draft;
  const ok = await replyText(item.customerMsgId, text);     // gửi GẮN vào tin của khách
  pendingCare.delete(key);
  await sendChatText(ok ? `✅ Đã gửi khách (${key}).` : `❌ Gửi khách ${key} lỗi — anh thử lại.`);
  return true;
}

// ── Xử lý lệnh (text & voice) ────────────────────────────────────────────────
const VOICE_PREAMBLE = "Bối cảnh: anh đang nghe câu trả lời bằng giọng đọc.\n\nQUY TẮC BẮT BUỘC:\n1. Nếu yêu cầu cần HÀNH ĐỘNG (gửi, đăng, đọc, tìm, tạo...): GỌI TOOL THỰC SỰ NGAY trong lượt này. TUYỆT ĐỐI KHÔNG viết 'Em sẽ làm', 'Em sẽ gửi', 'Chờ em' rồi kết thúc mà không gọi tool — đó là nói suông.\n2. Chỉ sau khi tool hoàn thành mới báo kết quả: văn nói tự nhiên tiếng Việt, tối đa 60 từ, không đọc link/markdown/emoji.\n3. Nếu chỉ là câu hỏi/trò chuyện: trả lời ngắn dưới 60 từ.\n\nYêu cầu của anh (chuyển từ giọng nói):\n";

// Lệnh nhanh; trả lời gắn vào tin của anh (replyTo). Trả về true nếu đã xử lý.
async function handleQuick(cmd, replyTo) {
  if (cmd === "/ping") { await replyText(replyTo, `🟢 Bridge sống\nPhiên: ${sessionId ? sessionId.slice(0, 8) + "…" : "(mới)"} · Nhớ đệm: ${history.length} lượt\nVoice: ${CFG.voiceReply ? "BẬT" : "tắt"} · whisper ${whisperReady ? "sẵn sàng" : "đang nạp…"} (${CFG.whisperModel})\nGiọng: ${CFG.voiceCode || "mặc định"}`); return true; }
  if (cmd === "/reset") { sessionId = null; saveMem(); await replyText(replyTo, "🔄 Đã sang phiên Claude mới (nhớ đệm vẫn giữ). Gõ /forget để xoá sạch."); return true; }
  if (cmd === "/forget") { sessionId = null; history = []; saveMem(); await replyText(replyTo, "🧹 Đã xoá sạch nhớ đệm, bắt đầu lại từ đầu."); return true; }
  if (cmd === "/mem") {
    const recent = history.slice(-8);
    const body = recent.length ? recent.map((h) => `[${h.t.slice(11)}] ${h.ok ? "✅" : "❌"} ${h.cmd.slice(0, 70)}`).join("\n") : "(trống)";
    await replyText(replyTo, `🧠 Nhớ đệm — ${history.length} lượt (8 gần nhất)\n${body}`); return true;
  }
  if (cmd === "/id") { await replyText(replyTo, `🪪 chat_id: ${CFG.controlChatId || "(tự học)"}\nowner: ${CFG.ownerOpenId}`); return true; }
  if (cmd === "/voice on") { CFG.voiceReply = true; await replyText(replyTo, "🔊 Voice ON — tin voice sẽ được trả lời bằng giọng nói."); return true; }
  if (cmd === "/voice off") { CFG.voiceReply = false; await replyText(replyTo, "🔇 Voice OFF — tạm trả lời bằng text. /voice on để bật lại."); return true; }
  if (cmd === "/care on") { CFG.careMode = true; await replyText(replyTo, "👥 Chăm khách ON — tin khách (Lark, 1-1) sẽ được soạn nháp chờ anh duyệt."); return true; }
  if (cmd === "/care off") { CFG.careMode = false; await replyText(replyTo, "👥 Chăm khách OFF — tạm bỏ qua tin khách external."); return true; }
  if (cmd === "/khach") { const ks = [...pendingCare.keys()]; await replyText(replyTo, ks.length ? `👥 Nháp khách đang chờ duyệt: ${ks.join(", ")}` : "👥 Không có nháp khách nào đang chờ."); return true; }
  if (cmd === "/help") { await replyText(replyTo, "📖 Nhắn TEXT → trả lời text. Gửi VOICE → trả lời bằng GIỌNG NÓI. Mỗi yêu cầu được trả lời GẮN vào tin của anh. Tự nhớ bối cảnh qua restart.\nLệnh: /ping /mem /reset /forget /id /voice on|off"); return true; }
  return false;
}

// Chạy 1 yêu cầu qua Claude (text hoặc đã-STT); trả lời GẮN vào tin của anh (replyTo).
async function runUserCommand(cmd, { voice, replyTo }) {
  const prompt = voice ? VOICE_PREAMBLE + cmd : cmd;
  const t0 = Date.now();
  let r = await runClaude(prompt, true);
  if (!r.ok && r.usedResume && /session|conversation|resume|not found|no such|no conversation/i.test(r.error || "")) {
    log("↻ Không resume được phiên cũ — chạy lại kèm bối cảnh từ nhớ đệm.");
    sessionId = null; saveMem();
    r = await runClaude(contextPreamble() + prompt, false);
  }
  const secs = Math.round((Date.now() - t0) / 1000);
  remember(cmd, r.ok ? r.result : (r.error || r.result), r.ok);

  if (!r.ok) return replyText(replyTo, `❌ Lỗi (${secs}s): ${r.error || r.result || "(không rõ)"}`);

  // VOICE vào → VOICE ra (1 tin giọng nói). TEXT vào → TEXT ra (1 tin). Đều gắn vào tin của anh.
  if (voice && CFG.voiceReply) {
    const speech = speakable(r.result);
    if (!speech) return;
    const opus = await ttsToOpus(speech, String(Date.now())).catch(e => { log("✖ TTS:", e.message); return null; });
    if (opus && await replyAudio(replyTo, opus)) { log("🔊 đã gửi voice trả lời."); try { fs.unlinkSync(opus); } catch {} }
    else await replyText(replyTo, r.result); // TTS hỏng → trả text cho khỏi mất câu trả lời
    return;
  }
  await replyText(replyTo, r.result);
}

async function processCommand(job) {
  const cmd = (job.text || "").trim();
  if (await handleCareApproval(cmd)) return;   // duyệt nháp khách (K1 ok / sửa / bỏ)
  if (await handleQuick(cmd, job.messageId)) return;
  await runUserCommand(cmd, { voice: false, replyTo: job.messageId });
}

// Tin VOICE: tải → STT → Claude → trả lời bằng giọng (1 tin duy nhất, gắn vào tin voice của anh)
async function processVoice(job) {
  const messageId = job.messageId;
  const absOpus = path.join(VOICE_TMP, `in-${messageId}.opus`);
  const fileKey = await getAudioFileKey(messageId);
  if (!fileKey) return replyText(messageId, "❌ Không lấy được file_key của tin audio.");
  if (!await downloadVoice(messageId, fileKey, absOpus)) return replyText(messageId, "❌ Không tải được file audio về.");
  const transcript = await sttTranscribe(absOpus);
  try { fs.unlinkSync(absOpus); } catch {}
  if (!transcript) return replyText(messageId, "❌ Nghe không rõ. Anh nói lại rõ và chậm hơn.");
  log("🎤 nghe:", transcript.slice(0, 120));
  await runUserCommand(transcript, { voice: true, replyTo: messageId });
}

function enqueue(job) {
  queue.push(job);
  drain();
}
async function drain() {
  if (busy) return;
  busy = true;
  while (queue.length) {
    const job = queue.shift();
    try {
      if (job.kind === "voice") await processVoice(job);
      else if (job.kind === "image") await processImage(job);
      else if (job.kind === "customer") await processCustomer(job);
      else await processCommand(job);
    } catch (e) { log("✖ xử lý job:", e.message); if (job.kind !== "customer") { try { await replyText(job.messageId, `❌ Bridge lỗi: ${e.message}`); } catch {} } }
  }
  busy = false;
}

// ── Lọc & bóc nội dung 1 event IM ────────────────────────────────────────────
function extractText(ev) {
  // event consume đã pre-render .content thành text người đọc (text/post…)
  let c = ev.content;
  if (typeof c === "object" && c) c = c.text ?? JSON.stringify(c);
  c = String(c ?? "");
  // Bỏ tiền tố @mention bot nếu anh tag bot (vd "@ADS -> LARK lệnh…")
  c = c.replace(/^\s*@[^\s]+(\s+@[^\s]+)*\s*/, "").trim() || c.trim();
  return c;
}

// ── XỬ LÝ ẢNH: tải ảnh Lark → Claude đọc bằng Read tool → trả kết quả ────────
async function getImageKey(messageId) {
  const r = await runProc(CFG.larkCli, ["api", "GET", `/open-apis/im/v1/messages/${messageId}`, "--as", "bot"], { timeoutMs: 30000 });
  const raw = r.stdout + r.stderr;
  try {
    const j = JSON.parse(raw.slice(raw.indexOf("{")));
    const content = j?.data?.items?.[0]?.body?.content;
    if (content) {
      const c = typeof content === "string" ? JSON.parse(content) : content;
      if (c.image_key) return c.image_key;
    }
  } catch {}
  const m = raw.match(/image_key[\\"':\s]*?(img_[A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}

async function downloadImage(messageId, imageKey, absOut) {
  await runProc(CFG.larkCli, [
    "im", "+messages-resources-download",
    "--message-id", messageId,
    "--file-key", imageKey,
    "--type", "image",
    "--output", relFromBrain(absOut),
    "--as", "bot"
  ], { timeoutMs: 60000 });
  return fs.existsSync(absOut) ? absOut : null;
}

async function processImage(job) {
  const messageId = job.messageId;
  await replyText(messageId, "🖼️ Đang tải và phân tích ảnh…");

  // 1. Lấy image_key
  const imageKey = await getImageKey(messageId);
  if (!imageKey) return replyText(messageId, "❌ Không lấy được image_key của ảnh.");

  // 2. Tải ảnh về thư mục tạm trong brain (để Claude Read tool đọc được)
  const ext = "jpg";
  const absImg = path.join(VOICE_TMP, `img-${messageId}.${ext}`);
  if (!await downloadImage(messageId, imageKey, absImg)) {
    return replyText(messageId, "❌ Không tải được ảnh về máy.");
  }
  log("🖼️ ảnh đã tải:", absImg);

  // 3. Gọi Claude — dùng Read tool để xem ảnh, caption làm ngữ cảnh nếu có
  const caption = job.caption ? `\nCaption của anh: "${job.caption}"` : "";
  const imgRelPath = relFromBrain(absImg);
  const prompt =
    `Anh vừa gửi 1 ảnh qua Lark. Ảnh đã được lưu tại đường dẫn (tương đối từ thư mục làm việc): ${imgRelPath}${caption}\n\n` +
    `Hãy dùng Read tool để mở ảnh đó, xem nội dung và:\n` +
    `- Nếu anh có caption/câu hỏi → trả lời theo đúng yêu cầu đó.\n` +
    `- Nếu không có caption → mô tả nội dung ảnh, nhận xét ngắn gọn, và hỏi anh cần làm gì với ảnh này.`;

  const t0 = Date.now();
  const r = await runClaude(prompt, true);
  const secs = Math.round((Date.now() - t0) / 1000);

  // 4. Dọn file tạm
  try { fs.unlinkSync(absImg); } catch {}

  if (!r.ok) return replyText(messageId, `❌ Claude lỗi (${secs}s): ${r.error || r.result || "(không rõ)"}`);
  remember(`[ảnh] ${job.caption || "(không caption)"}`, r.result, r.ok);
  await replyText(messageId, r.result);
}

function onEvent(ev) {
  const mt = ev.message_type || "";
  if (mt !== "text" && mt !== "audio" && mt !== "image") return;       // text, voice, ảnh
  const sender = ev.sender_id?.open_id || ev.sender_id || ev.open_id;  // tuỳ shape
  const chat = ev.chat_id;
  const chatType = ev.chat_type || "";
  const id = ev.message_id || `${chat}:${ev.create_time || ""}`;
  if (seen.has(id)) return;
  seen.add(id);
  if (seen.size > 500) seen.clear();

  const isOwner = sender === CFG.ownerOpenId;

  // 1) CHỦ trong nhóm điều khiển (hoặc tự học nhóm) → Claude TOÀN QUYỀN
  if (isOwner && (!CFG.controlChatId || chat === CFG.controlChatId)) {
    if (!CFG.controlChatId) { CFG.controlChatId = chat; log("🔒 Đã khoá nhóm điều khiển:", chat); }
    if (mt === "audio") { log("⟶ voice:", id); return enqueue({ kind: "voice", messageId: id }); }
    if (mt === "image") {
      // Caption = text kèm ảnh (nếu có), lấy từ quote/mentions hoặc để trống
      const caption = extractText(ev) || "";
      log("⟶ ảnh:", id, caption ? `| caption: ${caption.slice(0,60)}` : "");
      return enqueue({ kind: "image", messageId: id, caption });
    }
    const text = extractText(ev);
    if (!text) return;
    log("⟶ lệnh:", text.slice(0, 120));
    return enqueue({ kind: "text", text, messageId: id });
  }

  // 2) KHÁCH external (chat 1-1, KHÔNG phải chủ) → Claude-CHĂM-SÓC bị nhốt, nháp→duyệt
  if (CFG.careMode && !isOwner && chatType === "p2p" && mt === "text") {
    const text = extractText(ev);
    if (!text) return;
    log("⟶ khách:", String(sender).slice(0, 12), "|", text.slice(0, 80));
    return enqueue({ kind: "customer", customerOpenId: sender, customerMsgId: id, chat, text });
  }
  // còn lại → bỏ qua
}

// ── Nghe Lark IM: spawn `lark-cli event consume`, tự khởi động lại ────────────
function startConsumer() {
  const args = ["event", "consume", "im.message.receive_v1", "--as", "bot"];
  log("▶ khởi động listener:", CFG.larkCli, args.join(" "));
  const child = spawn(CFG.larkCli, args, {
    cwd: CFG.brainRoot,
    shell: isWin,
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"], // GIỮ stdin mở để consume không tự thoát
  });

  const rl = readline.createInterface({ input: child.stdout });
  rl.on("line", (line) => {
    line = line.trim();
    if (!line || line[0] !== "{") return;
    let ev;
    try { ev = JSON.parse(line); } catch { return; }
    try { onEvent(ev); } catch (e) { log("✖ onEvent:", e.message); }
  });

  child.stderr.on("data", (d) => {
    const s = d.toString();
    if (s.includes("ready")) log("✅ listener sẵn sàng (đã subscribe IM).");
    else if (s.trim()) log("listener:", s.trim().slice(0, 160));
  });

  child.on("close", (code) => {
    log(`⚠ listener thoát (mã ${code}). Khởi động lại sau 5s…`);
    setTimeout(startConsumer, 5000);
  });
  child.on("error", (e) => log("✖ listener lỗi:", e.message));
}

// ── Khởi động ────────────────────────────────────────────────────────────────
log("══════════ Lark ↔ Claude Bridge ══════════");
log("owner:", CFG.ownerOpenId);
log("nhóm :", CFG.controlChatId || "(tự học từ tin đầu tiên)");
log("model:", CFG.model, "| quyền:", CFG.permissionMode, "| DRY_RUN:", CFG.dryRun);
log("brain:", CFG.brainRoot);
log("voice:", CFG.voiceReply ? `BẬT (whisper ${CFG.whisperModel}, VBee TTS)` : "tắt");
log("chăm khách:", CFG.careMode ? `BẬT (nháp→duyệt, model ${CFG.careModel}, sandbox ${CARE_DIR})` : "tắt");
loadMem();        // khôi phục bối cảnh từ nhớ đệm (nếu có)
// ── PID + heartbeat cho watchdog tự khởi động lại nếu bridge chết/treo ────────
const PID_FILE = path.join(__dirname, "bridge.pid");
try { fs.writeFileSync(PID_FILE, String(process.pid)); } catch {}
const HB_FILE = path.join(__dirname, "bridge.heartbeat");
const updateHB = () => { try { fs.writeFileSync(HB_FILE, now()); } catch {} };
updateHB();
setInterval(updateHB, 30000).unref(); // .unref() không giữ process sống chỉ vì timer
if (CFG.voiceReply) startWhisper();  // nạp model STT thường trú
startConsumer();
// Không gửi tin "đã bật" cho khỏi rối nhóm — chỉ log ra console. Anh /ping để kiểm tra.
log("✅ Bridge sẵn sàng. Mỗi yêu cầu (text/voice) sẽ được trả lời GẮN vào tin của anh, từ 1 bot.");

const cleanup = () => { try { fs.unlinkSync(PID_FILE); } catch {} log("Tắt bridge."); process.exit(0); };
process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
