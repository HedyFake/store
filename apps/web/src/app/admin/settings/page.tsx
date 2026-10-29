'use client';

import React, { useEffect, useState } from 'react';
import { Send } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useStore } from '@/components/store-provider';
import { AdminShell } from '@/components/admin-shell';
import { StatusBadge } from '@/components/status-badge';

interface AdminSettingsResponse {
  store: {
    storeName: string;
    tagline: string;
    logoUrl: string;
    announcement: string;
    supportEmail: string;
    whatsappNumber: string;
    serviceHours: string;
    address: string;
    instagramUrl: string;
    tiktokUrl: string;
    footerAbout: string;
  };
  payment: {
    bankTransferEnabled: boolean;
    bankName: string;
    bankAccountName: string;
    bankAccountNumber: string;
    transferInstructions: string;
    qrisStaticEnabled: boolean;
    qrisImageUrl: string;
    paymentWindowHours: number;
    proofMaxBytes: number;
  };
  cod: {
    codEnabled: boolean;
    codFeeFlat: number;
    codFeePercentBps: number;
    codMaxOrderTotal: number;
    codBlockedProvinces: string[];
    codNotes: string;
  };
  shipping: {
    provider: 'rajaongkir' | 'flat';
    couriers: string[];
    flatRatePerGroup: number;
    flatRateLabel: string;
    freeShippingMinSubtotal: number;
  };
  integrations: {
    paymentGateway: {
      provider: string;
      configured: boolean;
      qrisEnabled: boolean;
      vaEnabled: boolean;
    };
    shipping: {
      provider: string;
      rajaOngkirConfigured: boolean;
      baseUrl: string;
    };
    telegram: {
      enabled: boolean;
      botTokenConfigured: boolean;
      chatIdMasked: string | null;
    };
    storage: {
      provider: string;
      s3Configured: boolean;
    };
  };
}

export default function AdminSettingsPage() {
  const { refreshConfig, showToast } = useStore();
  const [data, setData] = useState<AdminSettingsResponse | null>(null);
  const [tgResult, setTgResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadSettings = async () => {
    const res = await apiFetch<AdminSettingsResponse>('/api/admin/settings');
    setData(res);
  };

  useEffect(() => {
    void loadSettings().catch(() => undefined);
  }, []);

  if (!data) {
    return (
      <AdminShell title="Pengaturan Toko & Integrasi">
        <div className="p-8 text-xs text-ink-muted">Memuat pengaturan...</div>
      </AdminShell>
    );
  }

  const saveSection = async (endpoint: string, payload: unknown, label: string) => {
    setBusy(true);
    try {
      await apiFetch(endpoint, { method: 'PUT', body: JSON.stringify(payload) });
      await refreshConfig();
      await loadSettings();
      showToast(`Pengaturan ${label} berhasil disimpan`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menyimpan pengaturan', 'danger');
    } finally {
      setBusy(false);
    }
  };

  const handleTelegramTest = async (dryRun: boolean) => {
    setBusy(true);
    setTgResult(null);
    try {
      const res = await apiFetch<{ message: string }>('/api/admin/telegram/test', {
        method: 'POST',
        body: JSON.stringify({ dryRun }),
      });
      setTgResult(res.message);
      showToast(res.message, 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Tes Telegram gagal';
      setTgResult(msg);
      showToast(msg, 'danger');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminShell
      title="Pengaturan Toko, Pembayaran, COD & Integrasi"
      subtitle="Ubah identitas merek, rekening Bank Jago, QRIS, kebijakan COD, tarif ongkir, dan uji koneksi Telegram Bot."
    >
      {/* Integrations Status Card (Secrets stay in .env, never exposed in browser) */}
      <div className="bg-surface rounded-2xl p-6 border border-border/50 space-y-4 text-xs">
        <h2 className="font-serif text-lg text-primary">
          Status Kredensial &amp; Integrasi Server (Rahasia Disimpan di Environment)
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-surface-low space-y-1.5">
            <span className="font-bold block">RajaOngkir Komerce API</span>
            <StatusBadge
              label={
                data.integrations.shipping.rajaOngkirConfigured ? 'TERKONFIGURASI' : 'MODE FLAT'
              }
              tone={data.integrations.shipping.rajaOngkirConfigured ? 'success' : 'accent'}
            />
            <p className="text-[11px] text-ink-muted">
              Provider: {data.integrations.shipping.provider}
            </p>
          </div>

          <div className="p-4 rounded-xl bg-surface-low space-y-1.5">
            <span className="font-bold block">Telegram Bot API</span>
            <StatusBadge
              label={
                data.integrations.telegram.enabled && data.integrations.telegram.botTokenConfigured
                  ? `AKTIF (${data.integrations.telegram.chatIdMasked})`
                  : 'NONAKTIF'
              }
              tone={
                data.integrations.telegram.enabled && data.integrations.telegram.botTokenConfigured
                  ? 'success'
                  : 'accent'
              }
            />
            <div className="flex flex-wrap gap-1.5 pt-1">
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleTelegramTest(true)}
                className="px-2.5 py-1 rounded bg-surface border border-border font-semibold"
              >
                Dry-Run
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleTelegramTest(false)}
                className="px-2.5 py-1 rounded bg-primary text-white font-semibold inline-flex items-center gap-1"
              >
                <Send className="w-3 h-3" />
                <span>Kirim Pesan Uji</span>
              </button>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-surface-low space-y-1.5">
            <span className="font-bold block">Payment Gateway (Midtrans)</span>
            <StatusBadge
              label={
                data.integrations.paymentGateway.configured
                  ? 'AKTIF'
                  : 'TERTUNDA KREDENSIAL (DISABLED)'
              }
              tone={data.integrations.paymentGateway.configured ? 'success' : 'neutral'}
            />
            <p className="text-[11px] text-ink-muted">
              Transfer Bank &amp; QRIS Toko tetap berjalan penuh.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-surface-low space-y-1.5">
            <span className="font-bold block">Penyimpanan Berkas Privat</span>
            <StatusBadge
              label={`PRIVATE (${data.integrations.storage.provider.toUpperCase()})`}
              tone="success"
            />
            <p className="text-[11px] text-ink-muted">
              Bukti bayar &amp; PDF resi tidak dipublikasikan.
            </p>
          </div>
        </div>
        {tgResult && (
          <div className="p-3 rounded-xl bg-evergreen-soft text-evergreen font-medium">
            Hasil Uji Telegram: {tgResult}
          </div>
        )}
      </div>

      {/* Store Identity Form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void saveSection('/api/admin/settings/store', data.store, 'Identitas Toko');
        }}
        className="bg-surface rounded-2xl p-6 border border-border/50 space-y-4 text-xs"
      >
        <h2 className="font-serif text-lg text-primary">
          Identitas Merek &amp; Kontak Toko (Bukan Terpaku pada Nama Template KALA)
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="font-semibold block mb-1">Nama Toko / Brand *</label>
            <input
              type="text"
              required
              value={data.store.storeName}
              onChange={(e) =>
                setData({ ...data, store: { ...data.store, storeName: e.target.value } })
              }
              className="w-full h-9 px-3 rounded-lg bg-surface-low border border-border/60"
            />
          </div>
          <div>
            <label className="font-semibold block mb-1">Slogan Toko (Tagline)</label>
            <input
              type="text"
              value={data.store.tagline ?? ''}
              onChange={(e) =>
                setData({ ...data, store: { ...data.store, tagline: e.target.value } })
              }
              className="w-full h-9 px-3 rounded-lg bg-surface-low border border-border/60"
              placeholder="Pasti Murah, Pasti Puas! • Belanja Hemat, Tanpa Ragu."
            />
          </div>
          <div>
            <label className="font-semibold block mb-1">URL Logo Toko</label>
            <input
              type="text"
              value={data.store.logoUrl ?? ''}
              onChange={(e) =>
                setData({ ...data, store: { ...data.store, logoUrl: e.target.value } })
              }
              className="w-full h-9 px-3 rounded-lg bg-surface-low border border-border/60 font-mono"
              placeholder="/demo/logo-pasti-murahnya.jpg"
            />
          </div>
          <div>
            <label className="font-semibold block mb-1">Nomor WhatsApp Resmi (628...)</label>
            <input
              type="text"
              value={data.store.whatsappNumber}
              onChange={(e) =>
                setData({ ...data, store: { ...data.store, whatsappNumber: e.target.value } })
              }
              className="w-full h-9 px-3 rounded-lg bg-surface-low border border-border/60 font-mono"
            />
          </div>
          <div>
            <label className="font-semibold block mb-1">Email Dukungan</label>
            <input
              type="text"
              value={data.store.supportEmail ?? ''}
              onChange={(e) =>
                setData({ ...data, store: { ...data.store, supportEmail: e.target.value } })
              }
              className="w-full h-9 px-3 rounded-lg bg-surface-low border border-border/60"
              placeholder="halo@pastimurahnya.id"
            />
          </div>
          <div>
            <label className="font-semibold block mb-1">Jam Layanan</label>
            <input
              type="text"
              value={data.store.serviceHours}
              onChange={(e) =>
                setData({ ...data, store: { ...data.store, serviceHours: e.target.value } })
              }
              className="w-full h-9 px-3 rounded-lg bg-surface-low border border-border/60"
            />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="font-semibold block mb-1">Alamat Toko</label>
            <input
              type="text"
              value={data.store.address ?? ''}
              onChange={(e) =>
                setData({ ...data, store: { ...data.store, address: e.target.value } })
              }
              className="w-full h-9 px-3 rounded-lg bg-surface-low border border-border/60"
            />
          </div>
          <div>
            <label className="font-semibold block mb-1">Teks Announcement Bar</label>
            <input
              type="text"
              value={data.store.announcement}
              onChange={(e) =>
                setData({ ...data, store: { ...data.store, announcement: e.target.value } })
              }
              className="w-full h-9 px-3 rounded-lg bg-surface-low border border-border/60"
            />
          </div>
        </div>
        <div>
          <label className="font-semibold block mb-1">Deskripsi Toko (Footer About)</label>
          <textarea
            rows={3}
            value={data.store.footerAbout ?? ''}
            onChange={(e) =>
              setData({ ...data, store: { ...data.store, footerAbout: e.target.value } })
            }
            className="w-full p-3 rounded-lg bg-surface-low border border-border/60"
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="px-5 py-2 rounded-lg bg-primary text-white font-semibold"
        >
          Simpan Identitas Toko
        </button>
      </form>

      {/* Bank Transfer & Static QRIS Settings */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void saveSection('/api/admin/settings/payment', data.payment, 'Pembayaran');
        }}
        className="bg-surface rounded-2xl p-6 border border-border/50 space-y-4 text-xs"
      >
        <h2 className="font-serif text-lg text-primary">
          Rekening Transfer Bank &amp; QRIS Toko
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="font-semibold block mb-1">Nama Bank</label>
            <input
              type="text"
              value={data.payment.bankName}
              onChange={(e) =>
                setData({ ...data, payment: { ...data.payment, bankName: e.target.value } })
              }
              className="w-full h-9 px-3 rounded-lg bg-surface-low border border-border/60"
            />
          </div>
          <div>
            <label className="font-semibold block mb-1">Nomor Rekening</label>
            <input
              type="text"
              value={data.payment.bankAccountNumber}
              onChange={(e) =>
                setData({
                  ...data,
                  payment: { ...data.payment, bankAccountNumber: e.target.value },
                })
              }
              className="w-full h-9 px-3 rounded-lg bg-surface-low border border-border/60 font-mono"
            />
          </div>
          <div>
            <label className="font-semibold block mb-1">Nama Pemilik Rekening</label>
            <input
              type="text"
              value={data.payment.bankAccountName}
              onChange={(e) =>
                setData({ ...data, payment: { ...data.payment, bankAccountName: e.target.value } })
              }
              className="w-full h-9 px-3 rounded-lg bg-surface-low border border-border/60"
            />
          </div>
        </div>
        <div>
          <label className="font-semibold block mb-1">URL Gambar QRIS Toko</label>
          <input
            type="text"
            value={data.payment.qrisImageUrl || ''}
            onChange={(e) =>
              setData({ ...data, payment: { ...data.payment, qrisImageUrl: e.target.value } })
            }
            className="w-full h-9 px-3 rounded-lg bg-surface-low border border-border/60"
          />
        </div>
        <div>
          <label className="font-semibold block mb-1">Instruksi Pembayaran</label>
          <textarea
            rows={2}
            value={data.payment.transferInstructions}
            onChange={(e) =>
              setData({
                ...data,
                payment: { ...data.payment, transferInstructions: e.target.value },
              })
            }
            className="w-full p-3 rounded-lg bg-surface-low border border-border/60"
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="px-5 py-2 rounded-lg bg-primary text-white font-semibold"
        >
          Simpan Pengaturan Pembayaran
        </button>
      </form>

      {/* COD & Shipping Settings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void saveSection('/api/admin/settings/cod', data.cod, 'Kebijakan COD');
          }}
          className="bg-surface rounded-2xl p-6 border border-border/50 space-y-4 text-xs"
        >
          <h2 className="font-serif text-lg text-primary">Kebijakan Bayar di Tempat (COD)</h2>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={data.cod.codEnabled}
              onChange={(e) =>
                setData({ ...data, cod: { ...data.cod, codEnabled: e.target.checked } })
              }
            />
            <span>Aktifkan metode COD secara global</span>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-semibold block mb-1">Biaya Flat COD (IDR)</label>
              <input
                type="number"
                min={0}
                value={data.cod.codFeeFlat}
                onChange={(e) =>
                  setData({ ...data, cod: { ...data.cod, codFeeFlat: Number(e.target.value) } })
                }
                className="w-full h-9 px-3 rounded-lg bg-surface-low border border-border/60"
              />
            </div>
            <div>
              <label className="font-semibold block mb-1">Batas Maksimum Order COD (IDR)</label>
              <input
                type="number"
                min={0}
                value={data.cod.codMaxOrderTotal}
                onChange={(e) =>
                  setData({
                    ...data,
                    cod: { ...data.cod, codMaxOrderTotal: Number(e.target.value) },
                  })
                }
                className="w-full h-9 px-3 rounded-lg bg-surface-low border border-border/60"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={busy}
            className="px-5 py-2 rounded-lg bg-primary text-white font-semibold"
          >
            Simpan Kebijakan COD
          </button>
        </form>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void saveSection('/api/admin/settings/shipping', data.shipping, 'Pengiriman');
          }}
          className="bg-surface rounded-2xl p-6 border border-border/50 space-y-4 text-xs"
        >
          <h2 className="font-serif text-lg text-primary">Kalkulasi Ongkir &amp; Fallback</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-semibold block mb-1">Mode Kalkulasi Ongkir</label>
              <select
                value={data.shipping.provider}
                onChange={(e) =>
                  setData({
                    ...data,
                    shipping: {
                      ...data.shipping,
                      provider: e.target.value as 'rajaongkir' | 'flat',
                    },
                  })
                }
                className="w-full h-9 px-3 rounded-lg bg-surface-low border border-border/60"
              >
                <option value="rajaongkir">RajaOngkir Komerce API</option>
                <option value="flat">Tarif Flat per Gudang</option>
              </select>
            </div>
            <div>
              <label className="font-semibold block mb-1">Tarif Fallback per Kg (IDR)</label>
              <input
                type="number"
                min={0}
                value={data.shipping.flatRatePerGroup}
                onChange={(e) =>
                  setData({
                    ...data,
                    shipping: { ...data.shipping, flatRatePerGroup: Number(e.target.value) },
                  })
                }
                className="w-full h-9 px-3 rounded-lg bg-surface-low border border-border/60"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={busy}
            className="px-5 py-2 rounded-lg bg-primary text-white font-semibold"
          >
            Simpan Pengaturan Ongkir
          </button>
        </form>
      </div>
    </AdminShell>
  );
}

