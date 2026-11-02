@echo off
title Dark-Army Store - Public Internet Tunnel
echo ============================================================
echo   SHARE OVER THE INTERNET (Cloudflare Tunnel)
echo ============================================================
echo.
echo   SECURITY NOTICE - please read:
echo   * This makes your store reachable by ANYONE with the link.
echo   * Default admin is admin@darkarmy.store / admin123 --
echo     CHANGE the admin password before sharing the link.
echo   * The store must already be running (run start.bat first).
echo   * The https link below is TEMPORARY and changes every run.
echo.
echo ------------------------------------------------------------
echo   Look for a line ending in  .trycloudflare.com  below --
echo   that whole https://... address is the link to share.
echo   Press Ctrl+C in this window to stop sharing.
echo ------------------------------------------------------------
echo.

cloudflared tunnel --url http://localhost:3200

echo.
echo Tunnel closed.
pause
