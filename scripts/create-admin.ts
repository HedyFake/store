import * as path from 'node:path';
import * as fs from 'node:fs';
import * as dotenv from 'dotenv';
import * as bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { createUserSchema } from '@store/shared';

for (const p of [path.resolve(__dirname, '../.env'), path.resolve(process.cwd(), '.env')]) {
  if (fs.existsSync(p)) dotenv.config({ path: p });
}

async function main() {
  const [, , email, password, name = 'Administrator', role = 'OWNER'] = process.argv;
  if (!email || !password) {
    console.error('Penggunaan: npm run admin:create -- <email> <password_min_12_karakter> [nama] [OWNER|ADMIN|STAFF]');
    process.exit(1);
  }
  const parsed = createUserSchema.safeParse({ email, password, name, role });
  if (!parsed.success) {
    console.error('Input tidak valid:', parsed.error.issues);
    process.exit(1);
  }
  const prisma = new PrismaClient();
  try {
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const user = await prisma.user.upsert({
      where: { email: parsed.data.email },
      create: {
        email: parsed.data.email,
        name: parsed.data.name,
        passwordHash,
        role: parsed.data.role,
        status: 'ACTIVE',
      },
      update: {
        name: parsed.data.name,
        passwordHash,
        role: parsed.data.role,
        status: 'ACTIVE',
      },
    });
    console.warn(`Akun ${user.role} berhasil dibuat/diperbarui: ${user.email} (id: ${user.id})`);
  } finally {
    await prisma.$disconnect();
  }
}

void main();

