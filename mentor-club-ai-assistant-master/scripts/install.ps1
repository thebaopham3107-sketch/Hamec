# install.ps1 -- Cai dat mot lan cho TOM Voice (THUAN ASCII).
# Tao moi truong Python rieng (.venv) + cai faster-whisper + edge-tts, tu dien
# PYTHON_BIN vao .env, va kiem tra cac cong cu nen. Chay 1 lan tren may moi.
#
# Dung: bam phai > Run with PowerShell.

$ErrorActionPreference = "Stop"
$here = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
Set-Location $here

function Say($m, $c = "Gray") { Write-Host $m -ForegroundColor $c }
function Pause-End($code) { Write-Host ""; try { Read-Host "Nhan Enter de dong" | Out-Null } catch {}; exit $code }

Say "== TOM Voice -- cai dat ==" "Cyan"

# ── (1) Gop PATH ──
$env:Path = ((@([Environment]::GetEnvironmentVariable("Path","Machine"),[Environment]::GetEnvironmentVariable("Path","User"),"C:\Program Files\nodejs",(Join-Path $env:APPDATA "npm")) | Where-Object { $_ }) -join ";")

# ── (2) Kiem tra cong cu nen ──
$miss = @()
foreach ($t in @("node","ffmpeg","lark-cli","claude")) {
  if (Get-Command $t -ErrorAction SilentlyContinue) { Say "  [OK] $t" "Green" } else { Say "  [THIEU] $t" "Yellow"; $miss += $t }
}
if ($miss -contains "node")   { Say "[X] Bat buoc co Node.js >= 18 (nodejs.org)." "Red"; Pause-End 1 }
if ($miss -contains "ffmpeg") { Say "[!] Thieu ffmpeg -> TTS khong chuyen duoc audio. Cai: winget install Gyan.FFmpeg" "Yellow" }
if ($miss -contains "lark-cli") { Say "[!] Thieu lark-cli. Cai: npm i -g @larksuite/cli   roi dang nhap --as bot" "Yellow" }
if ($miss -contains "claude")   { Say "[!] Thieu claude (Claude Code CLI)." "Yellow" }

# ── (3) Tim trinh tao Python venv: uu tien uv, roi py -3, roi python ──
$venv = Join-Path $here ".venv"
$vpy  = Join-Path $venv "Scripts\python.exe"
if (-not (Test-Path $vpy)) {
  Say "[*] Tao moi truong Python (.venv)..." "Cyan"
  $made = $false
  if (Get-Command uv -ErrorAction SilentlyContinue) {
    uv venv --python 3.12 "$venv"; if (Test-Path $vpy) { $made = $true }
  }
  if (-not $made -and (Get-Command py -ErrorAction SilentlyContinue)) {
    py -3 -m venv "$venv"; if (Test-Path $vpy) { $made = $true }
  }
  if (-not $made -and (Get-Command python -ErrorAction SilentlyContinue)) {
    python -m venv "$venv"; if (Test-Path $vpy) { $made = $true }
  }
  if (-not $made) { Say "[X] Khong tao duoc venv. Cai Python 3.10-3.12 (python.org, tick Add to PATH) hoac 'uv'." "Red"; Pause-End 1 }
}
Say "  [OK] venv: $vpy" "Green"

# ── (4) Cai goi Python ──
Say "[*] Cai faster-whisper + edge-tts + python-dotenv..." "Cyan"
if (Get-Command uv -ErrorAction SilentlyContinue) {
  uv pip install --python "$vpy" -r (Join-Path $here "requirements.txt")
} else {
  & $vpy -m pip install --upgrade pip
  & $vpy -m pip install -r (Join-Path $here "requirements.txt")
}

# ── (5) Neu co GPU NVIDIA -> cai kem cuBLAS/cuDNN (khong co se loi "Nghe khong ro") ──
if (Get-Command nvidia-smi -ErrorAction SilentlyContinue) {
  Say "[*] Phat hien GPU NVIDIA -> cai cuBLAS + cuDNN cho Whisper GPU..." "Cyan"
  if (Get-Command uv -ErrorAction SilentlyContinue) {
    uv pip install --python "$vpy" nvidia-cublas-cu12 nvidia-cudnn-cu12
  } else {
    & $vpy -m pip install nvidia-cublas-cu12 nvidia-cudnn-cu12
  }
} else {
  Say "  [i] Khong co GPU NVIDIA -> Whisper chay CPU (dat WHISPER_MODEL=small trong .env cho nhanh)." "DarkGray"
}

# ── (6) Tao .env tu .env.example (neu chua co) + dien PYTHON_BIN tuyet doi ──
$envFile = Join-Path $here ".env"
if (-not (Test-Path $envFile)) { Copy-Item (Join-Path $here ".env.example") $envFile; Say "  [OK] Tao .env tu .env.example" "Green" }
$lines = Get-Content $envFile
if ($lines -match "^PYTHON_BIN=") {
  $lines = $lines | ForEach-Object { if ($_ -match "^PYTHON_BIN=") { "PYTHON_BIN=$vpy" } else { $_ } }
} else {
  $lines += "PYTHON_BIN=$vpy"
}
Set-Content -Path $envFile -Value $lines -Encoding UTF8
Say "  [OK] Da dien PYTHON_BIN=$vpy vao .env" "Green"

Write-Host ""
Say "== XONG CAI DAT ==" "Green"
Say "Buoc tiep theo:" "Cyan"
Say "  1) Dang nhap lark-cli --as bot (neu chua) + them bot vao NHOM DIEU KHIEN." "Gray"
Say "  2) node whoami.mjs  -> lay OWNER_OPEN_ID + CONTROL_CHAT_ID -> dien vao .env" "Gray"
Say "  3) node check-setup.mjs   (cong chot XANH)" "Gray"
Say "  4) powershell -File start.ps1   (bat len)" "Gray"
Pause-End 0
