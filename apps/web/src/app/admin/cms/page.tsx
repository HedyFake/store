'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Eye,
  Monitor,
  Smartphone,
  Tablet,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useStore } from '@/components/store-provider';
import { AdminShell } from '@/components/admin-shell';

interface CmsSectionRow {
  id: string;
  type: 'HERO' | 'CATEGORIES' | 'FEATURED_PRODUCTS' | 'PROMO_BANNER' | 'VALUE_PROPS';
  sortOrder: number;
  draftSortOrder: number;
  status: 'ENABLED' | 'DISABLED';
  draftStatus: 'ENABLED' | 'DISABLED';
  draftContent: Record<string, unknown>;
  publishedContent: Record<string, unknown> | null;
  publishedAt: string | null;
  version: number;
}

const SECTION_LABELS: Record<CmsSectionRow['type'], string> = {
  HERO: 'Hero Editorial Utama',
  CATEGORIES: 'Navigasi Kategori Terpilih',
  FEATURED_PRODUCTS: 'Kurasi Pilihan Pekan Ini',
  PROMO_BANNER: 'Banner Promosi Evergreen',
  VALUE_PROPS: 'Nilai & Keunggulan Layanan',
};

export default function AdminCmsPage() {
  const { config, refreshConfig, showToast } = useStore();
  const [sections, setSections] = useState<CmsSectionRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewport, setViewport] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [saving, setSaving] = useState(false);

  // Editable form fields for currently selected section
  const [eyebrow, setEyebrow] = useState('');
  const [headline, setHeadline] = useState('');
  const [subtext, setSubtext] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [primaryLabel, setPrimaryLabel] = useState('');
  const [primaryHref, setPrimaryHref] = useState('');
  const [secondaryLabel, setSecondaryLabel] = useState('');
  const [secondaryHref, setSecondaryHref] = useState('');

  const selectSection = useCallback((sec: CmsSectionRow) => {
    setSelectedId(sec.id);
    const c = sec.draftContent ?? {};
    setEyebrow(String(c.eyebrow ?? ''));
    setHeadline(String(c.headline ?? c.title ?? ''));
    setSubtext(String(c.subtext ?? c.body ?? c.subtitle ?? ''));
    setImageUrl(String(c.imageUrl ?? ''));
    const pCta = (c.primaryCta as { label?: string; href?: string } | undefined) ?? {};
    const sCta = (c.secondaryCta as { label?: string; href?: string } | undefined) ?? {};
    setPrimaryLabel(String(pCta.label ?? c.ctaLabel ?? 'Jelajahi Katalog'));
    setPrimaryHref(String(pCta.href ?? c.ctaHref ?? '/katalog'));
    setSecondaryLabel(String(sCta.label ?? 'Lacak Pesanan'));
    setSecondaryHref(String(sCta.href ?? '/pesanan'));
  }, []);

  const loadSections = useCallback(async () => {
    const res = await apiFetch<CmsSectionRow[]>('/api/admin/cms/sections');
    setSections(res);
    const current = res.find((s) => s.id === selectedId) ?? res[0];
    if (current) selectSection(current);
  }, [selectedId, selectSection]);

  useEffect(() => {
    void loadSections().catch(() => undefined);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const activeSection = sections.find((s) => s.id === selectedId) ?? sections[0] ?? null;

  const handleSaveDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSection) return;
    setSaving(true);
    try {
      let nextContent: Record<string, unknown> = { ...activeSection.draftContent };
      if (activeSection.type === 'HERO') {
        nextContent = {
          ...nextContent,
          eyebrow,
          headline,
          subtext,
          imageUrl: imageUrl || '/demo/hero.jpg',
          primaryCta: { label: primaryLabel || 'Jelajahi Katalog', href: primaryHref || '/katalog' },
          secondaryCta: { label: secondaryLabel || 'Lacak Pesanan', href: secondaryHref || '/pesanan' },
        };
      } else if (activeSection.type === 'PROMO_BANNER') {
        nextContent = {
          ...nextContent,
          eyebrow,
          headline,
          body: subtext,
          ctaLabel: primaryLabel || 'Lihat Katalog',
          ctaHref: primaryHref || '/katalog',
          imageUrl: imageUrl || '/demo/hero.jpg',
        };
      } else if (
        activeSection.type === 'CATEGORIES' ||
        activeSection.type === 'FEATURED_PRODUCTS'
      ) {
        nextContent = {
          ...nextContent,
          eyebrow,
          title: headline,
          subtitle: subtext,
        };
      }

      await apiFetch(`/api/admin/cms/sections/${activeSection.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ draftContent: nextContent }),
      });
      showToast('Draf seksi beranda berhasil disimpan', 'success');
      await loadSections();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menyimpan draf', 'danger');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (sec: CmsSectionRow) => {
    const nextStatus = sec.draftStatus === 'ENABLED' ? 'DISABLED' : 'ENABLED';
    try {
      await apiFetch(`/api/admin/cms/sections/${sec.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ draftStatus: nextStatus }),
      });
      await loadSections();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal mengubah status seksi', 'danger');
    }
  };

  const handleMove = async (idx: number, direction: -1 | 1) => {
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= sections.length) return;
    const copy = [...sections];
    const [moved] = copy.splice(idx, 1);
    copy.splice(targetIdx, 0, moved);
    const ids = copy.map((s) => s.id);
    setSections(copy);
    await apiFetch('/api/admin/cms/reorder', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    });
    showToast('Urutan blok beranda diperbarui');
  };

  const handlePublish = async () => {
    if (!window.confirm('Publikasikan seluruh perubahan draf ke halaman beranda toko?')) return;
    setSaving(true);
    try {
      await apiFetch('/api/admin/cms/publish', { method: 'POST' });
      await refreshConfig();
      await loadSections();
      showToast('Perubahan beranda berhasil dipublikasikan ke toko!', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal mempublikasikan', 'danger');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminShell
      title="Editor Tampilan Halaman Utama"
      subtitle="Kelola banner promosi, kurasi produk pilihan, dan susunan blok beranda toko secara visual."
      actions={
        <>
          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 rounded-xl bg-surface border border-border/70 text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Pratinjau Toko</span>
          </a>
          <button
            type="button"
            disabled={saving}
            onClick={handlePublish}
            className="px-5 py-2 rounded-xl bg-primary text-white text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-primary-container"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-accent" />
            <span>Publikasikan Perubahan</span>
          </button>
        </>
      }
    >
      {/* Workspace Grid matching editor_halaman_utama_kala_admin: Left Config Panel + Right Live Canvas */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column (5 cols): Section Stack + Active Section Parameter Form */}
        <div className="lg:col-span-5 space-y-6">
          {/* Structure Stack */}
          <div className="bg-surface rounded-2xl p-5 border border-border/50 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-lg text-primary">Struktur Halaman</h2>
              <span className="px-2.5 py-0.5 rounded-full bg-surface-low text-[11px] font-bold">
                {sections.length} BLOK
              </span>
            </div>
            <p className="text-xs text-ink-muted">
              Atur urutan vertikal dan visibilitas seksi di beranda toko.
            </p>

            <div className="space-y-2 pt-1">
              {sections.map((sec, idx) => {
                const isSelected = sec.id === activeSection?.id;
                return (
                  <div
                    key={sec.id}
                    className={`p-3 rounded-xl border transition-all flex items-center justify-between gap-2 ${
                      isSelected
                        ? 'border-accent bg-accent-soft/25 ring-1 ring-accent'
                        : 'border-border/60 bg-surface-low/60'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => selectSection(sec)}
                      className="text-left flex-1 min-w-0"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-ink truncate">
                          {SECTION_LABELS[sec.type]}
                        </span>
                        {isSelected && (
                          <span className="px-1.5 py-0.5 rounded bg-evergreen-soft text-evergreen text-[9px] font-bold">
                            EDITING
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-ink-muted block truncate">
                        {String(sec.draftContent?.headline ?? sec.draftContent?.title ?? sec.type)}
                      </span>
                    </button>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        aria-label="Naikkan urutan"
                        disabled={idx === 0}
                        onClick={() => void handleMove(idx, -1)}
                        className="p-1 rounded hover:bg-surface disabled:opacity-30"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label="Turunkan urutan"
                        disabled={idx === sections.length - 1}
                        onClick={() => void handleMove(idx, 1)}
                        className="p-1 rounded hover:bg-surface disabled:opacity-30"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleToggleStatus(sec)}
                        className={`ml-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          sec.draftStatus === 'ENABLED'
                            ? 'bg-primary text-white'
                            : 'bg-surface-high text-ink-muted'
                        }`}
                      >
                        {sec.draftStatus === 'ENABLED' ? 'ON' : 'OFF'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Active Block Configuration Form */}
          {activeSection && (
            <form
              onSubmit={handleSaveDraft}
              className="bg-surface rounded-2xl p-5 border border-border/50 space-y-4 text-xs"
            >
              <div className="flex items-center justify-between pb-3 border-b border-border/40">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-accent-ink block">
                    KONFIGURASI BLOK AKTIF
                  </span>
                  <h3 className="font-serif text-lg text-primary">
                    {SECTION_LABELS[activeSection.type]}
                  </h3>
                </div>
                <span className="px-2.5 py-1 rounded bg-primary text-white text-[10px] font-mono">
                  v{activeSection.version}
                </span>
              </div>

              {activeSection.type !== 'VALUE_PROPS' ? (
                <>
                  <div>
                    <label className="font-semibold block mb-1">Label Kecil (Eyebrow)</label>
                    <input
                      type="text"
                      value={eyebrow}
                      onChange={(e) => setEyebrow(e.target.value)}
                      className="w-full h-9 px-3 rounded-lg bg-surface-low border border-border/60"
                    />
                  </div>
                  <div>
                    <label className="font-semibold block mb-1">Judul Utama (Headline)</label>
                    <input
                      type="text"
                      required
                      value={headline}
                      onChange={(e) => setHeadline(e.target.value)}
                      className="w-full h-9 px-3 rounded-lg bg-surface-low border border-border/60 font-serif text-sm"
                    />
                  </div>
                  <div>
                    <label className="font-semibold block mb-1">Sub-teks Narasi</label>
                    <textarea
                      rows={3}
                      value={subtext}
                      onChange={(e) => setSubtext(e.target.value)}
                      className="w-full p-3 rounded-lg bg-surface-low border border-border/60"
                    />
                  </div>

                  {(activeSection.type === 'HERO' || activeSection.type === 'PROMO_BANNER') && (
                    <>
                      <div>
                        <label className="font-semibold block mb-1">URL Gambar Banner</label>
                        <input
                          type="text"
                          value={imageUrl}
                          onChange={(e) => setImageUrl(e.target.value)}
                          placeholder="/demo/hero.jpg atau https://..."
                          className="w-full h-9 px-3 rounded-lg bg-surface-low border border-border/60"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="font-semibold block mb-1">Label Tombol Utama</label>
                          <input
                            type="text"
                            value={primaryLabel}
                            onChange={(e) => setPrimaryLabel(e.target.value)}
                            className="w-full h-9 px-3 rounded-lg bg-surface-low border border-border/60"
                          />
                        </div>
                        <div>
                          <label className="font-semibold block mb-1">Tautan Tujuan</label>
                          <input
                            type="text"
                            value={primaryHref}
                            onChange={(e) => setPrimaryHref(e.target.value)}
                            className="w-full h-9 px-3 rounded-lg bg-surface-low border border-border/60 font-mono"
                          />
                        </div>
                      </div>
                    </>
                  )}
                </>
              ) : (
                <p className="text-ink-muted">
                  Blok Nilai &amp; Keunggulan berisi 4 badge layanan utama toko. Gunakan tombol
                  ON/OFF di atas untuk mengatur tampilannya.
                </p>
              )}

              <button
                type="submit"
                disabled={saving}
                className="w-full py-2.5 rounded-xl bg-primary text-white font-semibold hover:bg-primary-container"
              >
                {saving ? 'Menyimpan...' : 'Simpan Draf Blok'}
              </button>
            </form>
          )}
        </div>

        {/* Right Column (7 cols): Interactive Live Preview Canvas matching Stitch Reference */}
        <div className="lg:col-span-7 space-y-4">
          {/* Canvas Toolbar */}
          <div className="bg-surface rounded-xl p-3 border border-border/50 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="inline-flex rounded-lg bg-surface-low p-1 border border-border/50">
              <button
                type="button"
                onClick={() => setViewport('desktop')}
                className={`px-3 py-1 rounded-md font-semibold inline-flex items-center gap-1.5 ${
                  viewport === 'desktop' ? 'bg-surface shadow-sm text-primary' : 'text-ink-muted'
                }`}
              >
                <Monitor className="w-3.5 h-3.5" />
                <span>Desktop</span>
              </button>
              <button
                type="button"
                onClick={() => setViewport('tablet')}
                className={`px-3 py-1 rounded-md font-semibold inline-flex items-center gap-1.5 ${
                  viewport === 'tablet' ? 'bg-surface shadow-sm text-primary' : 'text-ink-muted'
                }`}
              >
                <Tablet className="w-3.5 h-3.5" />
                <span>Tablet</span>
              </button>
              <button
                type="button"
                onClick={() => setViewport('mobile')}
                className={`px-3 py-1 rounded-md font-semibold inline-flex items-center gap-1.5 ${
                  viewport === 'mobile' ? 'bg-surface shadow-sm text-primary' : 'text-ink-muted'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>Ponsel</span>
              </button>
            </div>

            <span className="text-ink-muted text-[11px]">Sinkronisasi Draf Langsung</span>
          </div>

          {/* Simulated Browser Frame */}
          <div
            className={`mx-auto transition-all bg-surface rounded-2xl border border-border/60 shadow-md overflow-hidden ${
              viewport === 'mobile'
                ? 'max-w-[380px]'
                : viewport === 'tablet'
                  ? 'max-w-[620px]'
                  : 'w-full'
            }`}
          >
            {/* Browser Top Bar */}
            <div className="bg-surface-low px-4 py-2.5 border-b border-border/50 flex items-center gap-3">
              <div className="flex gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-danger/70" />
                <span className="w-2.5 h-2.5 rounded-full bg-accent" />
                <span className="w-2.5 h-2.5 rounded-full bg-success/70" />
              </div>
              <div className="flex-1 bg-surface rounded-md px-3 py-1 text-[11px] text-ink-muted font-mono text-center">
                {config?.store.storeName.toLowerCase().replace(/\s+/g, '') || 'store'}.local
              </div>
            </div>

            {/* Simulated Storefront Preview */}
            <div className="p-5 bg-background space-y-6">
              <div className="flex items-center justify-between pb-3 border-b border-border/40">
                <span className="font-serif text-lg font-medium text-primary">
                  {config?.store.storeName || 'Pasti Murahnya'}
                </span>
                <div className="flex gap-4 text-[11px] text-ink-muted font-semibold">
                  <span>Beranda</span>
                  <span>Koleksi</span>
                  <span>Lacak Pesanan</span>
                </div>
              </div>

              {/* Active Hero Preview */}
              <div className="relative rounded-2xl overflow-hidden bg-evergreen text-white p-6 sm:p-8 border-2 border-accent">
                <span className="inline-block px-2.5 py-0.5 rounded bg-accent text-primary text-[10px] font-bold uppercase mb-3">
                  Seksi Aktif Diedit: {activeSection ? SECTION_LABELS[activeSection.type] : 'Hero'}
                </span>
                <p className="text-[10px] uppercase tracking-widest text-accent font-bold">
                  {eyebrow || 'EDISI KURASI MUSIM INI'}
                </p>
                <h3 className="font-serif text-2xl sm:text-3xl mt-1 leading-tight">
                  {headline || 'Koleksi Esensial untuk Gaya Hidup Modern.'}
                </h3>
                <p className="text-xs text-evergreen-soft/90 mt-2 max-w-md leading-relaxed">
                  {subtext}
                </p>
                <div className="flex flex-wrap gap-2.5 mt-4">
                  <span className="px-4 py-2 rounded-lg bg-white text-primary text-xs font-semibold">
                    {primaryLabel || 'Jelajahi Katalog'} →
                  </span>
                  {secondaryLabel && (
                    <span className="px-4 py-2 rounded-lg bg-white/10 text-white text-xs font-semibold">
                      {secondaryLabel}
                    </span>
                  )}
                </div>
              </div>

              {/* Enabled sections summary inside preview */}
              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">
                  Urutan Blok Beranda Aktif
                </p>
                {sections
                  .filter((s) => s.draftStatus === 'ENABLED')
                  .map((s, idx) => (
                    <div
                      key={s.id}
                      className="p-3 rounded-xl bg-surface border border-border/40 flex items-center justify-between text-xs"
                    >
                      <span className="font-semibold">
                        #{idx + 1} {SECTION_LABELS[s.type]}
                      </span>
                      <span className="text-[11px] text-ink-muted">Aktif</span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}

