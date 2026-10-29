'use client';

import React, { useEffect, useState } from 'react';
import { formatRupiah, orderStatusLabel, paymentStatusLabel, type OrderStatus, type PaymentStatus } from '@store/shared';
import { apiFetch } from '@/lib/api';
import { AdminShell } from '@/components/admin-shell';
import { StatusBadge } from '@/components/status-badge';

interface CustomerRow {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  createdAt: string;
  _count: { orders: number };
  orders: Array<{
    id: string;
    orderNumber: string;
    grandTotal: number;
    paymentStatus: PaymentStatus;
    orderStatus: OrderStatus;
    createdAt: string;
  }>;
}

export default function AdminCustomersPage() {
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [q, setQ] = useState('');

  useEffect(() => {
    void apiFetch<CustomerRow[]>(`/api/admin/customers?q=${encodeURIComponent(q)}`)
      .then(setCustomers)
      .catch(() => undefined);
  }, [q]);

  return (
    <AdminShell
      title="Data Pelanggan & Riwayat Pesanan"
      subtitle="Daftar pelanggan yang pernah melakukan pemesanan beserta riwayat transaksinya."
    >
      <div className="bg-surface rounded-2xl p-6 border border-border/50 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari nama, nomor WhatsApp, atau email..."
            className="w-full max-w-sm h-9 px-3 rounded-lg bg-surface-low border border-border/60 text-xs"
          />
          <span className="text-xs text-ink-muted">{customers.length} pelanggan</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-low text-ink-muted uppercase text-[10px]">
              <tr>
                <th className="p-3">Nama Pelanggan</th>
                <th className="p-3">WhatsApp / Telepon</th>
                <th className="p-3">Email</th>
                <th className="p-3">Jumlah Pesanan</th>
                <th className="p-3">Pesanan Terakhir</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {customers.map((c) => {
                const last = c.orders[0];
                return (
                  <tr key={c.id}>
                    <td className="p-3 font-semibold text-ink">{c.name}</td>
                    <td className="p-3 font-mono">{c.phone}</td>
                    <td className="p-3 text-ink-muted">{c.email || '-'}</td>
                    <td className="p-3 font-semibold">{c._count.orders} pesanan</td>
                    <td className="p-3">
                      {last ? (
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-bold text-primary">
                            {last.orderNumber}
                          </span>
                          <span>({formatRupiah(last.grandTotal)})</span>
                          <StatusBadge label={orderStatusLabel[last.orderStatus]} tone="info" />
                          <StatusBadge
                            label={paymentStatusLabel[last.paymentStatus]}
                            tone={last.paymentStatus === 'PAID' ? 'success' : 'accent'}
                          />
                        </div>
                      ) : (
                        '-'
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

