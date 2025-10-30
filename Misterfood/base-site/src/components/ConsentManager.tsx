'use client';

import Link from 'next/link';
import { storeConsent, useConsentValue } from '@/lib/consent';

export default function ConsentManager() {
  const consent = useConsentValue();

  if (consent !== 'unset') {
    return null;
  }

  const handleAccept = () => storeConsent('granted');
  const handleDecline = () => storeConsent('denied');

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
        maxWidth: 480,
        width: 'calc(100% - 32px)',
        background: 'rgba(11, 15, 20, 0.95)',
        color: 'white',
        borderRadius: 16,
        border: '1px solid rgba(148, 163, 184, 0.4)',
        padding: '18px 20px',
        boxShadow: '0 20px 45px rgba(15, 23, 42, 0.45)',
        zIndex: 1000,
      }}
    >
      <h2 style={{ margin: '0 0 8px', fontSize: '1.05rem' }}>Votre confidentialité</h2>
      <p style={{ margin: '0 0 12px', lineHeight: 1.5 }}>
        Nous utilisons des cookies analytiques pour améliorer l'expérience et mesurer la performance de notre carte. Vous pouvez
        modifier votre choix à tout moment via la page{' '}
        <Link href="/politique-cookies">Politique cookies</Link>.
      </p>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={handleDecline}
          style={{
            padding: '8px 14px',
            borderRadius: 999,
            background: 'transparent',
            border: '1px solid rgba(148, 163, 184, 0.7)',
            color: 'inherit',
            cursor: 'pointer',
          }}
        >
          Refuser
        </button>
        <button
          type="button"
          onClick={handleAccept}
          style={{
            padding: '8px 16px',
            borderRadius: 999,
            border: 'none',
            background: 'linear-gradient(180deg, #0ea5e9, #38bdf8)',
            color: '#fff',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Accepter
        </button>
      </div>
    </div>
  );
}
