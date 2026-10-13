@echo off
setlocal EnableExtensions
title WhatsApp Meal Bot - Deploy and Start
cd /d "%~dp0"
if errorlevel 1 (
    echo.
    echo   ERROR: Could not open the bot folder. Try moving it somewhere simple
    echo   like C:\whatsapp-meal-bot and running this file again.
    echo.
    pause
    exit /b 1
)

echo.
echo  ==========================================================
echo     WhatsApp Meal Bot - Windows Launcher
echo  ==========================================================
echo.
echo   Double-click this file each time you want to run the bot.
echo   The first launch installs everything and shows a QR code.
echo.

REM ---------------------------------------------------------------------
REM  1. Node.js
REM ---------------------------------------------------------------------
where node >nul 2>&1
if errorlevel 1 goto :no_node

for /f %%v in ('node -p "process.versions.node.split('.')[0]" 2^>nul') do set "NODE_MAJOR=%%v"
if not defined NODE_MAJOR goto :node_broken
if %NODE_MAJOR% LSS 18 goto :node_old
echo   [1/4]  Node.js v%NODE_MAJOR% detected. OK.
goto :deps

:no_node
echo   [1/4]  Node.js not found. Trying to install it with winget...
where winget >nul 2>&1
if errorlevel 1 goto :node_manual

winget install --id OpenJS.NodeJS.LTS -e --source winget ^
    --accept-source-agreements --accept-package-agreements
if errorlevel 1 goto :node_manual

REM winget does not refresh PATH inside the already-running cmd session.
set "PATH=%PATH%;%ProgramFiles%\nodejs;%APPDATA%\npm"
where node >nul 2>&1
if errorlevel 1 goto :node_manual
echo   [1/4]  Node.js installed.
goto :deps

:node_manual
echo.
echo   ERROR: Node.js 18 or newer is required.
echo.
echo   This launcher can install it automatically with winget, but winget is
echo   not available on this machine. Install Node.js manually instead:
echo.
echo       https://nodejs.org/  ^(download the LTS version^)
echo.
echo   Then double-click this file again.
echo.
start "" "https://nodejs.org/en/download"
goto :fail

:node_old
echo.
echo   ERROR: Node.js %NODE_MAJOR% is too old. This bot needs Node.js 18+.
echo.
echo   Install the LTS release from https://nodejs.org/ and run this again.
echo.
start "" "https://nodejs.org/en/download"
goto :fail

:node_broken
echo.
echo   ERROR: Node.js is installed but not responding correctly.
echo   Close any open terminals, reopen one, and try again.
echo.
goto :fail

REM ---------------------------------------------------------------------
REM  2. Dependencies
REM ---------------------------------------------------------------------
:npm_fail
echo.
echo   ERROR: npm install failed. Scroll up to see the reason.
echo   Common causes: no internet connection, or antivirus blocked node.
echo.
goto :fail

:deps
echo.
echo   [2/4]  Installing dependencies...
echo          (first run takes 1-2 minutes, later runs take a few seconds)

REM Skip Puppeteer's bundled Chromium download. The bot drives your real
REM Chrome install, so the ~150MB Chromium download is wasted time and disk.
set "PUPPETEER_SKIP_DOWNLOAD=1"

call npm install --no-fund --no-audit
if errorlevel 1 goto :npm_fail
echo          Dependencies installed.

REM ---------------------------------------------------------------------
REM  3. Configuration
REM ---------------------------------------------------------------------
echo.
if exist ".env" goto :env_ok
copy /Y ".env.example" ".env" >nul
if errorlevel 1 goto :env_fail
echo   [3/4]  Created .env from .env.example
goto :config_ok

:env_ok
echo   [3/4]  .env already exists, leaving it untouched.
goto :config_ok

:env_fail
echo.
echo   ERROR: Could not create .env from .env.example.
echo   Make sure this folder is writable, then try again.
echo.
goto :fail

:config_ok

REM ---------------------------------------------------------------------
REM  4. Run
REM ---------------------------------------------------------------------
echo.
echo   [4/4]  Starting the bot.
echo.
echo  --------------------------------------------------------------
echo   Keep this window OPEN while the bot is running.
echo   Press Ctrl+C to stop it.
echo  --------------------------------------------------------------
echo.

call npm start
set "EXITCODE=%ERRORLEVEL%"

echo.
if "%EXITCODE%"=="0" (
    echo   Bot stopped cleanly.
) else (
    echo   Bot exited with code %EXITCODE%. See the messages above.
)
echo.
pause
exit /b %EXITCODE%

:fail
echo.
pause
exit /b 1