'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Boxes,
  ExternalLink,
  FileSpreadsheet,
  LayoutTemplate,
  LogOut,
  Package,
  ScrollText,
  Settings,
  ShoppingBag,
  Users,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useStore } from '@/components/store-provider';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: 'OWNER' | 'ADMIN' | 'STAFF';
}

const NAV_ITEMS = [
  { href: '/admin', label: 'Manajemen Produk & CSV', icon: Package },
  { href: '/admin/suppliers', label: 'Pemasok, Gudang & Stok', icon: Boxes },
  { href: '/admin/orders', label: 'Pesanan, Bukti & Resi', icon: ShoppingBag },
  { href: '/admin/cms', label: 'CMS Beranda', icon: LayoutTemplate },
  { href: '/admin/customers', label: 'Pelanggan', icon: Users },
  { href: '/admin/settings', label: 'Pengaturan & Telegram', icon: Settings },
  { href: '/admin/audit', label: 'Log Audit', icon: ScrollText },
];

export function AdminShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { config, showToast } = useStore();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    apiFetch<{ authenticated: boolean; user: SessionUser | null }>('/api/auth/me')
      .then((res) => {
        if (!res.authenticated || !res.user) {
          router.replace('/admin/login');
        } else {
          setUser(res.user);
        }
      })
      .catch(() => router.replace('/admin/login'))
      .finally(() => setChecking(false));
  }, [router]);

  const handleLogout = async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    showToast('Anda telah keluar dari sesi admin');
    router.replace('/admin/login');
  };

  if (checking || !user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center text-xs text-ink-muted">
        Memeriksa sesi otorisasi admin...
      </div>
    );
  }

  const storeName = config?.store.storeName || 'Pasti Murahnya';
  const logoUrl = config?.store.logoUrl || '/demo/logo-pasti-murahnya.jpg';

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-background text-ink">
      {/* Dark Evergreen/Near-black Sidebar matching Stitch Admin Reference */}
      <aside className="w-full lg:w-64 bg-primary text-white shrink-0 flex flex-col justify-between">
        <div>
          <div className="p-5 border-b border-white/10 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <img
                src={logoUrl}
                alt={storeName}
                className="w-9 h-9 rounded-lg object-contain bg-white p-0.5 shrink-0"
              />
              <div>
                <span className="font-serif text-lg font-medium tracking-tight block leading-tight">
                  {storeName}
                </span>
                <span className="text-[10px] uppercase tracking-widest text-accent font-bold">
                  STUDIO ADMIN
                </span>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded bg-white/10 text-[10px] font-mono text-white/80">
              {user.role}
            </span>
          </div>

          <nav aria-label="Navigasi Admin" className="p-3 space-y-1">
            <p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-white/40">
              Navigasi Utama
            </p>
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                    active
                      ? 'bg-white/15 text-accent'
                      : 'text-white/75 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="p-4 border-t border-white/10 space-y-3 text-xs">
          <div className="p-3 rounded-xl bg-white/5 border border-white/10">
            <p className="font-semibold text-white truncate">{user.name}</p>
            <p className="text-[11px] text-white/60 truncate">{user.email}</p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="w-full py-2 px-3 rounded-lg bg-white/10 hover:bg-white/15 text-white text-xs font-semibold inline-flex items-center justify-center gap-2"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Keluar Sesi</span>
          </button>
        </div>
      </aside>

      {/* Main Bright Workspace */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="bg-surface border-b border-border/50 px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-xs text-ink-muted">
            <FileSpreadsheet className="w-4 h-4 text-accent-ink" />
            <span>Database PostgreSQL Aktif</span>
            {config?.demoMode && (
              <span className="px-2 py-0.5 rounded bg-accent-soft text-accent-ink font-bold text-[10px]">
                MODE DEMO
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/"
              target="_blank"
              className="px-3.5 py-1.5 rounded-lg bg-surface-low hover:bg-surface-high border border-border/60 text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <span>Lihat Toko</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </div>
        </header>

        {/* Workspace header & content */}
        <div className="p-6 lg:p-8 space-y-6 max-w-7xl w-full mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-4 border-b border-border/50">
            <div>
              <h1 className="font-serif text-2xl sm:text-3xl text-primary">{title}</h1>
              {subtitle && <p className="text-xs sm:text-sm text-ink-muted mt-1">{subtitle}</p>}
            </div>
            {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
          </div>

          {children}
        </div>
      </div>
    </div>
  );
}

