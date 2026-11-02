@echo off
REM One-off database backup. Schedule this with Windows Task Scheduler for
REM automated daily backups, or set BACKUP_INTERVAL_HOURS in backend\.env to
REM have the running server back up on a timer.
cd /d "%~dp0backend"
call npm run backup
