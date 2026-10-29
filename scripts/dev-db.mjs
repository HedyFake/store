import path from 'node:path';
import os from 'node:os';
import EmbeddedPostgres from 'embedded-postgres';

const dbDir = path.join(os.tmpdir(), 'pastimurahnya-dev-pg');

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
  // Already initialized
}
await pg.start();
try {
  await pg.createDatabase('dropship_store');
} catch {
  // Already exists
}

console.log('READY: Embedded PostgreSQL aktif di postgresql://postgres:postgres@127.0.0.1:5433/dropship_store?schema=public');

const shutdown = async () => {
  try {
    await pg.stop();
  } catch {
    // ignore
  }
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
setInterval(() => {}, 60_000);
