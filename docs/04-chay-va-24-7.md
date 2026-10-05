# 04 — Bật NGHÉ + chạy 24/7 (tuỳ chọn)

## Bật thủ công
```powershell
cd scripts
powershell -ExecutionPolicy Bypass -File start.ps1
```
Chờ tới khi thấy:
```
✅ Bridge sẵn sàng.
✅ whisper STT sẵn sàng.
```
(lần đầu Whisper tải model — `small` ~vài chục giây, `medium` ~1–2 phút). Rồi vào nhóm điều khiển,
bấm **micro** nói 1 câu → nghe NGHÉ trả lời. **Lệnh nhanh:** `/ping` · `/voice on|off` · `/help`.

## Tạo shortcut Desktop (double-click cho tiện)
> **QUAN TRỌNG:** shortcut phải trỏ tới `start.ps1` bằng **đường dẫn NỘI BỘ** (ổ C:...).
> Trỏ tới đường mạng UNC (`\\...`) sẽ bị Windows chặn ngầm khi double-click.
```powershell
$ps1 = "C:\<đường-dẫn-repo>\scripts\start.ps1"    # sửa cho đúng máy
$lnk = "$([Environment]::GetFolderPath('Desktop'))\NGHE.lnk"
$w = New-Object -ComObject WScript.Shell
$s = $w.CreateShortcut($lnk)
$s.TargetPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$s.Arguments  = "-ExecutionPolicy Bypass -NoProfile -File `"$ps1`""
$s.WorkingDirectory = (Split-Path $ps1)
$s.IconLocation = "shell32.dll,138"
$s.Save()
```

## Chạy ngầm 24/7 (Windows Scheduled Task + watchdog)
`watchdog.mjs` mỗi 3 phút kiểm bridge còn sống + tim còn đập (`bridge.heartbeat`), chết/treo thì tự bật lại.
Mở **PowerShell Admin**, sửa `$dir` cho đúng thư mục `scripts/`:
```powershell
$dir  = "C:\<đường-dẫn-repo>\scripts"
$node = (Get-Command node).Source
$act  = New-ScheduledTaskAction -Execute $node -Argument "`"$dir\watchdog.mjs`"" -WorkingDirectory $dir
$trg  = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 3)
$prin = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType S4U -RunLevel Highest
Register-ScheduledTask -TaskName "NGHE-Watchdog" -Action $act -Trigger $trg -Principal $prin -Force
```
> Muốn watchdog **gửi cảnh báo về Lark** khi tự khởi động lại: điền `LARK_WEBHOOK` (custom bot của nhóm) vào `.env`.
> `bypassPermissions` chạy nền liên tục = NGHÉ tự thực thi lệnh máy không giám sát — cân nhắc kỹ trước khi bật 24/7.
