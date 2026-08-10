@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

if not defined PORT set "PORT=8080"
set "URL=http://127.0.0.1:%PORT%/"

where node >nul 2>&1 || (
  echo [ERROR] Khong tim thay Node.js trong PATH.
  echo Cai Node.js LTS roi chay lai file nay.
  pause
  exit /b 1
)

where npm >nul 2>&1 || (
  echo [ERROR] Khong tim thay npm trong PATH.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo [ERROR] Chua co node_modules.
  echo Chay: npm install
  pause
  exit /b 1
)

call :probe_server
if not errorlevel 1 (
  echo CRM dang chay tai %URL%
  start "" "%URL%"
  exit /b 0
)

set "LISTEN_PID="
for /f "tokens=5" %%p in ('netstat -ano -p tcp 2^>nul ^| findstr /R /C:":%PORT% .*LISTENING"') do (
  set "LISTEN_PID=%%p"
)

if defined LISTEN_PID (
  echo [ERROR] Cong %PORT% dang bi PID !LISTEN_PID! chiem dung, nhung khong phai Innomat CRM.
  echo Kiem tra tien trinh: tasklist /FI "PID eq !LISTEN_PID!"
  echo Script se khong tu dong taskkill de tranh dong nham ung dung khac.
  pause
  exit /b 1
)

echo Dang khoi dong CRM tai %URL% ...
start "CRM Dev Server" /min cmd /k "set CI=true && title CRM Dev Server && cd /d ""%~dp0"" && node node_modules\vite\bin\vite.js dev --host 0.0.0.0 --port %PORT% --strictPort"

for /l %%i in (1,1,60) do (
  call :probe_server
  if not errorlevel 1 (
    echo CRM da san sang.
    start "" "%URL%"
    exit /b 0
  )
  timeout /t 1 /nobreak >nul
)

echo [ERROR] CRM khong phan hoi sau 60 giay.
echo Xem cua so "CRM Dev Server" de kiem tra log.
pause
exit /b 1

:probe_server
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -Uri '%URL%' -TimeoutSec 2; if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500 -and $r.Content -match 'Innomat CRM') { exit 0 } } catch { }; exit 1" >nul 2>&1
exit /b %errorlevel%
