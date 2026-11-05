'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Edit3, MapPin, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { formatRupiah, integrationModeLabel, type IntegrationMode } from '@store/shared';
import { apiFetch } from '@/lib/api';
import { useStore } from '@/components/store-provider';
import { AdminShell } from '@/components/admin-shell';
import { StatusBadge } from '@/components/status-badge';

interface WarehouseItem {
  id: string;
  supplierId: string;
  name: string;
  city: string;
  province: string | null;
  address: string | null;
  shippingOriginId: string | null;
  active: boolean;
}

interface SupplierRow {
  id: string;
  name: string;
  publicLabel: string | null;
  active: boolean;
  integrationMode: IntegrationMode;
  sourcePlatform: string | null;
  contactName: string | null;
  contactPhone: string | null;
  portalUrl: string | null;
  codSupported: boolean;
  notes: string | null;
  warehouses: WarehouseItem[];
}

interface OfferRow {
  id: string;
  productId: string;
  supplierId: string;
  warehouseId: string;
  supplierSku: string;
  supplierProductUrl: string | null;
  costPrice: number;
  stockQty: number;
  leadTimeDays: number;
  fulfillmentPriority: number;
  codEnabled: boolean;
  integrationMode: IntegrationMode;
  active: boolean;
  product: { id: string; sku: string; name: string; salePrice: number };
  supplier: { id: string; name: string };
  warehouse: { id: string; name: string; city: string };
}

interface DestinationMatch {
  id: string;
  label: string;
  province: string;
  city: string;
  district: string;
  subdistrict: string;
  postalCode: string;
}

export default function AdminSuppliersPage() {
  const { showToast } = useStore();
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [products, setProducts] = useState<Array<{ id: string; sku: string; name: string }>>([]);

  // 1. New supplier form
  const [supName, setSupName] = useState('');
  const [supPublicLabel, setSupPublicLabel] = useState('');
  const [supMode, setSupMode] = useState<IntegrationMode>('MANUAL');
  const [supPhone, setSupPhone] = useState('');
  const [supCod, setSupCod] = useState(true);

  // 2. New / Edit warehouse form (supports typing custom supplier name + full address + auto RajaOngkir Origin ID)
  const [editingWarehouseId, setEditingWarehouseId] = useState<string | null>(null);
  const [whSupplierName, setWhSupplierName] = useState('');
  const [whName, setWhName] = useState('');
  const [whAddress, setWhAddress] = useState('');
  const [whCity, setWhCity] = useState('');
  const [whProvince, setWhProvince] = useState('');
  const [whOriginId, setWhOriginId] = useState('');
  const [whOriginLabel, setWhOriginLabel] = useState('');
  const [cityMatches, setCityMatches] = useState<DestinationMatch[]>([]);
  const [lookingUpOrigin, setLookingUpOrigin] = useState(false);

  // 3. New offer form
  const [ofProductId, setOfProductId] = useState('');
  const [ofSupplierId, setOfSupplierId] = useState('');
  const [ofWarehouseId, setOfWarehouseId] = useState('');
  const [ofSupplierSku, setOfSupplierSku] = useState('');
  const [ofCostPrice, setOfCostPrice] = useState('90000');
  const [ofStockQty, setOfStockQty] = useState('25');
  const [ofPriority, setOfPriority] = useState('10');
  const [ofCod, setOfCod] = useState(true);

  // Stock adjustment modal/inline
  const [adjustOfferId, setAdjustOfferId] = useState<string | null>(null);
  const [adjustDelta, setAdjustDelta] = useState('5');
  const [adjustReason, setAdjustReason] = useState('Restock gudang pemasok');

  const loadAll = useCallback(async () => {
    const [supRes, offRes, prodRes] = await Promise.all([
      apiFetch<SupplierRow[]>('/api/admin/suppliers'),
      apiFetch<OfferRow[]>('/api/admin/supplier-offers'),
      apiFetch<{ items: Array<{ id: string; sku: string; name: string }> }>(
        '/api/admin/products?pageSize=100',
      ),
    ]);
    setSuppliers(supRes);
    setOffers(offRes);
    setProducts(prodRes.items);
    if (!ofProductId && prodRes.items[0]) setOfProductId(prodRes.items[0].id);
    if (!ofSupplierId && supRes[0]) {
      setOfSupplierId(supRes[0].id);
      if (supRes[0].warehouses[0]) setOfWarehouseId(supRes[0].warehouses[0].id);
    }
  }, [ofProductId, ofSupplierId]);

  useEffect(() => {
    void loadAll().catch(() => undefined);
  }, [loadAll]);

  // Automatically resolve ID Origin RajaOngkir & Provinsi whenever Kota / Kabupaten changes
  useEffect(() => {
    const q = whCity.trim();
    if (q.length < 2) {
      setCityMatches([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLookingUpOrigin(true);
      try {
        const res = await apiFetch<{ items: DestinationMatch[]; source: string }>(
          `/api/shipping/destinations?q=${encodeURIComponent(q)}`,
        );
        if (cancelled) return;
        const rawItems = res.items || [];
        const lower = q.toLowerCase().replace(/^(kota|kabupaten|kab\.?)\s+/i, '').trim();
        const scoreItem = (i: DestinationMatch) => {
          const cityLower = (i.city || '').toLowerCase();
          if (cityLower === lower) return 3;
          if (cityLower.includes(lower) || (lower.length >= 3 && lower.includes(cityLower))) return 2;
          if ((i.district || '').toLowerCase().includes(lower)) return 1;
          return 0;
        };
        const items = [...rawItems].sort((a, b) => scoreItem(b) - scoreItem(a));
        setCityMatches(items.slice(0, 6));
        if (items.length > 0) {
          const best = items[0];
          setWhOriginId(best.id);
          setWhOriginLabel(best.label);
          if (best.province) {
            setWhProvince(best.province);
          }
        }
      } catch {
        // ignore lookup error
      } finally {
        if (!cancelled) setLookingUpOrigin(false);
      }
    }, 260);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [whCity]);

  const handleSelectCityMatch = (match: DestinationMatch) => {
    setWhCity(match.city || whCity);
    setWhProvince(match.province || whProvince);
    setWhOriginId(match.id);
    setWhOriginLabel(match.label);
  };

  const resetWarehouseForm = () => {
    setEditingWarehouseId(null);
    setWhSupplierName('');
    setWhName('');
    setWhAddress('');
    setWhCity('');
    setWhProvince('');
    setWhOriginId('');
    setWhOriginLabel('');
    setCityMatches([]);
  };

  const startEditWarehouse = (sup: SupplierRow, wh: WarehouseItem) => {
    setEditingWarehouseId(wh.id);
    setWhSupplierName(sup.name);
    setWhName(wh.name);
    setWhAddress(wh.address || '');
    setWhCity(wh.city);
    setWhProvince(wh.province || '');
    setWhOriginId(wh.shippingOriginId || '');
    setWhOriginLabel(`${wh.city}${wh.province ? `, ${wh.province}` : ''}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCreateSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/admin/suppliers', {
        method: 'POST',
        body: JSON.stringify({
          name: supName.trim(),
          publicLabel: supPublicLabel.trim() || null,
          integrationMode: supMode,
          contactPhone: supPhone.trim() || null,
          codSupported: supCod,
          active: true,
        }),
      });
      setWhSupplierName(supName.trim());
      setSupName('');
      setSupPublicLabel('');
      setSupPhone('');
      showToast('Pemasok baru berhasil ditambahkan', 'success');
      await loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menambah pemasok', 'danger');
    }
  };

  const handleSaveWarehouse = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanSupName = whSupplierName.trim();
    if (cleanSupName.length < 2) {
      showToast('Mohon isi nama pemasok untuk gudang ini', 'danger');
      return;
    }
    try {
      const matchedSupplier = suppliers.find(
        (s) => s.name.toLowerCase() === cleanSupName.toLowerCase(),
      );
      const payload = {
        supplierId: matchedSupplier?.id ?? null,
        supplierName: cleanSupName,
        name: whName.trim(),
        address: whAddress.trim() || null,
        city: whCity.trim(),
        province: whProvince.trim() || null,
        shippingOriginId: whOriginId.trim() || null,
        active: true,
      };

      if (editingWarehouseId) {
        const updated = await apiFetch<{ shippingOriginId: string | null; city: string }>(
          `/api/admin/warehouses/${editingWarehouseId}`,
          {
            method: 'PATCH',
            body: JSON.stringify(payload),
          },
        );
        showToast(
          `Gudang diperbarui (${updated.city} • ID Origin RajaOngkir: ${updated.shippingOriginId || '-'})`,
          'success',
        );
      } else {
        const created = await apiFetch<{ shippingOriginId: string | null; city: string }>(
          '/api/admin/warehouses',
          {
            method: 'POST',
            body: JSON.stringify(payload),
          },
        );
        showToast(
          `Gudang berhasil ditambahkan (${created.city} • ID Origin RajaOngkir: ${created.shippingOriginId || '-'})`,
          'success',
        );
      }
      resetWarehouseForm();
      await loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menyimpan gudang', 'danger');
    }
  };

  const handleDeleteWarehouse = async (wh: WarehouseItem) => {
    if (!window.confirm(`Hapus/nonaktifkan gudang "${wh.name} (${wh.city})"?`)) return;
    try {
      await apiFetch(`/api/admin/warehouses/${wh.id}`, { method: 'DELETE' });
      showToast(`Gudang ${wh.name} berhasil dihapus/dinonaktifkan`, 'success');
      if (editingWarehouseId === wh.id) resetWarehouseForm();
      await loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menghapus gudang', 'danger');
    }
  };

  const handleCreateOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/admin/supplier-offers', {
        method: 'POST',
        body: JSON.stringify({
          productId: ofProductId,
          supplierId: ofSupplierId,
          warehouseId: ofWarehouseId,
          supplierSku: ofSupplierSku.trim().toUpperCase(),
          costPrice: Number(ofCostPrice),
          stockQty: Number(ofStockQty),
          fulfillmentPriority: Number(ofPriority),
          codEnabled: ofCod,
          active: true,
        }),
      });
      setOfSupplierSku('');
      showToast('Penawaran pemasok (SupplierOffer) berhasil dibuat', 'success');
      await loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal membuat penawaran pemasok', 'danger');
    }
  };

  const handleStockAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustOfferId) return;
    try {
      await apiFetch(`/api/admin/supplier-offers/${adjustOfferId}/adjust-stock`, {
        method: 'POST',
        body: JSON.stringify({
          delta: Number(adjustDelta),
          reason: adjustReason,
        }),
      });
      setAdjustOfferId(null);
      showToast('Stok berhasil disesuaikan dan tercatat di Audit Log', 'success');
      await loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menyesuaikan stok', 'danger');
    }
  };

  const selectedSupplierWarehouses =
    suppliers.find((s) => s.id === ofSupplierId)?.warehouses ?? [];

  return (
    <AdminShell
      title="Pemasok, Gudang Pengiriman & Penawaran Stok"
      subtitle="Isi sendiri nama pemasok dan alamat gudang pengiriman. ID Origin RajaOngkir otomatis menyesuaikan dengan Kota / Kabupaten gudang."
    >
      {/* Top Grid: Add Supplier + Add/Edit Warehouse */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <form
          onSubmit={handleCreateSupplier}
          className="lg:col-span-5 bg-surface rounded-2xl p-6 border border-border/50 space-y-4 text-xs"
        >
          <div>
            <h2 className="font-serif text-lg text-primary">1. Daftarkan Pemasok / Mitra Baru</h2>
            <p className="text-[11px] text-ink-muted mt-0.5">
              Anda dapat membuat pemasok di sini atau langsung mengetik nama pemasok baru pada
              formulir <strong>2. Tambah Gudang Pengiriman</strong> di sebelah kanan.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="font-semibold block mb-1">Nama Pemasok *</label>
              <input
                type="text"
                required
                value={supName}
                onChange={(e) => setSupName(e.target.value)}
                placeholder="Ketik nama pemasok..."
                className="w-full h-9 px-3 rounded-lg bg-surface-low border border-border/60"
              />
            </div>
            <div>
              <label className="font-semibold block mb-1">Label Publik (Tampil ke Pembeli)</label>
              <input
                type="text"
                value={supPublicLabel}
                onChange={(e) => setSupPublicLabel(e.target.value)}
                placeholder="Gudang Mitra Semarang"
                className="w-full h-9 px-3 rounded-lg bg-surface-low border border-border/60"
              />
            </div>
            <div>
              <label className="font-semibold block mb-1">Mode Integrasi</label>
              <select
                value={supMode}
                onChange={(e) => setSupMode(e.target.value as IntegrationMode)}
                className="w-full h-9 px-3 rounded-lg bg-surface-low border border-border/60"
              >
                <option value="MANUAL">MANUAL</option>
                <option value="WHATSAPP_MANUAL">WHATSAPP_MANUAL</option>
                <option value="SUPPLIER_PORTAL">SUPPLIER_PORTAL</option>
                <option value="API">API</option>
              </select>
            </div>
            <div>
              <label className="font-semibold block mb-1">WhatsApp / Telepon Pemasok</label>
              <input
                type="text"
                value={supPhone}
                onChange={(e) => setSupPhone(e.target.value)}
                placeholder="62851..."
                className="w-full h-9 px-3 rounded-lg bg-surface-low border border-border/60"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={supCod}
              onChange={(e) => setSupCod(e.target.checked)}
            />
            <span>Pemasok mendukung pembayaran COD</span>
          </label>
          <button
            type="submit"
            className="px-4 py-2 rounded-lg bg-primary text-white font-semibold hover:bg-primary-container"
          >
            + Simpan Pemasok
          </button>
        </form>

        <form
          onSubmit={handleSaveWarehouse}
          className="lg:col-span-7 bg-surface rounded-2xl p-6 border border-border/50 space-y-4 text-xs"
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="font-serif text-lg text-primary">
                {editingWarehouseId
                  ? '2. Edit Gudang Pengiriman Pemasok'
                  : '2. Tambah Gudang Pengiriman'}
              </h2>
              <p className="text-[11px] text-ink-muted mt-0.5">
                Ketik sendiri nama pemasok (atau pilih yang sudah ada), isi alamat lengkap gudang,
                dan ketik Kota/Kabupaten agar <strong>ID Origin RajaOngkir</strong> otomatis
                menyesuaikan.
              </p>
            </div>
            {editingWarehouseId && (
              <button
                type="button"
                onClick={resetWarehouseForm}
                className="text-xs font-semibold text-ink-muted hover:text-ink underline"
              >
                Batal Edit
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="font-semibold block mb-1">
                Nama Pemasok * <span className="text-ink-muted font-normal">(Bisa ketik sendiri)</span>
              </label>
              <input
                type="text"
                required
                list="supplier-names-list"
                value={whSupplierName}
                onChange={(e) => setWhSupplierName(e.target.value)}
                placeholder="Ketik nama pemasok sendiri atau pilih..."
                className="w-full h-9 px-3 rounded-lg bg-surface-low border border-border/60 font-semibold"
              />
              <datalist id="supplier-names-list">
                {suppliers.map((s) => (
                  <option key={s.id} value={s.name} />
                ))}
              </datalist>
              {suppliers.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {suppliers.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setWhSupplierName(s.name)}
                      className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${
                        whSupplierName.toLowerCase() === s.name.toLowerCase()
                          ? 'bg-primary text-white border-primary'
                          : 'bg-surface-low text-ink-muted border-border/60 hover:text-ink'
                      }`}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="font-semibold block mb-1">Nama Gudang *</label>
              <input
                type="text"
                required
                value={whName}
                onChange={(e) => setWhName(e.target.value)}
                placeholder="Contoh: Gudang Utama Yogyakarta / Gudang Surabaya"
                className="w-full h-9 px-3 rounded-lg bg-surface-low border border-border/60"
              />
            </div>
          </div>

          <div>
            <label className="font-semibold block mb-1">
              Alamat Lengkap Gudang Pemasok *
            </label>
            <input
              type="text"
              required
              value={whAddress}
              onChange={(e) => setWhAddress(e.target.value)}
              placeholder="Jl. Kaliurang Km 7 No. 12, Kec. Depok (Alamat lengkap pengirim untuk label resi)"
              className="w-full h-9 px-3 rounded-lg bg-surface-low border border-border/60"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="font-semibold block mb-1">
                Kota / Kabupaten Gudang *
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  value={whCity}
                  onChange={(e) => setWhCity(e.target.value)}
                  placeholder="Ketik kota/kab (mis. Sleman, Bandung, Surabaya)..."
                  className="w-full h-9 px-3 rounded-lg bg-surface-low border border-border/60 font-semibold"
                />
                {lookingUpOrigin && (
                  <RefreshCw className="w-3.5 h-3.5 text-ink-muted animate-spin absolute right-2.5 top-2.5" />
                )}
              </div>
            </div>

            <div>
              <label className="font-semibold block mb-1">Provinsi</label>
              <input
                type="text"
                value={whProvince}
                onChange={(e) => setWhProvince(e.target.value)}
                placeholder="Terisi otomatis dari kota..."
                className="w-full h-9 px-3 rounded-lg bg-surface-low border border-border/60"
              />
            </div>

            <div>
              <label className="font-semibold block mb-1">
                ID Origin RajaOngkir <span className="text-evergreen">(Otomatis)</span>
              </label>
              <input
                type="text"
                value={whOriginId}
                onChange={(e) => setWhOriginId(e.target.value)}
                placeholder="Otomatis sesuai kota/kab..."
                className="w-full h-9 px-3 rounded-lg bg-surface-low border border-border/60 font-mono font-bold text-primary"
              />
            </div>
          </div>

          {/* Live RajaOngkir City/Regency Auto-Match Indicator & Selector */}
          {(whOriginLabel || cityMatches.length > 0) && (
            <div className="p-3 rounded-xl bg-evergreen-soft/25 border border-evergreen/40 space-y-2">
              {whOriginId && (
                <div className="flex items-center gap-1.5 text-[11px] text-evergreen font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    ID Origin RajaOngkir otomatis disesuaikan: <strong>#{whOriginId}</strong> —{' '}
                    {whOriginLabel || whCity}
                  </span>
                </div>
              )}

              {cityMatches.length > 1 && (
                <div className="space-y-1">
                  <span className="text-[10px] text-ink-muted block">
                    Klik jika ingin memilih titik kecamatan/kota spesifik di {whCity}:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {cityMatches.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => handleSelectCityMatch(m)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] border text-left transition-all ${
                          whOriginId === m.id
                            ? 'bg-evergreen text-white border-evergreen font-semibold'
                            : 'bg-surface text-ink border-border/60 hover:bg-surface-low'
                        }`}
                      >
                        <span className="font-mono font-bold">#{m.id}</span> • {m.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            {editingWarehouseId && (
              <button
                type="button"
                onClick={resetWarehouseForm}
                className="px-4 py-2 rounded-lg bg-surface-low text-ink font-semibold"
              >
                Batal
              </button>
            )}
            <button
              type="submit"
              className="px-5 py-2 rounded-lg bg-primary text-white font-semibold hover:bg-primary-container inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>
                {editingWarehouseId ? 'Simpan Perubahan Gudang' : '+ Simpan Gudang Pengiriman'}
              </span>
            </button>
          </div>
        </form>
      </div>

      {/* Registered Suppliers & Warehouses List (with Address & Auto Origin ID) */}
      <div className="bg-surface rounded-2xl p-6 border border-border/50 space-y-4">
        <div>
          <h2 className="font-serif text-xl text-primary">
            Daftar Pemasok &amp; Lokasi Gudang Pengiriman ({suppliers.length} Pemasok)
          </h2>
          <p className="text-xs text-ink-muted">
            Klik tombol <strong>Edit</strong> pada gudang mana pun untuk mengubah nama pemasok,
            alamat gudang, kota/kabupaten, atau ID Origin RajaOngkir.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
          {suppliers.map((sup) => (
            <div
              key={sup.id}
              className="p-4 rounded-xl bg-surface-low border border-border/60 space-y-3 flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-sm text-primary">{sup.name}</h3>
                    <span className="text-[11px] text-ink-muted">
                      Label Publik: {sup.publicLabel || '-'} •{' '}
                      {sup.codSupported ? 'Mendukung COD' : 'Non-COD'}
                    </span>
                  </div>
                  <StatusBadge
                    label={sup.active ? 'AKTIF' : 'NONAKTIF'}
                    tone={sup.active ? 'success' : 'neutral'}
                  />
                </div>

                {sup.warehouses.length === 0 ? (
                  <p className="text-[11px] text-ink-muted italic">
                    Belum ada gudang pada pemasok ini.
                  </p>
                ) : (
                  <div className="space-y-2 pt-1">
                    {sup.warehouses.map((wh) => (
                      <div
                        key={wh.id}
                        className="p-3 rounded-lg bg-surface border border-border/50 space-y-1"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-ink flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-accent-ink shrink-0" />
                            <span>{wh.name}</span>
                          </span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => startEditWarehouse(sup, wh)}
                              title="Edit Gudang"
                              className="p-1 rounded hover:bg-surface-high text-ink"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteWarehouse(wh)}
                              title="Hapus Gudang"
                              className="p-1 rounded hover:bg-danger-soft text-danger"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        <p className="text-[11px] text-ink-muted">
                          Kota/Kab: <strong className="text-ink">{wh.city}</strong>
                          {wh.province ? `, ${wh.province}` : ''}
                        </p>
                        {wh.address && (
                          <p className="text-[11px] text-ink-muted">Alamat: {wh.address}</p>
                        )}
                        <p className="text-[11px] font-mono text-primary font-semibold">
                          ID Origin RajaOngkir: #{wh.shippingOriginId || '-'}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Add SupplierOffer Form */}
      <form
        onSubmit={handleCreateOffer}
        className="bg-surface rounded-2xl p-6 border border-border/50 space-y-4 text-xs"
      >
        <div>
          <h2 className="font-serif text-lg text-primary">
            3. Hubungkan Produk Toko ke Penawaran Pemasok (SupplierOffer)
          </h2>
          <p className="text-ink-muted">
            Saat checkout, sistem memilih offer aktif dengan stok cukup berdasarkan prioritas
            pemenuhan (angka lebih kecil = lebih diprioritaskan).
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="sm:col-span-2">
            <label className="font-semibold block mb-1">Produk Toko *</label>
            <select
              value={ofProductId}
              onChange={(e) => setOfProductId(e.target.value)}
              className="w-full h-9 px-2.5 rounded-lg bg-surface-low border border-border/60"
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  [{p.sku}] {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="font-semibold block mb-1">Pemasok *</label>
            <select
              value={ofSupplierId}
              onChange={(e) => {
                const nextId = e.target.value;
                setOfSupplierId(nextId);
                const sup = suppliers.find((s) => s.id === nextId);
                setOfWarehouseId(sup?.warehouses[0]?.id ?? '');
              }}
              className="w-full h-9 px-2.5 rounded-lg bg-surface-low border border-border/60"
            >
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="font-semibold block mb-1">Gudang *</label>
            <select
              value={ofWarehouseId}
              onChange={(e) => setOfWarehouseId(e.target.value)}
              className="w-full h-9 px-2.5 rounded-lg bg-surface-low border border-border/60"
            >
              {selectedSupplierWarehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.city})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="font-semibold block mb-1">SKU Sumber *</label>
            <input
              type="text"
              required
              value={ofSupplierSku}
              onChange={(e) => setOfSupplierSku(e.target.value)}
              placeholder="SRC-SKU-01"
              className="w-full h-9 px-2.5 rounded-lg bg-surface-low border border-border/60 font-mono uppercase"
            />
          </div>

          <div>
            <label className="font-semibold block mb-1">Harga Modal (IDR) *</label>
            <input
              type="number"
              required
              min={0}
              value={ofCostPrice}
              onChange={(e) => setOfCostPrice(e.target.value)}
              className="w-full h-9 px-2.5 rounded-lg bg-surface-low border border-border/60"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="font-semibold">Stok Awal:</label>
            <input
              type="number"
              min={0}
              value={ofStockQty}
              onChange={(e) => setOfStockQty(e.target.value)}
              className="w-20 h-9 px-2.5 rounded-lg bg-surface-low border border-border/60"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="font-semibold">Prioritas Routing:</label>
            <input
              type="number"
              min={1}
              value={ofPriority}
              onChange={(e) => setOfPriority(e.target.value)}
              className="w-20 h-9 px-2.5 rounded-lg bg-surface-low border border-border/60"
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={ofCod}
              onChange={(e) => setOfCod(e.target.checked)}
            />
            <span>Offer ini mengizinkan COD</span>
          </label>
          <button
            type="submit"
            className="ml-auto px-5 py-2 rounded-lg bg-primary text-white font-semibold"
          >
            + Buat Penawaran Pemasok
          </button>
        </div>
      </form>

      {/* Adjust Stock Modal */}
      {adjustOfferId && (
        <form
          onSubmit={handleStockAdjust}
          className="bg-accent-soft/40 rounded-2xl p-5 border border-accent space-y-3 text-xs"
        >
          <div className="flex items-center justify-between">
            <span className="font-bold text-primary">
              Penyesuaian Stok Manual Ber-Audit (Offer ID: {adjustOfferId.slice(0, 8)})
            </span>
            <button
              type="button"
              onClick={() => setAdjustOfferId(null)}
              className="underline text-ink-muted"
            >
              Tutup
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label>
              Delta Stok (mis. +10 atau -3):
              <input
                type="number"
                required
                value={adjustDelta}
                onChange={(e) => setAdjustDelta(e.target.value)}
                className="ml-2 w-24 h-9 px-2.5 rounded-lg bg-surface border border-border"
              />
            </label>
            <label className="flex-1 min-w-[220px]">
              Alasan Penyesuaian:
              <input
                type="text"
                required
                minLength={3}
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                className="ml-2 w-64 h-9 px-2.5 rounded-lg bg-surface border border-border"
              />
            </label>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-primary text-white font-semibold"
            >
              Simpan Perubahan Stok
            </button>
          </div>
        </form>
      )}

      {/* Offers Table */}
      <div className="bg-surface rounded-2xl p-6 border border-border/50 space-y-4">
        <h2 className="font-serif text-xl text-primary">
          Daftar Penawaran Pemasok Aktif ({offers.length})
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-low text-ink-muted uppercase text-[10px]">
              <tr>
                <th className="p-3">Produk Toko</th>
                <th className="p-3">Pemasok &amp; Mode</th>
                <th className="p-3">Gudang Asal</th>
                <th className="p-3">SKU Sumber</th>
                <th className="p-3">Harga Modal</th>
                <th className="p-3">Harga Jual</th>
                <th className="p-3">Stok</th>
                <th className="p-3">Prioritas</th>
                <th className="p-3">COD</th>
                <th className="p-3 text-right">Aksi Stok</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {offers.map((o) => (
                <tr key={o.id}>
                  <td className="p-3">
                    <span className="font-semibold text-ink block">{o.product.name}</span>
                    <span className="font-mono text-[11px] text-ink-muted">{o.product.sku}</span>
                  </td>
                  <td className="p-3">
                    <span className="font-semibold block">{o.supplier.name}</span>
                    <span className="text-[11px] text-ink-muted">
                      {integrationModeLabel[o.integrationMode]}
                    </span>
                  </td>
                  <td className="p-3">
                    {o.warehouse.name} ({o.warehouse.city})
                  </td>
                  <td className="p-3 font-mono">{o.supplierSku}</td>
                  <td className="p-3 font-semibold">{formatRupiah(o.costPrice)}</td>
                  <td className="p-3 text-primary font-bold">
                    {formatRupiah(o.product.salePrice)}
                  </td>
                  <td className="p-3">
                    <StatusBadge
                      label={`${o.stockQty} unit`}
                      tone={o.stockQty > 5 ? 'success' : o.stockQty > 0 ? 'accent' : 'danger'}
                    />
                  </td>
                  <td className="p-3 font-mono">{o.fulfillmentPriority}</td>
                  <td className="p-3">{o.codEnabled ? 'Ya' : 'Tidak'}</td>
                  <td className="p-3 text-right">
                    <button
                      type="button"
                      onClick={() => setAdjustOfferId(o.id)}
                      className="px-2.5 py-1 rounded bg-surface-low hover:bg-surface-high border border-border/60 font-semibold"
                    >
                      Sesuaikan Stok
                    </button>
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
