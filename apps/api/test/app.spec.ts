import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import * as bcrypt from 'bcryptjs';
import * as path from 'node:path';
import { execSync, spawn, ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { resetEnvCache } from '../src/config/env';

describe('Dropship Store API Integration Tests', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let dbProc: ChildProcess | null = null;
  let adminCookie = '';
  let csrfToken = '';
  let prodWarehouseAId = '';
  let prodWarehouseBId = '';

  beforeAll(async () => {
    const rootDir = path.resolve(__dirname, '../../..');
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(process.execPath, [path.join(rootDir, 'scripts/test-db.mjs')], {
        cwd: rootDir,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      dbProc = proc;
      let errOut = '';
      proc.stderr?.on('data', (chunk) => {
        errOut += String(chunk);
      });
      proc.stdout?.on('data', (chunk) => {
        if (String(chunk).includes('READY')) resolve();
      });
      proc.on('exit', (code) => {
        if (code !== 0) reject(new Error(`test-db exited with ${code}: ${errOut}`));
      });
    });

    process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5434/dropship_test?schema=public';
    resetEnvCache();

    execSync('npx.cmd prisma db push --skip-generate', {
      cwd: rootDir,
      env: { ...process.env },
      stdio: 'pipe',
    });

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();

    prisma = app.get(PrismaService);

    // Seed admin + payment settings + 2 suppliers/warehouses + 2 products
    await prisma.user.create({
      data: {
        email: 'admin@test.local',
        name: 'Test Admin',
        passwordHash: bcrypt.hashSync('SecretPass123!', 10),
        role: 'OWNER',
        status: 'ACTIVE',
      },
    });

    await prisma.storeSetting.upsert({
      where: { key: 'payment' },
      create: {
        key: 'payment',
        value: {
          bankTransferEnabled: true,
          bankName: 'Bank Jago',
          bankAccountNumber: '108993773895',
          bankAccountName: 'Bendahara Toko',
          transferInstructions: 'Unggah bukti transfer untuk verifikasi admin.',
          qrisStaticEnabled: true,
          qrisImageUrl: '/demo/qris-store.jpg',
          paymentWindowHours: 24,
          proofMaxBytes: 5 * 1024 * 1024,
        },
      },
      update: {},
    });

    const supA = await prisma.supplier.create({
      data: {
        name: 'Atelier Kriya Jakarta',
        publicLabel: 'Mitra Gudang Jakarta',
        integrationMode: 'MANUAL',
        codSupported: true,
        active: true,
      },
    });
    const whA = await prisma.warehouse.create({
      data: {
        supplierId: supA.id,
        name: 'Gudang Jakarta Selatan',
        city: 'Jakarta Selatan',
        province: 'DKI Jakarta',
        active: true,
      },
    });

    const supB = await prisma.supplier.create({
      data: {
        name: 'Studio Tekstil Bandung',
        publicLabel: 'Mitra Gudang Bandung',
        integrationMode: 'WHATSAPP_MANUAL',
        codSupported: true,
        active: true,
      },
    });
    const whB = await prisma.warehouse.create({
      data: {
        supplierId: supB.id,
        name: 'Gudang Bandung Kota',
        city: 'Bandung',
        province: 'Jawa Barat',
        active: true,
      },
    });

    const cat = await prisma.category.create({
      data: { name: 'Living & Home', slug: 'living-home', active: true },
    });

    const p1 = await prisma.product.create({
      data: {
        sku: 'TEST-LAMP-01',
        slug: 'lampu-meja-editorial',
        name: 'Lampu Meja Editorial',
        description: 'Lampu meja minimalis',
        categoryId: cat.id,
        status: 'ACTIVE',
        salePrice: 320000,
        weightGram: 900,
        images: { create: [{ url: '/demo/lamp.jpg', alt: 'Lampu', sortOrder: 0 }] },
        offers: {
          create: [
            {
              supplierId: supA.id,
              warehouseId: whA.id,
              supplierSku: 'SRC-LAMP-01',
              costPrice: 210000,
              stockQty: 10,
              leadTimeDays: 1,
              fulfillmentPriority: 10,
              codEnabled: true,
              integrationMode: 'MANUAL',
              active: true,
            },
          ],
        },
      },
    });
    prodWarehouseAId = p1.id;

    const p2 = await prisma.product.create({
      data: {
        sku: 'TEST-SHIRT-02',
        slug: 'kemeja-linen-bandung',
        name: 'Kemeja Linen Bandung',
        description: 'Kemeja linen sejuk',
        categoryId: cat.id,
        status: 'ACTIVE',
        salePrice: 280000,
        weightGram: 400,
        images: { create: [{ url: '/demo/shirt.jpg', alt: 'Kemeja', sortOrder: 0 }] },
        offers: {
          create: [
            {
              supplierId: supB.id,
              warehouseId: whB.id,
              supplierSku: 'SRC-SHIRT-02',
              costPrice: 175000,
              stockQty: 8,
              leadTimeDays: 1,
              fulfillmentPriority: 10,
              codEnabled: true,
              integrationMode: 'WHATSAPP_MANUAL',
              active: true,
            },
          ],
        },
      },
    });
    prodWarehouseBId = p2.id;
  }, 120000);

  afterAll(async () => {
    if (app) await app.close();
    if (dbProc) {
      dbProc.stdin?.end();
      dbProc.kill();
    }
  }, 60000);

  it('rejects unauthenticated access to /api/admin/* and allows login with valid credentials', async () => {
    await request(app.getHttpServer()).get('/api/admin/orders').expect(401);

    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'admin@test.local', password: 'SecretPass123!' })
      .expect(201);

    expect(loginRes.body.user.email).toBe('admin@test.local');
    const cookies = loginRes.headers['set-cookie'];
    expect(cookies).toBeDefined();
    const cookieList = Array.isArray(cookies) ? cookies : [String(cookies)];
    adminCookie = cookieList.map((c: string) => c.split(';')[0]).join('; ');
    const csrfCookie = cookieList.find((c: string) => c.startsWith('store_csrf='));
    csrfToken = csrfCookie ? csrfCookie.split(';')[0].split('=')[1] : loginRes.body.csrfToken || '';

    await request(app.getHttpServer()).get('/api/admin/orders').set('Cookie', adminCookie).expect(200);
  });

  it('splits a multi-warehouse cart into 2 SupplierOrders, reserves stock atomically, and protects guest order access token', async () => {
    const quoteRes = await request(app.getHttpServer())
      .post('/api/checkout/quote')
      .send({
        items: [
          { productId: prodWarehouseAId, quantity: 2 },
          { productId: prodWarehouseBId, quantity: 1 },
        ],
        paymentMethod: 'BANK_TRANSFER',
      })
      .expect(201);

    expect(quoteRes.body.groups).toHaveLength(2);
    expect(quoteRes.body.subtotal).toBe(320000 * 2 + 280000 * 1);

    const shippingSelections = quoteRes.body.groups.map(
      (g: { groupKey: string; shippingOptions: Array<{ optionId: string }> }) => ({
        groupKey: g.groupKey,
        optionId: g.shippingOptions[0].optionId,
      }),
    );

    const orderRes = await request(app.getHttpServer())
      .post('/api/orders')
      .send({
        quoteId: quoteRes.body.quoteId,
        idempotencyKey: 'idem-multi-wh-00001',
        acceptTerms: true,
        items: [
          { productId: prodWarehouseAId, quantity: 2 },
          { productId: prodWarehouseBId, quantity: 1 },
        ],
        shippingSelections,
        paymentMethod: 'BANK_TRANSFER',
        address: {
          recipientName: 'Budi Santoso',
          phone: '081234567890',
          email: 'budi@example.com',
          addressLine: 'Jl. Pemuda No. 45 RT 02 RW 03',
          province: 'Jawa Timur',
          city: 'Surabaya',
          district: 'Genteng',
          postalCode: '60271',
        },
      })
      .expect(201);

    const { orderNumber, accessKey, grandTotal } = orderRes.body;
    expect(orderNumber).toMatch(/^ORD-/);
    expect(orderRes.body.paymentStatus).toBe('UNPAID');

    // Guest order view without key or with wrong key must fail (403)
    await request(app.getHttpServer()).get(`/api/orders/${orderNumber}`).expect(403);
    await request(app.getHttpServer()).get(`/api/orders/${orderNumber}?key=wrong_token_value_123456`).expect(403);

    // Guest order view with valid key succeeds and shows 2 packages without leaking costPrice
    const detailRes = await request(app.getHttpServer())
      .get(`/api/orders/${orderNumber}?key=${encodeURIComponent(accessKey)}`)
      .expect(200);
    expect(detailRes.body.packages).toHaveLength(2);
    expect(JSON.stringify(detailRes.body)).not.toContain('costPrice');

    // Rejects fake JPG proof (magic bytes mismatch)
    await request(app.getHttpServer())
      .post(`/api/orders/${orderNumber}/payment-proofs?key=${encodeURIComponent(accessKey)}`)
      .attach('file', Buffer.from('NOT A REAL JPEG FILE'), {
        filename: 'fake.jpg',
        contentType: 'image/jpeg',
      })
      .expect(415);

    // Accepts valid PDF proof and sets status to PENDING_REVIEW (never PAID automatically)
    const validPdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');
    const proofRes = await request(app.getHttpServer())
      .post(`/api/orders/${orderNumber}/payment-proofs?key=${encodeURIComponent(accessKey)}`)
      .attach('file', validPdf, {
        filename: 'bukti-transfer.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);

    expect(proofRes.body.paymentStatus).toBe('PENDING_REVIEW');

    // Admin approves proof -> paymentStatus becomes PAID
    const approveRes = await request(app.getHttpServer())
      .post(`/api/admin/payment-proofs/${proofRes.body.proof.id}/approve`)
      .set('Cookie', adminCookie)
      .set('x-csrf-token', csrfToken)
      .send({ reviewedAmount: grandTotal, note: 'Mutasi Bank Jago sesuai' })
      .expect(201);

    expect(approveRes.body.paymentStatus).toBe('PAID');
    expect(approveRes.body.orderStatus).toBe('AWAITING_FULFILLMENT');
  });

  it('handles COD orders as COD_PENDING_COLLECTION until admin reconciles COD_COLLECTED', async () => {
    const quoteRes = await request(app.getHttpServer())
      .post('/api/checkout/quote')
      .send({
        items: [{ productId: prodWarehouseAId, quantity: 1 }],
        paymentMethod: 'COD',
      })
      .expect(201);

    const shippingSelections = quoteRes.body.groups.map(
      (g: { groupKey: string; shippingOptions: Array<{ optionId: string }> }) => ({
        groupKey: g.groupKey,
        optionId: g.shippingOptions[0].optionId,
      }),
    );

    const codOrderRes = await request(app.getHttpServer())
      .post('/api/orders')
      .send({
        quoteId: quoteRes.body.quoteId,
        idempotencyKey: 'idem-cod-order-00001',
        acceptTerms: true,
        items: [{ productId: prodWarehouseAId, quantity: 1 }],
        shippingSelections,
        paymentMethod: 'COD',
        address: {
          recipientName: 'Siti Aminah',
          phone: '081398765432',
          addressLine: 'Jl. Kemang Raya No. 12',
          province: 'DKI Jakarta',
          city: 'Jakarta Selatan',
          district: 'Mampang Prapatan',
          postalCode: '12730',
        },
      })
      .expect(201);

    expect(codOrderRes.body.paymentStatus).toBe('COD_PENDING_COLLECTION');

    const reconRes = await request(app.getHttpServer())
      .post(`/api/admin/orders/${codOrderRes.body.orderId}/reconcile-cod`)
      .set('Cookie', adminCookie)
      .set('x-csrf-token', csrfToken)
      .send({ outcome: 'COLLECTED', evidence: 'Setoran kurir JNE #COD-8891 diterima' })
      .expect(201);

    expect(reconRes.body.paymentStatus).toBe('COD_COLLECTED');
    expect(reconRes.body.orderStatus).toBe('COMPLETED');
  });

  it('validates and commits CSV mass product import with CREATE_ONLY and UPSERT_BY_SKU', async () => {
    const csvContent = [
      'sku,name,slug,category,description,sale_price,compare_at_price,currency,weight_gram,stock_qty,supplier_name,supplier_sku,warehouse_name,cost_price,supplier_product_url,image_url,cod_enabled,status',
      'CSV-IMP-01,Diffuser Keramik Baru,diffuser-keramik-baru,Living & Home,Diffuser keramik,295000,350000,IDR,550,15,Atelier Kriya Jakarta,SRC-DIF-01,Gudang Jakarta Selatan,180000,https://supplier.example/dif,/demo/diffuser.jpg,true,ACTIVE',
      'TEST-LAMP-01,Lampu Meja Editorial Updated,lampu-meja-editorial,Living & Home,Deskripsi baru via CSV,360000,,IDR,900,25,Atelier Kriya Jakarta,SRC-LAMP-01,Gudang Jakarta Selatan,210000,https://supplier.example/lamp,/demo/lamp.jpg,true,ACTIVE',
    ].join('\n');

    const previewRes = await request(app.getHttpServer())
      .post('/api/admin/imports/products/preview')
      .set('Cookie', adminCookie)
      .set('x-csrf-token', csrfToken)
      .attach('file', Buffer.from(csvContent, 'utf-8'), {
        filename: 'products.csv',
        contentType: 'text/csv',
      })
      .expect(201);

    expect(previewRes.body.validRows).toBe(2);
    expect(previewRes.body.createCandidates).toBe(1);
    expect(previewRes.body.updateCandidates).toBe(1);

    // Commit with UPSERT_BY_SKU but without unlocking PRICE protected group
    const commitRes = await request(app.getHttpServer())
      .post('/api/admin/imports/products/commit')
      .set('Cookie', adminCookie)
      .set('x-csrf-token', csrfToken)
      .send({
        jobId: previewRes.body.jobId,
        mode: 'UPSERT_BY_SKU',
        protectedFields: [],
        confirm: true,
      })
      .expect(201);

    expect(commitRes.body.createdCount).toBe(1);
    expect(commitRes.body.updatedCount).toBe(1);

    // Existing product description updated, but salePrice remained protected at 320000
    const existingAfter = await prisma.product.findUnique({ where: { sku: 'TEST-LAMP-01' } });
    expect(existingAfter?.description).toBe('Deskripsi baru via CSV');
    expect(existingAfter?.salePrice).toBe(320000);
  });

  it('verifies Midtrans webhook signature and enforces idempotency on replay', async () => {
    const quoteRes = await request(app.getHttpServer())
      .post('/api/checkout/quote')
      .send({
        items: [{ productId: prodWarehouseAId, quantity: 1 }],
        paymentMethod: 'QRIS_GATEWAY',
      })
      .expect(201);

    const orderRes = await request(app.getHttpServer())
      .post('/api/orders')
      .send({
        quoteId: quoteRes.body.quoteId,
        idempotencyKey: 'idem-qris-gw-00001',
        acceptTerms: true,
        items: [{ productId: prodWarehouseAId, quantity: 1 }],
        shippingSelections: [
          {
            groupKey: quoteRes.body.groups[0].groupKey,
            optionId: quoteRes.body.groups[0].shippingOptions[0].optionId,
          },
        ],
        paymentMethod: 'QRIS_GATEWAY',
        address: {
          recipientName: 'Andi Wijaya',
          phone: '081299998888',
          addressLine: 'Jl. Braga No. 10',
          province: 'Jawa Barat',
          city: 'Bandung',
          district: 'Sumur Bandung',
          postalCode: '40111',
        },
      })
      .expect(201);

    const orderNumber = orderRes.body.orderNumber;
    const grossAmount = `${orderRes.body.grandTotal}.00`;
    const statusCode = '200';
    const serverKey = process.env.MIDTRANS_SERVER_KEY!;

    // Invalid signature -> 403
    await request(app.getHttpServer())
      .post('/api/webhooks/payments/midtrans')
      .send({
        order_id: orderNumber,
        status_code: statusCode,
        gross_amount: grossAmount,
        transaction_status: 'settlement',
        transaction_id: 'mid-tx-001',
        signature_key: 'deadbeef',
      })
      .expect(403);

    // Valid SHA512 signature -> 201 and marks order PAID
    const validSig = createHash('sha512')
      .update(`${orderNumber}${statusCode}${grossAmount}${serverKey}`)
      .digest('hex');

    const hookRes1 = await request(app.getHttpServer())
      .post('/api/webhooks/payments/midtrans')
      .send({
        order_id: orderNumber,
        status_code: statusCode,
        gross_amount: grossAmount,
        transaction_status: 'settlement',
        transaction_id: 'mid-tx-001',
        signature_key: validSig,
      })
      .expect(201);

    expect(hookRes1.body.status).toBe('PAID');

    // Replay same webhook event -> idempotent
    const hookRes2 = await request(app.getHttpServer())
      .post('/api/webhooks/payments/midtrans')
      .send({
        order_id: orderNumber,
        status_code: statusCode,
        gross_amount: grossAmount,
        transaction_status: 'settlement',
        transaction_id: 'mid-tx-001',
        signature_key: validSig,
      })
      .expect(201);

    expect(hookRes2.body.idempotent).toBe(true);
  });
});