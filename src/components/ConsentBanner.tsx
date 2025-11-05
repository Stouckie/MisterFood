'use client';

import { useEffect, useState, useCallback } from 'react';
import type React from 'react';
import Link from 'next/link';
import { getConsent, setConsent, hasMadeChoice } from '@/lib/consent';

type Props = { policyHref?: string };

export default function ConsentBanner({ policyHref = '/politique-cookies' }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Debug + mode "force"
    const force = process.env.NEXT_PUBLIC_FORCE_CONSENT === '1'
      || new URLSearchParams(window.location.search).get('consent') === 'force';
    const choice = getConsent();
    // eslint-disable-next-line no-console
    console.log('[ConsentBanner] mounted', { choice, cookie: document.cookie, force });
    setOpen(force || !hasMadeChoice());

    // utilitaire pour rouvrir via console: openConsent()
    // @ts-expect-error
    window.openConsent = () => setOpen(true);
  }, []);

  const accept = useCallback(() => {
    setConsent('accepted');
    setOpen(false);
  }, []);
  const refuse = useCallback(() => {
    setConsent('refused');
    setOpen(false);
  }, []);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Gestion du consentement"
      style={{
        position: 'fixed',
        bottom: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        maxWidth: 520,
        width: 'calc(100% - 32px)',
        zIndex: 2147483647,       // 🔥 tout en haut
        pointerEvents: 'none',    // le wrapper ne bloque pas les clics
      }}
    >
      <div
        style={{
          pointerEvents: 'auto',  // seuls le panneau et ses boutons captent les clics
          background: 'rgba(20,20,25,.95)',
          color: '#fff',
          padding: 16,
          borderRadius: 12,
          boxShadow: '0 10px 30px rgba(0,0,0,.3)',
        }}
      >
        <p style={{ margin: 0, marginBottom: 12 }}>
          Nous utilisons des cookies strictement nécessaires et, avec votre accord, des cookies analytiques.
          Vous pouvez modifier votre choix à tout moment depuis la page{' '}
          <Link href={policyHref} style={{ textDecoration: 'underline', color: '#fff' }}>
            Politique cookies
          </Link>.
        </p>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={refuse} style={btn('ghost')}>Refuser</button>
          <button type="button" onClick={accept} style={btn('primary')}>Accepter</button>
        </div>
      </div>
    </div>
  );
}

function btn(kind: 'primary' | 'ghost'): React.CSSProperties {
  if (kind === 'primary') {
    return {
      padding: '8px 14px',
      borderRadius: 10,
      border: '1px solid #4b5563',
      background: '#0ea5e9',
      color: '#111827',
      fontWeight: 700,
      cursor: 'pointer',
    };
  }
  return {
    padding: '8px 14px',
    borderRadius: 10,
    border: '1px solid #4b5563',
    background: 'transparent',
    color: '#fff',
    cursor: 'pointer',
  };
}
