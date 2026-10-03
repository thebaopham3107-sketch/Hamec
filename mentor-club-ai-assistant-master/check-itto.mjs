#!/usr/bin/env node
/**
 * check-itto.mjs — soát HỢP ĐỒNG itto.yaml của gói app cục bộ. ZERO-DEPENDENCY.
 * Kiểm: đủ 4 mục I-T-T-O · có secrets · có tool.install/check/start · và MỌI script
 * (.mjs/.py/.ps1) khai trong itto CÓ TỒN TẠI (bắt lỗi bàn giao thiếu file).
 * Exit ≠ 0 nếu còn lỗi ⇒ cổng chốt gói trước khi bàn giao.
 *
 * Chạy: node check-itto.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ITTO = path.join(HERE, "itto.yaml");
const ok = (b) => (b ? "✔" : "✘");
let fail = 0;

let text;
try { text = fs.readFileSync(ITTO, "utf8"); }
catch { console.error(`✘ không đọc được itto.yaml tại ${ITTO}`); process.exit(1); }

const scalar = (key) => {
  const m = text.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  return m ? m[1].split(" #")[0].trim() : null;
};
const listUnder = (key) => {
  const lines = text.split(/\r?\n/);
  const idx = lines.findIndex((l) => l.match(new RegExp(`^(\\s*)${key}:\\s*(#.*)?$`)));
  if (idx < 0) return [];
  const base = lines[idx].match(/^(\s*)/)[1].length;
  const out = [];
  for (let i = idx + 1; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim()) continue;
    const ind = l.match(/^(\s*)/)[1].length;
    if (ind <= base) break;
    const m = l.match(/^\s*-\s*(.+)$/);
    if (m) out.push(m[1].split(" #")[0].trim());
  }
  return out;
};

console.log("== check-itto (local-app) ==\n");

const pkg = scalar("package"), ver = scalar("version"), kind = scalar("kind");
console.log(`${ok(!!pkg && !!ver)} gói: ${pkg || "?"} v${ver || "?"} (kind: ${kind || "?"})`);
if (!pkg || !ver) fail++;

// 4 mục I-T-T-O
const secs = ["input", "tech", "tool", "output"];
const miss = secs.filter((s) => !new RegExp(`^${s}:`, "m").test(text));
console.log(`${ok(miss.length === 0)} 4 mục I-T-T-O: ${miss.length ? "THIẾU " + miss.join(", ") : "đủ"}`);
if (miss.length) fail++;

// Có input người dùng phải chuẩn bị (secrets)
const secrets = listUnder("secrets");
console.log(`${ok(secrets.length > 0)} secrets/input bí mật (${secrets.length})`);
if (!secrets.length) fail++;

// App cục bộ: thay cho "event_type" → phải khai đủ install / check / start
for (const k of ["install", "check", "start"]) {
  const has = new RegExp(`^\\s*${k}:`, "m").test(text);
  console.log(`${ok(has)} tool.${k} đã khai`);
  if (!has) fail++;
}

// Mọi script khai trong itto (.mjs/.py/.ps1) phải tồn tại
const paths = [...new Set(
  [...text.matchAll(/((?:[\w.-]+\/)+[\w.-]+\.(?:mjs|py|ps1))/g)].map((m) => m[1])
)];
console.log(`\nKiểm script khai trong itto (${paths.length}):`);
for (const rel of paths) {
  const exists = fs.existsSync(path.join(HERE, rel));
  console.log(`  ${ok(exists)} ${rel}`);
  if (!exists) fail++;
}

console.log(fail
  ? `\n✘ Còn ${fail} lỗi trong hợp đồng — sửa itto.yaml / bổ sung file.`
  : `\n✔ itto.yaml hợp lệ, mọi script có mặt.`);
process.exit(fail ? 1 : 0);
