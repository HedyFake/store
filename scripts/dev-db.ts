import * as path from 'node:path';
import { spawn } from 'node:child_process';

const mjsPath = path.resolve(__dirname, './dev-db.mjs');
const child = spawn(process.execPath, [mjsPath], {
  stdio: 'inherit',
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
