import React from 'react';
import type { Tone } from '@store/shared';

export function StatusBadge({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  const classes =
    tone === 'success'
      ? 'bg-evergreen-soft text-evergreen border-evergreen/20'
      : tone === 'danger'
        ? 'bg-danger-soft text-danger border-danger/20'
        : tone === 'accent'
          ? 'bg-accent-soft text-accent-ink border-accent/40'
          : tone === 'info'
            ? 'bg-surface-high text-ink border-border'
            : 'bg-surface-low text-ink-muted border-border/60';
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${classes}`}>
      {label}
    </span>
  );
}

