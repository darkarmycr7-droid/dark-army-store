@echo off
title Dark-Army Store Launcher
echo ============================================================
echo   Starting Dark-Army Store...
echo ============================================================
echo.

REM Start backend (API + database) in its own window
start "Dark-Army BACKEND (port 4000)" cmd /k "cd /d %~dp0backend && npm run dev"

REM Start frontend (storefront + admin) in its own window
start "Dark-Army FRONTEND (port 3200)" cmd /k "cd /d %~dp0frontend && npm run dev"

echo Two server windows opened. Waiting for them to warm up...
timeout /t 10 /nobreak >nul

REM Open the store in the default browser
start http://localhost:3200

echo.
echo ------------------------------------------------------------
echo   Store:  http://localhost:3200
echo   Admin:  http://localhost:3200/admin/login
echo           (admin@darkarmy.store / admin123)
echo.
echo   Share on your Wi-Fi: http://%COMPUTERNAME%:3200
echo   (or run  ipconfig  to get your 192.168.x.x address)
echo ------------------------------------------------------------
echo.
echo   To STOP the servers: close the two server windows,
echo   or run  stop.bat
echo.
pause
