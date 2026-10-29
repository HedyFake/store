'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiFetch, type StoreConfigResponse } from '@/lib/api';

export interface CartItem {
  key: string; // productId:variantId
  productId: string;
  variantId: string | null;
  slug: string;
  name: string;
  variantName: string | null;
  sku: string;
  imageUrl: string | null;
  unitPrice: number; // display preview only; server recalculates on quote/checkout
  quantity: number;
  selected: boolean;
}

export interface SavedOrderLink {
  orderNumber: string;
  accessKey: string;
  createdAt: string;
  grandTotal: number;
}

interface ToastMessage {
  id: number;
  text: string;
  tone: 'success' | 'danger' | 'neutral';
}

interface StoreContextValue {
  config: StoreConfigResponse | null;
  refreshConfig: () => Promise<void>;
  cart: CartItem[];
  addToCart: (item: Omit<CartItem, 'key' | 'selected'>) => void;
  updateCartQty: (key: string, quantity: number) => void;
  toggleCartSelect: (key: string, selected?: boolean) => void;
  toggleSelectAllCart: (selected: boolean) => void;
  removeFromCart: (key: string) => void;
  clearSelectedCart: () => void;
  wishlist: string[]; // productIds
  toggleWishlist: (productId: string, productName?: string) => void;
  recentOrders: SavedOrderLink[];
  saveRecentOrder: (order: SavedOrderLink) => void;
  showToast: (text: string, tone?: ToastMessage['tone']) => void;
}

const StoreContext = createContext<StoreContextValue | null>(null);

const CART_STORAGE_KEY = 'store_cart_v1';
const WISHLIST_STORAGE_KEY = 'store_wishlist_v1';
const ORDERS_STORAGE_KEY = 'store_recent_orders_v1';

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<StoreConfigResponse | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [recentOrders, setRecentOrders] = useState<SavedOrderLink[]>([]);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const showToast = useCallback((text: string, tone: ToastMessage['tone'] = 'neutral') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, text, tone }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3400);
  }, []);

  const refreshConfig = useCallback(async () => {
    try {
      const data = await apiFetch<StoreConfigResponse>('/api/store-config');
      setConfig(data);
    } catch {
      /* offline or API booting */
    }
  }, []);

  useEffect(() => {
    void refreshConfig();
    try {
      const savedCart = localStorage.getItem(CART_STORAGE_KEY);
      if (savedCart) setCart(JSON.parse(savedCart));
      const savedWish = localStorage.getItem(WISHLIST_STORAGE_KEY);
      if (savedWish) setWishlist(JSON.parse(savedWish));
      const savedOrders = localStorage.getItem(ORDERS_STORAGE_KEY);
      if (savedOrders) setRecentOrders(JSON.parse(savedOrders));
    } catch {
      /* ignore storage errors */
    } finally {
      setHydrated(true);
    }
  }, [refreshConfig]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    } catch {
      /* ignore */
    }
  }, [cart, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(wishlist));
    } catch {
      /* ignore */
    }
  }, [wishlist, hydrated]);

  const addToCart = useCallback(
    (item: Omit<CartItem, 'key' | 'selected'>) => {
      const key = `${item.productId}:${item.variantId ?? ''}`;
      setCart((prev) => {
        const existing = prev.find((i) => i.key === key);
        if (existing) {
          return prev.map((i) =>
            i.key === key ? { ...i, quantity: Math.min(99, i.quantity + item.quantity), selected: true } : i,
          );
        }
        return [...prev, { ...item, key, selected: true }];
      });
      showToast(`${item.name} ditambahkan ke tas belanja`, 'success');
    },
    [showToast],
  );

  const updateCartQty = useCallback((key: string, quantity: number) => {
    setCart((prev) =>
      quantity <= 0
        ? prev.filter((i) => i.key !== key)
        : prev.map((i) => (i.key === key ? { ...i, quantity: Math.min(99, quantity) } : i)),
    );
  }, []);

  const toggleCartSelect = useCallback((key: string, selected?: boolean) => {
    setCart((prev) =>
      prev.map((i) => (i.key === key ? { ...i, selected: selected !== undefined ? selected : !i.selected } : i)),
    );
  }, []);

  const toggleSelectAllCart = useCallback((selected: boolean) => {
    setCart((prev) => prev.map((i) => ({ ...i, selected })));
  }, []);

  const removeFromCart = useCallback((key: string) => {
    setCart((prev) => prev.filter((i) => i.key !== key));
  }, []);

  const clearSelectedCart = useCallback(() => {
    setCart((prev) => prev.filter((i) => !i.selected));
  }, []);

  const toggleWishlist = useCallback(
    (productId: string, productName?: string) => {
      setWishlist((prev) => {
        const exists = prev.includes(productId);
        const next = exists ? prev.filter((id) => id !== productId) : [...prev, productId];
        showToast(
          exists
            ? `${productName || 'Produk'} dihapus dari daftar simpan`
            : `${productName || 'Produk'} disimpan ke favorit`,
        );
        return next;
      });
    },
    [showToast],
  );

  const saveRecentOrder = useCallback((order: SavedOrderLink) => {
    setRecentOrders((prev) => {
      const filtered = prev.filter((o) => o.orderNumber !== order.orderNumber);
      const next = [order, ...filtered].slice(0, 15);
      try {
        localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const value = useMemo<StoreContextValue>(
    () => ({
      config,
      refreshConfig,
      cart,
      addToCart,
      updateCartQty,
      toggleCartSelect,
      toggleSelectAllCart,
      removeFromCart,
      clearSelectedCart,
      wishlist,
      toggleWishlist,
      recentOrders,
      saveRecentOrder,
      showToast,
    }),
    [
      config,
      refreshConfig,
      cart,
      addToCart,
      updateCartQty,
      toggleCartSelect,
      toggleSelectAllCart,
      removeFromCart,
      clearSelectedCart,
      wishlist,
      toggleWishlist,
      recentOrders,
      saveRecentOrder,
      showToast,
    ],
  );

  return (
    <StoreContext.Provider value={value}>
      {children}
      {/* Accessible toast container */}
      <div
        aria-live="polite"
        className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm pointer-events-none"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto rounded-xl px-4 py-3 text-sm font-medium shadow-lg border transition-all ${
              t.tone === 'danger'
                ? 'bg-danger text-white border-danger'
                : t.tone === 'success'
                  ? 'bg-evergreen text-white border-evergreen'
                  : 'bg-primary text-white border-primary-container'
            }`}
          >
            {t.text}
          </div>
        ))}
      </div>
    </StoreContext.Provider>
  );
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore harus digunakan di dalam StoreProvider');
  return ctx;
}

