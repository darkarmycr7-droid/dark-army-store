@echo off
title Dark-Army Store - Stop
echo Stopping Dark-Army Store servers (ports 3200 and 4000)...

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3200" ^| findstr LISTENING') do taskkill /PID %%a /F >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":4000" ^| findstr LISTENING') do taskkill /PID %%a /F >nul 2>&1

echo Done. You can close the server windows if any remain.
pause
