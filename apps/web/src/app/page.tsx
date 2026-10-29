'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  ArrowUpRight,
  Coffee,
  Headphones,
  Lamp,
  Package,
  RefreshCw,
  ShieldCheck,
  Shirt,
  Sparkles,
  Truck,
  Wallet,
} from 'lucide-react';
import { formatRupiah } from '@store/shared';
import { apiFetch, type PublicProduct } from '@/lib/api';
import { useStore } from '@/components/store-provider';
import { StorefrontShell } from '@/components/storefront-shell';
import { ProductCard } from '@/components/product-card';

interface CategoryItem {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  productCount: number;
}

function CategoryIcon({ name }: { name: string | null }) {
  switch (name) {
    case 'Headphones':
      return <Headphones className="w-6 h-6" />;
    case 'Lamp':
      return <Lamp className="w-6 h-6" />;
    case 'Shirt':
      return <Shirt className="w-6 h-6" />;
    case 'Coffee':
      return <Coffee className="w-6 h-6" />;
    default:
      return <Sparkles className="w-6 h-6" />;
  }
}

export default function HomePage() {
  const { config } = useStore();
  const [products, setProducts] = useState<PublicProduct[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiFetch<{ items: PublicProduct[]; total: number }>('/api/products?pageSize=8&sort=popular'),
      apiFetch<CategoryItem[]>('/api/categories'),
    ])
      .then(([prodRes, catRes]) => {
        setProducts(prodRes.items);
        setCategories(catRes);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  const sections = config?.homepage ?? [];
  const heroSec = (sections.find((s) => s.type === 'HERO')?.content ?? {}) as {
    eyebrow?: string;
    headline?: string;
    subtext?: string;
    imageUrl?: string;
    imageAlt?: string;
    primaryCta?: { label: string; href: string };
    secondaryCta?: { label: string; href: string };
  };
  const promoSec = (sections.find((s) => s.type === 'PROMO_BANNER')?.content ?? {}) as {
    eyebrow?: string;
    headline?: string;
    body?: string;
    voucherCode?: string;
    ctaLabel?: string;
    ctaHref?: string;
  };
  const valuePropsSec = (sections.find((s) => s.type === 'VALUE_PROPS')?.content ?? {}) as {
    items?: Array<{ icon: string; title: string; body: string }>;
  };

  const spotlight = products[0] ?? null;

  return (
    <StorefrontShell>
      {/* Hero Showcase Section — faithful to beranda_kala_store reference */}
      <section className="relative w-full px-4 sm:px-6 lg:px-12 py-10 lg:py-16 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          {/* Left Column: Editorial Statement */}
          <div className="lg:col-span-6 flex flex-col items-start space-y-5">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-surface-high text-[11px] font-bold tracking-widest text-accent-ink uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-accent-ink" />
              <span>{heroSec.eyebrow || 'PASTI MURAH, PASTI PUAS! • BELANJA HEMAT, TANPA RAGU'}</span>
            </div>

            <h1 className="font-serif text-4xl sm:text-5xl lg:text-[54px] text-primary tracking-tight leading-[1.08]">
              {heroSec.headline || 'Harga Bersahabat, Dompet Selamat.'}
            </h1>

            <p className="text-base sm:text-lg text-ink-muted max-w-xl leading-relaxed">
              {heroSec.subtext ||
                'Pastimurah menyediakan berbagai kebutuhan dengan harga terjangkau tanpa mengorbankan kualitas. Belanja mudah, pelayanan ramah, dan harganya pasti murah.'}
            </p>

            <div className="p-3.5 rounded-xl bg-surface border border-border/50 max-w-xl">
              <p className="text-xs sm:text-sm text-ink font-medium">
                &ldquo;Males bandingin harga? Di Pastimurah semuanya udah dibikin murah dari awal. Tinggal pilih, checkout, hemat!&rdquo;
              </p>
              <div className="flex flex-wrap gap-2 mt-2.5 text-[11px] font-semibold text-accent-ink">
                <span className="px-2.5 py-0.5 rounded-full bg-accent-soft/70">Pasti Murah, Pasti Puas!</span>
                <span className="px-2.5 py-0.5 rounded-full bg-accent-soft/70">Belanja Hemat, Tanpa Ragu.</span>
                <span className="px-2.5 py-0.5 rounded-full bg-accent-soft/70">Cari Murah? Pasti di Sini.</span>
                <span className="px-2.5 py-0.5 rounded-full bg-accent-soft/70">Murahnya Pasti, Kualitasnya Oke.</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 pt-2">
              <Link
                href={heroSec.primaryCta?.href || '/katalog'}
                className="px-7 py-3.5 bg-primary text-white text-sm font-semibold rounded-lg shadow-sm hover:bg-primary-container transition-all inline-flex items-center gap-2 group"
              >
                <span>{heroSec.primaryCta?.label || 'Jelajahi Katalog'}</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link
                href={heroSec.secondaryCta?.href || '/pesanan'}
                className="px-7 py-3.5 bg-surface-low text-ink text-sm font-semibold rounded-lg border border-border/60 hover:bg-surface-high transition-colors"
              >
                {heroSec.secondaryCta?.label || 'Lacak Pesanan'}
              </Link>
            </div>

            {/* Honest live stats from database (no fabricated 1.800+ claims) */}
            <div className="flex flex-wrap items-center gap-6 pt-3 text-xs font-semibold text-ink-muted">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-accent-ink" />
                <span>{products.length} Produk Aktif di Katalog</span>
              </div>
              <div className="h-3 w-[1px] bg-border" />
              <div className="flex items-center gap-2">
                <Truck className="w-4 h-4 text-accent-ink" />
                <span>Pengiriman Multi-Gudang &amp; Multi-Resi</span>
              </div>
            </div>
          </div>

          {/* Right Column: Editorial Highlight Hero Card */}
          <div className="lg:col-span-6">
            <div className="bg-surface rounded-2xl p-4 md:p-6 shadow-sm border border-border/40">
              <div className="relative aspect-[4/3] rounded-xl overflow-hidden bg-surface-low">
                <img
                  src={heroSec.imageUrl || '/demo/hero.jpg'}
                  alt={heroSec.imageAlt || 'Ruang kurasi modern'}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-primary/70 via-transparent to-transparent" />
                <div className="absolute top-4 left-4">
                  <span className="px-3 py-1 rounded-full bg-surface/90 backdrop-blur-md text-primary text-[11px] font-bold tracking-wider uppercase">
                    Sorotan Kurasi
                  </span>
                </div>
                {spotlight && (
                  <div className="absolute bottom-4 left-4 right-4 text-white flex justify-between items-end gap-4">
                    <div>
                      <span className="text-[10px] font-bold tracking-widest text-surface-high uppercase block mb-0.5">
                        {spotlight.category?.name || 'Koleksi Pilihan'}
                      </span>
                      <Link
                        href={`/produk/${spotlight.slug}`}
                        className="font-serif text-lg sm:text-xl font-medium hover:underline line-clamp-1"
                      >
                        {spotlight.name}
                      </Link>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-[10px] font-bold uppercase text-surface-high block">
                        Harga
                      </span>
                      <span className="font-semibold text-base sm:text-lg">
                        {formatRupiah(spotlight.salePrice)}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-3 gap-3 pt-4">
                <div className="p-3 rounded-lg bg-surface-low">
                  <span className="text-[10px] font-bold text-ink-muted uppercase block">
                    Sumber Stok
                  </span>
                  <span className="text-xs font-semibold text-ink mt-1 block">
                    Database Gudang Aktif
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-surface-low">
                  <span className="text-[10px] font-bold text-ink-muted uppercase block">
                    Pembayaran
                  </span>
                  <span className="text-xs font-semibold text-ink mt-1 block">
                    Transfer, QRIS &amp; COD
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-surface-low">
                  <span className="text-[10px] font-bold text-ink-muted uppercase block">
                    Pelacakan
                  </span>
                  <span className="text-xs font-semibold text-ink mt-1 block">
                    Resi per Sub-Pesanan
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Quick Categories Grid */}
      <section className="w-full px-4 sm:px-6 lg:px-12 py-10 max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
          <div>
            <span className="text-[11px] font-bold text-accent-ink uppercase tracking-widest block mb-1">
              CARI MURAH? PASTI DI SINI
            </span>
            <h2 className="font-serif text-2xl sm:text-3xl text-primary tracking-tight">
              Kategori Pilihan Pasti Murahnya
            </h2>
          </div>
          <Link
            href="/katalog"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-muted hover:text-primary transition-colors"
          >
            <span>Lihat Semua Kategori ({categories.length})</span>
            <ArrowUpRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {categories.map((cat) => (
            <Link
              key={cat.id}
              href={`/katalog?category=${encodeURIComponent(cat.slug)}`}
              className="group flex flex-col items-center text-center p-5 rounded-xl bg-surface hover:bg-surface-low border border-border/30 transition-all shadow-sm"
            >
              <div className="w-14 h-14 rounded-full bg-surface-low group-hover:bg-primary group-hover:text-white transition-colors flex items-center justify-center text-primary mb-3">
                <CategoryIcon name={cat.icon} />
              </div>
              <h3 className="text-sm font-semibold text-ink group-hover:text-primary">
                {cat.name}
              </h3>
              <span className="text-xs text-ink-muted mt-1">{cat.productCount} Produk</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Curated Products Grid */}
      <section className="w-full px-4 sm:px-6 lg:px-12 py-10 max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
          <div>
            <span className="text-[11px] font-bold text-accent-ink uppercase tracking-widest block mb-1">
              MURAHNYA PASTI, KUALITASNYA OKE
            </span>
            <h2 className="font-serif text-2xl sm:text-3xl text-primary tracking-tight">
              Pilihan Hemat Minggu Ini
            </h2>
          </div>
          <Link
            href="/katalog"
            className="text-xs font-semibold text-ink-muted hover:text-primary inline-flex items-center gap-1"
          >
            <span>Buka Katalog Lengkap</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((n) => (
              <div
                key={n}
                className="rounded-2xl bg-surface p-4 border border-border/30 animate-pulse space-y-4"
              >
                <div className="aspect-[3/4] rounded-xl bg-surface-low" />
                <div className="h-4 bg-surface-low rounded w-2/3" />
                <div className="h-5 bg-surface-low rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="rounded-2xl bg-surface p-10 text-center border border-border/40">
            <p className="text-sm text-ink-muted">Belum ada produk aktif di katalog.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {products.slice(0, 8).map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </section>

      {/* Editorial Evergreen Promo Banner */}
      <section className="w-full px-4 sm:px-6 lg:px-12 py-8 max-w-7xl mx-auto">
        <div className="relative rounded-2xl bg-evergreen text-white p-8 sm:p-12 overflow-hidden shadow-md">
          <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-8 space-y-4">
              <span className="inline-block px-3 py-1 rounded-full bg-white/10 text-accent text-[11px] font-bold tracking-widest uppercase">
                {promoSec.eyebrow || 'MALES BANDINGIN HARGA?'}
              </span>
              <h2 className="font-serif text-2xl sm:text-4xl leading-tight">
                {promoSec.headline ||
                  'Di Pastimurah Semuanya Udah Dibikin Murah dari Awal. Tinggal Pilih, Checkout, Hemat!'}
              </h2>
              <p className="text-sm sm:text-base text-evergreen-soft/90 max-w-2xl leading-relaxed">
                {promoSec.body ||
                  'Murahnya Pasti, Kualitasnya Oke. Setiap item dikirim langsung dari gudang pemasok terdekat dengan nomor resi dan dokumen PDF pengiriman pada satu halaman pesanan.'}
              </p>
              <div className="pt-2 flex flex-wrap items-center gap-4">
                {promoSec.voucherCode && (
                  <div className="px-4 py-2.5 rounded-lg bg-white/10 border border-white/20 text-xs font-mono">
                    KODE: <strong className="text-accent">{promoSec.voucherCode}</strong>
                  </div>
                )}
                <Link
                  href={promoSec.ctaHref || '/katalog'}
                  className="px-6 py-3 rounded-lg bg-accent text-primary text-xs font-bold uppercase tracking-wider hover:bg-accent-soft transition-colors"
                >
                  {promoSec.ctaLabel || 'Jelajahi Katalog Sekarang'}
                </Link>
              </div>
            </div>

            <div className="lg:col-span-4 flex flex-col gap-3 bg-white/5 border border-white/10 rounded-xl p-5">
              <p className="text-[11px] font-bold uppercase tracking-widest text-accent">
                Alur Pesanan Transparan
              </p>
              <ol className="space-y-2.5 text-xs text-evergreen-soft">
                <li>1. Pilih produk &amp; cek ongkir otomatis per gudang asal.</li>
                <li>2. Pilih Transfer Bank Jago, QRIS Toko, atau COD.</li>
                <li>3. Pantau resi tiap paket &amp; unduh PDF label pengiriman.</li>
              </ol>
            </div>
          </div>
        </div>
      </section>

      {/* Value Proposition Section */}
      <section className="w-full px-4 sm:px-6 lg:px-12 py-8 max-w-7xl mx-auto">
        <div className="rounded-2xl bg-surface p-6 sm:p-8 border border-border/40 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {(
            valuePropsSec.items ?? [
              {
                icon: 'package',
                title: 'Multi-Gudang Terkurasi',
                body: 'Alokasi otomatis ke penawaran pemasok aktif dengan stok terverifikasi.',
              },
              {
                icon: 'truck',
                title: 'Pelacakan Multi-Resi',
                body: 'Pesanan dari beberapa gudang menampilkan setiap resi secara mandiri.',
              },
              {
                icon: 'wallet',
                title: 'Transfer Terverifikasi & COD',
                body: 'Bukti transfer disimpan privat & diverifikasi admin sebelum diproses.',
              },
              {
                icon: 'headset',
                title: 'Dukungan WhatsApp Resmi',
                body: 'Tautan komunikasi cepat dengan referensi pesanan yang aman.',
              },
            ]
          ).map((item, idx) => (
            <div key={idx} className="flex items-start gap-3.5">
              <div className="w-9 h-9 rounded-lg bg-surface-low flex items-center justify-center text-accent-ink shrink-0">
                {item.icon === 'truck' ? (
                  <Truck className="w-4 h-4" />
                ) : item.icon === 'wallet' ? (
                  <Wallet className="w-4 h-4" />
                ) : item.icon === 'refresh' ? (
                  <RefreshCw className="w-4 h-4" />
                ) : (
                  <ShieldCheck className="w-4 h-4" />
                )}
              </div>
              <div>
                <h3 className="text-xs font-bold text-ink">{item.title}</h3>
                <p className="text-xs text-ink-muted mt-1 leading-relaxed">{item.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </StorefrontShell>
  );
}

