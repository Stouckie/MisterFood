import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';

const DEFAULT_TOKEN_MARGIN_MS = 30_000;
const DEFAULT_SCOPE = 'delivery';

const apiBase = process.env.UBER_API_BASE || 'https://api.uber.com';
const authBase = process.env.UBER_AUTH_BASE || 'https://login.uber.com';

const clientId = process.env.UBER_CLIENT_ID;
const clientSecret = process.env.UBER_CLIENT_SECRET;
const hasRealCredentials = Boolean(clientId && clientSecret);

let cachedToken: { value: string; expiresAt: number } | null = null;

async function fetchToken(): Promise<{ token: string; expiresIn: number }> {
  if (!hasRealCredentials) {
    throw new Error('Clés Uber Direct manquantes. Configurez UBER_CLIENT_ID et UBER_CLIENT_SECRET.');
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    scope: DEFAULT_SCOPE,
    client_id: clientId!,
    client_secret: clientSecret!,
  });

  const res = await fetch(`${authBase.replace(/\/$/, '')}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
    cache: 'no-store',
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Uber OAuth ${res.status}: ${errorText}`);
  }

  const json = (await res.json()) as { access_token: string; expires_in?: number };
  if (!json.access_token) {
    throw new Error('Réponse OAuth Uber invalide (access_token manquant).');
  }

  return { token: json.access_token, expiresIn: json.expires_in ?? 3600 };
}

async function authToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + DEFAULT_TOKEN_MARGIN_MS) {
    return cachedToken.value;
  }

  const { token, expiresIn } = await fetchToken();
  cachedToken = {
    value: `Bearer ${token}`,
    expiresAt: Date.now() + expiresIn * 1000,
  };
  return cachedToken.value;
}

type UberFetchOptions = {
  idempotencyKey?: string;
  retries?: number;
};

type MockDelivery = {
  id: string;
  status: string;
  tracking_url: string;
  tracking?: { url?: string };
  quote_id?: string;
  total?: { amount: number; currency: string };
  currency?: string;
};

const mockDeliveriesByKey = new Map<string, MockDelivery>();
const mockDeliveriesById = new Map<string, MockDelivery>();
const mockQuotesByKey = new Map<string, Record<string, unknown>>();

function readIdempotencyKey(init?: RequestInit, options?: UberFetchOptions): string | undefined {
  if (options?.idempotencyKey) return options.idempotencyKey;
  if (!init?.headers) return undefined;
  const headers = new Headers(init.headers as HeadersInit);
  return headers.get('Idempotency-Key') ?? headers.get('idempotency-key') ?? undefined;
}

function parseBody(body: BodyInit | null | undefined): any {
  if (!body) return {};
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }
  if (body instanceof Uint8Array) {
    try {
      return JSON.parse(Buffer.from(body).toString('utf8'));
    } catch {
      return {};
    }
  }
  return {};
}

function mockUberFetch<T>(path: string, init?: RequestInit, options?: UberFetchOptions): T {
  const method = (init?.method || 'GET').toUpperCase();
  const basePath = path.split('?')[0];
  const idempotencyKey = readIdempotencyKey(init, options);
  const body = parseBody(init?.body);

  if (basePath === '/v2/deliveries/quotes' && method === 'POST') {
    if (idempotencyKey && mockQuotesByKey.has(idempotencyKey)) {
      return mockQuotesByKey.get(idempotencyKey) as T;
    }
    const items = Array.isArray(body?.manifest?.items) ? body.manifest.items : [];
    const baseAmount = 299;
    const perItem = items.reduce((sum: number, item: any) => sum + (Number(item?.price) || 0), 0);
    const amount = Math.max(baseAmount, baseAmount + Math.round(perItem * 0.05));
    const response = {
      quote_id: `mock_quote_${randomUUID().slice(0, 8)}`,
      total: { amount, currency: body?.currency ?? 'EUR' },
    };
    if (idempotencyKey) {
      mockQuotesByKey.set(idempotencyKey, response);
    }
    return response as T;
  }

  if (basePath === '/v2/deliveries' && method === 'POST') {
    if (idempotencyKey && mockDeliveriesByKey.has(idempotencyKey)) {
      return mockDeliveriesByKey.get(idempotencyKey) as T;
    }
    const deliveryId = `mock_delivery_${randomUUID().slice(0, 8)}`;
    const quoteId = body?.quote_id ?? body?.quoteId ?? `mock_quote_${deliveryId.slice(-6)}`;
    const response: MockDelivery = {
      id: deliveryId,
      status: 'created',
      tracking_url: `https://mock.uber.com/track/${deliveryId}`,
      tracking: { url: `https://mock.uber.com/track/${deliveryId}` },
      quote_id: quoteId,
      total: { amount: 599, currency: body?.currency ?? 'EUR' },
      currency: body?.currency ?? 'EUR',
    };
    if (idempotencyKey) {
      mockDeliveriesByKey.set(idempotencyKey, response);
    }
    mockDeliveriesById.set(deliveryId, response);
    return response as T;
  }

  if (basePath.startsWith('/v2/deliveries/') && method === 'GET') {
    const deliveryId = decodeURIComponent(basePath.split('/')[3] || '');
    const existing = mockDeliveriesById.get(deliveryId);
    if (existing) {
      return existing as T;
    }
    const fallback: MockDelivery = {
      id: deliveryId || `mock_delivery_${randomUUID().slice(0, 8)}`,
      status: 'courier_assigned',
      tracking_url: `https://mock.uber.com/track/${deliveryId}`,
    };
    return fallback as T;
  }

  if (basePath.endsWith('/cancel') && method === 'POST') {
    const parts = basePath.split('/');
    const deliveryId = decodeURIComponent(parts[3] || '');
    const existing = mockDeliveriesById.get(deliveryId);
    if (existing) {
      existing.status = 'canceled';
      return existing as T;
    }
    const response: MockDelivery = {
      id: deliveryId || `mock_delivery_${randomUUID().slice(0, 8)}`,
      status: 'canceled',
      tracking_url: `https://mock.uber.com/track/${deliveryId}`,
    };
    mockDeliveriesById.set(response.id, response);
    if (idempotencyKey) {
      mockDeliveriesByKey.set(idempotencyKey, response);
    }
    return response as T;
  }

  // Generic mock fallback
  return {} as T;
}

function shouldRetry(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

function computeRetryDelay(res: Response, attempt: number): number {
  const retryAfter = res.headers.get('retry-after');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) {
      return Math.min(seconds * 1000, 10_000);
    }
    const date = Date.parse(retryAfter);
    if (!Number.isNaN(date)) {
      const diff = date - Date.now();
      if (diff > 0) return Math.min(diff, 10_000);
    }
  }
  const base = 200;
  return Math.min(base * 2 ** attempt, 5_000);
}

function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function uberFetch<T = unknown>(path: string, init?: RequestInit, options?: UberFetchOptions): Promise<T> {
  if (!hasRealCredentials) {
    return mockUberFetch<T>(path, init, options);
  }

  const token = await authToken();
  const url = `${apiBase.replace(/\/$/, '')}${path}`;
  const headers = new Headers(init?.headers as HeadersInit | undefined);
  headers.set('Authorization', token);
  if (options?.idempotencyKey) {
    headers.set('Idempotency-Key', options.idempotencyKey);
  }
  if (!headers.has('content-type') && init?.body) {
    headers.set('Content-Type', 'application/json');
  }

  const requestInit: RequestInit = {
    ...init,
    headers,
    cache: 'no-store',
  };

  const maxAttempts = Math.max(1, (options?.retries ?? 2) + 1);
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await fetch(url, requestInit);
    const text = await res.text();

    if (res.ok) {
      if (!text) {
        return undefined as unknown as T;
      }
      try {
        return JSON.parse(text) as T;
      } catch {
        return text as unknown as T;
      }
    }

    const error = new Error(`Uber API ${res.status}: ${text || 'erreur inconnue'}`);
    if (attempt < maxAttempts - 1 && shouldRetry(res.status)) {
      lastError = error;
      await wait(computeRetryDelay(res, attempt));
      continue;
    }

    throw error;
  }

  throw lastError ?? new Error('Uber API: échec inconnu');
}

export function verifyUberSignature(rawBody: string, signature: string, secret: string) {
  const cleaned = signature.startsWith('sha256=') ? signature.slice(7) : signature;
  const computed = createHmac('sha256', secret).update(rawBody).digest();
  const provided = Buffer.from(cleaned, 'hex');
  if (computed.length !== provided.length) {
    throw new Error('Signature Uber invalide.');
  }
  if (!timingSafeEqual(computed, provided)) {
    throw new Error('Signature Uber invalide.');
  }
}

export function normalizeUberStatus(status?: string) {
  if (!status) return undefined;
  return status.toLowerCase();
}

export function requireUberStoreId() {
  const storeId = process.env.UBER_STORE_ID;
  if (storeId) {
    return storeId;
  }
  if (!hasRealCredentials) {
    return 'mock-store';
  }
  throw new Error('UBER_STORE_ID manquant.');
}
