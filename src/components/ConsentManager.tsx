'use client';

import { useEffect, useState } from 'react';
import { getConsent, setConsent } from '@/lib/consent';

export default function ConsentManager() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Afficher si pas encore de choix
    if (!getConsent()) setOpen(true);
  }, []);

  const applyGTMConsent = (granted: boolean) => {
    if (typeof window !== 'undefined' && (window as any).gtag) {
      (window as any).gtag('consent', 'update', {
        ad_user_data: granted ? 'granted' : 'denied',
        ad_personalization: granted ? 'granted' : 'denied',
        ad_storage: granted ? 'granted' : 'denied',
        analytics_storage: granted ? 'granted' : 'denied',
        functionality_storage: 'granted',
        security_storage: 'granted',
      });
    }
    window.dispatchEvent(new CustomEvent('consent:changed', { detail: { granted } }));
  };

  const handleAccept = () => {
    setConsent({ analytics: true, ads: true });
    applyGTMConsent(true);
    setOpen(false);
  };

  const handleRefuse = () => {
    setConsent({ analytics: false, ads: false });
    applyGTMConsent(false);
    setOpen(false);
  };

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
        maxWidth: 480,
        width: 'calc(100% - 32px)',
        zIndex: 1000,
        pointerEvents: 'none',   // <- le wrapper ne bloque rien
      }}
    >
      <div
        style={{
          pointerEvents: 'auto', // <- seuls le panneau et ses boutons reçoivent les clics
          background: 'rgba(20,20,25,.95)',
          color: 'white',
          padding: 16,
          borderRadius: 12,
          boxShadow: '0 10px 30px rgba(0,0,0,.3)',
        }}
      >
        <p style={{ marginBottom: 12 }}>
          Nous utilisons des cookies analytiques pour améliorer l’expérience.
          Vous pouvez modifier votre choix à tout moment dans « Politique cookies ».
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={handleRefuse}>
            Refuser
          </button>
          <button type="button" onClick={handleAccept}>
            Accepter
          </button>
        </div>
      </div>
    </div>
  );
}

