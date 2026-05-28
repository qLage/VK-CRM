@echo off
title CRM — Stop Dev Servers
echo Stopping CRM dev servers...

:: Kill node processes on port 5000 (backend) and 8080 (frontend)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5000 ^| findstr LISTENING') do taskkill /PID %%a /F >nul 2>nul
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8080 ^| findstr LISTENING') do taskkill /PID %%a /F >nul 2>nul

echo Done.
timeout /t 2 >nul
