@echo off
SET "LOCAL_NODE_DIR=C:\Users\wibyj\tools\node-v22.11.0-win-x64"
IF EXIST "%LOCAL_NODE_DIR%\node.exe" (
  SET "PATH=%LOCAL_NODE_DIR%;%PATH%"
  SET "NODE_BIN=%LOCAL_NODE_DIR%\node.exe"
) ELSE (
  SET "NODE_BIN=node"
)
cd /d "%~dp0"
echo ===================================================
echo   Menjalankan Toko Dropship: Pasti Murahnya
echo   Storefront : http://localhost:3000
echo   Admin      : http://localhost:3000/admin/login
echo   API Health : http://localhost:4000/api/health
echo   (Tekan Ctrl + C untuk mematikan semua server)
echo ===================================================
"%NODE_BIN%" "%~dp0scripts\start-all.mjs"
