import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import EmbeddedPostgres from 'embedded-postgres';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const envPath = path.join(rootDir, '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

// Pastikan selalu menggunakan binary Node.js yang benar dan bukan path kosong di Program Files
const portableNodeDir = 'C:\\Users\\wibyj\\tools\\node-v22.11.0-win-x64';
const portableNodeExe = path.join(portableNodeDir, 'node.exe');
const nodeBin = fs.existsSync(portableNodeExe)
  ? portableNodeExe
  : fs.existsSync(process.execPath)
    ? process.execPath
    : 'node';

const childEnv = {
  ...process.env,
  PATH: fs.existsSync(portableNodeDir)
    ? `${portableNodeDir};${process.env.PATH || ''}`
    : process.env.PATH,
};

const dbDir = path.join(os.tmpdir(), 'pastimurahnya-dev-pg');
const forceDev = process.argv.includes('--dev');

console.log('1/3 Menyalakan database PostgreSQL lokal (port 5433)...');
const pg = new EmbeddedPostgres({
  databaseDir: dbDir,
  user: 'postgres',
  password: 'postgres',
  port: 5433,
  persistent: true,
});

try {
  await pg.initialise();
} catch {
  // Sudah diinisialisasi
}
try {
  await pg.start();
} catch {
  // Mungkin sudah berjalan
}
try {
  await pg.createDatabase('dropship_store');
} catch {
  // Database sudah ada
}
console.log('✓ Database aktif di postgresql://postgres:postgres@127.0.0.1:5433/dropship_store');

// Pastikan skema database & akun admin utama selalu tersinkronisasi dengan .env
const syncOnly = process.argv.includes('--sync-only');
if (syncOnly) {
  execSync('npx.cmd prisma db push --accept-data-loss', { cwd: rootDir, stdio: 'inherit', env: childEnv });
  execSync('npx.cmd prisma generate', { cwd: rootDir, stdio: 'inherit', env: childEnv });
}
try {
  const prisma = new PrismaClient();
  const adminEmail = (process.env.SEED_ADMIN_EMAIL || 'wibyjoe12@gmail.com').toLowerCase().trim();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'hedyfake23';
  const passwordHash = await bcrypt.hash(adminPassword, 10);
  await prisma.user.upsert({
    where: { email: adminEmail },
    create: {
      email: adminEmail,
      name: 'Owner Pasti Murahnya',
      passwordHash,
      role: 'OWNER',
      status: 'ACTIVE',
    },
    update: {
      passwordHash,
      role: 'OWNER',
      status: 'ACTIVE',
    },
  });

  const storeRow = await prisma.storeSetting.findUnique({ where: { key: 'store' } });
  const prevStore = storeRow && typeof storeRow.value === 'object' && storeRow.value ? storeRow.value : {};
  await prisma.storeSetting.upsert({
    where: { key: 'store' },
    create: {
      key: 'store',
      value: {
        storeName: 'Pasti Murahnya',
        tagline: 'Pasti Murah, Pasti Puas! • Belanja Hemat, Tanpa Ragu.',
        logoUrl: '/demo/logo-pasti-murahnya.jpg',
        announcement:
          'Pasti Murah, Pasti Puas! • Harga Bersahabat, Dompet Selamat • Cari Murah? Pasti di Sini • Murahnya Pasti, Kualitasnya Oke',
        serviceHours: 'Senin–Sabtu, 09.00–18.00 WIB',
        address: 'Jakarta Selatan, DKI Jakarta, Indonesia',
        tiktokUrl: '',
        footerAbout:
          'Pastimurah menyediakan berbagai kebutuhan dengan harga terjangkau tanpa mengorbankan kualitas. Belanja mudah, pelayanan ramah, dan harganya pasti murah.',
        ...prevStore,
        supportEmail: 'pastimurahnya12@gmail.com',
        whatsappNumber: '6285141784243',
        instagramUrl: 'https://instagram.com/pastimurahnya.my.id',
      },
    },
    update: {
      value: {
        ...prevStore,
        supportEmail: 'pastimurahnya12@gmail.com',
        whatsappNumber: '6285141784243',
        instagramUrl: 'https://instagram.com/pastimurahnya.my.id',
      },
    },
  });

  const shipRow = await prisma.storeSetting.findUnique({ where: { key: 'shipping' } });
  const prevShip = shipRow && typeof shipRow.value === 'object' && shipRow.value ? shipRow.value : {};
  await prisma.storeSetting.upsert({
    where: { key: 'shipping' },
    create: {
      key: 'shipping',
      value: {
        provider: 'rajaongkir',
        couriers: ['jne', 'sicepat', 'jnt'],
        flatRatePerGroup: 18000,
        flatRateLabel: 'Reguler Nasional (2–4 hari)',
        freeShippingMinSubtotal: 0,
        minProfitPerOrder: 15000,
        ...prevShip,
      },
    },
    update: {
      value: {
        minProfitPerOrder: 15000,
        ...prevShip,
      },
    },
  });

  // Sinkronisasi HPP (costPrice) pada produk yang belum memiliki costPrice langsung di tabel Product
  const existingProducts = await prisma.product.findMany({
    include: { offers: { where: { active: true }, orderBy: { fulfillmentPriority: 'asc' } }, variants: true },
  });
  for (const prod of existingProducts) {
    if (prod.costPrice <= 0 && prod.offers[0]?.costPrice) {
      await prisma.product.update({
        where: { id: prod.id },
        data: {
          costPrice: prod.offers[0].costPrice,
          packagingCost: prod.packagingCost > 0 ? prod.packagingCost : 3000,
          otherCost: prod.otherCost > 0 ? prod.otherCost : 3000,
        },
      });
    }
    if (prod.slug.includes('kemeja') && prod.variants.length > 0) {
      for (const v of prod.variants) {
        const opts = v.options && typeof v.options === 'object' ? v.options : {};
        if (!('Warna' in opts) && !('Ukuran' in opts)) {
          const isXl = v.name.includes('XL');
          const isM = v.name.includes('M');
          await prisma.productVariant.update({
            where: { id: v.id },
            data: {
              options: {
                Warna: v.name.includes('Putih') ? 'Putih Gading' : 'Pasir Alami',
                Ukuran: isXl ? 'L / XL' : isM ? 'S / M' : 'All Size',
              },
            },
          });
        }
      }
    }
  }

  await prisma.$disconnect();
  console.log(`✓ Akun Admin aktif: ${adminEmail} | WA: +6285141784243 | Email: pastimurahnya12@gmail.com | IG: @pastimurahnya.my.id`);
} catch (err) {
  console.warn('Info sinkronisasi admin:', err instanceof Error ? err.message : err);
}

if (syncOnly) {
  try {
    await pg.stop();
  } catch {
    // ignore
  }
  process.exit(0);
}

console.log('2/3 Menyalakan Backend API (http://localhost:4000)...');
const apiMain = path.join(rootDir, 'apps', 'api', 'dist', 'main.js');
const apiProc = spawn(nodeBin, [apiMain], {
  cwd: path.join(rootDir, 'apps', 'api'),
  stdio: 'inherit',
  env: childEnv,
});
apiProc.on('error', (err) => {
  console.error('Gagal menjalankan API server:', err.message);
});

const hasProdBuild = fs.existsSync(path.join(rootDir, 'apps', 'web', '.next', 'BUILD_ID'));
const nextBin = path.join(rootDir, 'node_modules', 'next', 'dist', 'bin', 'next');
const nextArgs = hasProdBuild && !forceDev ? ['start', '-p', '3000'] : ['dev', '--turbopack', '-p', '3000'];

console.log('3/3 Menyalakan Website Storefront (http://localhost:3000)...');
const webProc = spawn(nodeBin, [nextBin, ...nextArgs], {
  cwd: path.join(rootDir, 'apps', 'web'),
  stdio: 'inherit',
  env: childEnv,
});
webProc.on('error', (err) => {
  console.error('Gagal menjalankan Web server:', err.message);
});

// Pre-warm API cache & Next.js routes in background so pages open with 0ms compile delay
setTimeout(async () => {
  const urls = [
    'http://127.0.0.1:4000/api/store-config',
    'http://127.0.0.1:4000/api/categories',
    'http://127.0.0.1:4000/api/products?pageSize=8&sort=popular',
    'http://127.0.0.1:3000/',
    'http://127.0.0.1:3000/katalog',
    'http://127.0.0.1:3000/checkout',
    'http://127.0.0.1:3000/pesanan',
    'http://127.0.0.1:3000/admin/login',
  ];
  for (const u of urls) {
    try {
      await fetch(u, { signal: AbortSignal.timeout(8000) });
    } catch {
      // ignore during warmup
    }
  }
  console.log('✓ Seluruh halaman utama & cache API telah siap (http://localhost:3000).');
}, 4000);

let shuttingDown = false;
const shutdown = async () => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('\nMematikan semua server...');
  try {
    webProc.kill();
  } catch {}
  try {
    apiProc.kill();
  } catch {}
  try {
    await pg.stop();
  } catch {}
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
