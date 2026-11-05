'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { useStore } from '@/components/store-provider';
import { StorefrontShell } from '@/components/storefront-shell';

export default function LegalPolicyPage() {
  const params = useParams<{ slug: string }>();
  const { config } = useStore();
  const page = config?.legal.find((p) => p.slug === params?.slug);

  return (
    <StorefrontShell>
      <div className="max-w-3xl mx-auto px-6 py-12 space-y-6">
        <div className="border-b border-border/50 pb-4">
          <span className="text-[11px] font-bold uppercase tracking-widest text-accent-ink block mb-1">
            INFORMASI &amp; KEBIJAKAN TOKO
          </span>
          <h1 className="font-serif text-3xl text-primary">
            {page?.title || 'Kebijakan & Informasi Layanan'}
          </h1>
        </div>
        <div className="bg-surface rounded-2xl p-6 sm:p-8 border border-border/40 text-sm text-ink leading-relaxed whitespace-pre-line">
          {page?.body || 'Konten halaman sedang dimuat.'}
        </div>
      </div>
    </StorefrontShell>
  );
}

