@echo off
SET PATH=C:\Users\wibyj\tools\node-v22.11.0-win-x64;%PATH%
cd /d "%~dp0"
echo ===================================================
echo   Menjalankan Toko Dropship: Pasti Murahnya
echo   Storefront : http://localhost:3000
echo   Admin      : http://localhost:3000/admin/login
echo   API Health : http://localhost:4000/api/health
echo   (Tekan Ctrl + C untuk mematikan semua server)
echo ===================================================
node scripts/start-all.mjs

