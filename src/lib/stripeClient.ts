let scriptPromise: Promise<void> | null = null;
let stripePromise: Promise<any> | null = null;
let lastKey: string | null = null;

declare global {
  interface Window {
    Stripe?: any;
  }
}

function loadStripeScript(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.resolve();
  }
  if (window.Stripe) {
    return Promise.resolve();
  }
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://js.stripe.com/v3';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Impossible de charger Stripe.js'));
      document.body.appendChild(script);
    });
  }
  return scriptPromise;
}

export async function getStripeClient(publishableKey: string) {
  if (typeof window === 'undefined') {
    return null;
  }
  if (!publishableKey) {
    throw new Error('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY est requis.');
  }

  await loadStripeScript();
  const factory = window.Stripe;
  if (!factory) {
    throw new Error('Stripe.js n\'est pas disponible.');
  }

  if (!stripePromise || lastKey !== publishableKey) {
    stripePromise = Promise.resolve(factory(publishableKey));
    lastKey = publishableKey;
  }

  return stripePromise;
}
