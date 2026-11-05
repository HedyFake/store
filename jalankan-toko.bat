@echo off
SET "NODE_DIR=C:\Users\wibyj\tools\node-v22.11.0-win-x64"
SET "PATH=%NODE_DIR%;%PATH%"
cd /d "%~dp0"
echo ===================================================
echo   Menjalankan Toko Dropship: Pasti Murahnya
echo   Storefront : http://localhost:3000
echo   Admin      : http://localhost:3000/admin/login
echo   API Health : http://localhost:4000/api/health
echo   (Tekan Ctrl + C untuk mematikan semua server)
echo ===================================================
"%NODE_DIR%\node.exe" "%~dp0scripts\start-all.mjs"
