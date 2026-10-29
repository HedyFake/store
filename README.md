# Website Toko Online Dropship Custom — Stitch Premium Editorial Edition

Platform e-commerce dropship multi-supplier dan multi-gudang full-stack yang dibangun mengikuti sistem desain **Stitch Premium Editorial** (`#F9F9F8` warm ivory, `#1A1C1C` deep ink, `#FECE57` warm gold accent, `#15221E` evergreen trust, tipografi `Newsreader` + `Plus Jakarta Sans`).

---

## 1. Ringkasan Audit Desain & Kode Warisan

### A. Audit 6 Layar Referensi Stitch (`references/design_reference/`)
Seluruh 6 layar (`code.html` + `screen.png`) telah diaudit dan diterjemahkan ke komponen aplikasi nyata:
1. **`home_page_storefront/`**: Announcement bar, sticky glass header, hero editorial 7/5 kolom dengan kartu produk mengambang, strip kategori horizontal, produk pilihan dengan badge terkurasi, banner promosi evergreen (`#15221E`), 4 kartu nilai utama, dan footer 4 kolom.
2. **`product_catalog_search/`**: Breadcrumb, judul koleksi, toolbar pencarian/filter/sortir, sidebar filter (kategori, rentang harga IDR, stok tersedia, dukungan COD), grid produk 3 kolom, dan paginasi.
3. **`product_detail_page/`**: Galeri utama `4:5` + thumbnail, pill kategori & SKU, nama produk dengan font serif `Newsreader`, harga IDR + harga coret, pemilih varian berbasis database, indikator stok nyata + estimasi asal gudang, kuantitas, tombol **Tambah ke Keranjang** (`#FECE57`) & **Beli Sekarang**, kartu estimasi pengiriman/COD, serta produk terkait.
4. **`shopping_cart_checkout/`**: Layout 2 kolom dengan daftar item keranjang, formulir alamat pengiriman (pencarian kota/kecamatan RajaOngkir Komerce + input manual), **rincian paket per gudang pemasok (`Pengiriman 1 dari N`)** dengan pilihan layanan kurir masing-masing, pemilih metode pembayaran (**Transfer Bank Manual**, **QRIS Toko**, **COD**, serta **QRIS/VA Midtrans** bila kredensial aktif), dan ringkasan biaya transparan.
5. **`admin_product_upload_management/`**: Sidebar gelap `#1A1C1C` dengan aksen aktif `#FECE57`, header aksi cepat, kartu metrik inventaris, panel **Mass Upload CSV** (unduh template `06_PRODUCT_IMPORT_TEMPLATE.csv`, preview/dry-run, pilihan mode `CREATE_ONLY` atau `UPSERT_BY_SKU`, pelindung kolom sensitif, unduh laporan error CSV), daftar inventaris dengan filter & penyesuaian stok, serta modal tambah/edit produk multi-penawaran pemasok.
6. **`admin_homepage_main_page_editor/`**: CMS editor halaman utama dengan daftar seksi (`HERO`, `CATEGORIES`, `FEATURED_PRODUCTS`, `PROMO_BANNER`, `VALUE_PROPS`), toggle aktif/nonaktif, simpan draf vs publikasi (`Publish Changes`), dan pratinjau langsung.

> **Kepatuhan Kejujuran Data (Anti-Fabrication)**: Seluruh klaim fiktif dari mockup HTML (`4.9 (128 ulasan)`, `Garansi 2 Tahun`, `100% Original`, merek fiktif `KALA`, atau nomor resi rekayasa) telah dibersihkan dan digantikan dengan data nyata dari database atau pengaturan yang dikendalikan pemilik toko.

### B. Audit Kode Warisan (`references/legacy_starter_kits/`)
- **`dropship-kit.zip`** & **`dropship-main-1-annotated.zip`**: Berupa prototipe awal dengan skema terbatas dan tanpa pemisahan `SupplierOffer` / `SupplierOrder` / `Shipment` multi-gudang maupun validasi magic-bytes bukti bayar.
- **Keputusan Arsitektur**: Membangun skema Prisma, kontrak bersama (`@store/shared`), API NestJS (`@store/api`), dan antarmuka Next.js (`@store/web`) secara bersih dari awal dengan mempertahankan seluruh aturan keamanan dan state machine dari dokumen spesifikasi `01`–`08`.

---

## 2. Arsitektur Monorepo

```text
productweb/
├── apps/
│   ├── api/                 # Backend NestJS (REST API, RBAC, Checkout, CSV Import, Telegram, Webhooks)
│   └── web/                 # Frontend Next.js 15 App Router + Tailwind CSS (Etalase Publik & Dashboard Admin)
├── packages/
│   └── shared/              # Paket kontrak bersama (Zod schemas, IDR money utils, CSV parser, state machine)
├── prisma/
│   ├── schema.prisma        # Skema PostgreSQL lengkap (21 model & 14 enum)
│   └── seed.ts              # Seeder idempoten (pengaturan toko, kategori, 2 pemasok/gudang, 8 produk demo)
├── scripts/
│   ├── dev-db.ts            # Orkestrator Embedded PostgreSQL otomatis + migrasi + seed untuk lingkungan lokal
│   └── create-admin.ts      # CLI pembuatan/pembaruan akun admin
├── 06_PRODUCT_IMPORT_TEMPLATE.csv
└── .env.example             # Template konfigurasi tanpa rahasia/kredensial
```

---

## 3. Cara Instalasi & Menjalankan Proyek

### Prasyarat
- **Node.js**: `>= 20.11.0` (direkomendasikan v22 LTS) dan `npm >= 10`
- **Database**: Proyek ini mendukung **PostgreSQL eksternal** (Docker / layanan cloud) **maupun Embedded PostgreSQL otomatis** (tanpa perlu menginstal Docker atau layanan PostgreSQL terpisah di Windows/macOS/Linux).

### Langkah Cepat (Quick Start)

1. **Salin file environment**:
   ```bash
   cp .env.example .env
   ```
   Pastikan `AUTH_SECRET` berisi string acak minimal 32 karakter.

2. **Instal dependensi & generate Prisma Client**:
   ```bash
   npm install
   npx prisma generate
   ```

3. **Jalankan mode pengembangan lengkap (Database Embedded + Seed + API + Web)**:
   ```bash
   npm run dev:full
   ```
   Perintah `npm run dev:full` akan:
   - Menyalakan instance PostgreSQL lokal pada port `5433` (menyimpan data di `.dev-postgres/`),
   - Menerapkan skema Prisma (`prisma db push`) dan menjalankan `prisma/seed.ts`,
   - Membuat akun admin awal (`admin@atelier-nusantara.id` / `AdminDropship123!`) bila belum ada,
   - Menjalankan server backend NestJS di `http://localhost:4000` dan frontend Next.js di `http://localhost:3000`.

### Jika Menggunakan PostgreSQL Eksternal
Apabila Anda menggunakan PostgreSQL sendiri:
```bash
# Atur DATABASE_URL di .env, lalu jalankan:
npm run db:push
npm run db:seed
npm run create-admin -- --email=owner@tokoanda.id --password=PasswordKuat123! --name="Pemilik Toko" --role=OWNER
npm run dev
```

---

## 4. Cara Membuat Akun Admin Baru

Gunakan skrip CLI [`scripts/create-admin.ts`](file:///c:/Users/wibyj/Documents/productweb/scripts/create-admin.ts):
```bash
npm run create-admin -- --email=admin@tokoanda.id --password=PasswordMinimal8Karakter! --name="Admin Utama" --role=OWNER
```
Role yang didukung: `OWNER`, `ADMIN`, `STAFF`.

---

## 5. Cara Menjalankan Build, Typecheck, Lint, dan Pengujian

```bash
# 1. Build paket kontrak bersama (@store/shared)
npm run build:shared

# 2. Typecheck seluruh workspace (@store/shared, @store/api, @store/web)
npm run typecheck

# 3. Lint seluruh workspace
npm run lint

# 4. Jalankan unit tests (@store/shared) + API integration tests (@store/api)
npm test

# 5. Build production penuh (shared + NestJS API + Next.js Web)
npm run build
```

---

## 6. Alur Fitur & Keamanan Utama

### A. Pembayaran, Bukti Transfer Privat, & COD
- **Transfer Bank Manual (`BANK_TRANSFER`) & QRIS Toko (`QRIS_STATIC`)**:
  - Pesanan dibuat dengan status pembayaran `UNPAID` dan status pesanan `PENDING_PAYMENT`.
  - Pelanggan mengunggah bukti bayar (`JPG`, `PNG`, atau `PDF`, maks. 5 MB). Backend memeriksa ekstensi, MIME, **magic bytes header & struktur akhir file (`%%EOF`, `IEND`, `FF D9`)**, serta kepemilikan pesanan melalui token `key`.
  - Mengunggah bukti bayar **hanya** mengubah status pembayaran menjadi `PENDING_REVIEW` (tidak pernah otomatis `PAID`).
  - Admin memeriksa bukti bayar di `/admin/orders`, mencocokkan nominal Rupiah (`reviewedAmount === grandTotal`), lalu menyetujui (`PAID`) atau menolak (`UNPAID` + alasan penolakan).
- **COD (`COD`)**:
  - Dimulai sebagai `COD_PENDING_COLLECTION` dan `AWAITING_FULFILLMENT`.
  - Hanya berubah menjadi `COD_COLLECTED` setelah admin melakukan rekonsiliasi COD beserta bukti setoran kurir, atau `COD_FAILED` bila pengiriman gagal/ditolak.
- **Payment Gateway Midtrans (`QRIS_GATEWAY`, `VIRTUAL_ACCOUNT`)**:
  - Hanya diaktifkan bila `PAYMENT_PROVIDER=midtrans` dan `MIDTRANS_SERVER_KEY` dikonfigurasi.
  - Webhook `POST /api/webhooks/payments/midtrans` memverifikasi tanda tangan `SHA-512(order_id + status_code + gross_amount + ServerKey)` secara constant-time (`timingSafeEqual`), memvalidasi kecocokan `gross_amount`, dan mencatat `WebhookEvent` agar idempoten terhadap pengiriman ulang webhook.

### B. Multi-Supplier, Multi-Gudang, & Pemecahan Pengiriman (`Order Splitting`)
- Satu `Product` dapat memiliki banyak `SupplierOffer` dari pemasok dan gudang berbeda.
- Saat checkout, algoritma deterministik (`fulfillmentPriority ASC`, `stockQty DESC`, `costPrice ASC`) memilih penawaran aktif dengan stok cukup dan mengelompokkannya per `supplierId:warehouseId`.
- Satu `Order` pelanggan otomatis dipecah menjadi beberapa `SupplierOrder` (sub-pesanan per gudang) dengan ongkir dan kurir masing-masing.
- Setiap `SupplierOrder` dapat memiliki satu atau lebih `Shipment`. Nomor resi (`trackingNumber`) bersifat nullable (`AWAITING_TRACKING`) sampai benar-benar diterbitkan oleh kurir/pemasok (`TRACKING_AVAILABLE`) — sistem tidak pernah menghasilkan nomor resi palsu.

### C. Pengiriman PDF Resi ke Telegram Bot (`sendDocument`)
- Saat admin mengunggah label/resi PDF pada suatu `Shipment` (`POST /api/admin/shipments/:id/documents`), file divalidasi sebagai PDF asli (`%PDF-` + `%%EOF`), disimpan di penyimpanan privat, dan didaftarkan ke tabel `TelegramDelivery`.
- `TelegramService` mengirim dokumen melalui `https://api.telegram.org/bot<TOKEN>/sendDocument` dengan caption terstruktur (nomor pesanan, indeks pengiriman `1 dari N`, pemasok/gudang, kurir, nomor resi).
- Mendukung deduplikasi berbasis SHA-256 (`ALREADY_SENT`), retry dengan exponential backoff untuk kegagalan jaringan/`429`/`5xx`, tombol retry manual di dashboard admin, serta mode `dryRun` saat `TELEGRAM_SEND_ENABLED=false`.

### D. Mass Upload Produk CSV
- Template resmi tersedia di [`06_PRODUCT_IMPORT_TEMPLATE.csv`](file:///c:/Users/wibyj/Documents/productweb/06_PRODUCT_IMPORT_TEMPLATE.csv) atau melalui tombol **Unduh Template CSV** di `/admin`.
- Tahap 1 (**Preview / Dry-Run**): Memvalidasi header, format SKU, harga integer IDR, berat, kelengkapan kolom pemasok/gudang, serta mendeteksi SKU/slug duplikat di dalam file tanpa mengubah database.
- Tahap 2 (**Commit**): Admin memilih mode `CREATE_ONLY` (tolak SKU yang sudah ada) atau `UPSERT_BY_SKU` (perbarui SKU yang sudah ada). Kolom sensitif (`PRICE`, `COST`, `STOCK`, `STATUS`, `SUPPLIER`, `COD`) dilindungi secara default pada SKU lama kecuali dicentang secara eksplisit oleh admin.
- Laporan baris gagal dapat diunduh sebagai file CSV (`GET /api/admin/imports/:jobId/errors.csv`).

---

## 7. Status Implementasi Jujur & Go-Live Checklist

| Area Fitur | Status | Keterangan |
| :--- | :--- | :--- |
| Etalase Publik Stitch (6 Layar Referensi) | **SELESAI** | Beranda, Katalog + Filter/Sortir, Detail Produk, Keranjang & Checkout Multi-Gudang, Pelacakan Pesanan, Halaman Kebijakan. |
| Dashboard Admin Lengkap | **SELESAI** | Produk + Varian, Penawaran Pemasok, Mass Upload CSV, Pesanan, Verifikasi Bukti Bayar, Rekonsiliasi COD, Pengiriman/Resi + Upload PDF, CMS Beranda, Pelanggan, Pengaturan Toko, Audit Log. |
| Transfer Bank Manual + Bukti Privat & COD | **SELESAI** | Validasi magic-bytes (`JPG`/`PNG`/`PDF`), penyimpanan privat, signed access via token pesanan/admin. |
| Integrasi Ongkir RajaOngkir Komerce API v1 | **SELESAI** | Pencarian destinasi domestik & kalkulasi ongkir per gudang asal, dengan fallback tarif tetap otomatis bila API offline. |
| Bot Telegram `sendDocument` PDF Resi | **SELESAI** | Validasi PDF, pengiriman multipart `sendDocument`, pencatatan `TelegramDelivery`, retry & tombol tes koneksi. |
| Adapter Midtrans QRIS / Virtual Account | **SEBAGIAN (Siap Pakai, Tertunda Kredensial)** | Endpoint pembuatan pembayaran & webhook SHA-512 terverifikasi + diuji di integration test; aktif otomatis saat `PAYMENT_PROVIDER=midtrans` dan `MIDTRANS_SERVER_KEY` diisi. |
| Penyimpanan Objek S3 Privat | **SEBAGIAN (Siap Pakai, Tertunda Kredensial)** | Menggunakan penyimpanan privat lokal (`apps/api/storage/`) di development dan beralih ke S3 signed URL saat `STORAGE_PROVIDER=s3` beserta kredensial bucket dikonfigurasi. |

### Checklist Sebelum Go-Live Produksi
1. Ganti `AUTH_SECRET` di `.env` produksi dengan nilai acak kriptografis baru (`openssl rand -hex 32`).
2. Pastikan `DEMO_MODE=false` dan arsipkan/hapus produk demo sebelum menerima pesanan pelanggan nyata.
3. Periksa pengaturan rekening bank, gambar QRIS toko, dan nomor WhatsApp di `/admin/settings`.
4. Tinjau dan tandai halaman kebijakan hukum (`/admin/settings` -> Halaman Kebijakan) sebagai telah ditinjau pemilik toko.
5. Aktifkan `TELEGRAM_SEND_ENABLED=true` di `.env` jika ingin pengiriman otomatis PDF resi ke grup/chat operasional Telegram.

#   s t o r e  
 # store
# store
