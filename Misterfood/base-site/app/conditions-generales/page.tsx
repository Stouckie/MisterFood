import type { Metadata } from 'next';
import { getBusinessInfo } from '@/lib/business';

const business = getBusinessInfo();

export const metadata: Metadata = {
  title: 'Conditions Générales de Vente',
  description: `Conditions générales de vente de ${business.name}.`,
};

export default function ConditionsGenerales() {
  return (
    <main style={{ padding: '32px 0' }}>
      <div className="container" style={{ display: 'grid', gap: 24, lineHeight: 1.6 }}>
        <header>
          <h1 style={{ marginBottom: 8 }}>Conditions générales de vente</h1>
          <p>
            Les présentes conditions s'appliquent à toute commande passée sur le site {business.name}. En validant votre
            commande, vous acceptez l'intégralité des dispositions ci-dessous.
          </p>
        </header>

        <section>
          <h2>Commande</h2>
          <p>
            Les produits proposés sont décrits avec la plus grande précision possible. Les photographies n'ont qu'une valeur
            illustrative. Toute commande est réputée ferme après validation du paiement.
          </p>
        </section>

        <section>
          <h2>Prix</h2>
          <p>
            Les prix sont indiqués en euros TTC. {business.name} se réserve le droit de modifier les prix à tout moment, mais les
            produits seront facturés sur la base des tarifs en vigueur lors de la validation de la commande.
          </p>
        </section>

        <section>
          <h2>Paiement</h2>
          <p>
            Le règlement s'effectue en ligne par carte bancaire via notre partenaire Stripe. Le débit est immédiat. En cas de
            refus de la part de la banque, la commande est automatiquement annulée.
          </p>
        </section>

        <section>
          <h2>Livraison et retrait</h2>
          <p>
            Les délais indiqués sont donnés à titre indicatif. {business.name} ne saurait être tenue responsable d'un retard
            imputable au prestataire de livraison. Pour les retraits, la commande doit être récupérée dans la plage horaire
            confirmée.
          </p>
        </section>

        <section>
          <h2>Rétractation</h2>
          <p>
            Conformément à l'article L221-28 du Code de la consommation, le droit de rétractation ne s'applique pas aux produits
            alimentaires préparés sur demande.
          </p>
        </section>

        <section>
          <h2>Service client</h2>
          <p>
            Pour toute question ou réclamation, contactez-nous à <a href={`mailto:${business.email}`}>{business.email}</a> ou par
            téléphone au <a href={`tel:${business.phone.replace(/\s+/g, '')}`}>{business.phone}</a>.
          </p>
        </section>
      </div>
    </main>
  );
}
