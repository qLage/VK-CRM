@echo off
title CRM Dev — Backend + Frontend
color 0A

echo ============================================
echo   CRM Local Development
echo ============================================
echo.

:: Check node
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js not found! Install from https://nodejs.org
    pause
    exit /b 1
)

:: Copy .env.development -> .env for root (backend reads from project root .env)
echo [1/4] Setting up environment...
copy /Y "%~dp0.env.development" "%~dp0backend\.env" >nul 2>nul

:: Install dependencies if needed
if not exist "%~dp0node_modules" (
    echo [2/4] Installing frontend dependencies...
    cd /d "%~dp0"
    call npm install
) else (
    echo [2/4] Frontend deps OK
)

if not exist "%~dp0backend\node_modules" (
    echo [3/4] Installing backend dependencies...
    cd /d "%~dp0backend"
    call npm install
    cd /d "%~dp0"
) else (
    echo [3/4] Backend deps OK
)

echo [4/4] Starting servers...
echo.
echo   Frontend: http://localhost:8080
echo   Backend:  http://localhost:5000
echo   API:      http://localhost:5000/api
echo.
echo   Press Ctrl+C in either window to stop.
echo ============================================
echo.

:: Build backend first to ensure latest code
@echo [BUILD] Building backend...
cd /d "%~dp0backend"
call npm run build
cd /d "%~dp0"

:: Start backend in new window
start "CRM Backend" cmd /k "cd /d "%~dp0backend" && node dist/server.js"

:: Start frontend in this window
cd /d "%~dp0"
call npx vite --host 0.0.0.0 --port 8080
