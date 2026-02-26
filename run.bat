@echo off
setlocal
cd /d "%~dp0"

set PORT=5173
set "PKG_CMD="

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js is not installed. Install Node.js 20+ first.
  pause
  exit /b 1
)

where yarn.cmd >nul 2>&1
if not errorlevel 1 (
  set "PKG_CMD=yarn.cmd"
) else (
  where corepack.cmd >nul 2>&1
  if not errorlevel 1 (
    set "PKG_CMD=corepack.cmd yarn"
  ) else (
    echo Yarn was not found and Corepack is unavailable.
    echo Install Yarn or enable Corepack, then re-run this script.
    pause
    exit /b 1
  )
)

netstat -an | findstr ":%PORT% " | findstr "LISTENING" >nul 2>&1
if %errorlevel%==0 (
  echo Port %PORT% is already in use.
  echo Please close the other process or change PORT in this file.
  pause
  exit /b 1
)

if not exist ".yarn\install-state.gz" (
  echo Installing dependencies...
  call %PKG_CMD% install
  if errorlevel 1 (
    echo Failed to install dependencies.
    pause
    exit /b 1
  )
)

start "" "http://localhost:%PORT%"
call %PKG_CMD% dev --host 0.0.0.0 --port %PORT%

endlocal
