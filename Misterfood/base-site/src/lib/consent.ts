'use client';

import { useEffect, useState } from 'react';

export type ConsentValue = 'granted' | 'denied' | 'unset';

const STORAGE_KEY = 'misterfood_consent_v1';
const EVENT_NAME = 'misterfood:consent';

declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
  }
}

export function readStoredConsent(): ConsentValue {
  if (typeof window === 'undefined') return 'unset';
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === 'granted' || value === 'denied' ? value : 'unset';
  } catch {
    return 'unset';
  }
}

function broadcast(value: ConsentValue) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<ConsentValue>(EVENT_NAME, { detail: value }));
}

function updateGtagConsent(value: ConsentValue) {
  if (typeof window === 'undefined') return;
  const gtag = window.gtag;
  if (typeof gtag !== 'function') return;
  const granted = value === 'granted';
  gtag('consent', 'update', {
    ad_storage: granted ? 'granted' : 'denied',
    analytics_storage: granted ? 'granted' : 'denied',
  });
}

export function storeConsent(value: 'granted' | 'denied') {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // ignore write errors
  }
  broadcast(value);
  updateGtagConsent(value);
}

export function useConsentValue(): ConsentValue {
  const [value, setValue] = useState<ConsentValue>('unset');

  useEffect(() => {
    setValue(readStoredConsent());
  }, []);

  useEffect(() => {
    function handleEvent(event: Event) {
      if (event instanceof CustomEvent<ConsentValue>) {
        setValue(event.detail);
      }
    }

    function handleStorage(event: StorageEvent) {
      if (event.key === STORAGE_KEY) {
        const next = event.newValue === 'granted' || event.newValue === 'denied' ? event.newValue : 'unset';
        setValue(next);
      }
    }

    window.addEventListener(EVENT_NAME, handleEvent as EventListener);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener(EVENT_NAME, handleEvent as EventListener);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  return value;
}
