'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Lock } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useStore } from '@/components/store-provider';

export default function AdminLoginPage() {
  const router = useRouter();
  const { config, showToast } = useStore();
  const [email, setEmail] = useState('admin@store.local');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      showToast('Selamat datang di Studio Admin', 'success');
      router.push('/admin');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login gagal');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center items-center px-4">
      <div className="w-full max-w-md bg-surface rounded-2xl p-8 border border-border/50 shadow-sm space-y-6">
        <div className="space-y-2 text-center">
          <img
            src={config?.store.logoUrl || '/demo/logo-pasti-murahnya.jpg'}
            alt={config?.store.storeName || 'Pasti Murahnya'}
            className="w-16 h-16 mx-auto rounded-xl object-contain bg-surface border border-border/50 p-1"
          />
          <span className="text-[11px] font-bold uppercase tracking-widest text-accent-ink block">
            STUDIO ADMIN • RBAC TERLINDUNGI
          </span>
          <h1 className="font-serif text-3xl text-primary">
            {config?.store.storeName || 'Pasti Murahnya'}
          </h1>
          <p className="text-xs text-ink-muted">
            Pasti Murah, Pasti Puas! • Masuk dengan akun Owner, Admin, atau Staff.
          </p>
        </div>

        {config?.demoMode && (
          <div className="p-3.5 rounded-xl bg-accent-soft/60 border border-accent text-xs text-primary space-y-1">
            <p className="font-bold">Akun Seed Pengembangan Lokal (DEMO):</p>
            <p className="font-mono text-[11px]">Email: admin@store.local</p>
            <p className="font-mono text-[11px]">Password: ChangeMeAdmin!2026</p>
          </div>
        )}

        {error && (
          <div className="p-3 rounded-xl bg-danger-soft text-danger text-xs font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-ink block mb-1">Email Admin</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-10 px-3 rounded-lg bg-surface-low border border-border/60 text-xs"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-ink block mb-1">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Masukkan password"
              className="w-full h-10 px-3 rounded-lg bg-surface-low border border-border/60 text-xs"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-primary text-white text-xs font-semibold flex items-center justify-center gap-2 hover:bg-primary-container disabled:opacity-50"
          >
            <Lock className="w-3.5 h-3.5 text-accent" />
            <span>{loading ? 'Memverifikasi...' : 'Masuk ke Dashboard Admin'}</span>
          </button>
        </form>

        <div className="text-center pt-2 border-t border-border/40">
          <Link href="/" className="text-xs text-ink-muted hover:text-ink">
            ← Kembali ke Etalase Toko
          </Link>
        </div>
      </div>
    </div>
  );
}

