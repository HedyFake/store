'use client';

import React, { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Filter, SlidersHorizontal, X } from 'lucide-react';
import { apiFetch, type PublicProduct } from '@/lib/api';
import { useStore } from '@/components/store-provider';
import { StorefrontShell } from '@/components/storefront-shell';
import { ProductCard } from '@/components/product-card';

interface CategoryItem {
  id: string;
  name: string;
  slug: string;
  productCount: number;
}

function CatalogContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { wishlist } = useStore();

  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [products, setProducts] = useState<PublicProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  const q = searchParams.get('q') ?? '';
  const category = searchParams.get('category') ?? '';
  const minPrice = searchParams.get('minPrice') ?? '';
  const maxPrice = searchParams.get('maxPrice') ?? '';
  const inStock = searchParams.get('inStock') === '1';
  const cod = searchParams.get('cod') === '1';
  const onlyFavorit = searchParams.get('favorit') === '1';
  const sort = searchParams.get('sort') ?? 'newest';
  const page = Math.max(1, Number(searchParams.get('page')) || 1);

  const [minInput, setMinInput] = useState(minPrice);
  const [maxInput, setMaxInput] = useState(maxPrice);

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (!v) next.delete(k);
        else next.set(k, v);
      }
      if (!('page' in updates)) next.delete('page');
      router.push(`/katalog?${next.toString()}`);
    },
    [router, searchParams],
  );

  useEffect(() => {
    void apiFetch<CategoryItem[]>('/api/categories')
      .then(setCategories)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (category) params.set('category', category);
    if (minPrice) params.set('minPrice', minPrice);
    if (maxPrice) params.set('maxPrice', maxPrice);
    if (inStock) params.set('inStock', '1');
    if (cod) params.set('cod', '1');
    params.set('sort', sort);
    params.set('page', String(page));
    params.set('pageSize', '12');

    apiFetch<{ items: PublicProduct[]; total: number; totalPages: number }>(
      `/api/products?${params.toString()}`,
    )
      .then((res) => {
        const list = onlyFavorit ? res.items.filter((i) => wishlist.includes(i.id)) : res.items;
        setProducts(list);
        setTotal(onlyFavorit ? list.length : res.total);
        setTotalPages(onlyFavorit ? 1 : res.totalPages);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [q, category, minPrice, maxPrice, inStock, cod, sort, page, onlyFavorit, wishlist]);

  const activeCategoryName = categories.find((c) => c.slug === category)?.name;

  const filterPanel = (
    <div className="space-y-6">
      {/* Category filter */}
      <div className="bg-surface rounded-xl p-5 border border-border/40">
        <h3 className="text-xs font-bold uppercase tracking-wider text-ink mb-3">Kategori</h3>
        <ul className="space-y-2 text-xs">
          <li>
            <button
              type="button"
              onClick={() => updateParams({ category: null })}
              className={`w-full flex items-center justify-between py-1 text-left ${
                !category ? 'font-bold text-primary' : 'text-ink-muted hover:text-ink'
              }`}
            >
              <span>Semua Kategori</span>
            </button>
          </li>
          {categories.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => updateParams({ category: c.slug })}
                className={`w-full flex items-center justify-between py-1 text-left ${
                  category === c.slug ? 'font-bold text-primary' : 'text-ink-muted hover:text-ink'
                }`}
              >
                <span>{c.name}</span>
                <span className="text-[11px] text-ink-muted">{c.productCount}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Price range filter */}
      <div className="bg-surface rounded-xl p-5 border border-border/40 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-ink">Rentang Harga</h3>
          <span className="text-[11px] font-semibold text-accent-ink">IDR</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] font-semibold uppercase text-ink-muted block mb-1">
              Minimum
            </label>
            <input
              type="number"
              min={0}
              value={minInput}
              onChange={(e) => setMinInput(e.target.value)}
              placeholder="50000"
              className="w-full h-9 px-2.5 rounded-lg bg-surface-low border border-border/60 text-xs"
            />
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase text-ink-muted block mb-1">
              Maksimum
            </label>
            <input
              type="number"
              min={0}
              value={maxInput}
              onChange={(e) => setMaxInput(e.target.value)}
              placeholder="2000000"
              className="w-full h-9 px-2.5 rounded-lg bg-surface-low border border-border/60 text-xs"
            />
          </div>
        </div>
        <button
          type="button"
          onClick={() => updateParams({ minPrice: minInput || null, maxPrice: maxInput || null })}
          className="w-full py-2 rounded-lg bg-surface-low hover:bg-surface-high text-xs font-semibold text-ink border border-border/60 transition-colors"
        >
          Terapkan Harga
        </button>
      </div>

      {/* Availability & COD */}
      <div className="bg-surface rounded-xl p-5 border border-border/40 space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-ink">
          Ketersediaan &amp; Metode
        </h3>
        <label className="flex items-center gap-2.5 text-xs text-ink cursor-pointer">
          <input
            type="checkbox"
            checked={inStock}
            onChange={(e) => updateParams({ inStock: e.target.checked ? '1' : null })}
            className="rounded border-border text-primary focus:ring-primary"
          />
          <span>Stok Tersedia di Gudang</span>
        </label>
        <label className="flex items-center gap-2.5 text-xs text-ink cursor-pointer">
          <input
            type="checkbox"
            checked={cod}
            onChange={(e) => updateParams({ cod: e.target.checked ? '1' : null })}
            className="rounded border-border text-primary focus:ring-primary"
          />
          <span>Mendukung Bayar di Tempat (COD)</span>
        </label>
        <label className="flex items-center gap-2.5 text-xs text-ink cursor-pointer">
          <input
            type="checkbox"
            checked={onlyFavorit}
            onChange={(e) => updateParams({ favorit: e.target.checked ? '1' : null })}
            className="rounded border-border text-primary focus:ring-primary"
          />
          <span>Hanya Produk Favorit Saya</span>
        </label>
      </div>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-12 py-8">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="text-xs text-ink-muted mb-4 flex items-center gap-2">
        <Link href="/" className="hover:text-ink">
          Beranda
        </Link>
        <span>/</span>
        <span className="text-ink font-medium">{activeCategoryName || 'Semua Koleksi'}</span>
      </nav>

      {/* Editorial Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-border/50">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-widest text-accent-ink block mb-1">
            KATALOG TERKURASI
          </span>
          <h1 className="font-serif text-3xl sm:text-4xl text-primary">
            {activeCategoryName || 'Semua Koleksi Terkurasi'}
          </h1>
          <p className="text-xs sm:text-sm text-ink-muted mt-1">
            Menampilkan {products.length} dari {total} produk aktif dengan stok langsung dari gudang
            mitra.
          </p>
        </div>

        {/* Quick category pills */}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => updateParams({ category: null })}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
              !category
                ? 'bg-primary text-white border-primary'
                : 'bg-surface text-ink-muted border-border/60 hover:text-ink'
            }`}
          >
            Semua
          </button>
          {categories.slice(0, 4).map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => updateParams({ category: c.slug })}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                category === c.slug
                  ? 'bg-primary text-white border-primary'
                  : 'bg-surface text-ink-muted border-border/60 hover:text-ink'
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {/* Active filter tags bar */}
      {(q || category || minPrice || maxPrice || inStock || cod || onlyFavorit) && (
        <div className="flex flex-wrap items-center gap-2 py-3 px-4 mt-4 rounded-xl bg-surface-low text-xs">
          <span className="font-bold uppercase text-[11px] text-ink-muted mr-1">Filter Aktif:</span>
          {q && (
            <button
              type="button"
              onClick={() => updateParams({ q: null })}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface border border-border/60 font-medium"
            >
              <span>Cari: &ldquo;{q}&rdquo;</span>
              <X className="w-3 h-3" />
            </button>
          )}
          {activeCategoryName && (
            <button
              type="button"
              onClick={() => updateParams({ category: null })}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface border border-border/60 font-medium"
            >
              <span>{activeCategoryName}</span>
              <X className="w-3 h-3" />
            </button>
          )}
          {inStock && (
            <button
              type="button"
              onClick={() => updateParams({ inStock: null })}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface border border-border/60 font-medium"
            >
              <span>Stok Tersedia</span>
              <X className="w-3 h-3" />
            </button>
          )}
          {cod && (
            <button
              type="button"
              onClick={() => updateParams({ cod: null })}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface border border-border/60 font-medium"
            >
              <span>Mendukung COD</span>
              <X className="w-3 h-3" />
            </button>
          )}
          <button
            type="button"
            onClick={() => router.push('/katalog')}
            className="ml-auto text-xs font-semibold text-accent-ink hover:underline"
          >
            Hapus Semua Filter
          </button>
        </div>
      )}

      {/* Main Grid: Sidebar + Products */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mt-6">
        <aside className="hidden lg:block lg:col-span-3">{filterPanel}</aside>

        <div className="lg:col-span-9 space-y-6">
          {/* Toolbar */}
          <div className="flex items-center justify-between gap-4 bg-surface p-3.5 rounded-xl border border-border/40">
            <button
              type="button"
              onClick={() => setMobileFilterOpen(true)}
              className="lg:hidden inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-low text-xs font-semibold"
            >
              <Filter className="w-3.5 h-3.5" />
              <span>Penyaring</span>
            </button>

            <span className="text-xs text-ink-muted">
              Menampilkan <strong className="text-ink">{products.length}</strong> dari{' '}
              <strong className="text-ink">{total}</strong> produk
            </span>

            <div className="flex items-center gap-2 ml-auto">
              <SlidersHorizontal className="w-3.5 h-3.5 text-ink-muted hidden sm:block" />
              <label htmlFor="sort-select" className="text-xs text-ink-muted hidden sm:block">
                Urutkan:
              </label>
              <select
                id="sort-select"
                value={sort}
                onChange={(e) => updateParams({ sort: e.target.value })}
                className="h-9 px-3 rounded-lg bg-surface-low border border-border/60 text-xs font-semibold text-ink"
              >
                <option value="newest">Terbaru</option>
                <option value="popular">Pilihan Kurator</option>
                <option value="price_asc">Harga: Rendah ke Tinggi</option>
                <option value="price_desc">Harga: Tinggi ke Rendah</option>
                <option value="name">Nama (A–Z)</option>
              </select>
            </div>
          </div>

          {/* Product Grid */}
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map((n) => (
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
            <div className="rounded-2xl bg-surface p-12 text-center border border-border/40 space-y-3">
              <p className="font-serif text-xl text-primary">Tidak ada produk yang cocok</p>
              <p className="text-xs text-ink-muted">
                Coba ubah kata kunci pencarian atau hapus beberapa penyaring aktif.
              </p>
              <button
                type="button"
                onClick={() => router.push('/katalog')}
                className="px-5 py-2.5 rounded-lg bg-primary text-white text-xs font-semibold"
              >
                Reset Filter
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {products.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t border-border/40 text-xs">
              <span className="text-ink-muted">
                Halaman {page} dari {totalPages}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => updateParams({ page: String(page - 1) })}
                  className="px-3 py-1.5 rounded-lg bg-surface border border-border/60 disabled:opacity-40 font-semibold"
                >
                  Sebelumnya
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => updateParams({ page: String(page + 1) })}
                  className="px-3 py-1.5 rounded-lg bg-primary text-white disabled:opacity-40 font-semibold"
                >
                  Selanjutnya
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Mobile filter drawer */}
      {mobileFilterOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex justify-end lg:hidden">
          <div className="w-80 max-w-full bg-background h-full overflow-y-auto p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border/50">
              <span className="font-bold text-sm">Penyaring Katalog</span>
              <button
                type="button"
                onClick={() => setMobileFilterOpen(false)}
                className="p-1 rounded-lg hover:bg-surface-low"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {filterPanel}
          </div>
        </div>
      )}
    </div>
  );
}

export default function CatalogPage() {
  return (
    <StorefrontShell>
      <Suspense fallback={<div className="p-12 text-center text-sm text-ink-muted">Memuat katalog...</div>}>
        <CatalogContent />
      </Suspense>
    </StorefrontShell>
  );
}

