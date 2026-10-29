import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import EmbeddedPostgres from 'embedded-postgres';

const rootDir = process.cwd();
const dbDir = path.join(os.tmpdir(), 'pastimurahnya-dev-pg');

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

console.log('2/3 Menyalakan Backend API (http://localhost:4000)...');
const apiProc = spawn(process.execPath, [path.join(rootDir, 'apps', 'api', 'dist', 'main.js')], {
  cwd: path.join(rootDir, 'apps', 'api'),
  stdio: 'inherit',
  env: process.env,
});

console.log('3/3 Menyalakan Website Storefront (http://localhost:3000)...');
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const webProc = spawn(npmCmd, ['run', 'dev:web'], {
  cwd: rootDir,
  stdio: 'inherit',
  shell: true,
  env: process.env,
});

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

