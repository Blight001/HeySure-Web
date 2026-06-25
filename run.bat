@echo off
setlocal EnableExtensions EnableDelayedExpansion

rem One-click web launcher (HeySure-Web).
rem Works both inside the workspace (after init-env) and when developing web standalone.
rem When run from workspace, %~dp0.. points to the workspace root (where server/ may live).
set "ROOT_DIR=%~dp0.."
set "SERVER_DIR=%ROOT_DIR%\server"

if not defined SERVER_URL set "SERVER_URL=http://127.0.0.1:3000"

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found.
  echo [ERROR] Install Node.js 22 LTS or a newer LTS version.
  echo [ERROR] Download: https://nodejs.org/en/download
  start "" "https://nodejs.org/en/download"
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm was not found. Reinstall Node.js LTS and make sure npm is in PATH.
  echo [ERROR] Download: https://nodejs.org/en/download
  start "" "https://nodejs.org/en/download"
  exit /b 1
)

if not exist "node_modules" (
  echo [INFO] node_modules not found. Installing frontend dependencies...
  npm install
  if errorlevel 1 (
    echo [ERROR] Frontend dependency installation failed. Check network or npm config, then retry.
    exit /b 1
  )
)

rem Clear Vite's local cache so stale optimized chunks do not poison the next dev session.
if exist "node_modules\.vite" rmdir /s /q "node_modules\.vite"

rem vue-tsc -b may emit an ignored vite.config.js beside the TypeScript source.
rem Remove it so Vite never boots with a stale proxy configuration.
if exist "vite.config.js" del /q "vite.config.js"
if exist "vite.config.d.ts" del /q "vite.config.d.ts"

rem Force a fresh dependency prebundle on every launch to reduce 304 / dynamic import cache issues.
npm run dev -- --force
