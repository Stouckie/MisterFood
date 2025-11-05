import type { Metadata } from 'next';
import { getBusinessInfo } from '@/lib/business';

const business = getBusinessInfo();

export const metadata: Metadata = {
  title: 'Mentions légales',
  description: `Informations légales de ${business.name}.`,
};

export default function MentionsLegales() {
  return (
    <main style={{ padding: '32px 0' }}>
      <div className="container" style={{ display: 'grid', gap: 24 }}>
        <header>
          <h1 style={{ marginBottom: 8 }}>Mentions légales</h1>
          <p style={{ maxWidth: 720, lineHeight: 1.6 }}>
            Conformément aux articles 6-III et 19 de la loi n°2004-575 du 21 juin 2004 pour la Confiance dans l'économie
            numérique, nous vous informons des éléments suivants.
          </p>
        </header>

        <section style={{ lineHeight: 1.6 }}>
          <h2>Éditeur du site</h2>
          <p>
            {business.name}<br />
            {business.address}<br />
            {business.postalCode} {business.city}, {business.country}
          </p>
          <p>
            Téléphone : <a href={`tel:${business.phone.replace(/\s+/g, '')}`}>{business.phone}</a><br />
            Email : <a href={`mailto:${business.email}`}>{business.email}</a>
          </p>
          <p>
            {business.legalForm}<br />
            Immatriculée au {business.registrationNumber}<br />
            TVA intracommunautaire : {business.vatNumber}<br />
            Capital social : {business.shareCapital}
          </p>
        </section>

        <section style={{ lineHeight: 1.6 }}>
          <h2>Responsable de la publication</h2>
          <p>
            {business.publicationDirector}, représentant légal de {business.name}.
          </p>
        </section>

        <section style={{ lineHeight: 1.6 }}>
          <h2>Hébergement</h2>
          <p>
            Le site est hébergé par Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, États-Unis.
          </p>
        </section>

        <section style={{ lineHeight: 1.6 }}>
          <h2>Protection des données</h2>
          <p>
            Les informations recueillies sur le site sont traitées par {business.name} afin de préparer et livrer vos
            commandes. Pour toute question concernant vos données ou pour exercer vos droits (accès, rectification,
            suppression), contactez-nous à <a href={`mailto:${business.email}`}>{business.email}</a>.
          </p>
        </section>

        <section style={{ lineHeight: 1.6 }}>
          <h2>Propriété intellectuelle</h2>
          <p>
            L'ensemble des éléments graphiques, textes et contenus présentés sur ce site appartiennent à {business.name} ou font
            l'objet d'une autorisation d'utilisation. Toute reproduction, représentation ou diffusion, totale ou partielle, sans
            autorisation écrite est interdite.
          </p>
        </section>

        <section style={{ lineHeight: 1.6 }}>
          <h2>Responsabilité</h2>
          <p>
            Nous mettons tout en œuvre pour garantir l'exactitude des informations mises à disposition. Toutefois, {business.name}
            ne saurait être tenue responsable des erreurs, omissions ou résultats pouvant être obtenus par un mauvais usage de ces
            informations.
          </p>
        </section>
      </div>
    </main>
  );
}
