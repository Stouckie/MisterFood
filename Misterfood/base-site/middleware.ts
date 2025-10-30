import { NextRequest, NextResponse } from 'next/server';

const RATE_LIMIT = 20; // req/60s/ip
const WINDOW_MS = 60_000;
const bucket = new Map<string, { count: number; ts: number }>();

function rateLimit(ip: string) {
  const now = Date.now();
  const curr = bucket.get(ip) ?? { count: 0, ts: now };
  if (now - curr.ts > WINDOW_MS) {
    bucket.set(ip, { count: 1, ts: now });
    return true;
  }
  if (curr.count + 1 > RATE_LIMIT) {
    return false;
  }
  curr.count += 1;
  bucket.set(ip, curr);
  return true;
}

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

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isAdminScope = pathname.startsWith('/admin') || pathname.startsWith('/api/admin');
  if (!isAdminScope) {
    return NextResponse.next();
  }

  const ip = req.ip ?? req.headers.get('x-forwarded-for') ?? 'unknown';
  if (!rateLimit(ip)) {
    return new NextResponse('Rate limit', { status: 429 });
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

export const config = { matcher: ['/admin/:path*', '/api/admin/:path*'] };
