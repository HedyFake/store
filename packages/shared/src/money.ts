/** IDR amounts are integer rupiah everywhere. */
export function formatRupiah(amount: number): string {
  if (!Number.isFinite(amount)) return 'Rp -';
  const sign = amount < 0 ? '-' : '';
  const digits = Math.abs(Math.trunc(amount))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sign}Rp ${digits}`;
}

export function assertIntegerRupiah(value: number, field = 'amount'): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${field} harus bilangan bulat rupiah >= 0`);
  }
  return value;
}

/** Sum integers safely; throws if any value is not a safe integer. */
export function sumRupiah(values: number[]): number {
  let total = 0;
  for (const v of values) {
    if (!Number.isSafeInteger(v)) throw new Error('Nilai uang tidak valid');
    total += v;
  }
  if (!Number.isSafeInteger(total)) throw new Error('Total melewati batas aman');
  return total;
}

/** Parse "Rp 1.250.000", "1250000", "1.250.000" into integer rupiah. Rejects decimals like "12,5". */
export function parseRupiahInput(raw: string): number | null {
  const s = raw.trim().replace(/^rp\.?\s*/i, '');
  if (s === '') return null;
  if (/^\d+$/.test(s)) return Number(s);
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) return Number(s.replace(/\./g, ''));
  return null;
}

