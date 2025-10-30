type EventLevel = 'fatal' | 'error' | 'warning' | 'info' | 'debug' | 'log';

interface ObservabilityContext {
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
}

interface SentryConfig {
  dsn: string;
  endpoint: string;
  environment: string;
}

let cachedConfig: SentryConfig | null | undefined;
let serverInitialized = false;

const sdkInfo = { name: 'custom-next-observability', version: '0.1.0' };

function resolveDsn(): string | null {
  const clientDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (clientDsn && clientDsn.trim().length > 0) {
    return clientDsn;
  }
  const serverDsn = process.env.SENTRY_DSN;
  if (serverDsn && serverDsn.trim().length > 0) {
    return serverDsn;
  }
  return null;
}

function parseDsn(dsn: string): SentryConfig | null {
  try {
    const url = new URL(dsn);
    const pathname = url.pathname.replace(/\/$/, '');
    if (!pathname) {
      return null;
    }

    const lastSlash = pathname.lastIndexOf('/');
    const projectId = pathname.slice(lastSlash + 1).replace(/^\//, '');
    if (!projectId) {
      return null;
    }

    const basePath = lastSlash >= 0 ? pathname.slice(0, lastSlash + 1) : '/';

    const environment =
      process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV || 'development';

    return {
      dsn,
      endpoint: `${url.protocol}//${url.host}${basePath}api/${projectId}/envelope/`,
      environment,
    };
  } catch {
    return null;
  }
}

function getConfig(): SentryConfig | null {
  if (cachedConfig !== undefined) {
    return cachedConfig;
  }
  const dsn = resolveDsn();
  cachedConfig = dsn ? parseDsn(dsn) : null;
  return cachedConfig;
}

function generateEventId(): string {
  const globalCrypto = typeof crypto !== 'undefined' ? crypto : undefined;
  if (globalCrypto?.randomUUID) {
    return globalCrypto.randomUUID().replace(/-/g, '');
  }
  return `${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
}

function buildEnvelope(
  event: Record<string, unknown>,
  type: 'event' | 'transaction',
  config: SentryConfig,
): { payload: string; id: string } {
  const eventId = (event.event_id as string) ?? generateEventId();
  const baseEvent = {
    timestamp: Date.now() / 1000,
    platform: 'javascript',
    environment: config.environment,
    ...event,
    event_id: eventId,
  };

  const envelopeHeader = {
    event_id: eventId,
    dsn: config.dsn,
    sent_at: new Date().toISOString(),
    sdk: sdkInfo,
  };
  const itemHeader = { type };
  const payload =
    `${JSON.stringify(envelopeHeader)}\n${JSON.stringify(itemHeader)}\n${JSON.stringify(baseEvent)}`;
  return { payload, id: eventId };
}

function sendToSentry(event: Record<string, unknown>, type: 'event' | 'transaction') {
  const config = getConfig();
  if (!config || typeof fetch !== 'function') {
    return;
  }

  const { payload } = buildEnvelope(event, type, config);

  try {
    const promise = fetch(config.endpoint, {
      method: 'POST',
      body: payload,
      headers: { 'content-type': 'application/x-sentry-envelope' },
      keepalive: true,
    });
    promise.catch(() => undefined);
  } catch {
    // ignore network errors
  }
}

function normalizeError(error: unknown): { message: string; name: string; stack?: string } {
  if (error instanceof Error) {
    return { message: error.message, name: error.name, stack: error.stack ?? undefined };
  }
  if (typeof error === 'string') {
    return { message: error, name: 'Error' };
  }
  return { message: 'Unknown error', name: 'Error', stack: JSON.stringify(error) };
}

export function isObservabilityEnabled(): boolean {
  return getConfig() !== null;
}

export function captureMessage(
  message: string,
  context?: ObservabilityContext & { level?: EventLevel },
): void {
  if (!isObservabilityEnabled()) {
    return;
  }

  const payload: Record<string, unknown> = {
    level: context?.level ?? 'info',
    message: { formatted: message },
  };

  if (context?.tags) {
    payload.tags = context.tags;
  }
  if (context?.extra) {
    payload.extra = context.extra;
  }

  sendToSentry(payload, 'event');
}

export function captureException(error: unknown, context?: ObservabilityContext): void {
  if (!isObservabilityEnabled()) {
    return;
  }

  const normalized = normalizeError(error);
  const payload: Record<string, unknown> = {
    level: 'error',
    exception: {
      values: [
        {
          type: normalized.name,
          value: normalized.message,
        },
      ],
    },
  };

  const extra: Record<string, unknown> = {};
  if (normalized.stack) {
    extra.stack = normalized.stack;
  }
  if (context?.extra) {
    Object.assign(extra, context.extra);
  }
  if (Object.keys(extra).length > 0) {
    payload.extra = extra;
  }
  if (context?.tags) {
    payload.tags = context.tags;
  }

  sendToSentry(payload, 'event');
}

export function initServerObservability(): void {
  if (serverInitialized) {
    return;
  }
  const config = getConfig();
  const isNode = typeof process !== 'undefined' && process.release?.name === 'node';
  if (!config || !isNode) {
    return;
  }

  const handleException = (err: unknown) => {
    captureException(err, {
      tags: { origin: 'node_uncaught_exception' },
    });
  };
  const handleRejection = (reason: unknown) => {
    captureException(reason, {
      tags: { origin: 'node_unhandled_rejection' },
    });
  };

  process.on('uncaughtException', handleException);
  process.on('unhandledRejection', handleRejection as (reason: unknown) => void);
  serverInitialized = true;
}
