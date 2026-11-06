#!/usr/bin/env bash
# ==============================================================================
# 1-CLICK INSTALLER & PRODUCTION RUNNER — PASTI MURAHNYA (https://pastimurahnya.my.id)
# Untuk Ubuntu Server 20.04 / 22.04 / 24.04 LTS
# Cara pakai: bash install-ubuntu.sh
# ==============================================================================

set -e

DOMAIN="pastimurahnya.my.id"
WWW_DOMAIN="www.pastimurahnya.my.id"
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"

echo "========================================================================"
echo "  INSTALASI OTOMATIS 1-KLIK: PASTI MURAHNYA (https://${DOMAIN})"
echo "  Direktori Project: ${APP_DIR}"
echo "========================================================================"

SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  SUDO="sudo"
fi

echo ""
echo "[1/8] Memperbarui paket sistem Ubuntu & menginstal dependensi sistem..."
export DEBIAN_FRONTEND=noninteractive
$SUDO apt-get update -y
$SUDO apt-get install -y curl git ca-certificates gnupg psmisc build-essential postgresql postgresql-contrib nginx certbot python3-certbot-nginx

echo ""
echo "[2/8] Memeriksa versi Node.js & PM2..."
NEED_NODE=0
if ! command -v node >/dev/null 2>&1; then
  NEED_NODE=1
else
  NODE_MAJOR=$(node -v | cut -d. -f1 | tr -d 'v')
  if [ "$NODE_MAJOR" -lt 20 ]; then
    NEED_NODE=1
  fi
fi

if [ "$NEED_NODE" -eq 1 ]; then
  echo "Menginstal Node.js 22.x LTS..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  $SUDO apt-get install -y nodejs
fi

echo "Node.js aktif: $(node -v) | NPM: $(npm -v)"

if ! command -v pm2 >/dev/null 2>&1; then
  echo "Menginstal PM2 Process Manager secara global..."
  $SUDO npm install -g pm2
fi

echo ""
echo "[3/8] Mengonfigurasi Database PostgreSQL (dropship_store)..."
$SUDO systemctl enable postgresql || true
$SUDO systemctl start postgresql || $SUDO service postgresql start

$SUDO su - postgres -c "psql -c \"ALTER USER postgres WITH PASSWORD 'postgres';\"" >/dev/null 2>&1 || true
DB_EXISTS=$($SUDO su - postgres -c "psql -tAc \"SELECT 1 FROM pg_database WHERE datname='dropship_store'\"" || echo "")
if [ "$DB_EXISTS" != "1" ]; then
  echo "Membuat database dropship_store..."
  $SUDO su - postgres -c "psql -c \"CREATE DATABASE dropship_store OWNER postgres;\""
else
  echo "Database dropship_store sudah tersedia."
fi

echo ""
echo "[4/8] Menyiapkan konfigurasi .env produksi untuk https://${DOMAIN}..."
if [ ! -f "$APP_DIR/.env" ]; then
  cat > "$APP_DIR/.env" <<EOF
NODE_ENV=production
APP_URL=https://${DOMAIN}
NEXT_PUBLIC_SITE_URL=https://${DOMAIN}
API_URL=http://127.0.0.1:4000
NEXT_PUBLIC_API_URL=https://${DOMAIN}
API_PORT=4000

# PostgreSQL System Service (Ubuntu Port 5432)
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/dropship_store?schema=public
REDIS_URL=redis://127.0.0.1:6379

# Secret minimal 32 karakter
AUTH_SECRET=prod_secret_958afac6fbe14940a0b9c3611da09843_pastimurahnya_2026
SESSION_TTL_HOURS=24
DEMO_MODE=false

# Penyimpanan privat lokal untuk bukti transfer & resi PDF
STORAGE_PROVIDER=local
STORAGE_LOCAL_DIR=
S3_ENDPOINT=
S3_REGION=
S3_BUCKET_PRIVATE=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_FORCE_PATH_STYLE=false

# Payment Gateway
PAYMENT_PROVIDER=disabled
MIDTRANS_SERVER_KEY=
MIDTRANS_IS_PRODUCTION=false
ENABLE_QRIS=false
ENABLE_VIRTUAL_ACCOUNT=false
VA_BANKS=bca,bni,bri

# Telegram Bot API
TELEGRAM_BOT_TOKEN=8790466466:AAFP6sS6m3xH3pF1K8_9v9T3vR5zG5w2k7M
TELEGRAM_CHAT_ID=6037868728
TELEGRAM_SEND_ENABLED=true
TELEGRAM_API_BASE=https://api.telegram.org

# Agregator Pengiriman RajaOngkir Komerce API v1
SHIPPING_PROVIDER=rajaongkir
RAJAONGKIR_API_KEY=mU9E9x2u83ee6dc0f4ef1a3b7lR7d9pA
RAJAONGKIR_BASE_URL=https://rajaongkir.komerce.id/api/v1

# Batas Unggahan
PAYMENT_PROOF_MAX_BYTES=5242880
SHIPPING_DOC_MAX_BYTES=10485760
PRODUCT_IMPORT_MAX_BYTES=2097152
PRODUCT_IMPORT_MAX_ROWS=500
JOB_WORKER_ENABLED=true

# Kredensial Admin Utama
SEED_ADMIN_EMAIL=wibyjoe12@gmail.com
SEED_ADMIN_PASSWORD=hedyfake23
EOF
  echo "File .env berhasil dibuat."
else
  # Pastikan DATABASE_URL di Ubuntu menggunakan port 5432 (System PostgreSQL) dan APP_URL memakai https://pastimurahnya.my.id
  sed -i 's|127.0.0.1:5433|127.0.0.1:5432|g' "$APP_DIR/.env" || true
  sed -i 's|localhost:5433|127.0.0.1:5432|g' "$APP_DIR/.env" || true
  sed -i "s|^APP_URL=.*|APP_URL=https://${DOMAIN}|g" "$APP_DIR/.env" || true
  echo "File .env sudah ada dan disesuaikan untuk Ubuntu Server (port 5432 & https://${DOMAIN})."
fi

echo ""
echo "[5/8] Memastikan package.json bersih & menginstal dependensi NPM..."
node -e '
const fs = require("fs");
for (const p of ["package.json", "packages/shared/package.json", "apps/api/package.json", "apps/web/package.json"]) {
  if (!fs.existsSync(p)) continue;
  const pkg = JSON.parse(fs.readFileSync(p, "utf8"));
  for (const sec of ["dependencies", "devDependencies"]) {
    if (!pkg[sec]) continue;
    if (pkg[sec]["zod"]) pkg[sec]["zod"] = "^3.23.8";
    if (pkg[sec]["next"]) pkg[sec]["next"] = "^15.1.0";
    if (pkg[sec]["@nestjs/common"]) pkg[sec]["@nestjs/common"] = "^10.4.7";
    if (pkg[sec]["@nestjs/core"]) pkg[sec]["@nestjs/core"] = "^10.4.7";
    if (pkg[sec]["@nestjs/platform-express"]) pkg[sec]["@nestjs/platform-express"] = "^10.4.7";
    if (pkg[sec]["@nestjs/testing"]) pkg[sec]["@nestjs/testing"] = "^10.4.7";
    if (pkg[sec]["vitest"]) pkg[sec]["vitest"] = "^2.1.4";
  }
  fs.writeFileSync(p, JSON.stringify(pkg, null, 2) + "\n");
}
'
npm install --no-audit --no-fund

echo ""
echo "[6/8] Sinkronisasi skema Prisma, Seed data awal & Build produksi..."
npx prisma generate
npx prisma db push --accept-data-loss
npm run db:seed || true
npm run build
node scripts/start-all.mjs --sync-only || true

echo ""
echo "[7/8] Menjalankan aplikasi secara permanen di background dengan PM2..."
fuser -k 3000/tcp >/dev/null 2>&1 || true
fuser -k 4000/tcp >/dev/null 2>&1 || true
pm2 delete pastimurahnya-api >/dev/null 2>&1 || true
pm2 delete pastimurahnya-web >/dev/null 2>&1 || true
pm2 delete pastimurahnya >/dev/null 2>&1 || true

pm2 start ecosystem.config.cjs
pm2 save
$SUDO env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u "$(whoami)" --hp "$HOME" >/dev/null 2>&1 || true

echo ""
echo "[8/8] Mengonfigurasi Nginx Reverse Proxy untuk ${DOMAIN} & ${WWW_DOMAIN}..."
NGINX_CONF="/etc/nginx/sites-available/${DOMAIN}"
$SUDO bash -c "cat > ${NGINX_CONF}" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} ${WWW_DOMAIN} _;

    client_max_body_size 35M;

    # Proxy API & Media langsung ke NestJS Backend (port 4000)
    location /api/ {
        proxy_pass http://127.0.0.1:4000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /media/ {
        proxy_pass http://127.0.0.1:4000/api/media/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Proxy seluruh halaman Storefront & Admin ke Next.js (port 3000)
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

$SUDO ln -sf "${NGINX_CONF}" "/etc/nginx/sites-enabled/${DOMAIN}"
$SUDO rm -f /etc/nginx/sites-enabled/default || true
$SUDO nginx -t && $SUDO systemctl reload nginx

# Coba pasang SSL Let's Encrypt otomatis jika domain sudah mengarah ke IP server ini
echo "Mencoba mengaktifkan SSL HTTPS otomatis (Certbot) untuk ${DOMAIN}..."
$SUDO certbot --nginx -d "${DOMAIN}" -d "${WWW_DOMAIN}" --non-interactive --agree-tos -m pastimurahnya12@gmail.com --redirect || echo "Info SSL: Jika DNS ${DOMAIN} baru diarahkan, jalankan 'sudo certbot --nginx -d ${DOMAIN} -d ${WWW_DOMAIN}' setelah propagasi DNS selesai."

echo ""
echo "========================================================================"
echo "  SELESAI! WEBSITE PASTI MURAHNYA SUDAH AKTIF 24 JAM NONSTOP!"
echo "========================================================================"
echo "  • URL Publik   : https://${DOMAIN}"
echo "  • Panel Admin  : https://${DOMAIN}/admin/login"
echo "  • Email Admin  : wibyjoe12@gmail.com"
echo "  • Password     : hedyfake23"
echo "  • Cek Status   : pm2 status"
echo "  • Cek Log Live : pm2 logs"
echo "========================================================================"
