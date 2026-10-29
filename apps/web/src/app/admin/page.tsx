'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Download,
  Edit3,
  FileSpreadsheet,
  Plus,
  Search,
  Upload,
} from 'lucide-react';
import { formatRupiah, slugify, type ImportMode, type ProtectedGroup } from '@store/shared';
import { apiFetch } from '@/lib/api';
import { useStore } from '@/components/store-provider';
import { AdminShell } from '@/components/admin-shell';
import { StatusBadge } from '@/components/status-badge';

interface AdminProductRow {
  id: string;
  sku: string;
  slug: string;
  name: string;
  description: string;
  categoryId: string | null;
  category: { id: string; name: string; slug: string } | null;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  salePrice: number;
  compareAtPrice: number | null;
  weightGram: number;
  highlights: string[];
  badges: string[];
  featured: boolean;
  isDemo: boolean;
  totalStock: number;
  images: Array<{ id: string; url: string; alt: string }>;
  offers: Array<{
    id: string;
    supplierSku: string;
    costPrice: number;
    stockQty: number;
    codEnabled: boolean;
    supplier: { id: string; name: string };
    warehouse: { id: string; name: string; city: string };
  }>;
}

interface PreviewResponse {
  jobId: string;
  fileName: string;
  totalRows: number;
  validRows: number;
  errorRows: number;
  createCandidates: number;
  updateCandidates: number;
  previewItems: Array<{
    rowNumber: number;
    sku: string;
    name: string;
    action: 'CREATE' | 'UPDATE';
    salePrice: number;
    costPrice: number | null;
    stockQty: number | null;
    supplierName: string | null;
    warehouseName: string | null;
    status: string;
    diffs: Array<{ field: string; group: string; before: unknown; after: unknown }>;
  }>;
  errors: Array<{ rowNumber: number; column: string | null; sku: string | null; message: string }>;
}

interface CommitResponse {
  jobId: string;
  mode: ImportMode;
  totalRows: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
  errors: Array<{ rowNumber: number; column: string | null; sku: string | null; message: string }>;
}

export default function AdminProductsPage() {
  const { showToast } = useStore();
  const [products, setProducts] = useState<AdminProductRow[]>([]);
  const [categories, setCategories] = useState<Array<{ id: string; name: string; slug: string }>>(
    [],
  );
  const [metrics, setMetrics] = useState({
    activeProducts: 0,
    lowStockProducts: 0,
    inventoryCostValue: 0,
  });
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  // Form state (matches 2-column layout in manajemen_upload_produk_kala_admin)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [slug, setSlug] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [salePrice, setSalePrice] = useState('249000');
  const [compareAtPrice, setCompareAtPrice] = useState('');
  const [weightGram, setWeightGram] = useState('500');
  const [stockQty, setStockQty] = useState('25');
  const [imageUrl, setImageUrl] = useState('/demo/lamp.jpg');
  const [highlightsText, setHighlightsText] = useState('Kualitas Kurasi, Pengiriman Terlindungi');
  const [status, setStatus] = useState<'DRAFT' | 'ACTIVE' | 'ARCHIVED'>('ACTIVE');
  const [featured, setFeatured] = useState(false);
  const [savingProduct, setSavingProduct] = useState(false);

  // Quick category creation
  const [newCategoryName, setNewCategoryName] = useState('');

  // CSV Mass Upload state
  const [csvPanelOpen, setCsvPanelOpen] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>('CREATE_ONLY');
  const [protectedFields, setProtectedFields] = useState<ProtectedGroup[]>([]);
  const [commitResult, setCommitResult] = useState<CommitResponse | null>(null);
  const [csvBusy, setCsvBusy] = useState(false);

  const loadData = useCallback(async () => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (statusFilter) params.set('status', statusFilter);
    if (categoryFilter) params.set('categoryId', categoryFilter);
    const [prodRes, catRes] = await Promise.all([
      apiFetch<{
        items: AdminProductRow[];
        total: number;
        metrics: { activeProducts: number; lowStockProducts: number; inventoryCostValue: number };
      }>(`/api/admin/products?${params.toString()}`),
      apiFetch<Array<{ id: string; name: string; slug: string }>>('/api/admin/categories'),
    ]);
    setProducts(prodRes.items);
    setTotal(prodRes.total);
    setMetrics(prodRes.metrics);
    setCategories(catRes);
  }, [q, statusFilter, categoryFilter]);

  useEffect(() => {
    void loadData().catch(() => undefined);
  }, [loadData]);

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setSku('');
    setSlug('');
    setCategoryId('');
    setDescription('');
    setSalePrice('249000');
    setCompareAtPrice('');
    setWeightGram('500');
    setStockQty('25');
    setImageUrl('/demo/lamp.jpg');
    setHighlightsText('');
    setStatus('ACTIVE');
    setFeatured(false);
  };

  const startEdit = (p: AdminProductRow) => {
    setEditingId(p.id);
    setName(p.name);
    setSku(p.sku);
    setSlug(p.slug);
    setCategoryId(p.categoryId ?? '');
    setDescription(p.description);
    setSalePrice(String(p.salePrice));
    setCompareAtPrice(p.compareAtPrice ? String(p.compareAtPrice) : '');
    setWeightGram(String(p.weightGram));
    setStockQty(String(p.offers[0]?.stockQty ?? p.totalStock ?? 0));
    setImageUrl(p.images[0]?.url ?? '/demo/lamp.jpg');
    setHighlightsText(p.highlights.join(', '));
    setStatus(p.status);
    setFeatured(p.featured);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProduct(true);
    try {
      const payload = {
        sku: sku.trim().toUpperCase(),
        slug: slug.trim() || slugify(name),
        name: name.trim(),
        description,
        categoryId: categoryId || null,
        status,
        salePrice: Number(salePrice),
        compareAtPrice: compareAtPrice ? Number(compareAtPrice) : null,
        weightGram: Number(weightGram),
        initialStockQty: stockQty !== '' ? Math.max(0, Number(stockQty)) : undefined,
        highlights: highlightsText
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 8),
        badges: featured ? ['Pilihan Kurator'] : [],
        featured,
        images: imageUrl.trim() ? [{ url: imageUrl.trim(), alt: name.trim() }] : [],
      };

      if (editingId) {
        await apiFetch(`/api/admin/products/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        showToast('Produk berhasil diperbarui', 'success');
      } else {
        await apiFetch('/api/admin/products', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        showToast('Produk baru berhasil dibuat', 'success');
      }
      resetForm();
      await loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menyimpan produk', 'danger');
    } finally {
      setSavingProduct(false);
    }
  };

  const handleArchive = async (p: AdminProductRow) => {
    if (!window.confirm(`Arsipkan produk "${p.name}"? Riwayat pesanan tetap tersimpan.`)) return;
    try {
      await apiFetch(`/api/admin/products/${p.id}/archive`, { method: 'POST' });
      showToast(`Produk ${p.sku} diarsipkan`, 'success');
      await loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal mengarsipkan', 'danger');
    }
  };

  const handleToggleLive = async (p: AdminProductRow) => {
    const nextStatus = p.status === 'ACTIVE' ? 'DRAFT' : 'ACTIVE';
    try {
      await apiFetch(`/api/admin/products/${p.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      showToast(`Status ${p.sku} diubah ke ${nextStatus}`);
      await loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal mengubah status', 'danger');
    }
  };

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) return;
    try {
      await apiFetch('/api/admin/categories', {
        method: 'POST',
        body: JSON.stringify({
          name: newCategoryName.trim(),
          slug: slugify(newCategoryName),
          active: true,
        }),
      });
      setNewCategoryName('');
      showToast('Kategori ditambahkan', 'success');
      await loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menambah kategori', 'danger');
    }
  };

  // CSV Preview & Commit handlers
  const handlePreviewCsv = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!csvFile) return;
    setCsvBusy(true);
    setPreview(null);
    setCommitResult(null);
    try {
      const form = new FormData();
      form.append('file', csvFile);
      const res = await apiFetch<PreviewResponse>('/api/admin/imports/products/preview', {
        method: 'POST',
        body: form,
      });
      setPreview(res);
      showToast(`Dry-run selesai: ${res.validRows} baris valid, ${res.errorRows} baris error`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal memvalidasi CSV', 'danger');
    } finally {
      setCsvBusy(false);
    }
  };

  const handleCommitCsv = async () => {
    if (!preview) return;
    setCsvBusy(true);
    try {
      const res = await apiFetch<CommitResponse>('/api/admin/imports/products/commit', {
        method: 'POST',
        body: JSON.stringify({
          jobId: preview.jobId,
          mode: importMode,
          protectedFields,
          confirm: true,
        }),
      });
      setCommitResult(res);
      showToast(
        `Impor selesai: ${res.createdCount} dibuat, ${res.updatedCount} diperbarui, ${res.failedCount} gagal`,
        'success',
      );
      await loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal mengeksekusi impor CSV', 'danger');
    } finally {
      setCsvBusy(false);
    }
  };

  const toggleProtectedGroup = (g: ProtectedGroup) => {
    setProtectedFields((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));
  };

  return (
    <AdminShell
      title="Katalog & Manajemen Produk"
      subtitle="Kelola inventaris, unggah produk baru, perbarui harga, dan impor katalog CSV secara presisi."
      actions={
        <>
          <button
            type="button"
            onClick={() => setCsvPanelOpen((v) => !v)}
            className="px-4 py-2 rounded-xl bg-surface border border-border/70 hover:bg-surface-low text-xs font-semibold inline-flex items-center gap-2"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Impor CSV Massal</span>
          </button>
          <a
            href="/api/admin/products/export.csv"
            className="px-4 py-2 rounded-xl bg-surface border border-border/70 hover:bg-surface-low text-xs font-semibold inline-flex items-center gap-2"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Ekspor Data CSV</span>
          </a>
          <button
            type="button"
            onClick={resetForm}
            className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-semibold inline-flex items-center gap-2 hover:bg-primary-container"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Tambah Produk Baru</span>
          </button>
        </>
      }
    >
      {/* KPI Summary Bento from real database figures (never fake 1.842 numbers) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-surface rounded-2xl p-5 border border-border/40">
          <span className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">
            TOTAL PRODUK AKTIF
          </span>
          <p className="font-serif text-3xl text-primary mt-2">{metrics.activeProducts}</p>
          <span className="text-xs text-ink-muted mt-1 block">Dari {total} total SKU terdaftar</span>
        </div>

        <div className="bg-surface rounded-2xl p-5 border border-border/40">
          <span className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">
            PERLU RESTOCK (≤ 5 UNIT)
          </span>
          <p className="font-serif text-3xl text-primary mt-2">{metrics.lowStockProducts}</p>
          <span className="inline-block mt-1 px-2 py-0.5 rounded bg-accent-soft text-accent-ink text-[11px] font-semibold">
            Pantau stok pemasok
          </span>
        </div>

        <div className="bg-surface rounded-2xl p-5 border border-border/40">
          <span className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">
            KATEGORI AKTIF
          </span>
          <p className="font-serif text-3xl text-primary mt-2">{categories.length}</p>
          <span className="text-xs text-ink-muted mt-1 block">Departemen katalog</span>
        </div>

        <div className="bg-surface rounded-2xl p-5 border border-border/40">
          <span className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">
            NILAI MODAL INVENTARIS
          </span>
          <p className="font-serif text-2xl text-primary mt-2">
            {formatRupiah(metrics.inventoryCostValue)}
          </p>
          <span className="text-xs text-ink-muted mt-1 block">
            Akumulasi stok × harga modal pemasok
          </span>
        </div>
      </div>

      {/* Mass Upload CSV Panel (Preview / Dry-run / Row-by-row Errors / Protected Field Policy) */}
      {csvPanelOpen && (
        <div className="bg-surface rounded-2xl p-6 border-2 border-primary/20 shadow-sm space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-border/40">
            <div className="flex items-center gap-2.5">
              <FileSpreadsheet className="w-5 h-5 text-accent-ink" />
              <div>
                <h2 className="font-serif text-xl text-primary">
                  Mass Upload Produk via CSV (Dry-Run &amp; Validasi Baris)
                </h2>
                <p className="text-xs text-ink-muted">
                  Batas 2 MB / 500 baris per unggahan. Harga, modal, dan stok produk lama terlindungi
                  hingga Anda mengaktifkannya secara eksplisit.
                </p>
              </div>
            </div>
            <a
              href="/api/admin/imports/products/template.csv"
              className="px-3.5 py-2 rounded-lg bg-surface-low hover:bg-surface-high border border-border/60 text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Unduh Template CSV (06_PRODUCT_IMPORT_TEMPLATE.csv)</span>
            </a>
          </div>

          <form onSubmit={handlePreviewCsv} className="flex flex-wrap items-center gap-3">
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => setCsvFile(e.target.files?.[0] ?? null)}
              className="text-xs text-ink-muted file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-primary file:text-white"
            />
            <button
              type="submit"
              disabled={!csvFile || csvBusy}
              className="px-5 py-2 rounded-lg bg-accent text-primary text-xs font-bold hover:bg-accent-soft disabled:opacity-50"
            >
              {csvBusy ? 'Memvalidasi...' : '1. Jalankan Preview / Dry-Run'}
            </button>
          </form>

          {preview && (
            <div className="space-y-4 pt-2 border-t border-border/40">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-surface-low">
                  <span className="text-ink-muted block">Total Baris</span>
                  <strong className="text-base text-ink">{preview.totalRows}</strong>
                </div>
                <div className="p-3 rounded-xl bg-surface-low">
                  <span className="text-ink-muted block">Baris Valid</span>
                  <strong className="text-base text-success">{preview.validRows}</strong>
                </div>
                <div className="p-3 rounded-xl bg-surface-low">
                  <span className="text-ink-muted block">SKU Baru (Create)</span>
                  <strong className="text-base text-primary">{preview.createCandidates}</strong>
                </div>
                <div className="p-3 rounded-xl bg-surface-low">
                  <span className="text-ink-muted block">SKU Lama (Update)</span>
                  <strong className="text-base text-accent-ink">{preview.updateCandidates}</strong>
                </div>
                <div className="p-3 rounded-xl bg-surface-low">
                  <span className="text-ink-muted block">Baris Error</span>
                  <strong className="text-base text-danger">{preview.errorRows}</strong>
                </div>
              </div>

              {/* Mode & Protected Fields Policy */}
              <div className="p-4 rounded-xl bg-surface-low border border-border/60 space-y-3 text-xs">
                <div className="flex flex-wrap items-center gap-6">
                  <span className="font-bold text-ink">Mode Impor:</span>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="importMode"
                      checked={importMode === 'CREATE_ONLY'}
                      onChange={() => setImportMode('CREATE_ONLY')}
                    />
                    <span>
                      <strong>CREATE_ONLY</strong> (Tolak/lewati SKU yang sudah ada — aman dari
                      timpa)
                    </span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="importMode"
                      checked={importMode === 'UPSERT_BY_SKU'}
                      onChange={() => setImportMode('UPSERT_BY_SKU')}
                    />
                    <span>
                      <strong>UPSERT_BY_SKU</strong> (Buat baru + perbarui SKU yang sudah ada)
                    </span>
                  </label>
                </div>

                {importMode === 'UPSERT_BY_SKU' && (
                  <div className="pt-2 border-t border-border/40 space-y-2">
                    <p className="font-semibold text-ink">
                      Otorisasi Perubahan Field Terlindungi pada SKU Lama (default: hanya nama &amp;
                      deskripsi yang diubah):
                    </p>
                    <div className="flex flex-wrap gap-4">
                      {(
                        [
                          ['PRICE', 'Harga Jual & Harga Coret'],
                          ['COST', 'Harga Modal Pemasok'],
                          ['STOCK', 'Stok Gudang'],
                          ['SUPPLIER', 'Mapping Pemasok & Gudang'],
                          ['COD', 'Kebijakan COD'],
                          ['STATUS', 'Status Publikasi'],
                        ] as Array<[ProtectedGroup, string]>
                      ).map(([grp, label]) => (
                        <label key={grp} className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={protectedFields.includes(grp)}
                            onChange={() => toggleProtectedGroup(grp)}
                          />
                          <span>{label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Preview Table */}
              {preview.previewItems.length > 0 && (
                <div className="overflow-x-auto border border-border/50 rounded-xl">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-surface-low text-ink-muted uppercase text-[10px]">
                      <tr>
                        <th className="p-2.5">Baris</th>
                        <th className="p-2.5">Aksi</th>
                        <th className="p-2.5">SKU</th>
                        <th className="p-2.5">Nama</th>
                        <th className="p-2.5">Harga Jual</th>
                        <th className="p-2.5">Modal</th>
                        <th className="p-2.5">Stok</th>
                        <th className="p-2.5">Perubahan Terdeteksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {preview.previewItems.slice(0, 15).map((item) => (
                        <tr key={item.rowNumber}>
                          <td className="p-2.5 font-mono">#{item.rowNumber}</td>
                          <td className="p-2.5">
                            <StatusBadge
                              label={item.action}
                              tone={item.action === 'CREATE' ? 'success' : 'accent'}
                            />
                          </td>
                          <td className="p-2.5 font-mono font-bold">{item.sku}</td>
                          <td className="p-2.5">{item.name}</td>
                          <td className="p-2.5">{formatRupiah(item.salePrice)}</td>
                          <td className="p-2.5">
                            {item.costPrice != null ? formatRupiah(item.costPrice) : '-'}
                          </td>
                          <td className="p-2.5">{item.stockQty ?? '-'}</td>
                          <td className="p-2.5">
                            {item.diffs.length === 0
                              ? 'Produk baru / tidak ada selisih'
                              : item.diffs
                                  .map((d) => `${d.field}: ${String(d.before)} → ${String(d.after)}`)
                                  .join('; ')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Row Errors */}
              {preview.errors.length > 0 && (
                <div className="p-4 rounded-xl bg-danger-soft/50 border border-danger/30 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-danger flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4" />
                      <span>Ditemukan {preview.errors.length} Kesalahan Validasi Baris</span>
                    </span>
                    <a
                      href={`/api/admin/imports/${preview.jobId}/report.csv`}
                      className="px-3 py-1 rounded bg-danger text-white font-semibold inline-flex items-center gap-1"
                    >
                      <Download className="w-3 h-3" />
                      <span>Unduh Laporan Error CSV</span>
                    </a>
                  </div>
                  <ul className="space-y-1 max-h-40 overflow-y-auto font-mono text-[11px] text-danger">
                    {preview.errors.map((err, idx) => (
                      <li key={idx}>
                        Baris {err.rowNumber}
                        {err.column ? ` [${err.column}]` : ''}
                        {err.sku ? ` (SKU: ${err.sku})` : ''}: {err.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Commit Action */}
              {preview.validRows > 0 && !commitResult && (
                <button
                  type="button"
                  disabled={csvBusy}
                  onClick={handleCommitCsv}
                  className="px-6 py-2.5 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-primary-container"
                >
                  {csvBusy
                    ? 'Menyimpan ke Database...'
                    : `2. Konfirmasi & Commit ${preview.validRows} Baris Valid`}
                </button>
              )}

              {commitResult && (
                <div className="p-4 rounded-xl bg-evergreen-soft text-evergreen text-xs flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>
                      <strong>Impor Selesai:</strong> {commitResult.createdCount} dibuat,{' '}
                      {commitResult.updatedCount} diperbarui, {commitResult.skippedCount} dilewati,{' '}
                      {commitResult.failedCount} gagal.
                    </span>
                  </div>
                  {commitResult.failedCount > 0 && (
                    <a
                      href={`/api/admin/imports/${commitResult.jobId}/report.csv`}
                      className="px-3 py-1.5 rounded-lg bg-evergreen text-white font-semibold inline-flex items-center gap-1"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Unduh Laporan Error CSV</span>
                    </a>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Primary Interactive Section: 2-Column Product Form matching Stitch Admin Reference */}
      <form
        onSubmit={handleSaveProduct}
        className="bg-surface rounded-2xl p-6 border border-border/50 shadow-sm space-y-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-border/40">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-serif text-xl text-primary">
                {editingId ? 'Edit Produk Kurasi' : 'Unggah Produk Kurasi Baru'}
              </h2>
              <StatusBadge
                label={editingId ? 'MODE EDIT' : 'FORMULIR BARU'}
                tone={editingId ? 'accent' : 'info'}
              />
            </div>
            <p className="text-xs text-ink-muted mt-0.5">
              Lengkapi metadata produk dan harga jual toko. Penawaran stok per gudang pemasok dapat
              ditambahkan di menu Pemasok &amp; Gudang.
            </p>
          </div>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="text-xs font-semibold text-ink-muted hover:text-ink underline"
            >
              Batal Edit / Buat Baru
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column (7 cols): Core Data & Pricing */}
          <div className="lg:col-span-7 space-y-4">
            <div>
              <label className="text-xs font-semibold text-ink block mb-1">
                Nama Produk Kurasi <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                required
                minLength={3}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!editingId) setSlug(slugify(e.target.value));
                }}
                placeholder="Contoh: Headphone Nirkabel Noise-Cancelling Seri One"
                className="w-full h-10 px-3.5 rounded-lg bg-surface-low border border-border/60 text-xs"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-ink block mb-1">Kategori Utama</label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg bg-surface-low border border-border/60 text-xs"
                >
                  <option value="">— Pilih Kategori —</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-ink block mb-1">
                  Tambah Kategori Cepat
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="Nama kategori baru..."
                    className="flex-1 h-10 px-3 rounded-lg bg-surface-low border border-border/60 text-xs"
                  />
                  <button
                    type="button"
                    onClick={handleCreateCategory}
                    className="px-3 h-10 rounded-lg bg-surface-high hover:bg-border text-xs font-semibold"
                  >
                    + Buat
                  </button>
                </div>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-ink block mb-1">Slug URL Produk</label>
              <input
                type="text"
                required
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="headphone-nirkabel-seri-one"
                className="w-full h-10 px-3.5 rounded-lg bg-surface-low border border-border/60 text-xs font-mono"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-ink block mb-1">
                Deskripsi Editorial &amp; Spesifikasi Produk
              </label>
              <textarea
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Jelaskan bahan, dimensi, fungsi, dan catatan pengiriman produk..."
                className="w-full p-3.5 rounded-lg bg-surface-low border border-border/60 text-xs"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-ink block mb-1">
                Fitur Unggulan Kunci (pisahkan dengan koma)
              </label>
              <input
                type="text"
                value={highlightsText}
                onChange={(e) => setHighlightsText(e.target.value)}
                placeholder="Hybrid ANC, Baterai 36 Jam, Kabel USB-C"
                className="w-full h-10 px-3.5 rounded-lg bg-surface-low border border-border/60 text-xs"
              />
            </div>

            {/* Pricing & SKU Box */}
            <div className="p-4 rounded-xl bg-surface-low border border-border/60 grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-ink block mb-1">
                  Harga Jual (IDR) <span className="text-danger">*</span>
                </label>
                <input
                  type="number"
                  required
                  min={1}
                  value={salePrice}
                  onChange={(e) => setSalePrice(e.target.value)}
                  className="w-full h-9 px-2.5 rounded-lg bg-surface border border-border/60 text-xs font-semibold"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-ink block mb-1">
                  Harga Coret (Opsional)
                </label>
                <input
                  type="number"
                  min={0}
                  value={compareAtPrice}
                  onChange={(e) => setCompareAtPrice(e.target.value)}
                  placeholder="Kosongkan bila normal"
                  className="w-full h-9 px-2.5 rounded-lg bg-surface border border-border/60 text-xs"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-ink block mb-1">
                  SKU Master <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={sku}
                  onChange={(e) => setSku(e.target.value.toUpperCase())}
                  placeholder="PM-ELC-001"
                  className="w-full h-9 px-2.5 rounded-lg bg-surface border border-border/60 text-xs font-mono uppercase"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-ink block mb-1">
                  Stok Gudang (Unit)
                </label>
                <input
                  type="number"
                  min={0}
                  value={stockQty}
                  onChange={(e) => setStockQty(e.target.value)}
                  className="w-full h-9 px-2.5 rounded-lg bg-surface border border-border/60 text-xs font-semibold"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-ink block mb-1">
                  Berat (Gram) <span className="text-danger">*</span>
                </label>
                <input
                  type="number"
                  required
                  min={1}
                  value={weightGram}
                  onChange={(e) => setWeightGram(e.target.value)}
                  className="w-full h-9 px-2.5 rounded-lg bg-surface border border-border/60 text-xs"
                />
              </div>
            </div>
          </div>

          {/* Right Column (5 cols): Media Assets & Publication Controls */}
          <div className="lg:col-span-5 space-y-4">
            <div className="p-4 rounded-xl bg-surface-low border border-border/60 space-y-3">
              <label className="text-xs font-bold text-ink block">URL Foto Produk Utama</label>
              <input
                type="text"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://... atau /demo/lamp.jpg"
                className="w-full h-9 px-3 rounded-lg bg-surface border border-border/60 text-xs"
              />
              {imageUrl && (
                <div className="aspect-[4/3] w-44 rounded-xl overflow-hidden bg-surface border border-border/50">
                  <img src={imageUrl} alt="Preview" className="w-full h-full object-cover" />
                </div>
              )}
              <p className="text-[11px] text-ink-muted">
                Demi keamanan SSRF, backend menyimpan URL gambar yang tervalidasi tanpa melakukan
                fetch otomatis ke host eksternal sembarangan.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-surface-low border border-border/60 space-y-3 text-xs">
              <span className="font-bold text-ink block">Visibilitas &amp; Status Terbit</span>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="radio"
                  name="prodStatus"
                  checked={status === 'ACTIVE'}
                  onChange={() => setStatus('ACTIVE')}
                />
                <span>
                  <strong>Publikasikan Langsung (ACTIVE)</strong> — Tampil di katalog toko
                </span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="radio"
                  name="prodStatus"
                  checked={status === 'DRAFT'}
                  onChange={() => setStatus('DRAFT')}
                />
                <span>
                  <strong>Simpan sebagai Draf (DRAFT)</strong> — Hanya terlihat di admin
                </span>
              </label>

              <div className="pt-2 border-t border-border/40">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={featured}
                    onChange={(e) => setFeatured(e.target.checked)}
                  />
                  <span>Tandai sebagai Pilihan Kurator (Featured)</span>
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-4 py-2.5 rounded-xl bg-surface-low text-xs font-semibold"
                >
                  Batal
                </button>
              )}
              <button
                type="submit"
                disabled={savingProduct}
                className="px-6 py-2.5 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-primary-container disabled:opacity-50"
              >
                {savingProduct
                  ? 'Menyimpan...'
                  : editingId
                    ? 'Simpan Perubahan Produk'
                    : 'Publikasikan Produk'}
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* Bottom Inventory Table Section */}
      <div className="bg-surface rounded-2xl p-6 border border-border/50 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-serif text-xl text-primary">Daftar Inventaris Terkini</h2>
            <p className="text-xs text-ink-muted">
              Memantau ketersediaan stok lintas gudang, penyesuaian harga, serta status aktif di
              etalase pembeli.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-ink-muted absolute left-3 top-2.5" />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Cari nama atau SKU..."
                className="h-9 pl-8 pr-3 rounded-lg bg-surface-low border border-border/60 text-xs"
              />
            </div>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="h-9 px-3 rounded-lg bg-surface-low border border-border/60 text-xs"
            >
              <option value="">Semua Kategori</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 px-3 rounded-lg bg-surface-low border border-border/60 text-xs"
            >
              <option value="">Semua Status</option>
              <option value="ACTIVE">ACTIVE</option>
              <option value="DRAFT">DRAFT</option>
              <option value="ARCHIVED">ARCHIVED</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-low text-ink-muted uppercase text-[10px]">
              <tr>
                <th className="p-3">Produk Kurasi</th>
                <th className="p-3">Kategori</th>
                <th className="p-3">SKU</th>
                <th className="p-3">Harga Jual</th>
                <th className="p-3">Stok Agregat</th>
                <th className="p-3">Pemasok / Gudang</th>
                <th className="p-3">Status Live</th>
                <th className="p-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {products.map((p) => (
                <tr key={p.id} className="hover:bg-surface-low/50">
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      <img
                        src={p.images[0]?.url || '/demo/lamp.jpg'}
                        alt={p.name}
                        className="w-11 h-11 rounded-lg object-cover bg-surface-low shrink-0"
                      />
                      <div>
                        <p className="font-semibold text-ink">{p.name}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {p.isDemo && (
                            <span className="px-1.5 py-0.2 rounded bg-primary/10 text-primary text-[10px] font-bold">
                              DEMO
                            </span>
                          )}
                          <span className="text-[11px] text-ink-muted">{p.weightGram}g</span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="p-3 text-ink-muted">{p.category?.name || '-'}</td>
                  <td className="p-3 font-mono font-semibold">{p.sku}</td>
                  <td className="p-3">
                    <span className="font-bold text-primary block">
                      {formatRupiah(p.salePrice)}
                    </span>
                    {p.compareAtPrice && (
                      <span className="text-[11px] text-ink-muted line-through">
                        {formatRupiah(p.compareAtPrice)}
                      </span>
                    )}
                  </td>
                  <td className="p-3">
                    <StatusBadge
                      label={`${p.totalStock} Unit`}
                      tone={p.totalStock > 5 ? 'success' : p.totalStock > 0 ? 'accent' : 'danger'}
                    />
                  </td>
                  <td className="p-3 text-[11px] text-ink-muted">
                    {p.offers.length === 0
                      ? 'Belum ada offer'
                      : p.offers.map((o) => `${o.warehouse.city} (${o.stockQty})`).join(', ')}
                  </td>
                  <td className="p-3">
                    <button
                      type="button"
                      onClick={() => handleToggleLive(p)}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                        p.status === 'ACTIVE'
                          ? 'bg-evergreen text-white'
                          : 'bg-surface-high text-ink-muted'
                      }`}
                    >
                      {p.status}
                    </button>
                  </td>
                  <td className="p-3 text-right space-x-1">
                    <button
                      type="button"
                      onClick={() => startEdit(p)}
                      title="Edit Produk"
                      className="p-1.5 rounded-lg hover:bg-surface-high text-ink"
                    >
                      <Edit3 className="w-4 h-4 inline" />
                    </button>
                    {p.status !== 'ARCHIVED' && (
                      <button
                        type="button"
                        onClick={() => handleArchive(p)}
                        title="Arsipkan Produk"
                        className="p-1.5 rounded-lg hover:bg-danger-soft text-danger"
                      >
                        <Archive className="w-4 h-4 inline" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminShell>
  );
}

