import type { Metadata } from 'next';
import { getBusinessInfo } from '@/lib/business';

const business = getBusinessInfo();

export const metadata: Metadata = {
  title: 'Politique de confidentialité',
  description: `Politique de confidentialité de ${business.name}.`,
};

export default function PolitiqueConfidentialite() {
  return (
    <main style={{ padding: '32px 0' }}>
      <div className="container" style={{ display: 'grid', gap: 24, lineHeight: 1.6 }}>
        <header>
          <h1 style={{ marginBottom: 8 }}>Politique de confidentialité</h1>
          <p>
            Cette politique explique la manière dont {business.name} traite vos données personnelles dans le cadre de l'utilisation
            de notre site et de la commande en ligne.
          </p>
        </header>

        <section>
          <h2>Données collectées</h2>
          <p>
            Nous collectons uniquement les informations nécessaires au traitement de votre commande : nom, coordonnées,
            informations de paiement et préférences de livraison. Ces données sont utilisées exclusivement pour assurer la
            préparation et la livraison de vos produits.
          </p>
        </section>

        <section>
          <h2>Base légale</h2>
          <p>
            Le traitement est fondé sur l'exécution du contrat de vente. Certaines données peuvent également être traitées pour
            répondre à des obligations légales (facturation) ou pour des intérêts légitimes (amélioration du service).
          </p>
        </section>

        <section>
          <h2>Durée de conservation</h2>
          <p>
            Les données sont conservées pendant la durée nécessaire à l'exécution de la commande, puis archivées selon les délais
            légaux applicables. Les informations utilisées à des fins marketing ne sont conservées qu'avec votre consentement.
          </p>
        </section>

        <section>
          <h2>Vos droits</h2>
          <p>
            Vous disposez d'un droit d'accès, de rectification, d'opposition, de portabilité et de suppression de vos données.
            Pour exercer ces droits, contactez-nous à <a href={`mailto:${business.email}`}>{business.email}</a>.
          </p>
        </section>

        <section>
          <h2>Sécurité</h2>
          <p>
            Nous mettons en œuvre des mesures techniques et organisationnelles appropriées pour garantir la confidentialité et la
            sécurité de vos données, notamment le chiffrement des paiements via Stripe.
          </p>
        </section>
      </div>
    </main>
  );
}
