export function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/[.$?*|{}()[\]\\/+^]/g, '\\$&') + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly issues?: Array<{ path: string; message: string }>,
  ) {
    super(message);
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const csrf = readCookie('store_csrf');
  if (csrf && !headers.has('x-csrf-token')) {
    headers.set('x-csrf-token', csrf);
  }

  const res = await fetch(path, {
    ...init,
    headers,
    credentials: 'include',
    cache: 'no-store',
  });

  const isJson = (res.headers.get('content-type') || '').includes('application/json');
  const body = isJson ? await res.json().catch(() => null) : await res.text().catch(() => null);

  if (!res.ok) {
    const msg =
      (body && typeof body === 'object' && ('message' in body || 'error' in body)
        ? String((body as { message?: unknown; error?: unknown }).message || (body as { error?: unknown }).error)
        : null) || `Permintaan gagal (HTTP ${res.status})`;
    const issues =
      body && typeof body === 'object' && Array.isArray((body as { issues?: unknown }).issues)
        ? ((body as { issues: Array<{ path: string; message: string }> }).issues)
        : undefined;
    throw new ApiError(msg, res.status, issues);
  }
  return body as T;
}

export interface PublicProduct {
  id: string;
  sku: string;
  slug: string;
  name: string;
  description: string;
  salePrice: number;
  compareAtPrice: number | null;
  currency: string;
  weightGram: number;
  highlights: string[];
  badges: string[];
  featured: boolean;
  isDemo: boolean;
  category: { id: string; name: string; slug: string } | null;
  images: Array<{ id: string; url: string; alt: string }>;
  variants: Array<{
    id: string;
    sku: string;
    name: string;
    options: Record<string, unknown>;
    priceOverride: number | null;
    effectivePrice: number;
    stockQty: number;
  }>;
  availability: {
    inStock: boolean;
    totalStock: number;
    codSupported: boolean;
    originCities: string[];
    leadTimeDaysMin: number | null;
    leadTimeDaysMax: number | null;
    offerCount: number;
  };
}

export interface StoreConfigResponse {
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
  demoMode: boolean;
  payment: {
    bankTransferEnabled: boolean;
    bankName: string;
    bankAccountName: string;
    bankAccountNumber: string;
    transferInstructions: string;
    qrisStaticEnabled: boolean;
    qrisImageUrl: string;
    qrisGatewayEnabled: boolean;
    virtualAccountEnabled: boolean;
    vaBanks: string[];
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
    freeShippingMinSubtotal: number;
  };
  legal: Array<{
    slug: string;
    title: string;
    body: string;
    ownerReviewed: boolean;
  }>;
  homepage: Array<{
    id: string;
    type: string;
    sortOrder: number;
    content: Record<string, unknown>;
  }>;
}

