import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import EmbeddedPostgres from 'embedded-postgres';

const dbDir = path.join(os.tmpdir(), 'pastimurahnya-test-pg');

if (fs.existsSync(dbDir)) {
  try {
    fs.rmSync(dbDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

const pg = new EmbeddedPostgres({
  databaseDir: dbDir,
  user: 'postgres',
  password: 'postgres',
  port: 5434,
  persistent: false,
});

await pg.initialise();
await pg.start();
try {
  await pg.createDatabase('dropship_test');
} catch {
  // already exists
}

process.stdout.write('READY\n');

const shutdown = async () => {
  try {
    await pg.stop();
  } catch {
    // ignore
  }
  process.exit(0);
};

process.stdin.resume();
process.stdin.on('end', shutdown);
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
