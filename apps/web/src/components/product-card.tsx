'use client';

import React from 'react';
import Link from 'next/link';
import { Heart, Layers, MessageCircle, ShoppingBag, Truck } from 'lucide-react';
import { formatRupiah, isVideoMediaUrl, waApiSendLink } from '@store/shared';
import type { PublicProduct } from '@/lib/api';
import { useStore } from '@/components/store-provider';

export function ProductCard({ product }: { product: PublicProduct }) {
  const { addToCart, wishlist, toggleWishlist, config } = useStore();
  const isSaved = wishlist.includes(product.id);
  const coverUrl = product.images[0]?.url || '/demo/lamp.jpg';
  const isCoverVideo = isVideoMediaUrl(coverUrl);
  const defaultVariant = product.variants[0] ?? null;
  const effectivePrice = defaultVariant ? defaultVariant.effectivePrice : product.salePrice;

  const discountPct =
    product.compareAtPrice && product.compareAtPrice > effectivePrice
      ? Math.round(((product.compareAtPrice - effectivePrice) / product.compareAtPrice) * 100)
      : null;

  const waPhone = config?.store.whatsappNumber || '6285141784243';
  const waMsg = `Halo kak, saya mau beli barang ini: ${product.name}${
    defaultVariant ? ` (${defaultVariant.name})` : ''
  } - Harga: ${formatRupiah(effectivePrice)}`;
  const waHref =
    waApiSendLink(waPhone, waMsg) ??
    `https://api.whatsapp.com/send/?phone=6285141784243&text=${encodeURIComponent(waMsg)}&type=phone_number&app_absent=0`;

  return (
    <div className="group flex flex-col rounded-2xl bg-surface p-4 shadow-sm hover:shadow-md border border-border/30 transition-all">
      <div className="relative aspect-[3/4] rounded-xl overflow-hidden bg-surface-low mb-4">
        <Link href={`/produk/${product.slug}`} className="block w-full h-full">
          {isCoverVideo ? (
            <video
              src={coverUrl}
              muted
              playsInline
              loop
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
          ) : (
            <img
              src={coverUrl}
              alt={product.images[0]?.alt || product.name}
              loading="lazy"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
          )}
        </Link>

        {/* Product badges & discount indicator */}
        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
          {discountPct ? (
            <span className="px-2.5 py-0.5 rounded-full bg-danger text-white text-[10px] font-bold uppercase tracking-wider">
              Hemat {discountPct}%
            </span>
          ) : (
            product.badges
              .filter((b) => b.toUpperCase() !== 'DEMO')
              .slice(0, 1)
              .map((b) => (
                <span
                  key={b}
                  className="px-2.5 py-0.5 rounded-full bg-surface/90 backdrop-blur-md text-accent-ink text-[10px] font-bold uppercase tracking-wider"
                >
                  {b}
                </span>
              ))
          )}
          {(product.shippingSubsidy ?? 0) > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-evergreen text-white text-[10px] font-bold inline-flex items-center gap-1">
              <Truck className="w-2.5 h-2.5" />
              Subsidi {formatRupiah(product.shippingSubsidy ?? 0)}
            </span>
          )}
        </div>

        <button
          type="button"
          aria-label={isSaved ? 'Hapus dari favorit' : 'Simpan ke favorit'}
          onClick={() => toggleWishlist(product.id, product.name)}
          className={`absolute top-3 right-3 w-8 h-8 rounded-full bg-surface/85 backdrop-blur-md flex items-center justify-center transition-colors ${
            isSaved ? 'text-danger' : 'text-ink-muted hover:text-danger'
          }`}
        >
          <Heart className={`w-4 h-4 ${isSaved ? 'fill-current' : ''}`} />
        </button>

        {/* Quick add & WhatsApp buttons */}
        <div className="absolute bottom-3 left-3 right-3 translate-y-1 opacity-95 sm:opacity-0 sm:group-hover:translate-y-0 sm:group-hover:opacity-100 transition-all duration-200 flex gap-1.5">
          <button
            type="button"
            disabled={!product.availability.inStock}
            onClick={() =>
              addToCart({
                productId: product.id,
                variantId: defaultVariant?.id ?? null,
                slug: product.slug,
                name: product.name,
                variantName: defaultVariant?.name ?? null,
                sku: defaultVariant?.sku ?? product.sku,
                imageUrl: coverUrl,
                unitPrice: effectivePrice,
                quantity: 1,
              })
            }
            className="flex-1 py-2.5 px-3 bg-primary text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-primary-container disabled:bg-surface-high disabled:text-ink-muted shadow-sm"
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>{product.availability.inStock ? 'Tambah ke Tas' : 'Stok Habis'}</span>
          </button>
          <a
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            title="Beli lewat WhatsApp (+6285141784243)"
            className="px-2.5 py-2.5 bg-evergreen text-white rounded-lg text-xs font-bold flex items-center justify-center hover:opacity-95 shadow-sm shrink-0"
          >
            <MessageCircle className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted truncate">
          {product.category?.name || 'Koleksi Pilihan'}
        </span>
        <span
          className={`text-[11px] font-semibold ${
            product.availability.inStock ? 'text-success' : 'text-danger'
          }`}
        >
          {product.availability.inStock ? `Stok ${product.availability.totalStock}` : 'Habis'}
        </span>
      </div>

      <Link
        href={`/produk/${product.slug}`}
        className="font-medium text-sm sm:text-base text-ink hover:text-accent-ink line-clamp-2 mb-1.5"
      >
        {product.name}
      </Link>

      {product.variants.length > 0 && (
        <div className="mb-2 flex items-center gap-1 text-[11px] text-ink-muted">
          <Layers className="w-3 h-3 text-accent-ink shrink-0" />
          <span className="truncate">
            {product.variants.length} Variasi:{' '}
            {product.variants
              .slice(0, 3)
              .map((v) => v.name)
              .join(', ')}
          </span>
        </div>
      )}

      <div className="mt-auto pt-2 flex items-baseline justify-between gap-2 border-t border-border/30">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-semibold text-base sm:text-lg text-primary">
            {formatRupiah(effectivePrice)}
          </span>
          {product.compareAtPrice && product.compareAtPrice > effectivePrice && (
            <span className="text-xs text-ink-muted line-through">
              {formatRupiah(product.compareAtPrice)}
            </span>
          )}
        </div>
        {product.availability.codSupported && (
          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-evergreen-soft text-evergreen">
            COD
          </span>
        )}
      </div>
    </div>
  );
}
