# start.ps1 -- Bat NGHE (tro ly giong noi Lark <-> Claude Code).
#
# GIU FILE NAY THUAN ASCII (khong dau tieng Viet, khong ky tu dac biet).
# Windows PowerShell 5.1 doc .ps1 theo bang ma ANSI, khong phai UTF-8 -> bo dau
# tieng Viet vao day se vo cu phap va cua so "tat phut".
#
# Dung: bam phai > Run with PowerShell  HOAC  double-click shortcut tro toi file nay.

$ErrorActionPreference = "Continue"
$here = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }

function Pause-Then-Exit($code) {
  Write-Host ""
  try { Read-Host "Nhan Enter de dong cua so" | Out-Null } catch {}
  exit $code
}

# Gop PATH de thay node / lark-cli / claude (chung thuong khong nam san tren PATH)
$paths = @(
  [Environment]::GetEnvironmentVariable("Path","Machine"),
  [Environment]::GetEnvironmentVariable("Path","User"),
  "C:\Program Files\nodejs",
  (Join-Path $env:APPDATA "npm")
) | Where-Object { $_ }
$env:Path = ($paths -join ";")

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "[X] Khong tim thay 'node'. Cai Node.js >= 18 roi thu lai." -ForegroundColor Red
  Pause-Then-Exit 1
}

Set-Location -Path $here
if (-not (Test-Path ".env")) {
  Write-Host "[X] Chua co file .env. Chay:  powershell -File install.ps1" -ForegroundColor Red
  Write-Host "    (hoac copy .env.example -> .env roi dien cac dong bat buoc)." -ForegroundColor Red
  Pause-Then-Exit 1
}

Write-Host "[*] Dang bat NGHE (Lark <-> Claude)... (Ctrl+C de dung)" -ForegroundColor Cyan
Write-Host "    Thu muc lam viec: $((Get-Location).Path)" -ForegroundColor DarkGray
node "lark-voice-bridge.mjs"

Write-Host ""
Write-Host "[!] Bridge da dung (node thoat)." -ForegroundColor Yellow
Pause-Then-Exit 0
