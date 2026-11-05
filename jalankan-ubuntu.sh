#!/usr/bin/env bash
# ==============================================================================
# 1-CLICK RUNNER / RESTART — PASTI MURAHNYA (https://pastimurahnya.my.id)
# Menjalankan atau me-restart aplikasi secara permanen di background dengan PM2
# Cara pakai: bash jalankan-ubuntu.sh
# ==============================================================================

set -e

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"

echo "Menyalakan PostgreSQL & menyinkronkan database..."
systemctl start postgresql 2>/dev/null || service postgresql start 2>/dev/null || true
node scripts/start-all.mjs --sync-only || true

if [ ! -f "$APP_DIR/apps/api/dist/main.js" ] || [ ! -f "$APP_DIR/apps/web/.next/BUILD_ID" ]; then
  echo "Build belum tersedia, menjalankan npm run build..."
  npm run build
fi

echo "Menjalankan / me-restart Pasti Murahnya di background via PM2..."
pm2 startOrRestart ecosystem.config.cjs
pm2 save

systemctl reload nginx 2>/dev/null || true

echo "✓ Aplikasi berjalan 24/7 di background! Gunakan 'pm2 status' atau 'pm2 logs' untuk memantau."

