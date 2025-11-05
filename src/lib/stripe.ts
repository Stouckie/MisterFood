import Stripe from 'stripe';

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  // On ne jette pas d'erreur à l'import pour ne pas casser le dev ;
  // les routes Stripe échoueront si la clé est invalide.
  console.warn('⚠️ STRIPE_SECRET_KEY manquant. Renseigne .env');
}

export const stripe = new Stripe(key || 'sk_test_placeholder', {
  apiVersion: '2024-09-30.acacia',
});
