'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, KeyRound, PackageSearch } from 'lucide-react';
import { formatRupiah } from '@store/shared';
import { useStore } from '@/components/store-provider';
import { StorefrontShell } from '@/components/storefront-shell';

export default function OrderLookupPage() {
  const router = useRouter();
  const { recentOrders } = useStore();
  const [orderNumber, setOrderNumber] = useState('');
  const [accessKey, setAccessKey] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const num = orderNumber.trim().toUpperCase();
    const key = accessKey.trim();
    if (!num || !key) return;
    router.push(`/pesanan/${encodeURIComponent(num)}?key=${encodeURIComponent(key)}`);
  };

  return (
    <StorefrontShell>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 space-y-8">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-widest text-accent-ink block mb-1">
            PELACAKAN PESANAN &amp; MULTI-RESI
          </span>
          <h1 className="font-serif text-3xl sm:text-4xl text-primary">
            Pantau Status Pesanan Anda
          </h1>
          <p className="text-xs sm:text-sm text-ink-muted mt-1">
            Demi privasi pelanggan, halaman pesanan dilindungi dengan kode akses unik yang diberikan
            saat checkout.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-surface rounded-2xl p-6 border border-border/50 shadow-sm space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-ink block mb-1">
                Nomor Pesanan <span className="text-danger">*</span>
              </label>
              <div className="relative">
                <PackageSearch className="w-4 h-4 text-ink-muted absolute left-3 top-3" />
                <input
                  type="text"
                  required
                  value={orderNumber}
                  onChange={(e) => setOrderNumber(e.target.value)}
                  placeholder="ORD-261029-XXXXXX"
                  className="w-full h-10 pl-9 pr-3 rounded-lg bg-surface-low border border-border/60 text-xs font-mono uppercase"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-ink block mb-1">
                Kode Akses Rahasia <span className="text-danger">*</span>
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-ink-muted absolute left-3 top-3" />
                <input
                  type="text"
                  required
                  value={accessKey}
                  onChange={(e) => setAccessKey(e.target.value)}
                  placeholder="Tempel kode akses dari tautan pesanan"
                  className="w-full h-10 pl-9 pr-3 rounded-lg bg-surface-low border border-border/60 text-xs font-mono"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            className="px-6 py-3 rounded-xl bg-primary text-white text-xs font-semibold inline-flex items-center gap-2 hover:bg-primary-container"
          >
            <span>Lihat Detail Pesanan &amp; Resi</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {recentOrders.length > 0 && (
          <div className="bg-surface rounded-2xl p-6 border border-border/40 space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-ink">
              Pesanan Terakhir di Perangkat Ini
            </h2>
            <div className="divide-y divide-border/40">
              {recentOrders.map((o) => (
                <div
                  key={o.orderNumber}
                  className="py-3 flex items-center justify-between gap-4 text-xs"
                >
                  <div>
                    <span className="font-mono font-bold text-primary">{o.orderNumber}</span>
                    <span className="text-ink-muted ml-3">
                      {new Date(o.createdAt).toLocaleString('id-ID')}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold">{formatRupiah(o.grandTotal)}</span>
                    <Link
                      href={`/pesanan/${encodeURIComponent(o.orderNumber)}?key=${encodeURIComponent(
                        o.accessKey,
                      )}`}
                      className="px-3 py-1.5 rounded-lg bg-surface-low hover:bg-surface-high font-semibold text-ink border border-border/60"
                    >
                      Buka Pesanan →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </StorefrontShell>
  );
}

