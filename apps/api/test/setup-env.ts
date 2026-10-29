import * as path from 'path';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5434/dropship_test?schema=public';
process.env.AUTH_SECRET = 'test_auth_secret_minimum_32_characters_long_1234567890';
process.env.STORAGE_PROVIDER = 'local';
process.env.STORAGE_LOCAL_DIR = path.resolve(__dirname, '../../../storage-test');
process.env.PAYMENT_PROVIDER = 'midtrans';
process.env.MIDTRANS_SERVER_KEY = 'SB-Mid-server-test-key-12345';
process.env.MIDTRANS_IS_PRODUCTION = 'false';
process.env.ENABLE_QRIS = 'true';
process.env.ENABLE_VIRTUAL_ACCOUNT = 'true';
process.env.JOB_WORKER_ENABLED = 'false';
