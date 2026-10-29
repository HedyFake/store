import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export function sha256(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Remove secrets/PII-heavy fields before writing audit logs or webhook payloads. */
export function redact<T>(value: T, depth = 0): T {
  if (depth > 6 || value == null) return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1)) as unknown as T;
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (/password|token|secret|signature|authorization|cookie|server_key|api_?key/i.test(k)) out[k] = '[REDACTED]';
      else out[k] = redact(v, depth + 1);
    }
    return out as T;
  }
  return value;
}

/** Sanitize error messages before storing/displaying: strip bot tokens / urls with credentials. */
export function sanitizeError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg
    .replace(/bot\d+:[A-Za-z0-9_-]+/g, 'bot[REDACTED]')
    .replace(/(key|token|secret)=([^&\s]+)/gi, '$1=[REDACTED]')
    .slice(0, 300);
}

export function maskChatId(chatId: string): string {
  if (chatId.length <= 4) return '****';
  return `${'*'.repeat(Math.max(0, chatId.length - 4))}${chatId.slice(-4)}`;
}

