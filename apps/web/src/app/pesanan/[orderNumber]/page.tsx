'use client';

import React, { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import {
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  FileText,
  MessageCircle,
  Package,
  Truck,
  Upload,
} from 'lucide-react';
import {
  codStatusLabel,
  formatRupiah,
  orderStatusLabel,
  paymentMethodLabel,
  paymentStatusLabel,
  shipmentStatusLabel,
  supplierOrderStatusLabel,
  toneForOrderStatus,
  toneForPaymentStatus,
  toneForShipmentStatus,
  waLink,
  type CodCollectionStatus,
  type OrderStatus,
  type PaymentMethod,
  type PaymentStatus,
  type ShipmentStatus,
  type SupplierOrderStatus,
} from '@store/shared';
import { apiFetch } from '@/lib/api';
import { useStore } from '@/components/store-provider';
import { StorefrontShell } from '@/components/storefront-shell';
import { StatusBadge } from '@/components/status-badge';

interface CustomerOrderDetail {
  id: string;
  orderNumber: string;
  createdAt: string;
  paymentDueAt: string | null;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;
  cancelReason: string | null;
  isDemo: boolean;
  recipient: {
    name: string;
    phone: string;
    addressLine: string;
    district: string;
    city: string;
    province: string;
    postalCode: string | null;
    customerNote: string | null;
  };
  totals: {
    subtotal: number;
    discountTotal: number;
    shippingTotal: number;
    codFee: number;
    grandTotal: number;
  };
  paymentInstructions: {
    bankName?: string;
    bankAccountName?: string;
    bankAccountNumber?: string;
    qrisImageUrl?: string;
    instructions: string;
    maxProofBytes: number;
  } | null;
  payment: {
    id: string;
    status: PaymentStatus;
    amount: number;
    paidAt: string | null;
    proofs: Array<{
      id: string;
      originalName: string;
      detectedMime: string;
      sizeBytes: number;
      reviewStatus: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';
      rejectionReason: string | null;
      reviewedAt: string | null;
      createdAt: string;
    }>;
  } | null;
  packages: Array<{
    id: string;
    sequence: number;
    status: SupplierOrderStatus;
    originLabel: string;
    warehouseCity: string;
    courierCode: string | null;
    courierService: string | null;
    courierEtd: string | null;
    shippingCost: number;
    items: Array<{
      id: string;
      productId: string;
      name: string;
      variantName: string | null;
      sku: string;
      imageUrl: string | null;
      quantity: number;
      unitPrice: number;
      lineTotal: number;
    }>;
    shipments: Array<{
      id: string;
      carrier: string;
      carrierService: string | null;
      trackingNumber: string | null;
      trackingUrl: string | null;
      status: ShipmentStatus;
      codCollectionStatus: CodCollectionStatus;
      shippedAt: string | null;
      deliveredAt: string | null;
      events: Array<{
        id: string;
        status: string;
        message: string;
        eventAt: string;
      }>;
      documents: Array<{
        id: string;
        docType: string;
        originalName: string;
        mime: string;
        sizeBytes: number;
        createdAt: string;
      }>;
    }>;
  }>;
  statusHistory: Array<{
    id: string;
    field: string;
    fromValue: string | null;
    toValue: string;
    note: string | null;
    createdAt: string;
  }>;
  supportWhatsapp: string | null;
}

function OrderDetailContent() {
  const params = useParams<{ orderNumber: string }>();
  const searchParams = useSearchParams();
  const { showToast } = useStore();

  const orderNumber = params?.orderNumber ?? '';
  const key = searchParams.get('key') ?? '';

  const [order, setOrder] = useState<CustomerOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const loadOrder = useCallback(async () => {
    if (!orderNumber || !key) {
      setError('Kode akses pesanan diperlukan untuk membuka halaman ini.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<CustomerOrderDetail>(
        `/api/orders/${encodeURIComponent(orderNumber)}?key=${encodeURIComponent(key)}`,
      );
      setOrder(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat pesanan.');
    } finally {
      setLoading(false);
    }
  }, [orderNumber, key]);

  useEffect(() => {
    void loadOrder();
  }, [loadOrder]);

  const handleUploadProof = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !order) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', selectedFile);
      await apiFetch(
        `/api/orders/${encodeURIComponent(order.orderNumber)}/payment-proofs?key=${encodeURIComponent(key)}`,
        {
          method: 'POST',
          body: form,
        },
      );
      setSelectedFile(null);
      showToast('Bukti pembayaran diunggah dan menunggu verifikasi admin', 'success');
      await loadOrder();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal mengunggah bukti', 'danger');
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return <div className="max-w-5xl mx-auto px-6 py-16 text-center text-sm text-ink-muted">Memuat detail pesanan...</div>;
  }

  if (error || !order) {
    return (
      <div className="max-w-xl mx-auto px-6 py-16 text-center space-y-4">
        <h1 className="font-serif text-2xl text-primary">Akses Pesanan Ditolak</h1>
        <p className="text-xs text-ink-muted">{error}</p>
        <Link
          href="/pesanan"
          className="inline-block px-5 py-2.5 rounded-lg bg-primary text-white text-xs font-semibold"
        >
          Masukkan Kode Akses
        </Link>
      </div>
    );
  }

  const canUploadProof =
    (order.paymentMethod === 'BANK_TRANSFER' || order.paymentMethod === 'QRIS_STATIC') &&
    (order.paymentStatus === 'UNPAID' || order.paymentStatus === 'PENDING_REVIEW');

  const currentUrl =
    typeof window !== 'undefined'
      ? window.location.href
      : `/pesanan/${order.orderNumber}?key=${key}`;

  const whatsappHref = waLink(
    order.supportWhatsapp,
    `Halo Admin, saya ingin menanyakan/konfirmasi pesanan ${order.orderNumber} atas nama ${order.recipient.name} (Total: ${formatRupiah(order.totals.grandTotal)}). Tautan pesanan: ${currentUrl}`,
  );

  const allResiDocs = order.packages.flatMap((pkg) =>
    pkg.shipments.flatMap((sh) =>
      sh.documents.map((doc) => ({
        ...doc,
        packageSequence: pkg.sequence,
      })),
    ),
  );

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header Banner */}
      <div className="bg-surface rounded-2xl p-6 border border-border/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm font-bold text-primary">{order.orderNumber}</span>
            {order.isDemo && (
              <span className="px-2 py-0.5 rounded bg-primary text-white text-[10px] font-bold">
                TRANSAKSI DEMO
              </span>
            )}
            <StatusBadge
              label={orderStatusLabel[order.orderStatus]}
              tone={toneForOrderStatus(order.orderStatus)}
            />
            <StatusBadge
              label={paymentStatusLabel[order.paymentStatus]}
              tone={toneForPaymentStatus(order.paymentStatus)}
            />
          </div>
          <p className="text-xs text-ink-muted">
            Dibuat pada {new Date(order.createdAt).toLocaleString('id-ID')} • Metode:{' '}
            <strong className="text-ink">{paymentMethodLabel[order.paymentMethod]}</strong>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {allResiDocs.map((doc) => (
            <a
              key={doc.id}
              href={`/api/orders/${encodeURIComponent(order.orderNumber)}/documents/${doc.id}/file?key=${encodeURIComponent(key)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-2 rounded-lg bg-accent text-primary hover:bg-accent-soft text-xs font-bold inline-flex items-center gap-1.5"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>
                Cetak Resi PDF{order.packages.length > 1 ? ` (Paket #${doc.packageSequence})` : ''}
              </span>
            </a>
          ))}

          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(currentUrl);
              showToast('Tautan aman pesanan disalin');
            }}
            className="px-3.5 py-2 rounded-lg bg-surface-low hover:bg-surface-high border border-border/60 text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Salin Tautan Pesanan</span>
          </button>

          {whatsappHref && (
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 rounded-lg bg-evergreen text-white text-xs font-semibold inline-flex items-center gap-1.5 hover:opacity-95"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span>Hubungi Admin via WhatsApp</span>
            </a>
          )}
        </div>
      </div>

      {/* Honest Payment & Proof Upload Section */}
      {order.paymentInstructions && (
        <div className="bg-surface rounded-2xl p-6 border border-border/50 grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-6 space-y-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-accent-ink block">
              Instruksi Pembayaran Resmi
            </span>
            <h2 className="font-serif text-xl text-primary">
              Total Tagihan: {formatRupiah(order.totals.grandTotal)}
            </h2>

            {order.paymentMethod === 'BANK_TRANSFER' && (
              <div className="p-4 rounded-xl bg-surface-low border border-border/60 space-y-1 text-xs">
                <p className="text-ink-muted">Bank Tujuan</p>
                <p className="font-bold text-sm text-ink">{order.paymentInstructions.bankName}</p>
                <p className="text-ink-muted pt-1">Nomor Rekening</p>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-base text-primary">
                    {order.paymentInstructions.bankAccountNumber}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(
                        order.paymentInstructions?.bankAccountNumber || '',
                      );
                      showToast('Nomor rekening disalin');
                    }}
                    className="px-2 py-0.5 rounded bg-surface border border-border text-[11px] font-semibold"
                  >
                    Salin
                  </button>
                </div>
                <p className="text-ink-muted pt-1">
                  Atas Nama: <strong>{order.paymentInstructions.bankAccountName}</strong>
                </p>
              </div>
            )}

            {order.paymentMethod === 'QRIS_STATIC' && order.paymentInstructions.qrisImageUrl && (
              <div className="p-4 rounded-xl bg-surface-low border border-border/60 text-center space-y-2">
                <img
                  src={order.paymentInstructions.qrisImageUrl}
                  alt="Kode QRIS Toko"
                  className="w-52 h-52 object-contain mx-auto rounded-lg bg-white p-2 border border-border/40"
                />
                <p className="text-[11px] text-ink-muted">
                  Scan QRIS di atas senilai tepat {formatRupiah(order.totals.grandTotal)}, lalu
                  unggah bukti transaksi di sebelah kanan.
                </p>
              </div>
            )}

            <p className="text-xs text-ink-muted leading-relaxed">
              {order.paymentInstructions.instructions}
            </p>
            <p className="text-[11px] text-ink-muted italic">
              Catatan: Mengunggah bukti atau mengirim pesan WhatsApp tidak otomatis menandai pesanan
              lunas. Status berubah menjadi Lunas setelah admin memverifikasi mutasi.
            </p>
          </div>

          <div className="lg:col-span-6 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-ink">
              Bukti Pembayaran (Penyimpanan Privat)
            </h3>

            {order.payment?.proofs && order.payment.proofs.length > 0 && (
              <div className="space-y-2">
                {order.payment.proofs.map((pr) => (
                  <div
                    key={pr.id}
                    className="p-3.5 rounded-xl bg-surface-low border border-border/60 text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-ink truncate">{pr.originalName}</span>
                      <StatusBadge
                        label={
                          pr.reviewStatus === 'APPROVED'
                            ? 'Disetujui'
                            : pr.reviewStatus === 'REJECTED'
                              ? 'Ditolak'
                              : 'Menunggu Verifikasi'
                        }
                        tone={
                          pr.reviewStatus === 'APPROVED'
                            ? 'success'
                            : pr.reviewStatus === 'REJECTED'
                              ? 'danger'
                              : 'accent'
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-ink-muted">
                      <span>
                        {(pr.sizeBytes / 1024).toFixed(1)} KB •{' '}
                        {new Date(pr.createdAt).toLocaleString('id-ID')}
                      </span>
                      <a
                        href={`/api/orders/${encodeURIComponent(order.orderNumber)}/payment-proofs/${pr.id}/file?key=${encodeURIComponent(key)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary font-semibold hover:underline inline-flex items-center gap-1"
                      >
                        <span>Lihat Berkas</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    {pr.rejectionReason && (
                      <p className="text-danger font-medium pt-1">
                        Alasan penolakan: {pr.rejectionReason} (Silakan unggah bukti pengganti di
                        bawah).
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {canUploadProof ? (
              <form
                onSubmit={handleUploadProof}
                className="p-4 rounded-xl border border-dashed border-border bg-surface-low/60 space-y-3"
              >
                <label className="block text-xs font-semibold text-ink">
                  Unggah / Ganti Bukti Transfer (JPG, PNG, atau PDF maks. 5 MB)
                </label>
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-xs text-ink-muted file:mr-3 file:py-2 file:px-3.5 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-primary file:text-white hover:file:bg-primary-container"
                />
                {selectedFile && (
                  <div className="flex items-center justify-between text-xs bg-surface p-2.5 rounded-lg border border-border/50">
                    <span className="truncate">
                      {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedFile(null)}
                      className="text-danger font-semibold ml-2"
                    >
                      Batal
                    </button>
                  </div>
                )}
                <button
                  type="submit"
                  disabled={!selectedFile || uploading}
                  className="w-full py-2.5 px-4 rounded-lg bg-primary text-white text-xs font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>{uploading ? 'Mengunggah...' : 'Kirim Bukti Pembayaran'}</span>
                </button>
              </form>
            ) : (
              <div className="p-4 rounded-xl bg-evergreen-soft/60 text-evergreen text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Status pembayaran pesanan ini: {paymentStatusLabel[order.paymentStatus]}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* COD Notice */}
      {order.paymentMethod === 'COD' && (
        <div className="bg-surface rounded-2xl p-5 border border-border/50 flex items-start gap-3.5 text-xs">
          <Truck className="w-5 h-5 text-accent-ink shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold text-ink">
              Pesanan Bayar di Tempat (COD) — Total Tunai ke Kurir:{' '}
              {formatRupiah(order.totals.grandTotal)}
            </p>
            <p className="text-ink-muted">
              Status pembayaran saat ini adalah{' '}
              <strong>{paymentStatusLabel[order.paymentStatus]}</strong>. Pesanan COD baru ditandai
              lunas setelah kurir menyerahkan paket dan penerimaan dana COD direkonsiliasi.
            </p>
          </div>
        </div>
      )}

      {/* Split Shipments / Packages per Warehouse */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-2xl text-primary">
            Daftar Paket &amp; Nomor Resi ({order.packages.length} Pengiriman)
          </h2>
        </div>

        {order.packages.map((pkg) => (
          <div
            key={pkg.id}
            className="bg-surface rounded-2xl p-5 sm:p-6 border border-border/50 space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-border/40">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-accent-ink">
                  Paket #{pkg.sequence} • {pkg.originLabel} ({pkg.warehouseCity})
                </span>
                <p className="text-xs text-ink-muted mt-0.5">
                  Layanan dipilih: {pkg.courierCode} {pkg.courierService} ({pkg.courierEtd || '-'})
                </p>
              </div>
              <StatusBadge label={supplierOrderStatusLabel[pkg.status]} tone="info" />
            </div>

            {/* Items in this package */}
            <div className="divide-y divide-border/30">
              {pkg.items.map((it) => (
                <div key={it.id} className="py-2.5 flex items-center justify-between gap-4 text-xs">
                  <div className="flex items-center gap-3">
                    <img
                      src={it.imageUrl || '/demo/lamp.jpg'}
                      alt={it.name}
                      className="w-12 h-12 rounded-lg object-cover bg-surface-low"
                    />
                    <div>
                      <p className="font-semibold text-ink">{it.name}</p>
                      <p className="text-ink-muted">
                        {it.variantName ? `${it.variantName} • ` : ''}SKU: {it.sku} • {it.quantity}{' '}
                        × {formatRupiah(it.unitPrice)}
                      </p>
                    </div>
                  </div>
                  <span className="font-bold text-ink">{formatRupiah(it.lineTotal)}</span>
                </div>
              ))}
            </div>

            {/* Shipments & Resi Cards */}
            {pkg.shipments.length === 0 ? (
              <div className="p-4 rounded-xl bg-surface-low text-xs text-ink-muted flex items-center gap-2">
                <Package className="w-4 h-4 text-accent-ink" />
                <span>
                  Menunggu penerbitan pengiriman &amp; nomor resi resmi dari gudang{' '}
                  {pkg.warehouseCity}.
                </span>
              </div>
            ) : (
              <div className="space-y-3 pt-2">
                {pkg.shipments.map((sh) => (
                  <div
                    key={sh.id}
                    className="p-4 rounded-xl bg-surface-low border border-border/60 space-y-3 text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-ink">
                          Kurir: {sh.carrier} {sh.carrierService || ''}
                        </span>
                        <StatusBadge
                          label={shipmentStatusLabel[sh.status]}
                          tone={toneForShipmentStatus(sh.status)}
                        />
                        {sh.codCollectionStatus !== 'NOT_APPLICABLE' && (
                          <StatusBadge
                            label={codStatusLabel[sh.codCollectionStatus]}
                            tone={sh.codCollectionStatus === 'COLLECTED' ? 'success' : 'accent'}
                          />
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-ink-muted">No. Resi:</span>
                        {sh.trackingNumber ? (
                          <span className="font-mono font-bold text-primary bg-surface px-2.5 py-1 rounded border border-border">
                            {sh.trackingNumber}
                          </span>
                        ) : (
                          <span className="italic text-ink-muted">Menunggu resi</span>
                        )}
                        {sh.trackingUrl && (
                          <a
                            href={sh.trackingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2.5 py-1 rounded bg-primary text-white font-semibold inline-flex items-center gap-1"
                          >
                            <span>Lacak Kurir</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Printable & Downloadable PDF shipping documents */}
                    {sh.documents.length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {sh.documents.map((doc) => (
                          <div key={doc.id} className="flex flex-wrap items-center gap-2">
                            <a
                              href={`/api/orders/${encodeURIComponent(order.orderNumber)}/documents/${doc.id}/file?key=${encodeURIComponent(key)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-3.5 py-1.5 rounded-lg bg-primary text-white hover:bg-primary-container font-semibold inline-flex items-center gap-1.5"
                            >
                              <FileText className="w-3.5 h-3.5 text-accent" />
                              <span>Cetak / Buka Resi PDF ({doc.originalName})</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                            <a
                              href={`/api/orders/${encodeURIComponent(order.orderNumber)}/documents/${doc.id}/file?key=${encodeURIComponent(key)}`}
                              download={doc.originalName}
                              className="px-3 py-1.5 rounded-lg bg-surface border border-border/60 hover:bg-surface-high font-semibold text-ink inline-flex items-center gap-1.5"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>Unduh PDF</span>
                            </a>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Tracking Timeline */}
                    {sh.events.length > 0 && (
                      <div className="pt-2 border-t border-border/40 space-y-1.5">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                          Riwayat Pelacakan
                        </p>
                        {sh.events.map((ev) => (
                          <div key={ev.id} className="flex items-start justify-between gap-4">
                            <span className="text-ink">{ev.message}</span>
                            <span className="text-ink-muted shrink-0">
                              {new Date(ev.eventAt).toLocaleString('id-ID')}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Recipient & Financial Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-surface rounded-2xl p-5 border border-border/50 text-xs space-y-1.5">
          <h3 className="font-bold uppercase tracking-wider text-ink mb-2">Alamat Penerima</h3>
          <p className="font-bold text-sm text-ink">{order.recipient.name}</p>
          <p className="text-ink-muted">{order.recipient.phone}</p>
          <p className="text-ink">{order.recipient.addressLine}</p>
          <p className="text-ink-muted">
            Kec. {order.recipient.district}, {order.recipient.city}, {order.recipient.province}{' '}
            {order.recipient.postalCode || ''}
          </p>
          {order.recipient.customerNote && (
            <p className="text-ink-muted italic pt-1">Catatan: {order.recipient.customerNote}</p>
          )}
        </div>

        <div className="bg-surface rounded-2xl p-5 border border-border/50 text-xs space-y-2">
          <h3 className="font-bold uppercase tracking-wider text-ink mb-2">Rincian Pembayaran</h3>
          <div className="flex justify-between">
            <span className="text-ink-muted">Subtotal Barang</span>
            <span className="font-semibold">{formatRupiah(order.totals.subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-muted">Total Ongkos Kirim</span>
            <span className="font-semibold">{formatRupiah(order.totals.shippingTotal)}</span>
          </div>
          {order.totals.codFee > 0 && (
            <div className="flex justify-between">
              <span className="text-ink-muted">Biaya COD</span>
              <span className="font-semibold">{formatRupiah(order.totals.codFee)}</span>
            </div>
          )}
          <div className="pt-2 border-t border-border/40 flex justify-between text-sm font-bold text-primary">
            <span>Total Pesanan</span>
            <span>{formatRupiah(order.totals.grandTotal)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function OrderDetailPage() {
  return (
    <StorefrontShell>
      <Suspense fallback={<div className="p-12 text-center text-sm text-ink-muted">Memuat pesanan...</div>}>
        <OrderDetailContent />
      </Suspense>
    </StorefrontShell>
  );
}

