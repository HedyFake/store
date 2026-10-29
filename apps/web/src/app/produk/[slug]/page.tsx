'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowRight,
  CheckCircle2,
  Heart,
  MapPin,
  Minus,
  Package,
  Plus,
  ShieldCheck,
  ShoppingBag,
  Truck,
} from 'lucide-react';
import { formatRupiah } from '@store/shared';
import { apiFetch, type PublicProduct } from '@/lib/api';
import { useStore } from '@/components/store-provider';
import { StorefrontShell } from '@/components/storefront-shell';
import { ProductCard } from '@/components/product-card';

export default function ProductDetailPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const { addToCart, wishlist, toggleWishlist } = useStore();

  const [product, setProduct] = useState<PublicProduct | null>(null);
  const [related, setRelated] = useState<PublicProduct[]>([]);
  const [selectedImage, setSelectedImage] = useState(0);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [activeTab, setActiveTab] = useState<'story' | 'specs'>('story');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!params?.slug) return;
    setLoading(true);
    setError(null);
    apiFetch<{ product: PublicProduct; related: PublicProduct[] }>(`/api/products/${params.slug}`)
      .then((res) => {
        setProduct(res.product);
        setRelated(res.related);
        setSelectedImage(0);
        setSelectedVariantId(res.product.variants[0]?.id ?? null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Produk tidak ditemukan'))
      .finally(() => setLoading(false));
  }, [params?.slug]);

  if (loading) {
    return (
      <StorefrontShell>
        <div className="max-w-7xl mx-auto px-6 lg:px-12 py-12 animate-pulse grid grid-cols-1 lg:grid-cols-12 gap-10">
          <div className="lg:col-span-7 aspect-[4/3] bg-surface-low rounded-2xl" />
          <div className="lg:col-span-5 space-y-4">
            <div className="h-8 bg-surface-low rounded w-3/4" />
            <div className="h-6 bg-surface-low rounded w-1/2" />
            <div className="h-24 bg-surface-low rounded" />
          </div>
        </div>
      </StorefrontShell>
    );
  }

  if (error || !product) {
    return (
      <StorefrontShell>
        <div className="max-w-2xl mx-auto px-6 py-20 text-center space-y-4">
          <h1 className="font-serif text-3xl text-primary">Produk Tidak Ditemukan</h1>
          <p className="text-sm text-ink-muted">{error}</p>
          <Link
            href="/katalog"
            className="inline-block px-6 py-3 rounded-lg bg-primary text-white text-xs font-semibold"
          >
            Kembali ke Katalog
          </Link>
        </div>
      </StorefrontShell>
    );
  }

  const activeVariant = product.variants.find((v) => v.id === selectedVariantId) ?? null;
  const effectivePrice = activeVariant ? activeVariant.effectivePrice : product.salePrice;
  const availableStock = activeVariant ? activeVariant.stockQty : product.availability.totalStock;
  const inStock = availableStock > 0;
  const isSaved = wishlist.includes(product.id);
  const images = product.images.length
    ? product.images
    : [{ id: 'fallback', url: '/demo/lamp.jpg', alt: product.name }];
  const currentImg = images[selectedImage] ?? images[0];

  const handleAdd = (buyNow = false) => {
    if (!inStock) return;
    addToCart({
      productId: product.id,
      variantId: activeVariant?.id ?? null,
      slug: product.slug,
      name: product.name,
      variantName: activeVariant?.name ?? null,
      sku: activeVariant?.sku ?? product.sku,
      imageUrl: currentImg.url,
      unitPrice: effectivePrice,
      quantity,
    });
    if (buyNow) router.push('/checkout');
  };

  return (
    <StorefrontShell>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-12 py-8">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="text-xs text-ink-muted mb-6 flex items-center gap-2 flex-wrap">
          <Link href="/" className="hover:text-ink">
            Beranda
          </Link>
          <span>/</span>
          <Link
            href={
              product.category
                ? `/katalog?category=${encodeURIComponent(product.category.slug)}`
                : '/katalog'
            }
            className="hover:text-ink"
          >
            {product.category?.name || 'Katalog'}
          </Link>
          <span>/</span>
          <span className="text-ink font-medium">{product.name}</span>
        </nav>

        {/* Main Product Showcase Grid (7 cols gallery + 5 cols narrative/checkout box) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
          {/* Left Column: Gallery & Highlights */}
          <div className="lg:col-span-7 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
              {images.length > 1 && (
                <div className="sm:col-span-2 flex sm:flex-col gap-3 order-2 sm:order-1 overflow-x-auto">
                  {images.map((img, idx) => (
                    <button
                      key={img.id}
                      type="button"
                      onClick={() => setSelectedImage(idx)}
                      className={`w-16 h-16 sm:w-full sm:aspect-square rounded-xl overflow-hidden border-2 transition-all shrink-0 ${
                        selectedImage === idx ? 'border-primary' : 'border-transparent opacity-70'
                      }`}
                    >
                      <img src={img.url} alt={img.alt || product.name} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}

              <div
                className={`${
                  images.length > 1 ? 'sm:col-span-10' : 'sm:col-span-12'
                } order-1 sm:order-2 relative aspect-[4/4] rounded-2xl overflow-hidden bg-surface border border-border/40`}
              >
                <img
                  src={currentImg.url}
                  alt={currentImg.alt || product.name}
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-4 left-4 flex flex-wrap gap-2">
                  {product.isDemo && (
                    <span className="px-3 py-1 rounded-full bg-primary text-white text-[10px] font-bold uppercase tracking-wider">
                      DATA CONTOH (DEMO)
                    </span>
                  )}
                  {product.badges
                    .filter((b) => b.toUpperCase() !== 'DEMO')
                    .map((b) => (
                      <span
                        key={b}
                        className="px-3 py-1 rounded-full bg-accent text-primary text-[10px] font-bold uppercase tracking-wider"
                      >
                        {b}
                      </span>
                    ))}
                </div>
              </div>
            </div>

            {/* Highlights bar */}
            {product.highlights.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {product.highlights.slice(0, 3).map((hl, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-xl bg-surface border border-border/40 flex items-center gap-3"
                  >
                    <CheckCircle2 className="w-4 h-4 text-accent-ink shrink-0" />
                    <span className="text-xs font-semibold text-ink">{hl}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right Column: Narrative, Variant Selectors & Action Box */}
          <div className="lg:col-span-5 flex flex-col space-y-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[11px] font-bold uppercase tracking-widest text-accent-ink">
                  {product.category?.name || 'KOLEKSI KURASI'}
                </span>
                <span className="text-border">•</span>
                <span className="text-[11px] font-mono text-ink-muted">
                  SKU: {activeVariant?.sku ?? product.sku}
                </span>
              </div>

              <h1 className="font-serif text-2xl sm:text-3xl lg:text-4xl text-primary leading-tight">
                {product.name}
              </h1>
            </div>

            {/* Pricing box */}
            <div className="p-5 rounded-2xl bg-surface border border-border/50 space-y-2">
              <div className="flex items-baseline gap-3 flex-wrap">
                <span className="text-2xl sm:text-3xl font-bold text-primary">
                  {formatRupiah(effectivePrice)}
                </span>
                {product.compareAtPrice && product.compareAtPrice > effectivePrice && (
                  <>
                    <span className="text-sm text-ink-muted line-through">
                      {formatRupiah(product.compareAtPrice)}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-danger-soft text-danger text-[11px] font-bold">
                      Hemat{' '}
                      {Math.round(
                        ((product.compareAtPrice - effectivePrice) / product.compareAtPrice) * 100,
                      )}
                      %
                    </span>
                  </>
                )}
              </div>
              <p className="text-xs text-ink-muted">
                Harga resmi server dalam Rupiah (IDR). Ongkos kirim dihitung saat checkout sesuai
                gudang asal dan kecamatan tujuan.
              </p>
            </div>

            {/* Variants selector */}
            {product.variants.length > 0 && (
              <div className="space-y-2.5">
                <label className="text-xs font-bold uppercase tracking-wider text-ink block">
                  Pilih Varian / Tipe Paket
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {product.variants.map((v) => {
                    const selected = v.id === selectedVariantId;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => setSelectedVariantId(v.id)}
                        className={`p-3.5 rounded-xl border text-left transition-all ${
                          selected
                            ? 'border-primary bg-surface shadow-sm ring-1 ring-primary'
                            : 'border-border/60 bg-surface/60 hover:bg-surface'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-ink">{v.name}</span>
                          <span className="text-[11px] font-semibold text-accent-ink">
                            {formatRupiah(v.effectivePrice)}
                          </span>
                        </div>
                        <span className="text-[11px] text-ink-muted mt-1 block">
                          Stok: {v.stockQty} unit
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Quantity & live database stock indicator */}
            <div className="flex items-center justify-between gap-4 pt-1">
              <div>
                <span className="text-xs font-bold text-ink block">Jumlah Pesanan</span>
                <span
                  className={`text-xs font-medium flex items-center gap-1.5 mt-0.5 ${
                    inStock ? 'text-success' : 'text-danger'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${inStock ? 'bg-success' : 'bg-danger'}`}
                  />
                  {inStock
                    ? `Tersedia ${availableStock} unit (${
                        product.availability.originCities.join(', ') || 'Gudang Mitra'
                      })`
                    : 'Stok sedang habis'}
                </span>
              </div>

              <div className="inline-flex items-center rounded-xl border border-border bg-surface">
                <button
                  type="button"
                  aria-label="Kurangi jumlah"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="p-2.5 text-ink hover:bg-surface-low"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="w-10 text-center text-sm font-semibold">{quantity}</span>
                <button
                  type="button"
                  aria-label="Tambah jumlah"
                  onClick={() => setQuantity((q) => Math.min(Math.max(1, availableStock), q + 1))}
                  className="p-2.5 text-ink hover:bg-surface-low"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Action CTAs */}
            <div className="space-y-3 pt-2">
              <div className="flex gap-3">
                <button
                  type="button"
                  disabled={!inStock}
                  onClick={() => handleAdd(false)}
                  className="flex-1 py-3.5 px-5 bg-primary text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 hover:bg-primary-container disabled:bg-surface-high disabled:text-ink-muted transition-colors"
                >
                  <ShoppingBag className="w-4 h-4" />
                  <span>{inStock ? 'Tambah ke Keranjang' : 'Stok Habis'}</span>
                </button>
                <button
                  type="button"
                  aria-label="Simpan ke favorit"
                  onClick={() => toggleWishlist(product.id, product.name)}
                  className={`px-4 rounded-xl border border-border bg-surface hover:bg-surface-low flex items-center justify-center ${
                    isSaved ? 'text-danger' : 'text-ink'
                  }`}
                >
                  <Heart className={`w-5 h-5 ${isSaved ? 'fill-current' : ''}`} />
                </button>
              </div>

              <button
                type="button"
                disabled={!inStock}
                onClick={() => handleAdd(true)}
                className="w-full py-3.5 px-5 bg-accent text-primary rounded-xl text-sm font-bold flex items-center justify-center gap-2 hover:bg-accent-soft disabled:opacity-50 transition-colors"
              >
                <span>Beli Sekarang Langsung</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            {/* Fulfilment & supplier transparency box */}
            <div className="p-4 rounded-2xl bg-surface-low border border-border/50 space-y-3 text-xs">
              <div className="flex items-start gap-3">
                <MapPin className="w-4 h-4 text-accent-ink shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-ink block">Lokasi Gudang Pengiriman</span>
                  <span className="text-ink-muted">
                    Dikirim dari:{' '}
                    {product.availability.originCities.length
                      ? product.availability.originCities.join(' / ')
                      : 'Gudang Mitra'}
                    {product.availability.leadTimeDaysMin != null &&
                      ` • Estimasi proses ${product.availability.leadTimeDaysMin}–${product.availability.leadTimeDaysMax} hari kerja`}
                  </span>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Truck className="w-4 h-4 text-accent-ink shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-ink block">Metode Pembayaran Didukung</span>
                  <span className="text-ink-muted">
                    Transfer Bank, QRIS Toko
                    {product.availability.codSupported
                      ? ', serta Bayar di Tempat (COD).'
                      : ' (Produk ini tidak mendukung COD).'}
                  </span>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <ShieldCheck className="w-4 h-4 text-accent-ink shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-ink block">Nomor Resi Resmi</span>
                  <span className="text-ink-muted">
                    Setiap pengiriman menampilkan kurir, nomor resi, dan dokumen PDF label pada
                    halaman pelacakan pesanan.
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs: Editorial Story & Technical Specifications */}
        <div className="mt-14 pt-8 border-t border-border/50">
          <div className="flex gap-8 border-b border-border/50 mb-6 text-sm font-semibold">
            <button
              type="button"
              onClick={() => setActiveTab('story')}
              className={`pb-3 border-b-2 transition-colors ${
                activeTab === 'story'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-ink-muted hover:text-ink'
              }`}
            >
              Deskripsi &amp; Detail Produk
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('specs')}
              className={`pb-3 border-b-2 transition-colors ${
                activeTab === 'specs'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-ink-muted hover:text-ink'
              }`}
            >
              Spesifikasi &amp; Informasi Pengiriman
            </button>
          </div>

          {activeTab === 'story' ? (
            <div className="max-w-3xl space-y-4 text-sm text-ink leading-relaxed whitespace-pre-line">
              {product.description || 'Deskripsi produk belum ditambahkan.'}
            </div>
          ) : (
            <div className="max-w-2xl bg-surface rounded-2xl border border-border/40 divide-y divide-border/40 text-xs">
              <div className="p-4 flex justify-between">
                <span className="text-ink-muted">Kode SKU Toko</span>
                <span className="font-mono font-semibold">{product.sku}</span>
              </div>
              <div className="p-4 flex justify-between">
                <span className="text-ink-muted">Berat Pengiriman</span>
                <span className="font-semibold">{product.weightGram} gram</span>
              </div>
              <div className="p-4 flex justify-between">
                <span className="text-ink-muted">Gudang Asal Tersedia</span>
                <span className="font-semibold">
                  {product.availability.originCities.join(', ') || '-'}
                </span>
              </div>
              <div className="p-4 flex justify-between">
                <span className="text-ink-muted">Dukungan COD</span>
                <span className="font-semibold">
                  {product.availability.codSupported ? 'Tersedia' : 'Tidak Tersedia'}
                </span>
              </div>
              <div className="p-4 flex justify-between">
                <span className="text-ink-muted">Jumlah Penawaran Pemasok Aktif</span>
                <span className="font-semibold">{product.availability.offerCount} gudang</span>
              </div>
            </div>
          )}
        </div>

        {/* Related / Companion products */}
        {related.length > 0 && (
          <section className="mt-14 pt-8 border-t border-border/50">
            <div className="flex items-end justify-between mb-6">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-widest text-accent-ink block mb-1">
                  PELENGKAP KURASI
                </span>
                <h2 className="font-serif text-2xl sm:text-3xl text-primary">
                  Sering Dibeli Bersama
                </h2>
              </div>
              <Link
                href="/katalog"
                className="text-xs font-semibold text-ink-muted hover:text-ink"
              >
                Lihat Semua →
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {related.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </section>
        )}
      </div>
    </StorefrontShell>
  );
}

