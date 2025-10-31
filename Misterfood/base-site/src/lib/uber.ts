import { createHmac, timingSafeEqual } from 'node:crypto';

const DEFAULT_TOKEN_MARGIN_MS = 30_000;
const DEFAULT_SCOPE = 'delivery';

const apiBase = process.env.UBER_API_BASE || 'https://api.uber.com';
const authBase = process.env.UBER_AUTH_BASE || 'https://login.uber.com';

const clientId = process.env.UBER_CLIENT_ID;
const clientSecret = process.env.UBER_CLIENT_SECRET;

let cachedToken: { value: string; expiresAt: number } | null = null;

function assertCredentials() {
  if (!clientId || !clientSecret) {
    throw new Error('Clés Uber Direct manquantes. Configurez UBER_CLIENT_ID et UBER_CLIENT_SECRET.');
  }
}

async function fetchToken(): Promise<{ token: string; expiresIn: number }> {
  assertCredentials();

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

export async function uberFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const token = await authToken();
  const url = `${apiBase.replace(/\/$/, '')}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      'Authorization': token,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
    cache: 'no-store',
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Uber API ${res.status}: ${text || 'erreur inconnue'}`);
  }

  if (!text) {
    return undefined as unknown as T;
  }

  return JSON.parse(text) as T;
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
  if (!storeId) {
    throw new Error('UBER_STORE_ID manquant.');
  }
  return storeId;
}
