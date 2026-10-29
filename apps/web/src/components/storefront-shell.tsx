'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Heart,
  Menu,
  PackageCheck,
  Search,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Truck,
  X,
  Headphones,
} from 'lucide-react';
import { waLink } from '@store/shared';
import { apiFetch } from '@/lib/api';
import { useStore } from '@/components/store-provider';

interface NavCategory {
  id: string;
  name: string;
  slug: string;
  productCount: number;
}

export function StorefrontShell({ children }: { children: React.ReactNode }) {
  const { config, cart, wishlist } = useStore();
  const pathname = usePathname();
  const router = useRouter();
  const [searchText, setSearchText] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [categories, setCategories] = useState<NavCategory[]>([]);

  useEffect(() => {
    void apiFetch<NavCategory[]>('/api/categories')
      .then((res) => setCategories(res))
      .catch(() => undefined);
  }, []);

  const storeName = config?.store.storeName || 'Pasti Murahnya';
  const logoUrl = config?.store.logoUrl || '/demo/logo-pasti-murahnya.jpg';
  const announcement = config?.store.announcement;
  const cartCount = cart.reduce((sum, i) => sum + i.quantity, 0);
  const supportWa = waLink(
    config?.store.whatsappNumber,
    `Halo Admin ${storeName}, saya ingin bertanya mengenai produk di katalog.`,
  );

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchText.trim();
    router.push(q ? `/katalog?q=${encodeURIComponent(q)}` : '/katalog');
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-ink">
      {/* Header matching Stitch reference */}
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-md border-b border-border/40 shadow-[0_1px_8px_rgba(0,0,0,0.03)]">
        {(announcement || config?.demoMode) && (
          <div className="bg-primary-container text-background py-1.5 px-4 text-center text-[11px] font-semibold tracking-widest uppercase flex items-center justify-center gap-3 flex-wrap">
            {config?.demoMode && (
              <span className="px-2 py-0.5 rounded bg-accent text-primary font-bold text-[10px]">
                MODE DEMO
              </span>
            )}
            <span>
              {announcement ||
                'Pasti Murah, Pasti Puas! • Belanja Hemat, Tanpa Ragu • Harga Bersahabat, Dompet Selamat • Cari Murah? Pasti di Sini • Murahnya Pasti, Kualitasnya Oke'}
            </span>
          </div>
        )}

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-12 pt-3 pb-2">
          <div className="flex items-center justify-between gap-4 lg:gap-8">
            {/* Mobile menu toggle & Configurable Brand Wordmark */}
            <div className="flex items-center gap-3 shrink-0">
              <button
                type="button"
                aria-label="Buka navigasi"
                onClick={() => setMobileMenuOpen((v) => !v)}
                className="lg:hidden p-2 rounded-lg text-ink hover:bg-surface-low"
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
              <Link href="/" className="flex items-center gap-2.5 group">
                <img
                  src={logoUrl}
                  alt={storeName}
                  className="h-10 w-10 rounded-lg object-contain bg-surface border border-border/40 p-0.5"
                />
                <div>
                  <span className="font-serif text-xl sm:text-2xl font-medium tracking-tight text-primary block leading-none">
                    {storeName}
                  </span>
                  <span className="text-[10px] font-semibold text-accent-ink tracking-wide hidden sm:block mt-0.5">
                    Pasti Murah, Pasti Puas!
                  </span>
                </div>
              </Link>
            </div>

            {/* Search bar */}
            <form onSubmit={handleSearch} className="hidden md:flex flex-1 max-w-2xl">
              <div className="relative flex items-center w-full">
                <Search className="w-4 h-4 text-ink-muted absolute left-4 pointer-events-none" />
                <input
                  type="search"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder="Cari produk kurasi, nama barang, atau kode SKU..."
                  aria-label="Cari produk"
                  className="w-full h-11 pl-11 pr-4 bg-surface rounded-lg border border-border/60 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:border-primary transition-all"
                />
              </div>
            </form>

            {/* Quick actions: Track Order, Wishlist, Cart, Admin link */}
            <div className="flex items-center gap-2 sm:gap-5 shrink-0">
              <Link
                href="/pesanan"
                className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold text-ink-muted hover:text-ink px-2.5 py-1.5 rounded-lg hover:bg-surface-low transition-colors"
              >
                <PackageCheck className="w-4 h-4" />
                <span>Lacak Pesanan</span>
              </Link>

              <Link
                href="/katalog?favorit=1"
                aria-label="Produk disimpan"
                className="relative p-2 text-ink-muted hover:text-ink transition-colors"
              >
                <Heart className="w-5 h-5" />
                {wishlist.length > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-primary text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                    {wishlist.length}
                  </span>
                )}
              </Link>

              <Link
                href="/checkout"
                aria-label="Tas belanja dan checkout"
                className="relative p-2 text-ink-muted hover:text-ink transition-colors"
              >
                <ShoppingBag className="w-5 h-5" />
                <span className="
                  absolute -top-0.5 -right-0.5 bg-accent text-primary text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center
                ">
                  {cartCount}
                </span>
              </Link>

              <Link
                href="/admin"
                className="hidden sm:inline-flex items-center gap-2 pl-4 border-l border-border/50 text-xs font-semibold text-ink-muted hover:text-primary"
              >
                <span>Studio Admin</span>
              </Link>
            </div>
          </div>

          {/* Category navigation bar */}
          <nav
            aria-label="Kategori utama"
            className="hidden lg:flex items-center gap-8 overflow-x-auto pt-3 pb-1 text-xs font-semibold"
          >
            <Link
              href="/katalog"
              className={`pb-1.5 whitespace-nowrap transition-colors ${
                pathname === '/katalog'
                  ? 'text-primary border-b-2 border-primary font-bold'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              Semua Koleksi
            </Link>
            {categories.map((cat) => (
              <Link
                key={cat.id}
                href={`/katalog?category=${encodeURIComponent(cat.slug)}`}
                className="text-ink-muted hover:text-ink pb-1.5 whitespace-nowrap transition-colors"
              >
                {cat.name}
              </Link>
            ))}
            <Link
              href="/katalog?cod=1"
              className="text-ink-muted hover:text-ink pb-1.5 whitespace-nowrap transition-colors"
            >
              Mendukung COD
            </Link>
            <Link
              href="/pesanan"
              className="ml-auto text-ink-muted hover:text-ink pb-1.5 whitespace-nowrap transition-colors"
            >
              Cek Status &amp; Resi
            </Link>
          </nav>
        </div>

        {/* Mobile menu drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden bg-surface border-t border-border/50 px-4 py-4 space-y-4">
            <form onSubmit={handleSearch}>
              <div className="relative flex items-center">
                <Search className="w-4 h-4 text-ink-muted absolute left-3.5 pointer-events-none" />
                <input
                  type="search"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder="Cari produk..."
                  className="w-full h-10 pl-10 pr-4 bg-surface-low rounded-lg border border-border/60 text-sm"
                />
              </div>
            </form>
            <div className="flex flex-col space-y-2 text-sm font-medium">
              <Link
                href="/katalog"
                onClick={() => setMobileMenuOpen(false)}
                className="py-1.5 text-ink hover:text-primary"
              >
                Semua Koleksi
              </Link>
              {categories.map((cat) => (
                <Link
                  key={cat.id}
                  href={`/katalog?category=${encodeURIComponent(cat.slug)}`}
                  onClick={() => setMobileMenuOpen(false)}
                  className="py-1.5 text-ink-muted hover:text-ink"
                >
                  {cat.name} ({cat.productCount})
                </Link>
              ))}
              <Link
                href="/pesanan"
                onClick={() => setMobileMenuOpen(false)}
                className="py-1.5 text-ink font-semibold border-t border-border/40 pt-3"
              >
                Lacak Status Pesanan &amp; Resi
              </Link>
              <Link
                href="/admin"
                onClick={() => setMobileMenuOpen(false)}
                className="py-1.5 text-ink-muted"
              >
                Dashboard Admin
              </Link>
            </div>
          </div>
        )}
      </header>

      {/* Main page content */}
      <main className="flex-1 w-full">{children}</main>

      {/* Editorial trust strip & structured footer matching Stitch reference */}
      <footer className="bg-surface-low border-t border-border/50 mt-16">
        <div className="max-w-7xl mx-auto px-6 lg:px-12 py-10 border-b border-border/40">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="flex items-start gap-3.5">
              <ShieldCheck className="w-5 h-5 text-accent-ink shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-ink">Transaksi Terverifikasi Server</p>
                <p className="text-xs text-ink-muted mt-0.5">
                  Harga, ongkir, dan ketersediaan stok dihitung langsung dari database.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3.5">
              <Truck className="w-5 h-5 text-accent-ink shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-ink">Pengiriman Multi-Gudang</p>
                <p className="text-xs text-ink-muted mt-0.5">
                  Setiap sub-pesanan memiliki nomor resi dan dokumen pengiriman tersendiri.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3.5">
              <Sparkles className="w-5 h-5 text-accent-ink shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-ink">Transfer Bank, QRIS &amp; COD</p>
                <p className="text-xs text-ink-muted mt-0.5">
                  Bukti transfer disimpan privat dan diverifikasi oleh tim admin toko.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3.5">
              <Headphones className="w-5 h-5 text-accent-ink shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-ink">Layanan Pelanggan</p>
                <p className="text-xs text-ink-muted mt-0.5">
                  {config?.store.serviceHours || 'Senin–Sabtu, 09.00–18.00 WIB'}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-6 lg:px-12 py-12 grid grid-cols-1 md:grid-cols-12 gap-8">
          <div className="md:col-span-5 space-y-4">
            <div className="flex items-center gap-3">
              <img
                src={logoUrl}
                alt={storeName}
                className="w-11 h-11 rounded-lg object-contain bg-surface border border-border/40 p-0.5"
              />
              <div>
                <span className="font-serif text-xl font-medium text-primary block leading-tight">
                  {storeName}
                </span>
                <span className="text-[11px] font-semibold text-accent-ink">
                  Murahnya Pasti, Kualitasnya Oke.
                </span>
              </div>
            </div>
            <p className="text-xs text-ink-muted leading-relaxed max-w-md">
              {config?.store.footerAbout ||
                'Pastimurah menyediakan berbagai kebutuhan dengan harga terjangkau tanpa mengorbankan kualitas. Belanja mudah, pelayanan ramah, dan harganya pasti murah.'}
            </p>
            <p className="text-xs text-ink font-medium italic max-w-md">
              &ldquo;Males bandingin harga? Di Pastimurah semuanya udah dibikin murah dari awal. Tinggal pilih, checkout, hemat!&rdquo;
            </p>
            <div className="pt-1">
              <p className="text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-2">
                Metode Pembayaran Aktif
              </p>
              <div className="flex flex-wrap gap-2">
                {config?.payment.bankTransferEnabled && (
                  <span className="px-2.5 py-1 rounded bg-surface border border-border/60 text-[11px] font-medium">
                    Transfer {config.payment.bankName || 'Bank'}
                  </span>
                )}
                {config?.payment.qrisStaticEnabled && (
                  <span className="px-2.5 py-1 rounded bg-surface border border-border/60 text-[11px] font-medium">
                    QRIS Toko
                  </span>
                )}
                {config?.cod.codEnabled && (
                  <span className="px-2.5 py-1 rounded bg-surface border border-border/60 text-[11px] font-medium">
                    COD (Bayar di Tempat)
                  </span>
                )}
                {config?.payment.qrisGatewayEnabled && (
                  <span className="px-2.5 py-1 rounded bg-surface border border-border/60 text-[11px] font-medium">
                    QRIS Gateway
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="md:col-span-3 space-y-2.5 text-xs">
            <p className="font-bold uppercase tracking-wider text-ink mb-3">Layanan Pelanggan</p>
            <ul className="space-y-2 text-ink-muted">
              <li>
                <Link href="/pesanan" className="hover:text-ink">
                  Lacak Status Pesanan &amp; Resi
                </Link>
              </li>
              <li>
                <Link href="/kebijakan/pengiriman" className="hover:text-ink">
                  Informasi Pengiriman Multi-Gudang
                </Link>
              </li>
              <li>
                <Link href="/kebijakan/pengembalian" className="hover:text-ink">
                  Kebijakan Pengembalian &amp; Retur
                </Link>
              </li>
              <li>
                <Link href="/kebijakan/bantuan" className="hover:text-ink">
                  Pusat Bantuan &amp; FAQ
                </Link>
              </li>
              {supportWa && (
                <li>
                  <a
                    href={supportWa}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-evergreen font-semibold hover:underline"
                  >
                    Hubungi Admin via WhatsApp ↗
                  </a>
                </li>
              )}
            </ul>
          </div>

          <div className="md:col-span-4 space-y-2.5 text-xs">
            <p className="font-bold uppercase tracking-wider text-ink mb-3">Kontak &amp; Legal</p>
            <p className="text-ink-muted">{config?.store.address}</p>
            {config?.store.supportEmail && (
              <p className="text-ink-muted">Email: {config.store.supportEmail}</p>
            )}
            <div className="pt-3 flex flex-wrap gap-4 text-ink-muted">
              <Link href="/kebijakan/kebijakan-privasi" className="hover:text-ink underline">
                Kebijakan Privasi
              </Link>
              <Link href="/kebijakan/syarat-ketentuan" className="hover:text-ink underline">
                Syarat &amp; Ketentuan
              </Link>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-6 lg:px-12 py-5 border-t border-border/40 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-ink-muted">
          <span>
            © {new Date().getFullYear()} {storeName}. Seluruh transaksi diverifikasi server-side.
          </span>
          <span>Tema Editorial terinspirasi dari referensi desain Stitch</span>
        </div>
      </footer>
    </div>
  );
}

