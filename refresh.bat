@echo off
title Dark-Army Store - Refresh Frontend
echo ============================================================
echo   Refreshing the storefront (clears the Next.js cache)
echo ============================================================
echo.
echo   Use this whenever the page shows a webpack error like:
echo     "Cannot read properties of undefined (reading 'call')"
echo     or  "X is not a function"  right after an update.
echo   Your products, orders and images are NOT affected.
echo.

REM 1) Stop whatever is running on the frontend port (3200)
echo Stopping the frontend (port 3200)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3200" ^| findstr LISTENING') do taskkill /PID %%a /F >nul 2>&1

REM 2) Delete the stale build cache
echo Clearing the .next cache...
if exist "%~dp0frontend\.next" rmdir /s /q "%~dp0frontend\.next"

REM 3) Start the frontend again in its own window
echo Starting the frontend again...
start "Dark-Army FRONTEND (port 3200)" cmd /k "cd /d %~dp0frontend && npm run dev"

echo Waiting for it to warm up...
timeout /t 12 /nobreak >nul

REM 4) Reopen the store
start http://localhost:3200

echo.
echo ------------------------------------------------------------
echo   Done. The store should load cleanly now.
echo   Store:  http://localhost:3200
echo   Admin:  http://localhost:3200/admin/login
echo.
echo   Note: this only restarts the frontend. If the API (port
echo   4000) is not running, use start.bat instead.
echo ------------------------------------------------------------
echo.
pause
