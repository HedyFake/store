/** Normalize Indonesian phone to 62xxxxxxxxx digits; returns null if invalid. */
export function normalizeIndoPhone(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, '').replace(/^\+/, '');
  let n = digits;
  if (n.startsWith('0')) n = '62' + n.slice(1);
  else if (n.startsWith('8')) n = '62' + n;
  if (!/^628\d{7,12}$/.test(n)) return null;
  return n;
}

export function waLink(number: string | null | undefined, text?: string): string | null {
  if (!number) return null;
  const n = number.replace(/\D/g, '');
  if (!/^\d{8,15}$/.test(n)) return null;
  return `https://wa.me/${n}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

