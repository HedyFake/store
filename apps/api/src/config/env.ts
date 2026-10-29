import { z } from 'zod';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as dotenv from 'dotenv';

// Load root .env (monorepo) then local overrides.
for (const p of [
  path.resolve(__dirname, '../../../.env'),
  path.resolve(__dirname, '../../../../.env'),
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '../../.env'),
]) {
  if (fs.existsSync(p)) dotenv.config({ path: p });
}

const bool = z
  .string()
  .optional()
  .transform((v) => v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.string().url().default('http://localhost:3000'),
  API_PORT: z.coerce.number().int().default(4000),
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET minimal 32 karakter acak'),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(12),
  DEMO_MODE: bool,

  STORAGE_PROVIDER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default(''),
  S3_ENDPOINT: z.string().optional().default(''),
  S3_REGION: z.string().optional().default(''),
  S3_BUCKET_PRIVATE: z.string().optional().default(''),
  S3_ACCESS_KEY_ID: z.string().optional().default(''),
  S3_SECRET_ACCESS_KEY: z.string().optional().default(''),
  S3_FORCE_PATH_STYLE: bool,

  PAYMENT_PROVIDER: z.enum(['disabled', 'midtrans']).default('disabled'),
  MIDTRANS_SERVER_KEY: z.string().optional().default(''),
  MIDTRANS_IS_PRODUCTION: bool,
  ENABLE_QRIS: bool,
  ENABLE_VIRTUAL_ACCOUNT: bool,
  VA_BANKS: z.string().default('bca,bni,bri'),

  TELEGRAM_BOT_TOKEN: z.string().optional().default(''),
  TELEGRAM_CHAT_ID: z.string().optional().default(''),
  TELEGRAM_SEND_ENABLED: bool,
  TELEGRAM_API_BASE: z.string().url().default('https://api.telegram.org'),

  SHIPPING_PROVIDER: z.enum(['manual', 'rajaongkir']).default('manual'),
  RAJAONGKIR_API_KEY: z.string().optional().default(''),
  RAJAONGKIR_BASE_URL: z.string().url().default('https://rajaongkir.komerce.id/api/v1'),

  PAYMENT_PROOF_MAX_BYTES: z.coerce.number().int().default(5 * 1024 * 1024),
  SHIPPING_DOC_MAX_BYTES: z.coerce.number().int().default(10 * 1024 * 1024),
  PRODUCT_IMPORT_MAX_BYTES: z.coerce.number().int().default(2 * 1024 * 1024),
  PRODUCT_IMPORT_MAX_ROWS: z.coerce.number().int().default(500),
  JOB_WORKER_ENABLED: z
    .string()
    .optional()
    .transform((v) => v !== 'false'),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;
export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Konfigurasi environment tidak valid: ${issues}`);
  }
  if (parsed.data.NODE_ENV === 'production' && /REPLACE|CHANGE_ME/i.test(parsed.data.AUTH_SECRET)) {
    throw new Error('AUTH_SECRET masih placeholder di production');
  }
  cached = parsed.data;
  return cached;
}

export function resetEnvCache() {
  cached = null;
}

export function storageDir(): string {
  const e = env();
  return e.STORAGE_LOCAL_DIR ? path.resolve(e.STORAGE_LOCAL_DIR) : path.resolve(__dirname, '../../storage');
}

