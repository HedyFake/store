'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  Lock,
  MapPin,
  Minus,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Truck,
} from 'lucide-react';
import { formatRupiah, paymentMethodLabel, type PaymentMethod } from '@store/shared';
import { apiFetch } from '@/lib/api';
import { useStore } from '@/components/store-provider';
import { StorefrontShell } from '@/components/storefront-shell';

interface DestinationOption {
  id: string;
  label: string;
  province: string;
  city: string;
  district: string;
  subdistrict: string;
  postalCode: string;
}

interface QuoteShippingOption {
  optionId: string;
  courierCode: string;
  courierName: string;
  service: string;
  description: string;
  cost: number;
  etd: string;
  source: 'rajaongkir' | 'flat';
}

interface QuoteGroup {
  groupKey: string;
  sequence: number;
  originLabel: string;
  warehouseCity: string;
  codSupported: boolean;
  itemsSubtotal: number;
  totalWeightGram: number;
  items: Array<{
    productId: string;
    variantId: string | null;
    name: string;
    variantName: string | null;
    sku: string;
    imageUrl: string | null;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
  shippingOptions: QuoteShippingOption[];
}

interface QuoteResponse {
  quoteId: string;
  expiresAt: string;
  subtotal: number;
  minShippingTotal: number;
  freeShippingApplied: boolean;
  cod: {
    allowed: boolean;
    fee: number;
    reasons: string[];
  };
  paymentMethods: Record<PaymentMethod, boolean>;
  groups: QuoteGroup[];
}

export default function CheckoutPage() {
  const router = useRouter();
  const {
    config,
    cart,
    updateCartQty,
    toggleCartSelect,
    toggleSelectAllCart,
    removeFromCart,
    clearSelectedCart,
    saveRecentOrder,
    showToast,
  } = useStore();

  const selectedItems = useMemo(() => cart.filter((i) => i.selected), [cart]);

  // Recipient & Address state
  const [recipientName, setRecipientName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [addressLine, setAddressLine] = useState('');
  const [province, setProvince] = useState('DKI Jakarta');
  const [city, setCity] = useState('Jakarta Selatan');
  const [district, setDistrict] = useState('Kebayoran Baru');
  const [postalCode, setPostalCode] = useState('12190');
  const [destinationId, setDestinationId] = useState<string>('17473');
  const [customerNote, setCustomerNote] = useState('');

  // Destination lookup
  const [destQuery, setDestQuery] = useState('');
  const [destOptions, setDestOptions] = useState<DestinationOption[]>([]);
  const [destLoading, setDestLoading] = useState(false);

  // Server quote & selections
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [selectedShipping, setSelectedShipping] = useState<Record<string, string>>({});
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('BANK_TRANSFER');
  const [acceptTerms, setAcceptTerms] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const searchDestinations = useCallback(async (q: string) => {
    setDestLoading(true);
    try {
      const res = await apiFetch<{ items: DestinationOption[] }>(
        `/api/shipping/destinations?q=${encodeURIComponent(q)}`,
      );
      setDestOptions(res.items);
    } catch {
      /* ignore */
    } finally {
      setDestLoading(false);
    }
  }, []);

  useEffect(() => {
    void searchDestinations('');
  }, [searchDestinations]);

  const fetchQuote = useCallback(async () => {
    if (selectedItems.length === 0) {
      setQuote(null);
      return;
    }
    setQuoteLoading(true);
    setQuoteError(null);
    try {
      const res = await apiFetch<QuoteResponse>('/api/checkout/quote', {
        method: 'POST',
        body: JSON.stringify({
          items: selectedItems.map((i) => ({
            productId: i.productId,
            variantId: i.variantId,
            quantity: i.quantity,
          })),
          destinationId,
          paymentMethod,
        }),
      });
      setQuote(res);
      setSelectedShipping((prev) => {
        const next: Record<string, string> = {};
        for (const g of res.groups) {
          const current = prev[g.groupKey];
          const valid = g.shippingOptions.some((o) => o.optionId === current);
          next[g.groupKey] = valid ? current : (g.shippingOptions[0]?.optionId ?? '');
        }
        return next;
      });
      if (paymentMethod === 'COD' && !res.cod.allowed) {
        setPaymentMethod('BANK_TRANSFER');
      }
    } catch (err) {
      setQuoteError(err instanceof Error ? err.message : 'Gagal memuat kutipan ongkir.');
    } finally {
      setQuoteLoading(false);
    }
  }, [selectedItems, destinationId, paymentMethod]);

  useEffect(() => {
    void fetchQuote();
  }, [fetchQuote]);

  // Calculate server-aligned totals from current quote & selected courier option per group
  const shippingTotal = useMemo(() => {
    if (!quote) return 0;
    if (quote.freeShippingApplied) return 0;
    return quote.groups.reduce((sum, g) => {
      const optId = selectedShipping[g.groupKey];
      const opt = g.shippingOptions.find((o) => o.optionId === optId) ?? g.shippingOptions[0];
      return sum + (opt?.cost ?? 0);
    }, 0);
  }, [quote, selectedShipping]);

  const subtotal = quote?.subtotal ?? selectedItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const codFee = paymentMethod === 'COD' && quote?.cod.allowed ? quote.cod.fee : 0;
  const grandTotal = subtotal + shippingTotal + codFee;

  const handleSelectDestination = (d: DestinationOption) => {
    setDestinationId(d.id);
    if (d.province) setProvince(d.province);
    if (d.city) setCity(d.city);
    if (d.district) setDistrict(d.district);
    if (d.postalCode) setPostalCode(d.postalCode);
    setDestQuery('');
  };

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quote) {
      showToast('Tunggu perhitungan ongkir selesai terlebih dahulu.', 'danger');
      return;
    }
    if (selectedItems.length === 0) {
      showToast('Pilih minimal 1 produk di keranjang.', 'danger');
      return;
    }
    setSubmitting(true);
    try {
      const idempotencyKey = `chk_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
      const res = await apiFetch<{
        orderId: string;
        orderNumber: string;
        accessKey: string;
        grandTotal: number;
        trackingPath: string;
      }>('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          items: selectedItems.map((i) => ({
            productId: i.productId,
            variantId: i.variantId,
            quantity: i.quantity,
          })),
          address: {
            recipientName,
            phone,
            email,
            addressLine,
            province,
            city,
            district,
            postalCode,
            destinationId,
            customerNote,
          },
          paymentMethod,
          quoteId: quote.quoteId,
          shippingSelections: quote.groups.map((g) => ({
            groupKey: g.groupKey,
            optionId: selectedShipping[g.groupKey] || g.shippingOptions[0]?.optionId || 'flat_reg',
          })),
          idempotencyKey,
          acceptTerms,
        }),
      });

      saveRecentOrder({
        orderNumber: res.orderNumber,
        accessKey: res.accessKey,
        createdAt: new Date().toISOString(),
        grandTotal: res.grandTotal,
      });
      clearSelectedCart();
      showToast(`Pesanan ${res.orderNumber} berhasil dibuat`, 'success');
      router.push(res.trackingPath);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal membuat pesanan', 'danger');
    } finally {
      setSubmitting(false);
    }
  };

  const allSelected = cart.length > 0 && cart.every((i) => i.selected);

  return (
    <StorefrontShell>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-12 py-8">
        {/* Stepper Header matching keranjang_checkout_kala_store */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-border/50">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-widest text-accent-ink block mb-1">
              PEMESANAN TRANSPARAN
            </span>
            <h1 className="font-serif text-3xl sm:text-4xl text-primary">
              Keranjang &amp; Pengiriman
            </h1>
          </div>

          <div className="flex items-center gap-3 text-xs font-semibold">
            <div className="flex items-center gap-2 text-primary">
              <span className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-[11px]">
                1
              </span>
              <span>Keranjang Belanja</span>
            </div>
            <div className="w-8 h-[1px] bg-border" />
            <div className="flex items-center gap-2 text-primary">
              <span className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-[11px]">
                2
              </span>
              <span>Alamat &amp; Kurir</span>
            </div>
            <div className="w-8 h-[1px] bg-border" />
            <div className="flex items-center gap-2 text-ink-muted">
              <span className="w-6 h-6 rounded-full bg-surface-high text-ink flex items-center justify-center text-[11px]">
                3
              </span>
              <span>Pembayaran</span>
            </div>
          </div>
        </div>

        {cart.length === 0 ? (
          <div className="my-12 rounded-2xl bg-surface p-12 text-center border border-border/40 space-y-4">
            <h2 className="font-serif text-2xl text-primary">Tas Belanja Anda Kosong</h2>
            <p className="text-xs sm:text-sm text-ink-muted max-w-md mx-auto">
              Jelajahi katalog produk untuk menambahkan barang pilihan. Jika Anda sudah membuat
              pesanan, pantau status dan resinya di halaman Lacak Pesanan.
            </p>
            <div className="flex justify-center gap-3 pt-2">
              <Link
                href="/katalog"
                className="px-6 py-3 rounded-lg bg-primary text-white text-xs font-semibold"
              >
                Mulai Belanja
              </Link>
              <Link
                href="/pesanan"
                className="px-6 py-3 rounded-lg bg-surface-low text-ink text-xs font-semibold border border-border/60"
              >
                Lacak Pesanan Saya
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmitOrder} className="grid grid-cols-1 lg:grid-cols-12 gap-8 mt-8">
            {/* Left Column (~65%): Cart Items, Address, Split Courier Selection */}
            <div className="lg:col-span-8 space-y-6">
              {/* Cart Items Card */}
              <div className="bg-surface rounded-2xl p-5 sm:p-6 border border-border/40 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-border/40">
                  <label className="flex items-center gap-2.5 text-sm font-bold text-ink cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={(e) => toggleSelectAllCart(e.target.checked)}
                      className="rounded border-border text-primary focus:ring-primary w-4 h-4"
                    />
                    <span>Keranjang Belanja ({cart.length} Item)</span>
                  </label>
                  <button
                    type="button"
                    onClick={clearSelectedCart}
                    className="text-xs font-semibold text-ink-muted hover:text-danger inline-flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Hapus yang Dipilih</span>
                  </button>
                </div>

                <div className="divide-y divide-border/40">
                  {cart.map((item) => (
                    <div key={item.key} className="py-4 flex items-start gap-4">
                      <input
                        type="checkbox"
                        checked={item.selected}
                        onChange={() => toggleCartSelect(item.key)}
                        aria-label={`Pilih ${item.name}`}
                        className="mt-8 rounded border-border text-primary focus:ring-primary w-4 h-4"
                      />
                      <img
                        src={item.imageUrl || '/demo/lamp.jpg'}
                        alt={item.name}
                        className="w-20 h-20 rounded-xl object-cover bg-surface-low shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <Link
                              href={`/produk/${item.slug}`}
                              className="text-sm font-semibold text-ink hover:underline line-clamp-1"
                            >
                              {item.name}
                            </Link>
                            <p className="text-xs text-ink-muted mt-0.5">
                              {item.variantName ? `Varian: ${item.variantName} • ` : ''}SKU:{' '}
                              {item.sku}
                            </p>
                          </div>
                          <span className="text-sm font-bold text-primary shrink-0">
                            {formatRupiah(item.unitPrice * item.quantity)}
                          </span>
                        </div>

                        <div className="flex items-center justify-between mt-3">
                          <button
                            type="button"
                            onClick={() => removeFromCart(item.key)}
                            className="text-xs text-ink-muted hover:text-danger inline-flex items-center gap-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Hapus</span>
                          </button>

                          <div className="inline-flex items-center rounded-lg border border-border bg-surface-low">
                            <button
                              type="button"
                              aria-label="Kurangi"
                              onClick={() => updateCartQty(item.key, item.quantity - 1)}
                              className="px-2.5 py-1 text-ink hover:bg-surface-high"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span className="w-8 text-center text-xs font-semibold">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              aria-label="Tambah"
                              onClick={() => updateCartQty(item.key, item.quantity + 1)}
                              className="px-2.5 py-1 text-ink hover:bg-surface-high"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recipient & Shipping Address Form */}
              <div className="bg-surface rounded-2xl p-5 sm:p-6 border border-border/40 space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-border/40">
                  <MapPin className="w-4 h-4 text-accent-ink" />
                  <h2 className="text-sm font-bold text-ink">Alamat Tujuan Pengiriman</h2>
                </div>

                {/* RajaOngkir Domestic Destination Lookup */}
                <div className="p-3.5 rounded-xl bg-surface-low border border-border/50 space-y-2">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-ink-muted block">
                    Cari Kecamatan / Kota Tujuan (Kalkulasi Ongkir RajaOngkir)
                  </label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="w-3.5 h-3.5 text-ink-muted absolute left-3 top-2.5" />
                      <input
                        type="text"
                        value={destQuery}
                        onChange={(e) => setDestQuery(e.target.value)}
                        placeholder="Ketik kecamatan/kota, mis: Kebayoran, Coblong, Gubeng..."
                        className="w-full h-9 pl-8 pr-3 rounded-lg bg-surface border border-border/60 text-xs"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => void searchDestinations(destQuery)}
                      className="px-3.5 h-9 rounded-lg bg-primary text-white text-xs font-semibold"
                    >
                      {destLoading ? 'Mencari...' : 'Cari Lokasi'}
                    </button>
                  </div>

                  {destOptions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {destOptions.slice(0, 6).map((d, dIdx) => (
                        <button
                          key={`${d.id}_${dIdx}`}
                          type="button"
                          onClick={() => handleSelectDestination(d)}
                          className={`px-2.5 py-1 rounded-md text-[11px] border transition-colors ${
                            destinationId === d.id
                              ? 'bg-evergreen text-white border-evergreen font-semibold'
                              : 'bg-surface text-ink border-border/60 hover:bg-surface-high'
                          }`}
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-ink block mb-1">
                      Nama Penerima <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      minLength={3}
                      value={recipientName}
                      onChange={(e) => setRecipientName(e.target.value)}
                      placeholder="Nama lengkap penerima paket"
                      className="w-full h-10 px-3 rounded-lg bg-surface-low border border-border/60 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-ink block mb-1">
                      Nomor WhatsApp / Telepon <span className="text-danger">*</span>
                    </label>
                    <input
                      type="tel"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="0812xxxxxxxx / 62812xxxxxxxx"
                      className="w-full h-10 px-3 rounded-lg bg-surface-low border border-border/60 text-xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-ink block mb-1">
                    Alamat Lengkap (Jalan, Nomor Rumah, RT/RW, Patokan){' '}
                    <span className="text-danger">*</span>
                  </label>
                  <textarea
                    required
                    minLength={10}
                    rows={2}
                    value={addressLine}
                    onChange={(e) => setAddressLine(e.target.value)}
                    placeholder="Contoh: Jl. Senopati No. 42, RT 04 / RW 02, dekat Taman..."
                    className="w-full p-3 rounded-lg bg-surface-low border border-border/60 text-xs"
                  />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-ink block mb-1">
                      Provinsi <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={province}
                      onChange={(e) => setProvince(e.target.value)}
                      className="w-full h-9 px-3 rounded-lg bg-surface-low border border-border/60 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-ink block mb-1">
                      Kota / Kabupaten <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      className="w-full h-9 px-3 rounded-lg bg-surface-low border border-border/60 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-ink block mb-1">
                      Kecamatan <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={district}
                      onChange={(e) => setDistrict(e.target.value)}
                      className="w-full h-9 px-3 rounded-lg bg-surface-low border border-border/60 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-ink block mb-1">Kode Pos</label>
                    <input
                      type="text"
                      pattern="\d{5}"
                      value={postalCode}
                      onChange={(e) => setPostalCode(e.target.value)}
                      placeholder="12190"
                      className="w-full h-9 px-3 rounded-lg bg-surface-low border border-border/60 text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-ink block mb-1">
                      Email (Opsional)
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="nama@email.com"
                      className="w-full h-9 px-3 rounded-lg bg-surface-low border border-border/60 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-ink block mb-1">
                      Catatan Pengiriman (Opsional)
                    </label>
                    <input
                      type="text"
                      maxLength={300}
                      value={customerNote}
                      onChange={(e) => setCustomerNote(e.target.value)}
                      placeholder="Titip di pos sekuriti bila tidak di rumah..."
                      className="w-full h-9 px-3 rounded-lg bg-surface-low border border-border/60 text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Multi-Warehouse Split Shipping Groups & Courier Selection */}
              <div className="bg-surface rounded-2xl p-5 sm:p-6 border border-border/40 space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-border/40">
                  <div className="flex items-center gap-2">
                    <Truck className="w-4 h-4 text-accent-ink" />
                    <h2 className="text-sm font-bold text-ink">
                      Alokasi Gudang &amp; Pilihan Layanan Kurir
                    </h2>
                  </div>
                  {quote && quote.groups.length > 1 && (
                    <span className="px-2.5 py-0.5 rounded-full bg-accent-soft text-accent-ink text-[11px] font-bold">
                      Dipecah Menjadi {quote.groups.length} Pengiriman
                    </span>
                  )}
                </div>

                {quoteError && (
                  <div className="p-3.5 rounded-xl bg-danger-soft text-danger text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{quoteError}</span>
                  </div>
                )}

                {quoteLoading && (
                  <p className="text-xs text-ink-muted py-4">
                    Menghitung stok gudang dan tarif pengiriman dari server...
                  </p>
                )}

                {quote &&
                  quote.groups.map((grp) => (
                    <div
                      key={grp.groupKey}
                      className="p-4 rounded-xl bg-surface-low border border-border/60 space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <span className="text-[11px] font-bold uppercase tracking-wider text-accent-ink">
                            Paket #{grp.sequence} • Dikirim dari {grp.warehouseCity}
                          </span>
                          <p className="text-xs font-semibold text-ink">{grp.originLabel}</p>
                        </div>
                        <span className="text-xs text-ink-muted">
                          Berat total: {(grp.totalWeightGram / 1000).toFixed(2)} kg
                        </span>
                      </div>

                      <div className="text-xs text-ink-muted flex flex-wrap gap-2">
                        {grp.items.map((it) => (
                          <span
                            key={`${it.productId}:${it.variantId ?? ''}`}
                            className="px-2.5 py-1 rounded bg-surface border border-border/50 text-ink"
                          >
                            {it.name} × {it.quantity}
                          </span>
                        ))}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
                        {grp.shippingOptions.map((opt, optIdx) => {
                          const active =
                            (selectedShipping[grp.groupKey] ?? grp.shippingOptions[0]?.optionId) ===
                            opt.optionId;
                          return (
                            <label
                              key={`${opt.optionId}_${optIdx}`}
                              className={`p-3 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                                active
                                  ? 'border-primary bg-surface shadow-sm ring-1 ring-primary'
                                  : 'border-border/60 bg-surface/60 hover:bg-surface'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <span className="text-xs font-bold text-ink block">
                                    {opt.courierCode} {opt.service}
                                  </span>
                                  <span className="text-[11px] text-ink-muted block">
                                    Estimasi {opt.etd}
                                  </span>
                                </div>
                                <input
                                  type="radio"
                                  name={`ship_${grp.groupKey}`}
                                  checked={active}
                                  onChange={() =>
                                    setSelectedShipping((prev) => ({
                                      ...prev,
                                      [grp.groupKey]: opt.optionId,
                                    }))
                                  }
                                  className="text-primary focus:ring-primary mt-0.5"
                                />
                              </div>
                              <div className="pt-2 mt-2 border-t border-border/30 flex items-center justify-between">
                                <span className="text-[10px] uppercase text-ink-muted font-semibold">
                                  {opt.source === 'rajaongkir' ? 'RajaOngkir' : 'Tarif Toko'}
                                </span>
                                <span className="text-xs font-bold text-primary">
                                  {formatRupiah(opt.cost)}
                                </span>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            {/* Right Column (~35%): Order Summary & Payment Method Selection */}
            <div className="lg:col-span-4 space-y-6">
              <div className="bg-surface rounded-2xl p-5 sm:p-6 border border-border/50 shadow-sm space-y-5 sticky top-28">
                <h2 className="font-serif text-xl text-primary pb-3 border-b border-border/40">
                  Ringkasan Pesanan
                </h2>

                {/* Financial breakdown */}
                <div className="space-y-2.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-ink-muted">
                      Total Harga ({selectedItems.reduce((s, i) => s + i.quantity, 0)} Barang)
                    </span>
                    <span className="font-semibold text-ink">{formatRupiah(subtotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-muted">
                      Biaya Pengiriman ({quote?.groups.length ?? 1} Paket)
                    </span>
                    <span className="font-semibold text-ink">{formatRupiah(shippingTotal)}</span>
                  </div>
                  {paymentMethod === 'COD' && codFee > 0 && (
                    <div className="flex justify-between">
                      <span className="text-ink-muted">Biaya Layanan COD</span>
                      <span className="font-semibold text-ink">{formatRupiah(codFee)}</span>
                    </div>
                  )}

                  <div className="pt-3 border-t border-border/50 flex items-baseline justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-ink">
                      Total Pembayaran
                    </span>
                    <span className="font-serif text-2xl font-bold text-primary">
                      {formatRupiah(grandTotal)}
                    </span>
                  </div>
                </div>

                {/* Payment Method Selection */}
                <div className="space-y-2.5 pt-2 border-t border-border/40">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted block">
                    Metode Pembayaran Pilihan
                  </span>

                  {/* Bank Transfer */}
                  <label
                    className={`p-3 rounded-xl border flex items-start gap-3 cursor-pointer ${
                      paymentMethod === 'BANK_TRANSFER'
                        ? 'border-primary bg-surface-low ring-1 ring-primary'
                        : 'border-border/60'
                    }`}
                  >
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="BANK_TRANSFER"
                      checked={paymentMethod === 'BANK_TRANSFER'}
                      onChange={() => setPaymentMethod('BANK_TRANSFER')}
                      className="mt-1"
                    />
                    <div className="text-xs">
                      <span className="font-bold text-ink block">
                        {paymentMethodLabel.BANK_TRANSFER} ({config?.payment.bankName || 'Bank Jago'}
                        )
                      </span>
                      <span className="text-ink-muted text-[11px]">
                        Transfer manual ke rekening toko &amp; unggah bukti bayar untuk diverifikasi
                        admin.
                      </span>
                    </div>
                  </label>

                  {/* Static QRIS */}
                  {config?.payment.qrisStaticEnabled && (
                    <label
                      className={`p-3 rounded-xl border flex items-start gap-3 cursor-pointer ${
                        paymentMethod === 'QRIS_STATIC'
                          ? 'border-primary bg-surface-low ring-1 ring-primary'
                          : 'border-border/60'
                      }`}
                    >
                      <input
                        type="radio"
                        name="paymentMethod"
                        value="QRIS_STATIC"
                        checked={paymentMethod === 'QRIS_STATIC'}
                        onChange={() => setPaymentMethod('QRIS_STATIC')}
                        className="mt-1"
                      />
                      <div className="text-xs">
                        <span className="font-bold text-ink block">
                          {paymentMethodLabel.QRIS_STATIC}
                        </span>
                        <span className="text-ink-muted text-[11px]">
                          Scan kode QRIS resmi toko lalu unggah tangkapan layar bukti bayar.
                        </span>
                      </div>
                    </label>
                  )}

                  {/* COD */}
                  <label
                    className={`p-3 rounded-xl border flex items-start gap-3 ${
                      quote?.cod.allowed ? 'cursor-pointer' : 'opacity-60 cursor-not-allowed'
                    } ${
                      paymentMethod === 'COD'
                        ? 'border-primary bg-surface-low ring-1 ring-primary'
                        : 'border-border/60'
                    }`}
                  >
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="COD"
                      disabled={!quote?.cod.allowed}
                      checked={paymentMethod === 'COD'}
                      onChange={() => setPaymentMethod('COD')}
                      className="mt-1"
                    />
                    <div className="text-xs">
                      <span className="font-bold text-ink block">
                        {paymentMethodLabel.COD}{' '}
                        {quote?.cod.fee ? `(+${formatRupiah(quote.cod.fee)})` : ''}
                      </span>
                      {quote?.cod.allowed ? (
                        <span className="text-ink-muted text-[11px]">
                          Bayar tunai ke kurir saat paket tiba. Status pembayaran menjadi lunas
                          setelah setoran COD dikonfirmasi.
                        </span>
                      ) : (
                        <span className="text-danger text-[11px] block mt-0.5">
                          {quote?.cod.reasons[0] ||
                            'COD tidak tersedia untuk produk/tujuan pada keranjang ini.'}
                        </span>
                      )}
                    </div>
                  </label>

                  {/* Gateway QRIS / VA — only active if credentials are configured */}
                  {quote?.paymentMethods.QRIS_GATEWAY || quote?.paymentMethods.VIRTUAL_ACCOUNT ? (
                    <label
                      className={`p-3 rounded-xl border flex items-start gap-3 cursor-pointer ${
                        paymentMethod === 'QRIS_GATEWAY'
                          ? 'border-primary bg-surface-low ring-1 ring-primary'
                          : 'border-border/60'
                      }`}
                    >
                      <input
                        type="radio"
                        name="paymentMethod"
                        value="QRIS_GATEWAY"
                        checked={paymentMethod === 'QRIS_GATEWAY'}
                        onChange={() => setPaymentMethod('QRIS_GATEWAY')}
                        className="mt-1"
                      />
                      <div className="text-xs">
                        <span className="font-bold text-ink block">
                          QRIS / Virtual Account (Payment Gateway)
                        </span>
                        <span className="text-ink-muted text-[11px]">
                          Verifikasi otomatis melalui webhook bertanda tangan.
                        </span>
                      </div>
                    </label>
                  ) : (
                    <div className="p-2.5 rounded-xl bg-surface-low border border-border/40 text-[11px] text-ink-muted">
                      Payment Gateway otomatis (Midtrans QRIS/VA) belum diaktifkan; gunakan Transfer
                      Bank, QRIS Toko, atau COD.
                    </div>
                  )}
                </div>

                {/* Terms checkbox */}
                <label className="flex items-start gap-2.5 text-xs text-ink-muted cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    required
                    checked={acceptTerms}
                    onChange={(e) => setAcceptTerms(e.target.checked)}
                    className="mt-0.5 rounded border-border text-primary"
                  />
                  <span>
                    Saya menyetujui{' '}
                    <Link href="/kebijakan/syarat-ketentuan" className="underline text-ink">
                      Syarat &amp; Ketentuan
                    </Link>{' '}
                    serta memahami bahwa pesanan multi-gudang dapat memiliki beberapa nomor resi.
                  </span>
                </label>

                <button
                  type="submit"
                  disabled={submitting || quoteLoading || !quote || selectedItems.length === 0}
                  className="w-full py-3.5 px-5 rounded-xl bg-primary text-white text-sm font-semibold flex items-center justify-between hover:bg-primary-container disabled:opacity-50 transition-colors"
                >
                  <span className="inline-flex items-center gap-2">
                    <Lock className="w-4 h-4 text-accent" />
                    <span>{submitting ? 'Memproses Pesanan...' : 'Buat Pesanan Aman'}</span>
                  </span>
                  <span className="font-bold">{formatRupiah(grandTotal)}</span>
                </button>

                <div className="flex items-center gap-2 text-[11px] text-ink-muted justify-center">
                  <ShieldCheck className="w-4 h-4 text-evergreen" />
                  <span>Total harga &amp; stok divalidasi ulang di server</span>
                </div>
              </div>
            </div>
          </form>
        )}
      </div>
    </StorefrontShell>
  );
}

