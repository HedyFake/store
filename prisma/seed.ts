import * as path from 'node:path';
import * as fs from 'node:fs';
import * as dotenv from 'dotenv';
import * as bcrypt from 'bcryptjs';
import { PrismaClient, Prisma } from '@prisma/client';

for (const p of [path.resolve(__dirname, '../.env'), path.resolve(process.cwd(), '.env')]) {
  if (fs.existsSync(p)) dotenv.config({ path: p });
}

const prisma = new PrismaClient();

async function main() {
  const adminEmail = (process.env.SEED_ADMIN_EMAIL || 'admin@store.local').toLowerCase().trim();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'ChangeMeAdmin!2026';
  const passwordHash = await bcrypt.hash(adminPassword, 12);

  await prisma.user.upsert({
    where: { email: adminEmail },
    create: {
      email: adminEmail,
      name: 'Owner / Kurator Utama (DEMO)',
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

  // Store settings (configured with user-provided Bank Jago, QRIS image, and WhatsApp)
  const settingsData: Array<{ key: string; value: Prisma.InputJsonValue }> = [
    {
      key: 'store',
      value: {
        storeName: 'Pasti Murahnya',
        tagline: 'Pasti Murah, Pasti Puas! • Belanja Hemat, Tanpa Ragu.',
        logoUrl: '/demo/logo-pasti-murahnya.jpg',
        announcement:
          'Pasti Murah, Pasti Puas! • Harga Bersahabat, Dompet Selamat • Cari Murah? Pasti di Sini • Murahnya Pasti, Kualitasnya Oke',
        supportEmail: 'halo@pastimurahnya.id',
        whatsappNumber: '6282233038659',
        serviceHours: 'Senin–Sabtu, 09.00–18.00 WIB',
        address: 'Jakarta Selatan, DKI Jakarta, Indonesia',
        instagramUrl: '',
        tiktokUrl: '',
        footerAbout:
          'Pastimurah menyediakan berbagai kebutuhan dengan harga terjangkau tanpa mengorbankan kualitas. Belanja mudah, pelayanan ramah, dan harganya pasti murah. Males bandingin harga? Di Pastimurah semuanya udah dibikin murah dari awal. Tinggal pilih, checkout, hemat!',
      },
    },
    {
      key: 'payment',
      value: {
        bankTransferEnabled: true,
        bankName: 'Bank Jago',
        bankAccountName: 'Rekening Resmi Toko (Sesuaikan Nama Pemilik di Pengaturan)',
        bankAccountNumber: '108993773895',
        transferInstructions:
          'Transfer sesuai nominal total pesanan (hingga digit terakhir) ke rekening Bank Jago 108993773895 atau scan QRIS toko, kemudian unggah foto/PDF bukti transfer pada halaman pesanan Anda. Status pembayaran akan berubah menjadi Lunas setelah diverifikasi oleh admin.',
        qrisStaticEnabled: true,
        qrisImageUrl: '/demo/qris-store.jpg',
        paymentWindowHours: 24,
        proofMaxBytes: 5 * 1024 * 1024,
      },
    },
    {
      key: 'cod',
      value: {
        codEnabled: true,
        codFeeFlat: 5000,
        codFeePercentBps: 0,
        codMaxOrderTotal: 3_000_000,
        codBlockedProvinces: [],
        codNotes:
          'Bayar tunai ke kurir saat paket tiba. Hanya berlaku apabila seluruh item pada pesanan berasal dari gudang yang mendukung COD.',
      },
    },
    {
      key: 'shipping',
      value: {
        provider: 'rajaongkir',
        couriers: ['jne', 'sicepat', 'jnt'],
        flatRatePerGroup: 18000,
        flatRateLabel: 'Reguler Nasional (2–4 hari)',
        freeShippingMinSubtotal: 0,
      },
    },
  ];

  for (const s of settingsData) {
    await prisma.storeSetting.upsert({
      where: { key: s.key },
      create: { key: s.key, value: s.value },
      update: { value: s.value },
    });
  }

  // Categories
  const categorySpecs = [
    { name: 'Elektronik & Audio', slug: 'elektronik-audio', icon: 'Headphones', sortOrder: 1 },
    { name: 'Rumah & Dekorasi', slug: 'rumah-dekorasi', icon: 'Lamp', sortOrder: 2 },
    { name: 'Pakaian & Aksesoris', slug: 'pakaian-aksesoris', icon: 'Shirt', sortOrder: 3 },
    { name: 'Dapur & Seduh Kopi', slug: 'dapur-seduh-kopi', icon: 'Coffee', sortOrder: 4 },
    { name: 'Perawatan & Aromaterapi', slug: 'perawatan-aromaterapi', icon: 'Sparkles', sortOrder: 5 },
  ];
  const categories = new Map<string, string>();
  for (const c of categorySpecs) {
    const saved = await prisma.category.upsert({
      where: { slug: c.slug },
      create: { ...c, active: true },
      update: { name: c.name, icon: c.icon, sortOrder: c.sortOrder, active: true },
    });
    categories.set(c.slug, saved.id);
  }

  // Suppliers & Warehouses (multi-supplier, multi-warehouse across Jakarta, Bandung, Surabaya)
  const supJakarta = await prisma.supplier.upsert({
    where: { name: 'Mitra Akustik & Ruang Nusantara (DEMO)' },
    create: {
      name: 'Mitra Akustik & Ruang Nusantara (DEMO)',
      publicLabel: 'Gudang Mitra Jakarta',
      active: true,
      integrationMode: 'MANUAL',
      sourcePlatform: 'Direct B2B',
      contactName: 'Tim Operasional Jakarta',
      contactPhone: '6282233038659',
      codSupported: true,
      notes: 'Data pemasok contoh (DEMO). Mendukung COD & pengiriman reguler.',
    },
    update: { codSupported: true, active: true },
  });

  const supBandung = await prisma.supplier.upsert({
    where: { name: 'Atelier Tekstil & Kriya Priangan (DEMO)' },
    create: {
      name: 'Atelier Tekstil & Kriya Priangan (DEMO)',
      publicLabel: 'Gudang Mitra Bandung',
      active: true,
      integrationMode: 'WHATSAPP_MANUAL',
      sourcePlatform: 'Workshop Lokal',
      contactName: 'Admin Gudang Bandung',
      contactPhone: '6282233038659',
      codSupported: true,
      notes: 'Pemasok tekstil & kriya Bandung (DEMO).',
    },
    update: { codSupported: true, active: true },
  });

  const supSurabaya = await prisma.supplier.upsert({
    where: { name: 'Roastery & Homeware Timur (DEMO)' },
    create: {
      name: 'Roastery & Homeware Timur (DEMO)',
      publicLabel: 'Gudang Mitra Surabaya',
      active: true,
      integrationMode: 'SUPPLIER_PORTAL',
      sourcePlatform: 'Portal B2B',
      portalUrl: 'https://supplier.example/portal',
      contactName: 'Admin Gudang Surabaya',
      codSupported: false,
      notes: 'Pemasok alat kopi & perlengkapan rumah Surabaya (DEMO — non-COD untuk menguji aturan COD).',
    },
    update: { active: true },
  });

  const whJakarta = await prisma.warehouse.upsert({
    where: { supplierId_name: { supplierId: supJakarta.id, name: 'Gudang Jakarta Selatan' } },
    create: {
      supplierId: supJakarta.id,
      name: 'Gudang Jakarta Selatan',
      city: 'Jakarta Selatan',
      province: 'DKI Jakarta',
      address: 'Kebayoran Baru, Jakarta Selatan',
      shippingOriginId: '17473',
      active: true,
    },
    update: { shippingOriginId: '17473', active: true },
  });

  const whBandung = await prisma.warehouse.upsert({
    where: { supplierId_name: { supplierId: supBandung.id, name: 'Gudang Bandung Utara' } },
    create: {
      supplierId: supBandung.id,
      name: 'Gudang Bandung Utara',
      city: 'Kota Bandung',
      province: 'Jawa Barat',
      address: 'Coblong, Kota Bandung',
      shippingOriginId: '6984',
      active: true,
    },
    update: { shippingOriginId: '6984', active: true },
  });

  const whSurabaya = await prisma.warehouse.upsert({
    where: { supplierId_name: { supplierId: supSurabaya.id, name: 'Gudang Surabaya Gubeng' } },
    create: {
      supplierId: supSurabaya.id,
      name: 'Gudang Surabaya Gubeng',
      city: 'Kota Surabaya',
      province: 'Jawa Timur',
      address: 'Gubeng, Kota Surabaya',
      shippingOriginId: '42915',
      active: true,
    },
    update: { shippingOriginId: '42915', active: true },
  });

  // Demo products (clearly marked isDemo: true and badge 'DEMO'; no fake review counts or verified claims)
  const demoProducts = [
    {
      sku: 'DEMO-AUD-001',
      slug: 'headphone-nirkabel-seri-one-demo',
      name: 'Headphone Nirkabel Over-Ear Seri One',
      description:
        'Produk contoh (DEMO) untuk menguji galeri produk, pemilihan varian, dan alokasi multi-gudang. Memiliki penawaran dari Gudang Jakarta dan Gudang Bandung.',
      categorySlug: 'elektronik-audio',
      salePrice: 1_499_000,
      compareAtPrice: 1_750_000,
      weightGram: 650,
      highlights: ['Peredam Bising Aktif', 'Baterai 36 Jam', 'Kabel USB-C Termasuk'],
      badges: ['DEMO', 'Pilihan Kurator'],
      featured: true,
      imageUrl: '/demo/headphone.jpg',
      variants: [
        { sku: 'DEMO-AUD-001-CHR', name: 'Matte Charcoal / Standar', priceOverride: null },
        { sku: 'DEMO-AUD-001-SND', name: 'Warm Sand / Standar', priceOverride: null },
        { sku: 'DEMO-AUD-001-DLX', name: 'Matte Charcoal / Paket Stand Kayu', priceOverride: 1_799_000 },
      ],
      offers: [
        {
          supplierId: supJakarta.id,
          warehouseId: whJakarta.id,
          supplierSku: 'JKT-AUD-001',
          costPrice: 1_050_000,
          stockQty: 14,
          leadTimeDays: 1,
          fulfillmentPriority: 10,
          codEnabled: true,
          integrationMode: 'MANUAL' as const,
        },
        {
          supplierId: supBandung.id,
          warehouseId: whBandung.id,
          supplierSku: 'BDG-AUD-001',
          costPrice: 1_080_000,
          stockQty: 8,
          leadTimeDays: 2,
          fulfillmentPriority: 20,
          codEnabled: true,
          integrationMode: 'WHATSAPP_MANUAL' as const,
        },
      ],
    },
    {
      sku: 'DEMO-HOM-002',
      slug: 'lampu-meja-keramik-nordik-demo',
      name: 'Lampu Meja Keramik Nordik Glaze Hangat',
      description:
        'Produk contoh (DEMO) kategori Rumah & Dekorasi. Dikirim dari Gudang Jakarta Selatan dan mendukung metode COD maupun Transfer Bank.',
      categorySlug: 'rumah-dekorasi',
      salePrice: 429_000,
      compareAtPrice: null,
      weightGram: 1200,
      highlights: ['Keramik Glaze Matte', 'Kap Linen Alami', 'Bohlam Warm E27'],
      badges: ['DEMO'],
      featured: true,
      imageUrl: '/demo/lamp.jpg',
      variants: [],
      offers: [
        {
          supplierId: supJakarta.id,
          warehouseId: whJakarta.id,
          supplierSku: 'JKT-HOM-002',
          costPrice: 275_000,
          stockQty: 9,
          leadTimeDays: 1,
          fulfillmentPriority: 10,
          codEnabled: true,
          integrationMode: 'MANUAL' as const,
        },
      ],
    },
    {
      sku: 'DEMO-APP-003',
      slug: 'kemeja-linen-katun-santai-demo',
      name: 'Kemeja Linen Katun Tenun Natural',
      description:
        'Produk contoh (DEMO) yang dipenuhi dari Gudang Bandung Utara. Bila dibeli bersama produk dari Gudang Jakarta atau Surabaya, pesanan akan otomatis dipecah menjadi beberapa pengiriman (split shipment).',
      categorySlug: 'pakaian-aksesoris',
      salePrice: 329_000,
      compareAtPrice: 389_000,
      weightGram: 350,
      highlights: ['Linen Breathable', 'Potongan Relaxed Fit', 'Kancing Tempurung'],
      badges: ['DEMO'],
      featured: true,
      imageUrl: '/demo/shirt.jpg',
      variants: [
        { sku: 'DEMO-APP-003-M', name: 'Sand Beige / Ukuran M', priceOverride: null },
        { sku: 'DEMO-APP-003-L', name: 'Sand Beige / Ukuran L', priceOverride: null },
      ],
      offers: [
        {
          supplierId: supBandung.id,
          warehouseId: whBandung.id,
          supplierSku: 'BDG-APP-003',
          costPrice: 195_000,
          stockQty: 22,
          leadTimeDays: 1,
          fulfillmentPriority: 10,
          codEnabled: true,
          integrationMode: 'WHATSAPP_MANUAL' as const,
        },
      ],
    },
    {
      sku: 'DEMO-COF-004',
      slug: 'mesin-espresso-portabel-manual-demo',
      name: 'Mesin Espresso Manual Meja Kompak',
      description:
        'Produk contoh (DEMO) yang dikirim dari Gudang Surabaya Gubeng (non-COD). Menguji kebijakan COD per penawaran pemasok serta pecah pengiriman lintas kota.',
      categorySlug: 'dapur-seduh-kopi',
      salePrice: 680_000,
      compareAtPrice: null,
      weightGram: 1800,
      highlights: ['Tekanan Ekstraksi 15 Bar', 'Portafilter Baja Nirkarat', 'Mudah Dibersihkan'],
      badges: ['DEMO', 'Non-COD'],
      featured: true,
      imageUrl: '/demo/espresso.jpg',
      variants: [],
      offers: [
        {
          supplierId: supSurabaya.id,
          warehouseId: whSurabaya.id,
          supplierSku: 'SBY-COF-004',
          costPrice: 460_000,
          stockQty: 7,
          leadTimeDays: 2,
          fulfillmentPriority: 10,
          codEnabled: false,
          integrationMode: 'SUPPLIER_PORTAL' as const,
        },
      ],
    },
    {
      sku: 'DEMO-ARO-005',
      slug: 'diffuser-aromaterapi-keramik-matte-demo',
      name: 'Diffuser Aromaterapi Keramik Ultrasonik 300ml',
      description: 'Produk contoh (DEMO) dari Gudang Jakarta Selatan dengan dukungan COD dan Transfer Bank.',
      categorySlug: 'perawatan-aromaterapi',
      salePrice: 289_000,
      compareAtPrice: 340_000,
      weightGram: 600,
      highlights: ['Kapasitas 300ml', 'Timer Otomatis', 'Senyap <25dB'],
      badges: ['DEMO'],
      featured: false,
      imageUrl: '/demo/diffuser.jpg',
      variants: [],
      offers: [
        {
          supplierId: supJakarta.id,
          warehouseId: whJakarta.id,
          supplierSku: 'JKT-ARO-005',
          costPrice: 170_000,
          stockQty: 18,
          leadTimeDays: 1,
          fulfillmentPriority: 10,
          codEnabled: true,
          integrationMode: 'MANUAL' as const,
        },
      ],
    },
    {
      sku: 'DEMO-BAG-006',
      slug: 'tas-jinjing-kanvas-kulit-demo',
      name: 'Tas Jinjing Kanvas 16oz Pegangan Kulit Nabati',
      description: 'Produk contoh (DEMO) dari Gudang Bandung Utara.',
      categorySlug: 'pakaian-aksesoris',
      salePrice: 385_000,
      compareAtPrice: null,
      weightGram: 550,
      highlights: ['Kanvas 16oz Tebal', 'Slot Laptop 14 Inci', 'Kulit Samak Nabati'],
      badges: ['DEMO'],
      featured: false,
      imageUrl: '/demo/tote.jpg',
      variants: [],
      offers: [
        {
          supplierId: supBandung.id,
          warehouseId: whBandung.id,
          supplierSku: 'BDG-BAG-006',
          costPrice: 230_000,
          stockQty: 15,
          leadTimeDays: 1,
          fulfillmentPriority: 10,
          codEnabled: true,
          integrationMode: 'WHATSAPP_MANUAL' as const,
        },
      ],
    },
    {
      sku: 'DEMO-COF-007',
      slug: 'teko-leher-angsa-pour-over-demo',
      name: 'Teko Seduh Kopi Leher Angsa Baja 304 Matte',
      description: 'Produk contoh (DEMO) dari Gudang Surabaya Gubeng.',
      categorySlug: 'dapur-seduh-kopi',
      salePrice: 310_000,
      compareAtPrice: 350_000,
      weightGram: 700,
      highlights: ['Baja Food-Grade 304', 'Gagang Kayu Akasia', 'Kapasitas 600ml'],
      badges: ['DEMO'],
      featured: false,
      imageUrl: '/demo/kettle.jpg',
      variants: [],
      offers: [
        {
          supplierId: supSurabaya.id,
          warehouseId: whSurabaya.id,
          supplierSku: 'SBY-COF-007',
          costPrice: 185_000,
          stockQty: 11,
          leadTimeDays: 2,
          fulfillmentPriority: 10,
          codEnabled: false,
          integrationMode: 'SUPPLIER_PORTAL' as const,
        },
      ],
    },
    {
      sku: 'DEMO-SKN-008',
      slug: 'serum-botani-lavender-chamomile-demo',
      name: 'Minyak Esensial & Serum Botani Calm 30ml',
      description: 'Produk contoh (DEMO) dari Gudang Jakarta Selatan.',
      categorySlug: 'perawatan-aromaterapi',
      salePrice: 165_000,
      compareAtPrice: null,
      weightGram: 200,
      highlights: ['Botol Kaca Amber UV', 'Pipet Presisi', 'Aroma Lembut'],
      badges: ['DEMO'],
      featured: false,
      imageUrl: '/demo/serum.jpg',
      variants: [],
      offers: [
        {
          supplierId: supJakarta.id,
          warehouseId: whJakarta.id,
          supplierSku: 'JKT-SKN-008',
          costPrice: 92_000,
          stockQty: 25,
          leadTimeDays: 1,
          fulfillmentPriority: 10,
          codEnabled: true,
          integrationMode: 'MANUAL' as const,
        },
      ],
    },
  ];

  const createdProductIds: string[] = [];
  for (const dp of demoProducts) {
    const categoryId = categories.get(dp.categorySlug) ?? null;
    const saved = await prisma.product.upsert({
      where: { sku: dp.sku },
      create: {
        sku: dp.sku,
        slug: dp.slug,
        name: dp.name,
        description: dp.description,
        categoryId,
        status: 'ACTIVE',
        salePrice: dp.salePrice,
        compareAtPrice: dp.compareAtPrice,
        weightGram: dp.weightGram,
        highlights: dp.highlights,
        badges: dp.badges,
        featured: dp.featured,
        isDemo: true,
        images: { create: [{ url: dp.imageUrl, alt: dp.name, sortOrder: 0 }] },
      },
      update: {
        name: dp.name,
        description: dp.description,
        categoryId,
        salePrice: dp.salePrice,
        compareAtPrice: dp.compareAtPrice,
        weightGram: dp.weightGram,
        highlights: dp.highlights,
        badges: dp.badges,
        featured: dp.featured,
        isDemo: true,
      },
    });
    createdProductIds.push(saved.id);

    for (const [idx, v] of dp.variants.entries()) {
      await prisma.productVariant.upsert({
        where: { sku: v.sku },
        create: {
          productId: saved.id,
          sku: v.sku,
          name: v.name,
          priceOverride: v.priceOverride,
          active: true,
          sortOrder: idx,
        },
        update: {
          name: v.name,
          priceOverride: v.priceOverride,
          active: true,
          sortOrder: idx,
        },
      });
    }

    for (const o of dp.offers) {
      await prisma.supplierOffer.upsert({
        where: {
          supplierId_warehouseId_supplierSku: {
            supplierId: o.supplierId,
            warehouseId: o.warehouseId,
            supplierSku: o.supplierSku,
          },
        },
        create: {
          productId: saved.id,
          supplierId: o.supplierId,
          warehouseId: o.warehouseId,
          supplierSku: o.supplierSku,
          supplierProductUrl: `https://supplier.example/items/${o.supplierSku}`,
          costPrice: o.costPrice,
          stockQty: o.stockQty,
          leadTimeDays: o.leadTimeDays,
          fulfillmentPriority: o.fulfillmentPriority,
          codEnabled: o.codEnabled,
          integrationMode: o.integrationMode,
          active: true,
        },
        update: {
          costPrice: o.costPrice,
          stockQty: o.stockQty,
          codEnabled: o.codEnabled,
          active: true,
        },
      });
    }
  }

  // Homepage CMS sections (matching the 5 editorial blocks in the Stitch design reference)
  await prisma.homepageSection.deleteMany({});
  {
    const now = new Date();
    const initialSections: Array<{
      type: string;
      sortOrder: number;
      content: Prisma.InputJsonValue;
    }> = [
      {
        type: 'HERO',
        sortOrder: 0,
        content: {
          eyebrow: 'PASTI MURAH, PASTI PUAS! • BELANJA HEMAT, TANPA RAGU',
          headline: 'Harga Bersahabat, Dompet Selamat.',
          subtext:
            'Pastimurah menyediakan berbagai kebutuhan dengan harga terjangkau tanpa mengorbankan kualitas. Belanja mudah, pelayanan ramah, dan harganya pasti murah.',
          imageUrl: '/demo/hero.jpg',
          imageAlt: 'Koleksi produk pilihan Pasti Murahnya',
          primaryCta: { label: 'Mulai Belanja Hemat', href: '/katalog' },
          secondaryCta: { label: 'Lacak Pesanan', href: '/pesanan' },
          spotlightProductId: createdProductIds[1] ?? null,
        },
      },
      {
        type: 'CATEGORIES',
        sortOrder: 1,
        content: {
          eyebrow: 'CARI MURAH? PASTI DI SINI',
          title: 'Kategori Pilihan Pasti Murahnya',
          categoryIds: [...categories.values()],
        },
      },
      {
        type: 'FEATURED_PRODUCTS',
        sortOrder: 2,
        content: {
          eyebrow: 'MURAHNYA PASTI, KUALITASNYA OKE',
          title: 'Pilihan Hemat Minggu Ini',
          subtitle: 'Males bandingin harga? Di Pastimurah semuanya udah dibikin murah dari awal. Tinggal pilih, checkout, hemat!',
          productIds: createdProductIds.slice(0, 4),
        },
      },
      {
        type: 'PROMO_BANNER',
        sortOrder: 3,
        content: {
          eyebrow: 'MALES BANDINGIN HARGA?',
          headline: 'Di Pastimurah Semuanya Udah Dibikin Murah dari Awal. Tinggal Pilih, Checkout, Hemat!',
          body: 'Murahnya Pasti, Kualitasnya Oke. Didukung pengiriman langsung dari gudang mitra terdekat dengan pelacakan resi transparan.',
          voucherCode: '',
          ctaLabel: 'Lihat Katalog Produk',
          ctaHref: '/katalog',
          endsAt: null,
          imageUrl: '/demo/hero.jpg',
        },
      },
      {
        type: 'VALUE_PROPS',
        sortOrder: 4,
        content: {
          items: [
            {
              icon: 'package',
              title: 'Multi-Gudang Terkurasi',
              body: 'Alokasi otomatis ke penawaran pemasok aktif dengan stok yang terverifikasi di database.',
            },
            {
              icon: 'truck',
              title: 'Pelacakan Multi-Resi',
              body: 'Pesanan yang terpecah ke beberapa gudang menampilkan setiap kurir dan nomor resi secara jelas.',
            },
            {
              icon: 'wallet',
              title: 'Transfer Terverifikasi & COD',
              body: 'Dukungan Transfer Bank Jago + unggah bukti privat, QRIS toko, serta COD sesuai kebijakan produk.',
            },
            {
              icon: 'headset',
              title: 'Konfirmasi WhatsApp',
              body: 'Hubungi tim admin dengan tautan pesanan aman kapan saja selama jam operasional.',
            },
          ],
        },
      },
    ];

    for (const s of initialSections) {
      await prisma.homepageSection.create({
        data: {
          type: s.type,
          sortOrder: s.sortOrder,
          draftSortOrder: s.sortOrder,
          status: 'ENABLED',
          draftStatus: 'ENABLED',
          draftContent: s.content,
          publishedContent: s.content,
          publishedAt: now,
        },
      });
    }
  }

  console.warn(`Seed selesai. Akun admin demo: ${adminEmail}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

