@echo off
rem TODO: mirror the Claude Code hook bridge after Windows hook behavior is testable.
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0helm.ps1" %*
exit /b %errorlevel%
