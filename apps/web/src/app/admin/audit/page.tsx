'use client';

import React, { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { AdminShell } from '@/components/admin-shell';

interface AuditRow {
  id: string;
  actorId: string | null;
  actorLabel: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  createdAt: string;
  actor: { email: string; name: string; role: string } | null;
}

export default function AdminAuditPage() {
  const [logs, setLogs] = useState<AuditRow[]>([]);

  useEffect(() => {
    void apiFetch<AuditRow[]>('/api/admin/audit-logs?limit=120')
      .then(setLogs)
      .catch(() => undefined);
  }, []);

  return (
    <AdminShell
      title="Log Audit Keamanan & Operasional"
      subtitle="Jejak audit perubahan harga, stok, keputusan bukti transfer, rekonsiliasi COD, impor CSV, dan pengiriman Telegram."
    >
      <div className="bg-surface rounded-2xl p-6 border border-border/50 overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-surface-low text-ink-muted uppercase text-[10px]">
            <tr>
              <th className="p-3">Waktu</th>
              <th className="p-3">Aktor</th>
              <th className="p-3">Aksi</th>
              <th className="p-3">Entitas</th>
              <th className="p-3">Ringkasan Perubahan (Redacted)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {logs.map((l) => (
              <tr key={l.id}>
                <td className="p-3 whitespace-nowrap text-ink-muted">
                  {new Date(l.createdAt).toLocaleString('id-ID')}
                </td>
                <td className="p-3">
                  <span className="font-semibold text-ink block">
                    {l.actor?.email || l.actorLabel || 'system'}
                  </span>
                  {l.actor?.role && (
                    <span className="text-[10px] text-ink-muted">{l.actor.role}</span>
                  )}
                </td>
                <td className="p-3 font-mono font-bold text-primary">{l.action}</td>
                <td className="p-3 font-mono text-ink-muted">
                  {l.entityType} {l.entityId ? `#${l.entityId.slice(0, 8)}` : ''}
                </td>
                <td className="p-3 font-mono text-[11px] text-ink-muted max-w-md truncate">
                  {l.after ? JSON.stringify(l.after) : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}

