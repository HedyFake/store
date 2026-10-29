'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  FileText,
  RefreshCw,
  Send,
  Truck,
  Upload,
  XCircle,
} from 'lucide-react';
import {
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
  type OrderStatus,
  type PaymentMethod,
  type PaymentStatus,
  type ShipmentStatus,
  type SupplierOrderStatus,
} from '@store/shared';
import { apiFetch } from '@/lib/api';
import { useStore } from '@/components/store-provider';
import { AdminShell } from '@/components/admin-shell';
import { StatusBadge } from '@/components/status-badge';

interface AdminOrderRow {
  id: string;
  orderNumber: string;
  recipientName: string;
  phone: string;
  addressLine: string;
  district: string;
  city: string;
  province: string;
  postalCode: string | null;
  subtotal: number;
  shippingTotal: number;
  codFee: number;
  grandTotal: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;
  isDemo: boolean;
  createdAt: string;
  payments: Array<{
    id: string;
    status: PaymentStatus;
    amount: number;
    proofs: Array<{
      id: string;
      originalName: string;
      detectedMime: string;
      sizeBytes: number;
      reviewStatus: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';
      rejectionReason: string | null;
      createdAt: string;
    }>;
  }>;
  supplierOrders: Array<{
    id: string;
    sequence: number;
    status: SupplierOrderStatus;
    integrationMode: string;
    externalOrderRef: string | null;
    purchaseCostTotal: number;
    itemsSubtotal: number;
    shippingCost: number;
    courierCode: string | null;
    courierService: string | null;
    supplier: {
      id: string;
      name: string;
      contactPhone: string | null;
      portalUrl: string | null;
    };
    warehouse: { id: string; name: string; city: string };
    items: Array<{
      id: string;
      productNameSnap: string;
      skuSnap: string;
      supplierSkuSnap: string;
      quantity: number;
      unitPrice: number;
      costPriceSnap: number;
      lineTotal: number;
    }>;
    shipments: Array<{
      id: string;
      carrier: string;
      carrierService: string | null;
      trackingNumber: string | null;
      trackingUrl: string | null;
      status: ShipmentStatus;
      codCollectionStatus: string;
      documents: Array<{
        id: string;
        originalName: string;
        sizeBytes: number;
        telegramDeliveries: Array<{
          id: string;
          status: 'PENDING' | 'SENT' | 'FAILED' | 'DEAD';
          attemptCount: number;
          lastError: string | null;
          sentAt: string | null;
        }>;
      }>;
    }>;
  }>;
}

export default function AdminOrdersPage() {
  const { showToast } = useStore();
  const [orders, setOrders] = useState<AdminOrderRow[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<AdminOrderRow | null>(null);
  const [metrics, setMetrics] = useState({ pendingProofCount: 0, codPendingCount: 0 });
  const [statusFilter, setStatusFilter] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');

  // Action inputs
  const [rejectReason, setRejectReason] = useState('');
  const [codEvidence, setCodEvidence] = useState('');
  const [newCarrier, setNewCarrier] = useState('JNE');
  const [newService, setNewService] = useState('REG');
  const [newTrackingNumber, setNewTrackingNumber] = useState('');
  const [newTrackingUrl, setNewTrackingUrl] = useState('');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const loadOrders = useCallback(
    async (keepSelectedId?: string) => {
      const params = new URLSearchParams();
      if (statusFilter) params.set('orderStatus', statusFilter);
      if (paymentFilter) params.set('paymentStatus', paymentFilter);
      const res = await apiFetch<{
        items: AdminOrderRow[];
        metrics: { pendingProofCount: number; codPendingCount: number };
      }>(`/api/admin/orders?${params.toString()}`);
      setOrders(res.items);
      setMetrics(res.metrics);
      const targetId = keepSelectedId ?? selectedOrder?.id ?? res.items[0]?.id;
      if (targetId) {
        const detail = await apiFetch<AdminOrderRow>(`/api/admin/orders/${targetId}`).catch(
          () => null,
        );
        setSelectedOrder(detail);
      }
    },
    [statusFilter, paymentFilter, selectedOrder?.id],
  );

  useEffect(() => {
    void loadOrders().catch(() => undefined);
  }, [statusFilter, paymentFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleApproveProof = async (proofId: string, amount: number) => {
    setBusy(true);
    try {
      await apiFetch(`/api/admin/payment-proofs/${proofId}/approve`, {
        method: 'POST',
        body: JSON.stringify({
          reviewedAmount: amount,
          note: 'Mutasi rekening cocok dengan total pesanan',
        }),
      });
      showToast('Bukti pembayaran disetujui — Status pesanan kini PAID', 'success');
      await loadOrders(selectedOrder?.id);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menyetujui bukti', 'danger');
    } finally {
      setBusy(false);
    }
  };

  const handleRejectProof = async (proofId: string) => {
    if (rejectReason.trim().length < 5) {
      showToast('Isi alasan penolakan minimal 5 karakter', 'danger');
      return;
    }
    setBusy(true);
    try {
      await apiFetch(`/api/admin/payment-proofs/${proofId}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason: rejectReason }),
      });
      setRejectReason('');
      showToast('Bukti pembayaran ditolak; pelanggan dapat mengunggah ulang', 'neutral');
      await loadOrders(selectedOrder?.id);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menolak bukti', 'danger');
    } finally {
      setBusy(false);
    }
  };

  const handleReconcileCod = async (outcome: 'COLLECTED' | 'FAILED') => {
    if (!selectedOrder) return;
    if (codEvidence.trim().length < 5) {
      showToast('Catat bukti/referensi rekonsiliasi COD terlebih dahulu', 'danger');
      return;
    }
    setBusy(true);
    try {
      await apiFetch(`/api/admin/orders/${selectedOrder.id}/reconcile-cod`, {
        method: 'POST',
        body: JSON.stringify({ outcome, evidence: codEvidence }),
      });
      setCodEvidence('');
      showToast(
        outcome === 'COLLECTED'
          ? 'Dana COD dikonfirmasi diterima — Pesanan selesai'
          : 'COD ditandai gagal dikirim',
        'success',
      );
      await loadOrders(selectedOrder.id);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal merekonsiliasi COD', 'danger');
    } finally {
      setBusy(false);
    }
  };

  const handleSupplierOrderStatus = async (soId: string, status: SupplierOrderStatus) => {
    setBusy(true);
    try {
      await apiFetch(`/api/admin/supplier-orders/${soId}/status`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      });
      showToast(`Status sub-pesanan pemasok diperbarui ke ${status}`, 'success');
      await loadOrders(selectedOrder?.id);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal mengubah status pemasok', 'danger');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateShipment = async (supplierOrderId: string) => {
    setBusy(true);
    try {
      await apiFetch('/api/admin/shipments', {
        method: 'POST',
        body: JSON.stringify({
          supplierOrderId,
          carrier: newCarrier,
          carrierService: newService,
          trackingNumber: newTrackingNumber.trim() || null,
          trackingUrl: newTrackingUrl.trim() || null,
        }),
      });
      setNewTrackingNumber('');
      setNewTrackingUrl('');
      showToast('Pengiriman & resi berhasil disimpan', 'success');
      await loadOrders(selectedOrder?.id);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal membuat pengiriman', 'danger');
    } finally {
      setBusy(false);
    }
  };

  const handleUpdateShipmentStatus = async (shipmentId: string, status: ShipmentStatus) => {
    setBusy(true);
    try {
      await apiFetch(`/api/admin/shipments/${shipmentId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      showToast(`Status pengiriman diperbarui ke ${shipmentStatusLabel[status]}`, 'success');
      await loadOrders(selectedOrder?.id);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal memperbarui pengiriman', 'danger');
    } finally {
      setBusy(false);
    }
  };

  const handleUploadShipmentPdf = async (shipmentId: string) => {
    if (!pdfFile) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', pdfFile);
      const res = await apiFetch<{
        telegramDelivery: { status: string; lastError: string | null } | null;
      }>(`/api/admin/shipments/${shipmentId}/documents`, {
        method: 'POST',
        body: form,
      });
      setPdfFile(null);
      const tgStatus = res.telegramDelivery?.status;
      showToast(
        tgStatus === 'SENT'
          ? 'PDF label disimpan & berhasil dikirim ke Telegram Bot!'
          : `PDF label disimpan (Status Telegram: ${tgStatus || 'PENDING'})`,
        tgStatus === 'SENT' ? 'success' : 'neutral',
      );
      await loadOrders(selectedOrder?.id);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal mengunggah PDF resi', 'danger');
    } finally {
      setBusy(false);
    }
  };

  const handleRetryTelegram = async (shipmentId: string) => {
    setBusy(true);
    try {
      await apiFetch(`/api/admin/shipments/${shipmentId}/retry-telegram`, { method: 'POST' });
      showToast('Pengiriman ulang dokumen PDF ke Telegram dijalankan', 'success');
      await loadOrders(selectedOrder?.id);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal mengirim ulang Telegram', 'danger');
    } finally {
      setBusy(false);
    }
  };

  const handleGenerateAndSendResiPdf = async (supplierOrderId: string) => {
    setBusy(true);
    try {
      const res = await apiFetch<{
        document: { id: string; originalName: string };
        telegramDelivery: { status: string; lastError: string | null } | null;
      }>(`/api/admin/supplier-orders/${supplierOrderId}/generate-resi-pdf`, {
        method: 'POST',
      });
      const tgStatus = res.telegramDelivery?.status;
      showToast(
        tgStatus === 'SENT'
          ? 'Resi PDF dicetak & berhasil dikirim beserta Data Diri Pelanggan ke Telegram!'
          : `Resi PDF dibuat (Status Telegram: ${tgStatus || 'PENDING'})`,
        tgStatus === 'SENT' ? 'success' : 'neutral',
      );
      window.open(`/api/admin/shipment-documents/${res.document.id}/file`, '_blank');
      await loadOrders(selectedOrder?.id);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal mencetak resi PDF', 'danger');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminShell
      title="Pesanan, Verifikasi Pembayaran & Multi-Resi"
      subtitle="Verifikasi bukti transfer manual, rekonsiliasi dana COD, kelola sub-pesanan per gudang, dan kirim PDF label ke Telegram."
    >
      {/* Top Filters & Metrics */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-surface p-4 rounded-2xl border border-border/50 text-xs">
        <div className="flex flex-wrap items-center gap-4">
          <span>
            Menunggu Verifikasi Bukti:{' '}
            <strong className="text-accent-ink">{metrics.pendingProofCount}</strong>
          </span>
          <span>•</span>
          <span>
            COD Belum Diterima: <strong className="text-primary">{metrics.codPendingCount}</strong>
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value)}
            className="h-9 px-3 rounded-lg bg-surface-low border border-border/60"
          >
            <option value="">Semua Status Bayar</option>
            <option value="PENDING_REVIEW">Menunggu Verifikasi Bukti</option>
            <option value="UNPAID">Belum Dibayar</option>
            <option value="PAID">Lunas (PAID)</option>
            <option value="COD_PENDING_COLLECTION">COD Belum Diterima</option>
            <option value="COD_COLLECTED">COD Diterima</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 px-3 rounded-lg bg-surface-low border border-border/60"
          >
            <option value="">Semua Status Pesanan</option>
            <option value="PENDING_PAYMENT">Menunggu Pembayaran</option>
            <option value="AWAITING_FULFILLMENT">Menunggu Diproses</option>
            <option value="PROCESSING">Diproses</option>
            <option value="PARTIALLY_SHIPPED">Sebagian Dikirim</option>
            <option value="SHIPPED">Dikirim</option>
            <option value="DELIVERED">Terkirim</option>
            <option value="COMPLETED">Selesai</option>
          </select>
        </div>
      </div>

      {/* Master-Detail Split View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left List (5 cols) */}
        <div className="lg:col-span-5 bg-surface rounded-2xl border border-border/50 divide-y divide-border/40 max-h-[780px] overflow-y-auto">
          {orders.length === 0 ? (
            <div className="p-8 text-center text-xs text-ink-muted">Belum ada pesanan.</div>
          ) : (
            orders.map((o) => {
              const active = selectedOrder?.id === o.id;
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => void loadOrders(o.id)}
                  className={`w-full p-4 text-left transition-colors space-y-2 ${
                    active ? 'bg-surface-low' : 'hover:bg-surface-low/50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-bold text-primary">
                      {o.orderNumber}
                    </span>
                    <span className="text-xs font-bold text-ink">{formatRupiah(o.grandTotal)}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-ink-muted">
                    <span>
                      {o.recipientName} ({o.city})
                    </span>
                    <span>{o.supplierOrders.length} paket</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <StatusBadge
                      label={orderStatusLabel[o.orderStatus]}
                      tone={toneForOrderStatus(o.orderStatus)}
                    />
                    <StatusBadge
                      label={paymentStatusLabel[o.paymentStatus]}
                      tone={toneForPaymentStatus(o.paymentStatus)}
                    />
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Right Detail Panel (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {!selectedOrder ? (
            <div className="bg-surface rounded-2xl p-12 text-center text-xs text-ink-muted border border-border/50">
              Pilih salah satu pesanan di sebelah kiri untuk memverifikasi pembayaran, mengatur
              pemasok, dan menerbitkan nomor resi.
            </div>
          ) : (
            <>
              {/* Order Summary & Recipient */}
              <div className="bg-surface rounded-2xl p-6 border border-border/50 space-y-4 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-border/40">
                  <div>
                    <span className="font-mono text-base font-bold text-primary">
                      {selectedOrder.orderNumber}
                    </span>
                    <p className="text-ink-muted">
                      {new Date(selectedOrder.createdAt).toLocaleString('id-ID')} •{' '}
                      {paymentMethodLabel[selectedOrder.paymentMethod]}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <StatusBadge
                      label={orderStatusLabel[selectedOrder.orderStatus]}
                      tone={toneForOrderStatus(selectedOrder.orderStatus)}
                    />
                    <StatusBadge
                      label={paymentStatusLabel[selectedOrder.paymentStatus]}
                      tone={toneForPaymentStatus(selectedOrder.paymentStatus)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <p className="font-bold text-ink">Penerima: {selectedOrder.recipientName}</p>
                    <p className="text-ink-muted">Telp/WA: {selectedOrder.phone}</p>
                    <p className="text-ink mt-1">
                      {selectedOrder.addressLine}, Kec. {selectedOrder.district},{' '}
                      {selectedOrder.city}, {selectedOrder.province}{' '}
                      {selectedOrder.postalCode || ''}
                    </p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-surface-low space-y-1">
                    <div className="flex justify-between">
                      <span>Subtotal</span>
                      <span>{formatRupiah(selectedOrder.subtotal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Ongkir</span>
                      <span>{formatRupiah(selectedOrder.shippingTotal)}</span>
                    </div>
                    {selectedOrder.codFee > 0 && (
                      <div className="flex justify-between">
                        <span>Biaya COD</span>
                        <span>{formatRupiah(selectedOrder.codFee)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold text-primary pt-1 border-t border-border/40">
                      <span>Grand Total</span>
                      <span>{formatRupiah(selectedOrder.grandTotal)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Payment Proof Review Panel */}
              {(selectedOrder.paymentMethod === 'BANK_TRANSFER' ||
                selectedOrder.paymentMethod === 'QRIS_STATIC') && (
                <div className="bg-surface rounded-2xl p-6 border border-border/50 space-y-4 text-xs">
                  <h2 className="font-serif text-lg text-primary">
                    Verifikasi Bukti Transfer / QRIS Manual
                  </h2>
                  {selectedOrder.payments[0]?.proofs?.length ? (
                    selectedOrder.payments[0].proofs.map((pr) => (
                      <div
                        key={pr.id}
                        className="p-4 rounded-xl bg-surface-low border border-border/60 space-y-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <span className="font-bold text-ink">{pr.originalName}</span>
                            <span className="text-ink-muted ml-2">
                              ({(pr.sizeBytes / 1024).toFixed(1)} KB • {pr.detectedMime})
                            </span>
                          </div>
                          <a
                            href={`/api/admin/payment-proofs/${pr.id}/file`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1.5 rounded-lg bg-surface border border-border font-semibold inline-flex items-center gap-1"
                          >
                            <span>Buka Berkas Privat</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>

                        {pr.reviewStatus === 'PENDING_REVIEW' && (
                          <div className="pt-2 border-t border-border/40 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() =>
                                  handleApproveProof(pr.id, selectedOrder.grandTotal)
                                }
                                className="px-4 py-2 rounded-lg bg-evergreen text-white font-semibold inline-flex items-center gap-1.5"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>
                                  Setujui &amp; Tandai Lunas (
                                  {formatRupiah(selectedOrder.grandTotal)})
                                </span>
                              </button>
                            </div>
                            <div className="flex gap-2 pt-1">
                              <input
                                type="text"
                                value={rejectReason}
                                onChange={(e) => setRejectReason(e.target.value)}
                                placeholder="Alasan penolakan (mis. nominal kurang / gambar buram)..."
                                className="flex-1 h-9 px-3 rounded-lg bg-surface border border-border/60"
                              />
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => handleRejectProof(pr.id)}
                                className="px-3.5 h-9 rounded-lg bg-danger text-white font-semibold inline-flex items-center gap-1"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                <span>Tolak Bukti</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="text-ink-muted">
                      Pelanggan belum mengunggah bukti pembayaran untuk pesanan ini.
                    </p>
                  )}
                </div>
              )}

              {/* COD Reconciliation Panel */}
              {selectedOrder.paymentMethod === 'COD' && (
                <div className="bg-surface rounded-2xl p-6 border border-border/50 space-y-3 text-xs">
                  <h2 className="font-serif text-lg text-primary">
                    Rekonsiliasi Penerimaan Dana COD ({formatRupiah(selectedOrder.grandTotal)})
                  </h2>
                  <p className="text-ink-muted">
                    Jangan menandai lunas sebelum kurir menyetorkan dana COD atau laporan resmi
                    diterima.
                  </p>
                  {selectedOrder.paymentStatus === 'COD_PENDING_COLLECTION' && (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={codEvidence}
                        onChange={(e) => setCodEvidence(e.target.value)}
                        placeholder="Catat bukti setoran kurir / nomor referensi settlement..."
                        className="w-full h-9 px-3 rounded-lg bg-surface-low border border-border/60"
                      />
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleReconcileCod('COLLECTED')}
                          className="px-4 py-2 rounded-lg bg-evergreen text-white font-semibold"
                        >
                          Konfirmasi Dana COD Diterima (Lunas)
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleReconcileCod('FAILED')}
                          className="px-4 py-2 rounded-lg bg-danger text-white font-semibold"
                        >
                          Tandai COD Gagal / Ditolak Penerima
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Supplier Orders (Split per Supplier + Warehouse) & Shipments */}
              <div className="space-y-4">
                {selectedOrder.supplierOrders.map((so) => {
                  const supplierSummary = [
                    `Purchase Order ${selectedOrder.orderNumber} (Paket #${so.sequence})`,
                    `Gudang: ${so.warehouse.name} (${so.warehouse.city})`,
                    `Penerima: ${selectedOrder.recipientName} (${selectedOrder.phone})`,
                    `Alamat: ${selectedOrder.addressLine}, ${selectedOrder.district}, ${selectedOrder.city}, ${selectedOrder.province}`,
                    `Kurir: ${so.courierCode} ${so.courierService}`,
                    ...so.items.map(
                      (i) => `- ${i.productNameSnap} [SKU Sumber: ${i.supplierSkuSnap}] x${i.quantity}`,
                    ),
                  ].join('\n');

                  const supplierWa = waLink(so.supplier.contactPhone, supplierSummary);

                  return (
                    <div
                      key={so.id}
                      className="bg-surface rounded-2xl p-6 border border-border/50 space-y-4 text-xs"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-border/40">
                        <div>
                          <span className="text-[11px] font-bold uppercase tracking-wider text-accent-ink">
                            Paket #{so.sequence} • {so.supplier.name} — {so.warehouse.name}
                          </span>
                          <p className="text-ink-muted">
                            Mode: {so.integrationMode} • Modal pemasok:{' '}
                            <strong>{formatRupiah(so.purchaseCostTotal)}</strong> • Kurir diminta:{' '}
                            {so.courierCode} {so.courierService}
                          </p>
                        </div>
                        <StatusBadge label={supplierOrderStatusLabel[so.status]} tone="info" />
                      </div>

                      {/* Manual supplier workflow buttons */}
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleGenerateAndSendResiPdf(so.id)}
                          className="px-3.5 py-1.5 rounded-lg bg-accent text-primary hover:bg-accent-soft font-bold inline-flex items-center gap-1.5"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>Cetak Resi PDF &amp; Kirim ke Telegram</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            void navigator.clipboard.writeText(supplierSummary);
                            showToast('Ringkasan PO pemasok disalin');
                          }}
                          className="px-3 py-1.5 rounded-lg bg-surface-low border border-border/60 font-semibold inline-flex items-center gap-1"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          <span>Salin Ringkasan PO</span>
                        </button>
                        {supplierWa && (
                          <a
                            href={supplierWa}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1.5 rounded-lg bg-surface-low border border-border/60 font-semibold inline-flex items-center gap-1"
                          >
                            <span>Kirim WA ke Pemasok ↗</span>
                          </a>
                        )}
                        {so.supplier.portalUrl && (
                          <a
                            href={so.supplier.portalUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1.5 rounded-lg bg-surface-low border border-border/60 font-semibold inline-flex items-center gap-1"
                          >
                            <span>Buka Portal Pemasok ↗</span>
                          </a>
                        )}

                        <select
                          value={so.status}
                          onChange={(e) =>
                            handleSupplierOrderStatus(so.id, e.target.value as SupplierOrderStatus)
                          }
                          className="ml-auto h-8 px-2.5 rounded-lg bg-surface-low border border-border/60 font-semibold"
                        >
                          <option value="PENDING">PENDING</option>
                          <option value="SUBMITTED">SUBMITTED</option>
                          <option value="CONFIRMED">CONFIRMED</option>
                          <option value="PACKED">PACKED</option>
                          <option value="SHIPPED">SHIPPED</option>
                          <option value="DELIVERED">DELIVERED</option>
                          <option value="OUT_OF_STOCK">OUT_OF_STOCK</option>
                        </select>
                      </div>

                      {/* Existing shipments for this SupplierOrder */}
                      {so.shipments.map((sh) => (
                        <div
                          key={sh.id}
                          className="p-4 rounded-xl bg-surface-low border border-border/60 space-y-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <Truck className="w-4 h-4 text-accent-ink" />
                              <span className="font-bold">
                                {sh.carrier} {sh.carrierService || ''}
                              </span>
                              <span className="font-mono bg-surface px-2 py-0.5 rounded border border-border">
                                {sh.trackingNumber || 'Menunggu Resi'}
                              </span>
                            </div>
                            <select
                              value={sh.status}
                              onChange={(e) =>
                                handleUpdateShipmentStatus(sh.id, e.target.value as ShipmentStatus)
                              }
                              className="h-8 px-2.5 rounded-lg bg-surface border border-border/60 font-semibold"
                            >
                              <option value="AWAITING_TRACKING">Menunggu Resi</option>
                              <option value="TRACKING_AVAILABLE">Resi Tersedia</option>
                              <option value="TRACKING_FAILED">Gagal Mengambil Resi</option>
                              <option value="IN_TRANSIT">Dalam Perjalanan</option>
                              <option value="DELIVERED">Terkirim (DELIVERED)</option>
                              <option value="DELIVERY_FAILED">Gagal Dikirim</option>
                              <option value="RETURNED_TO_ORIGIN">Retur ke Pengirim</option>
                            </select>
                          </div>

                          {/* Upload PDF Shipping Label & Telegram Delivery Status */}
                          <div className="pt-2 border-t border-border/40 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <input
                                type="file"
                                accept=".pdf,application/pdf"
                                onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)}
                                className="text-[11px] file:mr-2 file:py-1 file:px-2.5 file:rounded file:border-0 file:bg-primary file:text-white"
                              />
                              <button
                                type="button"
                                disabled={!pdfFile || busy}
                                onClick={() => handleUploadShipmentPdf(sh.id)}
                                className="px-3 py-1.5 rounded-lg bg-primary text-white font-semibold inline-flex items-center gap-1 disabled:opacity-50"
                              >
                                <Upload className="w-3.5 h-3.5" />
                                <span>Unggah PDF Resi &amp; Kirim ke Telegram</span>
                              </button>
                            </div>

                            {sh.documents.map((doc) => {
                              const tg = doc.telegramDeliveries[0];
                              return (
                                <div
                                  key={doc.id}
                                  className="p-2.5 rounded-lg bg-surface border border-border/50 flex flex-wrap items-center justify-between gap-2"
                                >
                                  <div className="flex items-center gap-2">
                                    <FileText className="w-3.5 h-3.5 text-accent-ink" />
                                    <a
                                      href={`/api/admin/shipment-documents/${doc.id}/file`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="font-semibold hover:underline"
                                    >
                                      {doc.originalName}
                                    </a>
                                    <a
                                      href={`/api/admin/shipment-documents/${doc.id}/file`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="px-2 py-0.5 rounded bg-primary text-white text-[11px] font-semibold inline-flex items-center gap-1"
                                    >
                                      <span>Cetak PDF</span>
                                      <ExternalLink className="w-3 h-3" />
                                    </a>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {tg && (
                                      <StatusBadge
                                        label={`Telegram: ${tg.status} (${tg.attemptCount}x)`}
                                        tone={
                                          tg.status === 'SENT'
                                            ? 'success'
                                            : tg.status === 'PENDING'
                                              ? 'accent'
                                              : 'danger'
                                        }
                                      />
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => handleRetryTelegram(sh.id)}
                                      className="px-2 py-1 rounded bg-surface-low hover:bg-surface-high border border-border text-[11px] font-semibold inline-flex items-center gap-1"
                                    >
                                      <RefreshCw className="w-3 h-3" />
                                      <span>Kirim Ulang Telegram</span>
                                    </button>
                                  </div>
                                  {tg?.lastError && (
                                    <p className="w-full text-[11px] text-danger">
                                      Error terakhir: {tg.lastError}
                                    </p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}

                      {/* Create new shipment / input resi for this SupplierOrder */}
                      <div className="p-3.5 rounded-xl border border-dashed border-border space-y-2">
                        <span className="font-bold text-ink block">
                          + Terbitkan Pengiriman / Input Nomor Resi Resmi
                        </span>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <input
                            type="text"
                            value={newCarrier}
                            onChange={(e) => setNewCarrier(e.target.value)}
                            placeholder="Kurir (JNE/SICEPAT)"
                            className="h-8 px-2.5 rounded bg-surface-low border border-border/60"
                          />
                          <input
                            type="text"
                            value={newService}
                            onChange={(e) => setNewService(e.target.value)}
                            placeholder="Layanan (REG/BEST)"
                            className="h-8 px-2.5 rounded bg-surface-low border border-border/60"
                          />
                          <input
                            type="text"
                            value={newTrackingNumber}
                            onChange={(e) => setNewTrackingNumber(e.target.value)}
                            placeholder="No. Resi (opsional)"
                            className="h-8 px-2.5 rounded bg-surface-low border border-border/60 font-mono"
                          />
                          <input
                            type="url"
                            value={newTrackingUrl}
                            onChange={(e) => setNewTrackingUrl(e.target.value)}
                            placeholder="https://cekresi..."
                            className="h-8 px-2.5 rounded bg-surface-low border border-border/60"
                          />
                        </div>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleCreateShipment(so.id)}
                          className="px-4 py-1.5 rounded-lg bg-primary text-white font-semibold inline-flex items-center gap-1.5"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>Simpan Pengiriman Paket #{so.sequence}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </AdminShell>
  );
}

