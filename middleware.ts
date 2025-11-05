import { NextRequest, NextResponse } from 'next/server';

import { consumeRateLimit } from '@/lib/rate-limit';

const ADMIN_RATE_LIMIT = { limit: 40, windowMs: 60_000 } as const;
const PUBLIC_RATE_LIMIT = { limit: 60, windowMs: 60_000 } as const;
const WEBHOOK_PREFIXES = ['/api/webhooks'];

function encodeBasicCredentials(username: string | undefined, password: string | undefined) {
  if (!username || !password) {
    return null;
  }
  const credentials = `${username}:${password}`;
  if (typeof btoa === 'function') {
    return btoa(credentials);
  }
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(credentials).toString('base64');
  }
  return null;
}

function getClientIp(req: NextRequest) {
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const [first] = forwardedFor.split(',');
    if (first) {
      return first.trim();
    }
  }
  return req.ip ?? 'unknown';
}

function shouldBypassWebhook(pathname: string) {
  return WEBHOOK_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isAdminScope = pathname.startsWith('/admin') || pathname.startsWith('/api/admin');
  const isApiRoute = pathname.startsWith('/api/');

  const ip = getClientIp(req);

  if (isApiRoute && !shouldBypassWebhook(pathname)) {
    const limit = isAdminScope ? ADMIN_RATE_LIMIT : PUBLIC_RATE_LIMIT;
    const rateKey = `${isAdminScope ? 'admin' : 'public'}:${ip}`;
    const result = consumeRateLimit(rateKey, limit);

    if (!result.ok) {
      const res = new NextResponse('Too Many Requests', { status: 429 });
      if (result.retryAfterSeconds) {
        res.headers.set('Retry-After', String(result.retryAfterSeconds));
      }
      return res;
    }
  }

  if (!isAdminScope) {
    return NextResponse.next();
  }

  const expectedToken = encodeBasicCredentials(process.env.ADMIN_USERNAME, process.env.ADMIN_PASSWORD);
  if (!expectedToken) {
    return new NextResponse('Admin credentials not configured', { status: 500 });
  }

  const expectedHeader = `Basic ${expectedToken}`;
  const providedHeader = req.headers.get('authorization') ?? '';

  if (providedHeader !== expectedHeader) {
    const res = new NextResponse('Auth required', { status: 401 });
    res.headers.set('WWW-Authenticate', 'Basic realm="Admin"');
    return res;
  }

  return NextResponse.next();
}

export const config = { matcher: ['/admin/:path*', '/api/:path*'] };
