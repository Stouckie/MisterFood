import Link from 'next/link';
import { getBusinessInfo } from '@/lib/business';

export default function Footer() {
  const business = getBusinessInfo();
  const year = new Date().getFullYear();
  return (
    <footer
      style={{
        marginTop: 40,
        borderTop: '1px solid rgba(148, 163, 184, 0.18)',
        background: 'rgba(15, 23, 42, 0.75)',
      }}
    >
      <div
        className="container"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          padding: '24px 0 32px',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, justifyContent: 'space-between' }}>
          <div>
            <strong style={{ fontSize: '1.05rem' }}>{business.name}</strong>
            <p style={{ margin: '8px 0 0', color: 'rgba(226, 232, 240, 0.75)' }}>
              <a href={`mailto:${business.email}`}>{business.email}</a>
              {' '}·{' '}
              <a href={`tel:${business.phone.replace(/\s+/g, '')}`}>{business.phone}</a>
            </p>
          </div>
          <nav style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: '.95rem' }}>
            <Link href="/mentions-legales">Mentions légales</Link>
            <Link href="/conditions-generales">CGV</Link>
            <Link href="/politique-confidentialite">Confidentialité</Link>
            <Link href="/politique-cookies">Politique cookies</Link>
            <button
              type="button"
              data-consent-open
              style={{
                background: 'transparent',
                border: 'none',
                color: 'inherit',
                padding: 0,
                cursor: 'pointer',
                textDecoration: 'underline',
                textUnderlineOffset: 4,
              }}
            >
              Gérer mes cookies
            </button>
          </nav>
        </div>
        <p style={{ margin: 0, fontSize: '.85rem', color: 'rgba(148, 163, 184, 0.65)' }}>
          © {year} {business.name}. Tous droits réservés.
        </p>
        <script
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `(() => {
  const setup = () => {
    const trigger = document.querySelector('[data-consent-open]');
    if (!trigger) return;
    trigger.addEventListener('click', () => {
      window.__misterfoodConsent?.open?.();
    });
  };
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setup();
  } else {
    document.addEventListener('DOMContentLoaded', setup, { once: true });
  }
})();`,
          }}
        />
      </div>
    </footer>
  );
}
