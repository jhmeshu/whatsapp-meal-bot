@echo off
setlocal EnableExtensions
title WhatsApp Meal Bot - Reset Session
cd /d "%~dp0"

echo.
echo  ==========================================================
echo    WhatsApp Meal Bot - Reset Linked Session
echo  ==========================================================
echo.
echo   This deletes the saved WhatsApp login so the bot starts fresh.
echo   The next launch will show a new QR code to scan.
echo.
echo   Only do this if:
echo     - the bot was logged out remotely
echo     - you are switching to a different phone number
echo     - the session is corrupted
echo.
echo   This does NOT delete your chat history or any replies already sent.
echo.

set /p "ANSWER=   Type YES to continue: "
if /i not "%ANSWER%"=="YES" (
    echo.
    echo   Cancelled. Nothing was changed.
    echo.
    pause
    exit /b 0
)

where node >nul 2>&1
if errorlevel 1 (
    echo.
    echo   ERROR: Node.js is required. Run START-HERE.bat to install it first.
    echo.
    pause
    exit /b 1
)

echo.
node src/reset-session.js
set "EXITCODE=%ERRORLEVEL%"
echo.
pause
exit /b %EXITCODE%
