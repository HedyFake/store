'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { formatRupiah, integrationModeLabel, type IntegrationMode } from '@store/shared';
import { apiFetch } from '@/lib/api';
import { useStore } from '@/components/store-provider';
import { AdminShell } from '@/components/admin-shell';
import { StatusBadge } from '@/components/status-badge';

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
  warehouses: Array<{
    id: string;
    name: string;
    city: string;
    province: string | null;
    shippingOriginId: string | null;
    active: boolean;
  }>;
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

export default function AdminSuppliersPage() {
  const { showToast } = useStore();
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [products, setProducts] = useState<Array<{ id: string; sku: string; name: string }>>([]);

  // New supplier form
  const [supName, setSupName] = useState('');
  const [supPublicLabel, setSupPublicLabel] = useState('');
  const [supMode, setSupMode] = useState<IntegrationMode>('MANUAL');
  const [supPhone, setSupPhone] = useState('');
  const [supCod, setSupCod] = useState(true);

  // New warehouse form
  const [whSupplierId, setWhSupplierId] = useState('');
  const [whName, setWhName] = useState('');
  const [whCity, setWhCity] = useState('');
  const [whOriginId, setWhOriginId] = useState('17473');

  // New offer form
  const [ofProductId, setOfProductId] = useState('');
  const [ofSupplierId, setOfSupplierId] = useState('');
  const [ofWarehouseId, setOfWarehouseId] = useState('');
  const [ofSupplierSku, setOfSupplierSku] = useState('');
  const [ofCostPrice, setOfCostPrice] = useState('150000');
  const [ofStockQty, setOfStockQty] = useState('10');
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
    if (!whSupplierId && supRes[0]) setWhSupplierId(supRes[0].id);
    if (!ofProductId && prodRes.items[0]) setOfProductId(prodRes.items[0].id);
    if (!ofSupplierId && supRes[0]) {
      setOfSupplierId(supRes[0].id);
      if (supRes[0].warehouses[0]) setOfWarehouseId(supRes[0].warehouses[0].id);
    }
  }, [whSupplierId, ofProductId, ofSupplierId]);

  useEffect(() => {
    void loadAll().catch(() => undefined);
  }, [loadAll]);

  const handleCreateSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/admin/suppliers', {
        method: 'POST',
        body: JSON.stringify({
          name: supName,
          publicLabel: supPublicLabel || null,
          integrationMode: supMode,
          contactPhone: supPhone || null,
          codSupported: supCod,
          active: true,
        }),
      });
      setSupName('');
      setSupPublicLabel('');
      showToast('Pemasok ditambahkan', 'success');
      await loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menambah pemasok', 'danger');
    }
  };

  const handleCreateWarehouse = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/admin/warehouses', {
        method: 'POST',
        body: JSON.stringify({
          supplierId: whSupplierId,
          name: whName,
          city: whCity,
          shippingOriginId: whOriginId || null,
          active: true,
        }),
      });
      setWhName('');
      setWhCity('');
      showToast('Gudang ditambahkan', 'success');
      await loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menambah gudang', 'danger');
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
      title="Pemasok, Gudang & Penawaran Stok"
      subtitle="Satu produk toko dapat memiliki beberapa SupplierOffer dari pemasok dan lokasi gudang berbeda."
    >
      {/* Top Grid: Add Supplier + Add Warehouse */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <form
          onSubmit={handleCreateSupplier}
          className="bg-surface rounded-2xl p-6 border border-border/50 space-y-4 text-xs"
        >
          <h2 className="font-serif text-lg text-primary">1. Daftarkan Pemasok / Mitra Baru</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="font-semibold block mb-1">Nama Internal Pemasok *</label>
              <input
                type="text"
                required
                value={supName}
                onChange={(e) => setSupName(e.target.value)}
                placeholder="PT Sumber Kriya Nusantara"
                className="w-full h-9 px-3 rounded-lg bg-surface-low border border-border/60"
              />
            </div>
            <div>
              <label className="font-semibold block mb-1">Label Publik (Aman untuk Pembeli)</label>
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
                placeholder="62812..."
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
            className="px-4 py-2 rounded-lg bg-primary text-white font-semibold"
          >
            + Simpan Pemasok
          </button>
        </form>

        <form
          onSubmit={handleCreateWarehouse}
          className="bg-surface rounded-2xl p-6 border border-border/50 space-y-4 text-xs"
        >
          <h2 className="font-serif text-lg text-primary">2. Tambah Gudang Pengiriman</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="font-semibold block mb-1">Pilih Pemasok *</label>
              <select
                value={whSupplierId}
                onChange={(e) => setWhSupplierId(e.target.value)}
                className="w-full h-9 px-3 rounded-lg bg-surface-low border border-border/60"
              >
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="font-semibold block mb-1">Nama Gudang *</label>
              <input
                type="text"
                required
                value={whName}
                onChange={(e) => setWhName(e.target.value)}
                placeholder="Gudang Yogyakarta"
                className="w-full h-9 px-3 rounded-lg bg-surface-low border border-border/60"
              />
            </div>
            <div>
              <label className="font-semibold block mb-1">Kota / Kabupaten *</label>
              <input
                type="text"
                required
                value={whCity}
                onChange={(e) => setWhCity(e.target.value)}
                placeholder="Sleman"
                className="w-full h-9 px-3 rounded-lg bg-surface-low border border-border/60"
              />
            </div>
            <div>
              <label className="font-semibold block mb-1">ID Origin RajaOngkir</label>
              <input
                type="text"
                value={whOriginId}
                onChange={(e) => setWhOriginId(e.target.value)}
                placeholder="17473 (Jaksel) / 6984 (Bandung)"
                className="w-full h-9 px-3 rounded-lg bg-surface-low border border-border/60 font-mono"
              />
            </div>
          </div>
          <button
            type="submit"
            className="px-4 py-2 rounded-lg bg-primary text-white font-semibold"
          >
            + Simpan Gudang
          </button>
        </form>
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

