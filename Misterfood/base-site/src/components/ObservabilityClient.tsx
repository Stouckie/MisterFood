'use client';

import { useEffect } from 'react';
import { captureException, captureMessage, isObservabilityEnabled } from '@/lib/observability';

function serializeReason(reason: unknown): Record<string, unknown> {
  if (reason instanceof Error) {
    return { message: reason.message, name: reason.name, stack: reason.stack };
  }
  if (typeof reason === 'string') {
    return { message: reason };
  }
  if (typeof reason === 'object' && reason !== null) {
    const shallow: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(reason as Record<string, unknown>)) {
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        shallow[key] = value;
      }
    }
    if (Object.keys(shallow).length > 0) {
      return { message: 'Unhandled rejection', details: shallow };
    }
  }
  return { message: 'Unhandled rejection', value: String(reason) };
}

export default function ObservabilityClient() {
  useEffect(() => {
    if (!isObservabilityEnabled()) {
      return undefined;
    }

    const handleError = (event: ErrorEvent) => {
      const error = event.error ?? new Error(event.message ?? 'Client error');
      captureException(error, {
        tags: { origin: 'window_error' },
        extra: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        },
      });
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      captureException(event.reason, {
        tags: { origin: 'unhandled_promise_rejection' },
        extra: serializeReason(event.reason),
      });
    };

    const logHydrationError = () => {
      captureMessage('React hydration mismatch detected', {
        level: 'warning',
        tags: { origin: 'hydration' },
      });
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);
    window.addEventListener('hydrationerror', logHydrationError as EventListener);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
      window.removeEventListener('hydrationerror', logHydrationError as EventListener);
    };
  }, []);

  return null;
}
