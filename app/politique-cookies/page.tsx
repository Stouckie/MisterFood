import type { Metadata } from 'next';
import { getBusinessInfo } from '@/lib/business';

const business = getBusinessInfo();

export const metadata: Metadata = {
  title: 'Politique cookies',
  description: `Politique d'utilisation des cookies de ${business.name}.`,
};

export default function PolitiqueCookies() {
  return (
    <main style={{ padding: '32px 0' }}>
      <div className="container" style={{ display: 'grid', gap: 24, lineHeight: 1.6 }}>
        <header>
          <h1 style={{ marginBottom: 8 }}>Politique cookies</h1>
          <p>
            Cette page décrit les cookies utilisés sur le site {business.name} et la manière de gérer vos préférences.
          </p>
        </header>

        <section>
          <h2>Cookies nécessaires</h2>
          <p>
            Nous utilisons des cookies strictement nécessaires au fonctionnement du panier et du processus de commande. Ils sont
            toujours activés et ne contiennent aucune donnée sensible.
          </p>
        </section>

        <section>
          <h2>Cookies analytiques</h2>
          <p>
            Avec votre accord, nous déclenchons Google Analytics 4 afin de mesurer la fréquentation et d'améliorer l'expérience
            utilisateur. Ces cookies ne sont activés qu'après votre consentement via la bannière dédiée.
          </p>
        </section>

        <section>
          <h2>Gestion du consentement</h2>
          <p>
            Vous pouvez modifier votre choix à tout moment en supprimant le consentement enregistré dans votre navigateur. Sur la
            plupart des navigateurs, vous pouvez effacer les cookies ou le stockage local associé à {business.name}. Au prochain
            chargement, la bannière de consentement apparaîtra de nouveau.
          </p>
        </section>

        <section>
          <h2>Contact</h2>
          <p>
            Pour toute question relative aux cookies, contactez-nous à <a href={`mailto:${business.email}`}>{business.email}</a>.
          </p>
        </section>
      </div>
    </main>
  );
}
