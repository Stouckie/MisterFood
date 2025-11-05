const DEFAULT_LIMIT = 60;
const DEFAULT_WINDOW_MS = 60_000;

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

interface RateLimitOptions {
  limit?: number;
  windowMs?: number;
}

interface RateLimitResult {
  ok: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds?: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __RATE_LIMIT_STORE: Map<string, RateLimitBucket> | undefined;
}

const store: Map<string, RateLimitBucket> =
  globalThis.__RATE_LIMIT_STORE ?? new Map<string, RateLimitBucket>();

if (!globalThis.__RATE_LIMIT_STORE) {
  globalThis.__RATE_LIMIT_STORE = store;
}

export function consumeRateLimit(
  key: string,
  options: RateLimitOptions = {},
): RateLimitResult {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
  const now = Date.now();

  const bucket = store.get(key);

  if (!bucket || bucket.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, limit, remaining: limit - 1 };
  }

  if (bucket.count >= limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    return { ok: false, limit, remaining: 0, retryAfterSeconds };
  }

  bucket.count += 1;
  store.set(key, bucket);

  return { ok: true, limit, remaining: limit - bucket.count };
}

export function resetRateLimit(key: string) {
  store.delete(key);
}

export function getRateLimitStoreSize() {
  return store.size;
}
