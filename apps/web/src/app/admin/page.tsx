'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  Calculator,
  CheckCircle2,
  Download,
  Edit3,
  FileSpreadsheet,
  Layers,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Truck,
  Upload,
  Video,
} from 'lucide-react';
import {
  evaluateProductProfitAndSubsidy,
  formatRupiah,
  isVideoMediaUrl,
  slugify,
  type ImportMode,
  type ProtectedGroup,
  type ShippingRateInput,
} from '@store/shared';
import { apiFetch } from '@/lib/api';
import { useStore } from '@/components/store-provider';
import { AdminShell } from '@/components/admin-shell';
import { StatusBadge } from '@/components/status-badge';

interface AdminVariantRow {
  id?: string;
  sku: string;
  name: string;
  options?: Record<string, string>;
  priceOverride: number | null;
  active: boolean;
  sortOrder?: number;
}

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
  costPrice: number;
  packagingCost: number;
  otherCost: number;
  shippingSubsidy: number;
  weightGram: number;
  highlights: string[];
  badges: string[];
  featured: boolean;
  isDemo: boolean;
  totalStock: number;
  images: Array<{ id: string; url: string; alt: string }>;
  variants: AdminVariantRow[];
  offers: Array<{
    id: string;
    supplierSku: string;
    costPrice: number;
    stockQty: number;
    codEnabled: boolean;
    supplier: { id: string; name: string };
    warehouse: { id: string; name: string; city: string; shippingOriginId?: string | null };
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

interface EditableVariant {
  id?: string;
  sku: string;
  warna: string;
  ukuran: string;
  customName: string;
  priceOverride: string;
  active: boolean;
}

const SAMPLE_DESTINATIONS = [
  { id: '17473', label: 'Kebayoran Baru, Jakarta Selatan (DKI Jakarta)' },
  { id: '17512', label: 'Menteng, Jakarta Pusat (DKI Jakarta)' },
  { id: '6984', label: 'Coblong, Kota Bandung (Jawa Barat)' },
  { id: '42915', label: 'Gubeng, Kota Surabaya (Jawa Timur)' },
  { id: '31597', label: 'Depok, Sleman (DI Yogyakarta)' },
  { id: '5132', label: 'Denpasar Selatan, Kota Denpasar (Bali)' },
];

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

  // Form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [slug, setSlug] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [salePrice, setSalePrice] = useState('150000');
  const [compareAtPrice, setCompareAtPrice] = useState('');
  const [costPrice, setCostPrice] = useState('90000');
  const [packagingCost, setPackagingCost] = useState('3000');
  const [otherCost, setOtherCost] = useState('3000');
  const [shippingSubsidy, setShippingSubsidy] = useState('0');
  const [weightGram, setWeightGram] = useState('500');
  const [stockQty, setStockQty] = useState('25');

  // Up to 3 photos or videos
  const [mediaSlots, setMediaSlots] = useState<Array<{ url: string; alt: string }>>([
    { url: '/demo/lamp.jpg', alt: '' },
  ]);
  const [uploadingSlot, setUploadingSlot] = useState<number | null>(null);

  // Product Variations (Warna, Ukuran, dll.)
  const [variants, setVariants] = useState<EditableVariant[]>([]);

  const [highlightsText, setHighlightsText] = useState('Kualitas Kurasi, Pengiriman Terlindungi');
  const [status, setStatus] = useState<'DRAFT' | 'ACTIVE' | 'ARCHIVED'>('ACTIVE');
  const [featured, setFeatured] = useState(false);
  const [savingProduct, setSavingProduct] = useState(false);

  // Automatic Profit & Aggregator Shipping Calculator state
  const [minProfitTarget, setMinProfitTarget] = useState<number>(15000);
  const [savingMinProfit, setSavingMinProfit] = useState(false);
  const [destinationId, setDestinationId] = useState('17473');
  const [aggregatorRates, setAggregatorRates] = useState<ShippingRateInput[]>([]);
  const [selectedOptionId, setSelectedOptionId] = useState<string>('');
  const [aggregatorMeta, setAggregatorMeta] = useState<{
    provider: string;
    liveAggregator: boolean;
    originCity: string;
    loading: boolean;
  }>({
    provider: 'rajaongkir',
    liveAggregator: false,
    originCity: 'Jakarta Selatan',
    loading: false,
  });

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
    const [prodRes, catRes, settingsRes] = await Promise.all([
      apiFetch<{
        items: AdminProductRow[];
        total: number;
        metrics: { activeProducts: number; lowStockProducts: number; inventoryCostValue: number };
      }>(`/api/admin/products?${params.toString()}`),
      apiFetch<Array<{ id: string; name: string; slug: string }>>('/api/admin/categories'),
      apiFetch<{ shipping?: { minProfitPerOrder?: number } }>('/api/admin/settings').catch(
        () => null,
      ),
    ]);
    setProducts(prodRes.items);
    setTotal(prodRes.total);
    setMetrics(prodRes.metrics);
    setCategories(catRes);
    if (settingsRes?.shipping?.minProfitPerOrder != null) {
      setMinProfitTarget(settingsRes.shipping.minProfitPerOrder);
    }
  }, [q, statusFilter, categoryFilter]);

  useEffect(() => {
    void loadData().catch(() => undefined);
  }, [loadData]);

  // Fetch actual shipping rates from aggregator whenever destinationId, weightGram, or editingId changes
  const fetchActualShippingRates = useCallback(async () => {
    const parsedWeight = Math.max(1, Number(weightGram) || 500);
    setAggregatorMeta((prev) => ({ ...prev, loading: true }));
    try {
      const res = await apiFetch<{
        optionsBreakdown: Array<{
          optionId: string;
          courierCode: string;
          courierName: string;
          serviceCode: string;
          serviceName: string;
          etd: string;
          shippingCost: number;
        }>;
        aggregator: {
          provider: string;
          liveAggregator: boolean;
          originCity: string;
        };
      }>('/api/admin/products/profit-preview', {
        method: 'POST',
        body: JSON.stringify({
          productId: editingId,
          salePrice: Math.max(0, Number(salePrice) || 0),
          costPrice: Math.max(0, Number(costPrice) || 0),
          packagingCost: Math.max(0, Number(packagingCost) || 0),
          otherCost: Math.max(0, Number(otherCost) || 0),
          shippingSubsidy: Math.max(0, Number(shippingSubsidy) || 0),
          weightGram: parsedWeight,
          destinationId,
          minProfitTarget,
        }),
      });
      const rates: ShippingRateInput[] = (res.optionsBreakdown || []).map((o) => ({
        optionId: o.optionId,
        courierCode: o.courierCode,
        courierName: o.courierName,
        serviceCode: o.serviceCode,
        serviceName: o.serviceName,
        etd: o.etd,
        cost: o.shippingCost,
      }));
      setAggregatorRates(rates);
      setSelectedOptionId((prev) =>
        rates.some((r) => r.optionId === prev) ? prev : (rates[0]?.optionId ?? ''),
      );
      setAggregatorMeta({
        provider: res.aggregator?.provider ?? 'rajaongkir',
        liveAggregator: Boolean(res.aggregator?.liveAggregator),
        originCity: res.aggregator?.originCity ?? 'Jakarta Selatan',
        loading: false,
      });
    } catch {
      setAggregatorMeta((prev) => ({ ...prev, loading: false }));
    }
  }, [
    editingId,
    weightGram,
    destinationId,
    salePrice,
    costPrice,
    packagingCost,
    otherCost,
    shippingSubsidy,
    minProfitTarget,
  ]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchActualShippingRates();
    }, 280);
    return () => clearTimeout(timer);
  }, [editingId, weightGram, destinationId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Real-time automatic profit & subsidy evaluation whenever any price/cost/subsidy/shipping input changes
  const profitEval = useMemo(() => {
    return evaluateProductProfitAndSubsidy({
      salePrice: Math.max(0, Number(salePrice) || 0),
      costPrice: Math.max(0, Number(costPrice) || 0),
      packagingCost: Math.max(0, Number(packagingCost) || 0),
      otherCost: Math.max(0, Number(otherCost) || 0),
      currentSubsidy: Math.max(0, Number(shippingSubsidy) || 0),
      minProfitTarget: Math.max(0, Number(minProfitTarget) || 15000),
      shippingOptions: aggregatorRates,
      selectedOptionId: selectedOptionId || undefined,
    });
  }, [
    salePrice,
    costPrice,
    packagingCost,
    otherCost,
    shippingSubsidy,
    minProfitTarget,
    aggregatorRates,
    selectedOptionId,
  ]);

  const handleSaveMinProfitTarget = async () => {
    setSavingMinProfit(true);
    try {
      const settingsRes = await apiFetch<{
        shipping: {
          provider: 'rajaongkir' | 'flat';
          couriers: string[];
          flatRatePerGroup: number;
          flatRateLabel: string;
          freeShippingMinSubtotal: number;
          minProfitPerOrder?: number;
        };
      }>('/api/admin/settings');
      await apiFetch('/api/admin/settings/shipping', {
        method: 'PUT',
        body: JSON.stringify({
          ...settingsRes.shipping,
          minProfitPerOrder: Math.max(0, Math.round(minProfitTarget)),
        }),
      });
      showToast(
        `Target laba minimal disimpan: ${formatRupiah(Math.round(minProfitTarget))} / pesanan`,
        'success',
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menyimpan target laba', 'danger');
    } finally {
      setSavingMinProfit(false);
    }
  };

  // Explicit approval handlers: never mutate database without admin confirmation
  const handleApproveRecommendation = () => {
    setSalePrice(String(profitEval.recommendedSalePrice));
    setShippingSubsidy(String(profitEval.recommendedSubsidy));
    showToast(
      `Rekomendasi disetujui ke form: Harga ${formatRupiah(profitEval.recommendedSalePrice)}, Subsidi Ongkir ${formatRupiah(profitEval.recommendedSubsidy)}. Klik Simpan Produk untuk menerapkan live.`,
      'success',
    );
  };

  const handleApprovePromoSubsidy = () => {
    setSalePrice(String(profitEval.salePrice));
    setShippingSubsidy(String(profitEval.optionalPromoSubsidy));
    showToast(
      `Promo subsidi ongkir ${formatRupiah(profitEval.optionalPromoSubsidy)} disetujui ke form (Laba bersih tetap aman ${formatRupiah(profitEval.optionalPromoNetProfit)}). Klik Simpan Produk untuk menerapkan live.`,
      'success',
    );
  };

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setSku('');
    setSlug('');
    setCategoryId('');
    setDescription('');
    setSalePrice('150000');
    setCompareAtPrice('');
    setCostPrice('90000');
    setPackagingCost('3000');
    setOtherCost('3000');
    setShippingSubsidy('0');
    setWeightGram('500');
    setStockQty('25');
    setMediaSlots([{ url: '/demo/lamp.jpg', alt: '' }]);
    setVariants([]);
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
    const resolvedHpp =
      p.costPrice && p.costPrice > 0
        ? p.costPrice
        : (p.offers[0]?.costPrice ?? Math.round(p.salePrice * 0.65));
    setCostPrice(String(resolvedHpp));
    setPackagingCost(String(p.packagingCost ?? 3000));
    setOtherCost(String(p.otherCost ?? 3000));
    setShippingSubsidy(String(p.shippingSubsidy ?? 0));
    setWeightGram(String(p.weightGram));
    setStockQty(String(p.offers[0]?.stockQty ?? p.totalStock ?? 0));
    const existingImgs = (p.images ?? [])
      .slice(0, 3)
      .map((img) => ({ url: img.url, alt: img.alt || '' }));
    setMediaSlots(existingImgs.length > 0 ? existingImgs : [{ url: '/demo/lamp.jpg', alt: '' }]);
    setVariants(
      (p.variants ?? []).map((v) => {
        const opts = (v.options ?? {}) as Record<string, string>;
        const warna = opts.Warna || opts.warna || '';
        const ukuran = opts.Ukuran || opts.ukuran || '';
        return {
          id: v.id,
          sku: v.sku,
          warna,
          ukuran,
          customName: v.name,
          priceOverride: v.priceOverride != null ? String(v.priceOverride) : '',
          active: v.active !== false,
        };
      }),
    );
    setHighlightsText(p.highlights.join(', '));
    setStatus(p.status);
    setFeatured(p.featured);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Media slot helpers (max 3 photos or videos)
  const handleAddMediaSlot = () => {
    if (mediaSlots.length >= 3) {
      showToast('Maksimal 3 foto atau video per produk', 'danger');
      return;
    }
    setMediaSlots((prev) => [...prev, { url: '', alt: '' }]);
  };

  const handleRemoveMediaSlot = (index: number) => {
    setMediaSlots((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.length > 0 ? next : [{ url: '', alt: '' }];
    });
  };

  const handleUploadMediaFile = async (index: number, file: File | null) => {
    if (!file) return;
    setUploadingSlot(index);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await apiFetch<{ url: string; mime: string }>('/api/admin/media', {
        method: 'POST',
        body: form,
      });
      setMediaSlots((prev) =>
        prev.map((slot, i) => (i === index ? { ...slot, url: res.url } : slot)),
      );
      showToast('Foto/video berhasil diunggah', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal mengunggah media', 'danger');
    } finally {
      setUploadingSlot(null);
    }
  };

  // Variant editor helpers
  const addBlankVariant = () => {
    const baseSku = (sku.trim() || 'PRD').toUpperCase();
    const idx = variants.length + 1;
    setVariants((prev) => [
      ...prev,
      {
        sku: `${baseSku}-V${idx}`,
        warna: '',
        ukuran: '',
        customName: '',
        priceOverride: '',
        active: true,
      },
    ]);
  };

  const addClothingSizePresets = (defaultColor = 'Hitam') => {
    const baseSku = (sku.trim() || 'BAJU').toUpperCase();
    const sizes = ['S', 'M', 'L', 'XL'];
    const colorCode = defaultColor
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 3);
    const newRows: EditableVariant[] = sizes.map((sz) => ({
      sku: `${baseSku}-${colorCode || 'CLR'}-${sz}`,
      warna: defaultColor,
      ukuran: sz,
      customName: defaultColor ? `${defaultColor} - Ukuran ${sz}` : `Ukuran ${sz}`,
      priceOverride: '',
      active: true,
    }));
    setVariants((prev) => [...prev, ...newRows]);
    showToast(`4 variasi ukuran (${sizes.join(', ')}) ditambahkan`, 'success');
  };

  const updateVariantField = (
    idx: number,
    field: keyof EditableVariant,
    value: string | boolean,
  ) => {
    setVariants((prev) =>
      prev.map((row, i) => {
        if (i !== idx) return row;
        const updated = { ...row, [field]: value };
        if (field === 'warna' || field === 'ukuran') {
          const parts = [
            updated.warna.trim() ? updated.warna.trim() : '',
            updated.ukuran.trim() ? `Ukuran ${updated.ukuran.trim()}` : '',
          ].filter(Boolean);
          if (parts.length > 0) {
            updated.customName = parts.join(' • ');
          }
        }
        return updated;
      }),
    );
  };

  const removeVariantRow = (idx: number) => {
    setVariants((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProduct(true);
    try {
      const validImages = mediaSlots
        .map((m) => ({ url: m.url.trim(), alt: (m.alt || name).trim() }))
        .filter((m) => m.url.length > 0)
        .slice(0, 3);

      const formattedVariants = variants
        .map((v, idx) => {
          const options: Record<string, string> = {};
          if (v.warna.trim()) options.Warna = v.warna.trim();
          if (v.ukuran.trim()) options.Ukuran = v.ukuran.trim();
          const finalName =
            v.customName.trim() ||
            [v.warna.trim(), v.ukuran.trim() ? `Ukuran ${v.ukuran.trim()}` : '']
              .filter(Boolean)
              .join(' • ') ||
            `Varian ${idx + 1}`;
          return {
            ...(v.id ? { id: v.id } : {}),
            sku: (v.sku.trim() || `${sku.trim().toUpperCase()}-V${idx + 1}`).toUpperCase(),
            name: finalName,
            options,
            priceOverride: v.priceOverride.trim() ? Number(v.priceOverride) : null,
            active: v.active,
            sortOrder: idx,
          };
        })
        .filter((v) => v.name.length > 0);

      const payload = {
        sku: sku.trim().toUpperCase(),
        slug: slug.trim() || slugify(name),
        name: name.trim(),
        description,
        categoryId: categoryId || null,
        status,
        salePrice: Number(salePrice),
        compareAtPrice: compareAtPrice ? Number(compareAtPrice) : null,
        costPrice: Math.max(0, Number(costPrice) || 0),
        packagingCost: Math.max(0, Number(packagingCost) || 0),
        otherCost: Math.max(0, Number(otherCost) || 0),
        shippingSubsidy: Math.max(0, Number(shippingSubsidy) || 0),
        weightGram: Number(weightGram),
        initialStockQty: stockQty !== '' ? Math.max(0, Number(stockQty)) : undefined,
        highlights: highlightsText
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 8),
        badges: featured ? ['Pilihan Kurator'] : [],
        featured,
        images: validImages,
        variants: formattedVariants,
      };

      if (editingId) {
        await apiFetch(`/api/admin/products/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        showToast('Produk, biaya HPP, subsidi ongkir & variasi berhasil diperbarui', 'success');
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
      title="Katalog, Kalkulator Laba Otomatis & Variasi Produk"
      subtitle="Kelola inventaris, hitung otomatis estimasi laba & subsidi ongkir aktual dari agregator, atur variasi warna/ukuran, dan unggah maksimal 3 foto/video."
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
      {/* KPI Summary Bento from real database figures */}
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
            TARGET LABA MINIMAL
          </span>
          <p className="font-serif text-2xl text-primary mt-2">{formatRupiah(minProfitTarget)}</p>
          <span className="text-xs text-ink-muted mt-1 block">
            Per pesanan (dapat diubah di bawah)
          </span>
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

      {/* Mass Upload CSV Panel */}
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
              <span>Unduh Template CSV</span>
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
                      <strong>CREATE_ONLY</strong> (Tolak/lewati SKU yang sudah ada)
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
                      Otorisasi Perubahan Field Terlindungi pada SKU Lama:
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
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Primary Interactive Form */}
      <form
        onSubmit={handleSaveProduct}
        className="bg-surface rounded-2xl p-6 border border-border/50 shadow-sm space-y-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-border/40">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-serif text-xl text-primary">
                {editingId ? 'Edit Produk, Variasi & Skema Laba' : 'Tambah Produk Baru & Kalkulasi Laba Otomatis'}
              </h2>
              <StatusBadge
                label={editingId ? 'MODE EDIT' : 'FORMULIR BARU'}
                tone={editingId ? 'accent' : 'info'}
              />
            </div>
            <p className="text-xs text-ink-muted mt-0.5">
              Terintegrasi langsung dengan database produk, HPP, biaya kemasan, tarif ongkir aktual agregator, variasi warna/ukuran, dan maks. 3 foto/video.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setSalePrice('150000');
                setCostPrice('90000');
                setPackagingCost('3000');
                setOtherCost('3000');
                setShippingSubsidy('0');
                showToast('Simulasi contoh (Harga Rp150.000, HPP Rp90.000, Kemasan Rp3.000, Biaya Lain Rp3.000) dimuat');
              }}
              className="px-3 py-1.5 rounded-lg bg-accent-soft text-accent-ink text-[11px] font-semibold hover:bg-accent/30"
            >
              Isi Contoh Uji (Rp150rb / HPP Rp90rb)
            </button>
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
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column (7 cols): Core Data, Cost/HPP, Live Profit Engine, & Variations */}
          <div className="lg:col-span-7 space-y-5">
            <div>
              <label className="text-xs font-semibold text-ink block mb-1">
                Nama Produk <span className="text-danger">*</span>
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
                placeholder="Contoh: Kemeja Linen Oversize Lengan Panjang"
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-ink block mb-1">
                  SKU Master <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={sku}
                  onChange={(e) => setSku(e.target.value.toUpperCase())}
                  placeholder="PM-FSH-001"
                  className="w-full h-10 px-3.5 rounded-lg bg-surface-low border border-border/60 text-xs font-mono uppercase"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-ink block mb-1">Slug URL Produk</label>
                <input
                  type="text"
                  required
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="kemeja-linen-oversize"
                  className="w-full h-10 px-3.5 rounded-lg bg-surface-low border border-border/60 text-xs font-mono"
                />
              </div>
            </div>

            {/* Pricing, HPP, Costs & Shipping Subsidy Box */}
            <div className="p-4 rounded-xl bg-surface-low border border-border/60 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-primary flex items-center gap-1.5">
                  <Calculator className="w-4 h-4 text-accent-ink" />
                  <span>Data Harga Jual, HPP, Biaya Operasional &amp; Subsidi Ongkir</span>
                </span>
                <span className="text-[11px] text-ink-muted">
                  Diperbarui otomatis ke kalkulator laba di bawah
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
                    className="w-full h-9 px-2.5 rounded-lg bg-surface border border-border/60 text-xs font-bold text-primary"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-ink block mb-1">
                    HPP / Harga Modal (IDR) <span className="text-danger">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={costPrice}
                    onChange={(e) => setCostPrice(e.target.value)}
                    className="w-full h-9 px-2.5 rounded-lg bg-surface border border-border/60 text-xs font-semibold"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-ink block mb-1">
                    Biaya Kemasan (IDR)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={packagingCost}
                    onChange={(e) => setPackagingCost(e.target.value)}
                    className="w-full h-9 px-2.5 rounded-lg bg-surface border border-border/60 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-ink block mb-1">
                    Biaya Lainnya (IDR)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={otherCost}
                    onChange={(e) => setOtherCost(e.target.value)}
                    className="w-full h-9 px-2.5 rounded-lg bg-surface border border-border/60 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                <div>
                  <label className="text-[11px] font-semibold text-ink block mb-1">
                    Subsidi Ongkir Produk (IDR)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={shippingSubsidy}
                    onChange={(e) => setShippingSubsidy(e.target.value)}
                    className="w-full h-9 px-2.5 rounded-lg bg-surface border border-border/60 text-xs font-semibold text-evergreen"
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

            {/* LIVE AUTOMATIC PROFIT & SHIPPING SUBSIDY RECOMMENDATION ENGINE */}
            <div
              className={`p-5 rounded-2xl border-2 space-y-4 ${
                !profitEval.isSafe
                  ? 'bg-danger-soft/25 border-danger/50'
                  : 'bg-evergreen-soft/20 border-evergreen/40'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-border/40">
                <div className="flex items-center gap-2">
                  {profitEval.isSafe ? (
                    <ShieldCheck className="w-5 h-5 text-evergreen shrink-0" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-danger shrink-0" />
                  )}
                  <div>
                    <h3 className="text-sm font-bold text-primary">
                      Analisis Otomatis Laba, Ongkir Agregator &amp; Rekomendasi Subsidi
                    </h3>
                    <p className="text-[11px] text-ink-muted">
                      Sumber Ongkir:{' '}
                      <strong>
                        {aggregatorMeta.liveAggregator
                          ? 'Tarif Aktual RajaOngkir API (Live)'
                          : 'Tarif Agregator Toko'}
                      </strong>{' '}
                      • Gudang Asal: <strong>{aggregatorMeta.originCity}</strong>
                    </p>
                  </div>
                </div>
                <StatusBadge
                  label={profitEval.statusBadgeText}
                  tone={profitEval.isSafe ? 'success' : 'danger'}
                />
              </div>

              {/* Destination & Target Profit Controls */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="text-[11px] font-semibold text-ink block mb-1">
                    Tujuan Pengiriman Simulasi (RajaOngkir)
                  </label>
                  <div className="flex gap-1.5">
                    <select
                      value={destinationId}
                      onChange={(e) => setDestinationId(e.target.value)}
                      className="flex-1 h-9 px-2.5 rounded-lg bg-surface border border-border/60 text-xs"
                    >
                      {SAMPLE_DESTINATIONS.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => void fetchActualShippingRates()}
                      title="Muat ulang tarif agregator"
                      className="px-2.5 h-9 rounded-lg bg-surface border border-border/60 hover:bg-surface-high text-ink"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${aggregatorMeta.loading ? 'animate-spin' : ''}`}
                      />
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-ink block mb-1">
                    Target Laba Minimal / Pesanan (Default Rp 15.000)
                  </label>
                  <div className="flex gap-1.5">
                    <input
                      type="number"
                      min={0}
                      step={1000}
                      value={minProfitTarget}
                      onChange={(e) => setMinProfitTarget(Math.max(0, Number(e.target.value) || 0))}
                      className="flex-1 h-9 px-2.5 rounded-lg bg-surface border border-border/60 text-xs font-bold text-primary"
                    />
                    <button
                      type="button"
                      disabled={savingMinProfit}
                      onClick={handleSaveMinProfitTarget}
                      className="px-3 h-9 rounded-lg bg-primary text-white text-[11px] font-semibold hover:bg-primary-container disabled:opacity-50"
                    >
                      {savingMinProfit ? '...' : 'Simpan Target'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Courier Service Selector from Aggregator */}
              {profitEval.optionsBreakdown.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[11px] font-semibold text-ink block">
                    Pilih Layanan Kurir Aktual dari Agregator (Klik untuk melihat simulasi per kurir):
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {profitEval.optionsBreakdown.map((opt) => {
                      const active =
                        (profitEval.selectedOption?.optionId ?? '') === opt.optionId;
                      return (
                        <button
                          key={opt.optionId}
                          type="button"
                          onClick={() => setSelectedOptionId(opt.optionId)}
                          className={`p-2.5 rounded-xl border text-left transition-all text-xs ${
                            active
                              ? 'border-primary bg-surface shadow-sm ring-1 ring-primary'
                              : 'border-border/60 bg-surface/70 hover:bg-surface'
                          }`}
                        >
                          <div className="flex items-center justify-between font-bold text-ink">
                            <span>
                              {opt.courierCode} {opt.serviceCode}
                            </span>
                            <span className="text-primary">{formatRupiah(opt.shippingCost)}</span>
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-ink-muted mt-0.5">
                            <span>ETD {opt.etd}</span>
                            <span
                              className={
                                opt.isCurrentSchemeMeetingTarget
                                  ? 'text-evergreen font-semibold'
                                  : 'text-danger font-semibold'
                              }
                            >
                              Laba: {formatRupiah(opt.netProfit)}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Key Calculated Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                <div className="p-3 rounded-xl bg-surface border border-border/50">
                  <span className="text-[10px] uppercase tracking-wider text-ink-muted block">
                    Total Checkout Pembeli
                  </span>
                  <strong className="text-base text-primary block mt-0.5">
                    {formatRupiah(profitEval.buyerTotalCheckout)}
                  </strong>
                  <span className="text-[10px] text-ink-muted">
                    Harga {formatRupiah(profitEval.salePrice)} + Ongkir Pembeli{' '}
                    {formatRupiah(profitEval.buyerShippingPay)}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-surface border border-border/50">
                  <span className="text-[10px] uppercase tracking-wider text-ink-muted block">
                    Estimasi Laba Bersih
                  </span>
                  <strong
                    className={`text-base block mt-0.5 ${
                      profitEval.netProfit >= profitEval.minProfitTarget
                        ? 'text-evergreen'
                        : 'text-danger'
                    }`}
                  >
                    {formatRupiah(profitEval.netProfit)}
                  </strong>
                  <span className="text-[10px] text-ink-muted">
                    Margin Kotor {formatRupiah(profitEval.grossMarginBeforeSubsidy)} − Subsidi{' '}
                    {formatRupiah(profitEval.appliedSubsidy)}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-surface border border-border/50">
                  <span className="text-[10px] uppercase tracking-wider text-ink-muted block">
                    Subsidi Ongkir Maksimal
                  </span>
                  <strong className="text-base text-accent-ink block mt-0.5">
                    {formatRupiah(profitEval.maxShippingSubsidy)}
                  </strong>
                  <span className="text-[10px] text-ink-muted">
                    Batas Ruang Subsidi: {formatRupiah(profitEval.rawMaxSubsidyBudget)}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-surface border border-border/50">
                  <span className="text-[10px] uppercase tracking-wider text-ink-muted block">
                    Rekomendasi Skema
                  </span>
                  <strong className="text-xs text-primary block mt-0.5 leading-snug">
                    {profitEval.canFullFreeShipping
                      ? 'Bisa Gratis Ongkir / Ongkir Normal'
                      : profitEval.maxShippingSubsidy > 0
                        ? `Subsidi Sebagian (Pembeli Bayar ${formatRupiah(profitEval.buyerRemainingShippingAtMaxSubsidy)})`
                        : 'Ongkir Normal (Tanpa Subsidi)'}
                  </strong>
                  <span className="text-[10px] text-ink-muted">
                    Ongkir Agregator: {formatRupiah(profitEval.shippingCost)}
                  </span>
                </div>
              </div>

              {/* Detailed Summary & Warnings */}
              <div className="p-3.5 rounded-xl bg-surface border border-border/60 space-y-2 text-xs">
                <p className="font-semibold text-ink">{profitEval.summaryText}</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-[11px] text-ink-muted border-t border-border/40">
                  <div>
                    • <strong>Skema Ongkir Normal (Subsidi Rp 0):</strong> Pembeli bayar{' '}
                    {formatRupiah(profitEval.salePrice + profitEval.shippingCost)}, Laba Anda{' '}
                    <strong>{formatRupiah(profitEval.profitWithNormalShipping)}</strong>.
                  </div>
                  <div>
                    • <strong>Skema Subsidi Maksimal ({formatRupiah(profitEval.maxShippingSubsidy)}):</strong>{' '}
                    Pembeli bayar sisa ongkir{' '}
                    <strong>{formatRupiah(profitEval.buyerRemainingShippingAtMaxSubsidy)}</strong>, Laba Anda{' '}
                    <strong>
                      {formatRupiah(
                        profitEval.grossMarginBeforeSubsidy - profitEval.maxShippingSubsidy,
                      )}
                    </strong>
                    .
                  </div>
                  <div>
                    • <strong>Status Gratis Ongkir Penuh:</strong>{' '}
                    {profitEval.canFullFreeShipping ? (
                      <span className="text-evergreen font-semibold">
                        Aman (Laba {formatRupiah(profitEval.profitWithFullFreeShipping)} ≥ Target)
                      </span>
                    ) : (
                      <span className="text-danger font-semibold">
                        Tidak Direkomendasikan (Laba akan turun ke{' '}
                        {formatRupiah(profitEval.profitWithFullFreeShipping)})
                      </span>
                    )}
                  </div>
                </div>

                {profitEval.warnings.length > 0 && (
                  <div className="p-2.5 rounded-lg bg-danger-soft/60 text-danger text-[11px] space-y-1">
                    {profitEval.warnings.map((w, idx) => (
                      <p key={idx} className="font-medium">
                        ⚠️ {w}
                      </p>
                    ))}
                  </div>
                )}
              </div>

              {/* Explicit Admin Approval Actions */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <span className="text-[11px] text-ink-muted">
                  * Perubahan harga jual &amp; subsidi ongkir hanya diterapkan ke produk setelah Anda
                  menyetujuinya:
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  {(profitEval.requiresPriceChange || profitEval.requiresSubsidyChange) && (
                    <button
                      type="button"
                      onClick={handleApproveRecommendation}
                      className="px-3.5 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-container inline-flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>
                        Setujui &amp; Terapkan Rekomendasi Aman (Harga{' '}
                        {formatRupiah(profitEval.recommendedSalePrice)}, Subsidi{' '}
                        {formatRupiah(profitEval.recommendedSubsidy)})
                      </span>
                    </button>
                  )}

                  {profitEval.isSafe &&
                    profitEval.optionalPromoSubsidy > 0 &&
                    profitEval.optionalPromoSubsidy !== profitEval.appliedSubsidy && (
                      <button
                        type="button"
                        onClick={handleApprovePromoSubsidy}
                        className="px-3.5 py-2 rounded-xl bg-evergreen text-white text-xs font-semibold hover:opacity-95 inline-flex items-center gap-1.5"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>
                          Setujui Promo Subsidi {formatRupiah(profitEval.optionalPromoSubsidy)}{' '}
                          (Laba {formatRupiah(profitEval.optionalPromoNetProfit)})
                        </span>
                      </button>
                    )}

                  {Number(shippingSubsidy) > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setShippingSubsidy('0');
                        showToast('Subsidi ongkir dikembalikan ke Rp 0 (Ongkir Normal) di form');
                      }}
                      className="px-3 py-2 rounded-xl bg-surface border border-border/70 text-xs font-semibold hover:bg-surface-high"
                    >
                      Gunakan Ongkir Normal (Subsidi Rp 0)
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* PRODUCT VARIATIONS BUILDER / EDITOR (Warna, Ukuran, dll.) */}
            <div className="p-5 rounded-2xl bg-surface-low border border-border/60 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-primary flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-accent-ink" />
                    <span>Variasi Produk (Warna, Ukuran Baju S/M/L/XL, atau Tipe Lainnya)</span>
                  </h3>
                  <p className="text-[11px] text-ink-muted">
                    Tambahkan dan edit variasi seperti Warna dan Ukuran. Variasi ini akan langsung
                    tampil dan bisa dipilih pembeli di halaman produk.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => addClothingSizePresets('Hitam')}
                    className="px-3 py-1.5 rounded-lg bg-accent-soft text-accent-ink text-[11px] font-semibold hover:bg-accent/30"
                  >
                    + Preset Ukuran Baju (S, M, L, XL)
                  </button>
                  <button
                    type="button"
                    onClick={addBlankVariant}
                    className="px-3 py-1.5 rounded-lg bg-primary text-white text-[11px] font-semibold hover:bg-primary-container inline-flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Tambah Variasi</span>
                  </button>
                </div>
              </div>

              {variants.length === 0 ? (
                <div className="p-4 rounded-xl bg-surface border border-dashed border-border text-center text-xs text-ink-muted">
                  Belum ada variasi (produk dijual dalam 1 tipe standar). Klik{' '}
                  <strong>+ Tambah Variasi</strong> atau{' '}
                  <strong>+ Preset Ukuran Baju (S, M, L, XL)</strong> untuk menambahkan pilihan
                  warna/ukuran.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {variants.map((v, idx) => (
                    <div
                      key={v.id ?? `var-${idx}`}
                      className="p-3 rounded-xl bg-surface border border-border/60 grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end"
                    >
                      <div className="sm:col-span-2">
                        <label className="text-[10px] font-semibold text-ink-muted block mb-1">
                          Warna
                        </label>
                        <input
                          type="text"
                          value={v.warna}
                          onChange={(e) => updateVariantField(idx, 'warna', e.target.value)}
                          placeholder="Mis. Hitam / Putih"
                          className="w-full h-8 px-2.5 rounded-lg bg-surface-low border border-border/60 text-xs"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="text-[10px] font-semibold text-ink-muted block mb-1">
                          Ukuran
                        </label>
                        <input
                          type="text"
                          value={v.ukuran}
                          onChange={(e) => updateVariantField(idx, 'ukuran', e.target.value)}
                          placeholder="S / M / L / XL"
                          className="w-full h-8 px-2.5 rounded-lg bg-surface-low border border-border/60 text-xs"
                        />
                      </div>
                      <div className="sm:col-span-3">
                        <label className="text-[10px] font-semibold text-ink-muted block mb-1">
                          Label Tampilan Variasi
                        </label>
                        <input
                          type="text"
                          value={v.customName}
                          onChange={(e) => updateVariantField(idx, 'customName', e.target.value)}
                          placeholder="Hitam • Ukuran L"
                          className="w-full h-8 px-2.5 rounded-lg bg-surface-low border border-border/60 text-xs font-semibold"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="text-[10px] font-semibold text-ink-muted block mb-1">
                          SKU Variasi
                        </label>
                        <input
                          type="text"
                          value={v.sku}
                          onChange={(e) =>
                            updateVariantField(idx, 'sku', e.target.value.toUpperCase())
                          }
                          placeholder="SKU-VAR-1"
                          className="w-full h-8 px-2.5 rounded-lg bg-surface-low border border-border/60 text-xs font-mono uppercase"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="text-[10px] font-semibold text-ink-muted block mb-1">
                          Harga Khusus (Opsional)
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={v.priceOverride}
                          onChange={(e) => updateVariantField(idx, 'priceOverride', e.target.value)}
                          placeholder="Ikut harga utama"
                          className="w-full h-8 px-2.5 rounded-lg bg-surface-low border border-border/60 text-xs"
                        />
                      </div>
                      <div className="sm:col-span-1 flex justify-end">
                        <button
                          type="button"
                          onClick={() => removeVariantRow(idx)}
                          title="Hapus variasi ini"
                          className="h-8 px-2.5 rounded-lg bg-danger-soft text-danger hover:bg-danger hover:text-white text-xs inline-flex items-center justify-center"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="text-xs font-semibold text-ink block mb-1">
                Deskripsi Editorial &amp; Spesifikasi Produk
              </label>
              <textarea
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Jelaskan bahan, panduan ukuran (S/M/L/XL), dimensi, dan keunggulan produk..."
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
                placeholder="Katun Linen Adem, Jahitan Rapi, Tersedia Ukuran S-XL"
                className="w-full h-10 px-3.5 rounded-lg bg-surface-low border border-border/60 text-xs"
              />
            </div>
          </div>

          {/* Right Column (5 cols): Up to 3 Photos/Videos Media Manager & Publication Controls */}
          <div className="lg:col-span-5 space-y-4">
            <div className="p-4 rounded-xl bg-surface-low border border-border/60 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-xs font-bold text-ink block">
                    Galeri Foto / Video Produk (Maksimal 3 Media)
                  </label>
                  <span className="text-[11px] text-ink-muted">
                    Bisa menampilkan 1, 2, atau maksimal 3 foto (.jpg/.png/.webp) atau video
                    (.mp4/.webm).
                  </span>
                </div>
                {mediaSlots.length < 3 && (
                  <button
                    type="button"
                    onClick={handleAddMediaSlot}
                    className="px-2.5 py-1.5 rounded-lg bg-primary text-white text-[11px] font-semibold hover:bg-primary-container inline-flex items-center gap-1 shrink-0"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Slot ({mediaSlots.length}/3)</span>
                  </button>
                )}
              </div>

              <div className="space-y-3">
                {mediaSlots.map((slot, index) => {
                  const isVid = isVideoMediaUrl(slot.url);
                  return (
                    <div
                      key={index}
                      className="p-3 rounded-xl bg-surface border border-border/60 space-y-2"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-primary flex items-center gap-1.5">
                          {isVid ? <Video className="w-3.5 h-3.5 text-accent-ink" /> : null}
                          <span>
                            Media #{index + 1} {index === 0 ? '(Utama)' : '(Tambahan)'}
                          </span>
                        </span>
                        <div className="flex items-center gap-2">
                          <label className="px-2.5 py-1 rounded-lg bg-surface-low hover:bg-surface-high border border-border/60 text-[11px] font-semibold cursor-pointer inline-flex items-center gap-1">
                            <Upload className="w-3 h-3" />
                            <span>
                              {uploadingSlot === index ? 'Mengunggah...' : 'Unggah File'}
                            </span>
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
                              className="hidden"
                              onChange={(e) =>
                                void handleUploadMediaFile(index, e.target.files?.[0] ?? null)
                              }
                            />
                          </label>
                          {mediaSlots.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveMediaSlot(index)}
                              className="text-[11px] text-danger hover:underline"
                            >
                              Hapus
                            </button>
                          )}
                        </div>
                      </div>

                      <input
                        type="text"
                        value={slot.url}
                        onChange={(e) =>
                          setMediaSlots((prev) =>
                            prev.map((s, i) => (i === index ? { ...s, url: e.target.value } : s)),
                          )
                        }
                        placeholder="https://... atau /media/... (.jpg, .png, .webp, .mp4, .webm)"
                        className="w-full h-8 px-2.5 rounded-lg bg-surface-low border border-border/60 text-xs"
                      />

                      {slot.url && (
                        <div className="aspect-[4/3] w-40 rounded-lg overflow-hidden bg-surface-low border border-border/50">
                          {isVid ? (
                            <video
                              src={slot.url}
                              controls
                              muted
                              playsInline
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <img
                              src={slot.url}
                              alt={`Preview ${index + 1}`}
                              className="w-full h-full object-cover"
                            />
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
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
            <h2 className="font-serif text-xl text-primary">Daftar Inventaris, HPP &amp; Variasi</h2>
            <p className="text-xs text-ink-muted">
              Memantau harga jual, HPP, subsidi ongkir, jumlah variasi, dan ketersediaan stok lintas
              gudang.
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
                <th className="p-3">Produk</th>
                <th className="p-3">SKU &amp; Variasi</th>
                <th className="p-3">Harga Jual</th>
                <th className="p-3">HPP &amp; Subsidi</th>
                <th className="p-3">Stok Agregat</th>
                <th className="p-3">Media</th>
                <th className="p-3">Status Live</th>
                <th className="p-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {products.map((p) => {
                const effHpp =
                  p.costPrice && p.costPrice > 0 ? p.costPrice : (p.offers[0]?.costPrice ?? 0);
                return (
                  <tr key={p.id} className="hover:bg-surface-low/50">
                    <td className="p-3">
                      <div className="flex items-center gap-3">
                        {isVideoMediaUrl(p.images[0]?.url) ? (
                          <video
                            src={p.images[0]?.url}
                            muted
                            className="w-11 h-11 rounded-lg object-cover bg-surface-low shrink-0"
                          />
                        ) : (
                          <img
                            src={p.images[0]?.url || '/demo/lamp.jpg'}
                            alt={p.name}
                            className="w-11 h-11 rounded-lg object-cover bg-surface-low shrink-0"
                          />
                        )}
                        <div>
                          <p className="font-semibold text-ink">{p.name}</p>
                          <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-ink-muted">
                            <span>{p.category?.name || 'Tanpa Kategori'}</span>
                            <span>•</span>
                            <span>{p.weightGram}g</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="p-3">
                      <span className="font-mono font-semibold block">{p.sku}</span>
                      <span className="text-[11px] text-ink-muted">
                        {p.variants?.length
                          ? `${p.variants.length} variasi (${p.variants
                              .slice(0, 3)
                              .map((v) => v.name)
                              .join(', ')})`
                          : 'Standar (1 opsi)'}
                      </span>
                    </td>
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
                    <td className="p-3 text-[11px]">
                      <span className="block text-ink">
                        HPP: <strong>{effHpp > 0 ? formatRupiah(effHpp) : 'Belum diisi'}</strong>
                      </span>
                      {p.shippingSubsidy > 0 ? (
                        <span className="text-evergreen font-semibold inline-flex items-center gap-1">
                          <Truck className="w-3 h-3" /> Subsidi {formatRupiah(p.shippingSubsidy)}
                        </span>
                      ) : (
                        <span className="text-ink-muted">Ongkir Normal</span>
                      )}
                    </td>
                    <td className="p-3">
                      <StatusBadge
                        label={`${p.totalStock} Unit`}
                        tone={
                          p.totalStock > 5 ? 'success' : p.totalStock > 0 ? 'accent' : 'danger'
                        }
                      />
                    </td>
                    <td className="p-3 text-[11px] text-ink-muted">
                      {Math.min(3, p.images?.length || 0)}/3 file
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
                        title="Edit Produk, Variasi & Laba"
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
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </AdminShell>
  );
}
