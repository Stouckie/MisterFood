'use client';

import { useEffect, useRef } from 'react';
import { readStoredConsent, useConsentValue } from '@/lib/consent';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: any[]) => void;
  }
}

const GA_ID = process.env.NEXT_PUBLIC_GA4_ID;

export default function AnalyticsProvider() {
  const consent = useConsentValue();
  const initialized = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!GA_ID) return;
    if (initialized.current) return;

    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag(...args: any[]) {
      window.dataLayer?.push(args);
    };

    window.gtag('consent', 'default', {
      ad_storage: 'denied',
      analytics_storage: 'denied',
      wait_for_update: 500,
    });

    const stored = readStoredConsent();
    if (stored !== 'unset') {
      window.gtag('consent', 'update', {
        ad_storage: stored === 'granted' ? 'granted' : 'denied',
        analytics_storage: stored === 'granted' ? 'granted' : 'denied',
      });
    }

    initialized.current = true;
  }, [GA_ID]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!GA_ID) return;
    if (consent !== 'granted') return;

    const existing = document.querySelector(`script[data-ga4="${GA_ID}"]`);
    if (existing) return;

    const script = document.createElement('script');
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
    script.async = true;
    script.dataset.ga4 = GA_ID;
    document.head.appendChild(script);

    window.gtag?.('js', new Date());
    window.gtag?.('config', GA_ID, { send_page_view: true });
  }, [consent, GA_ID]);

  return null;
}
