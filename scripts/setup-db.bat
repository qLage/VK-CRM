@echo off
title CRM — Setup PostgreSQL for Dev
color 0B

echo ============================================
echo   CRM — Initial PostgreSQL Setup
echo ============================================
echo.
echo This script creates the DB user and database
echo for local development.
echo.
echo Make sure PostgreSQL is installed and running.
echo You will need the 'postgres' superuser password.
echo ============================================
echo.

:: Find psql
where psql >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [INFO] psql not in PATH, checking common locations...
    if exist "C:\Program Files\PostgreSQL\17\bin\psql.exe" (
        set "PATH=%PATH%;C:\Program Files\PostgreSQL\17\bin"
    ) else if exist "C:\Program Files\PostgreSQL\16\bin\psql.exe" (
        set "PATH=%PATH%;C:\Program Files\PostgreSQL\16\bin"
    ) else (
        echo [ERROR] psql.exe not found!
        echo Install PostgreSQL from: https://www.postgresql.org/download/windows/
        pause
        exit /b 1
    )
)

echo Creating user 'crm_user'...
psql -h localhost -U postgres -c "CREATE USER crm_user WITH PASSWORD 'crm_dev_password' CREATEDB;"

echo Creating database 'crm'...
psql -h localhost -U postgres -c "CREATE DATABASE crm OWNER crm_user;"

echo.
echo ============================================
echo   Done! Now run:
echo     .\scripts\restore-db.ps1   (to load prod data)
echo     start-dev.bat              (to start CRM)
echo ============================================
pause
