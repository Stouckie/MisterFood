'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getStripeClient } from '@/lib/stripeClient';

type Props = {
  clientSecret: string;
  orderId?: string;
  amountMinor?: number;
  currency?: string;
};

export default function CheckoutPaymentForm({ clientSecret, orderId, amountMinor, currency }: Props) {
  const router = useRouter();
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';

  const containerRef = useRef<HTMLDivElement | null>(null);
  const elementsRef = useRef<any>(null);
  const paymentElementRef = useRef<any>(null);
  const stripeRef = useRef<any>(null);

  const [initializing, setInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const formattedAmount = useMemo(() => {
    if (typeof amountMinor !== 'number') return null;
    try {
      return new Intl.NumberFormat('fr-FR', {
        style: 'currency',
        currency: (currency || 'eur').toUpperCase(),
      }).format(amountMinor / 100);
    } catch {
      return `${(amountMinor / 100).toFixed(2)} ${(currency || 'eur').toUpperCase()}`;
    }
  }, [amountMinor, currency]);

  useEffect(() => {
    let active = true;

    async function mountPaymentElement() {
      setInitializing(true);
      setError(null);
      try {
        if (!publishableKey) {
          throw new Error('Configure NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY pour afficher le paiement.');
        }
        const stripe = await getStripeClient(publishableKey);
        if (!stripe || !active) return;
        const container = containerRef.current;
        if (!container) {
          throw new Error('Conteneur de paiement introuvable.');
        }
        stripeRef.current = stripe;
        const elements = stripe.elements({
          clientSecret,
          appearance: { theme: 'stripe' },
        });
        elementsRef.current = elements;
        const paymentElement = elements.create('payment');
        paymentElementRef.current = paymentElement;
        paymentElement.mount(container);
        setInitializing(false);
      } catch (err) {
        if (!active) return;
        const message = err instanceof Error ? err.message : 'Impossible d\'initialiser le paiement.';
        setError(message);
        setInitializing(false);
      }
    }

    if (clientSecret) {
      mountPaymentElement();
    }

    return () => {
      active = false;
      if (paymentElementRef.current) {
        paymentElementRef.current.destroy();
        paymentElementRef.current = null;
      }
      elementsRef.current = null;
      stripeRef.current = null;
    };
  }, [clientSecret, publishableKey]);

  async function confirmPayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    const stripe = stripeRef.current;
    const elements = elementsRef.current;
    if (!stripe || !elements) {
      setError('Paiement indisponible.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const successUrl = (() => {
        const base = `${window.location.origin}/checkout/success`;
        const params = new URLSearchParams();
        if (orderId) params.set('order_id', orderId);
        if (typeof amountMinor === 'number') params.set('amount', String(amountMinor));
        if (currency) params.set('currency', currency);
        const query = params.toString();
        return query ? `${base}?${query}` : base;
      })();

      const { error: stripeError, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: successUrl,
          receipt_email: email || undefined,
        },
        redirect: 'if_required',
      });

      if (stripeError) {
        setError(stripeError.message || 'Paiement refusé.');
      } else if (paymentIntent?.status === 'succeeded') {
        router.replace(successUrl);
        return;
      } else if (paymentIntent?.status === 'processing') {
        setError('Paiement en cours de traitement…');
      } else {
        setError('Paiement en attente d\'action supplémentaire.');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur inattendue lors du paiement.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={confirmPayment} style={{ maxWidth: 480, width: '100%' }}>
      <h1 style={{ fontSize: '1.8rem', marginBottom: 12 }}>Paiement sécurisé</h1>
      {formattedAmount && (
        <p style={{ fontWeight: 600 }}>Montant : {formattedAmount}</p>
      )}
      <label htmlFor="email" style={{ display: 'block', marginBottom: 8 }}>
        Email (reçu)
      </label>
      <input
        id="email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="vous@example.com"
        style={{
          width: '100%',
          padding: '10px 12px',
          borderRadius: 8,
          border: '1px solid #ccc',
          marginBottom: 16,
        }}
      />
      <div
        ref={containerRef}
        style={{
          border: '1px solid #ccc',
          borderRadius: 12,
          padding: 16,
          minHeight: 120,
          background: '#fff',
        }}
        aria-busy={initializing}
      />
      {(initializing || isSubmitting) && (
        <p role="status" style={{ marginTop: 12 }}>
          {initializing ? 'Initialisation du paiement…' : 'Validation en cours…'}
        </p>
      )}
      {error && (
        <p role="alert" style={{ color: '#b00020', marginTop: 12 }}>
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={initializing || isSubmitting || !clientSecret}
        style={{
          marginTop: 16,
          width: '100%',
          padding: '12px 16px',
          borderRadius: 10,
          border: 'none',
          background: initializing || isSubmitting ? '#bbb' : 'black',
          color: 'white',
          cursor: initializing || isSubmitting ? 'not-allowed' : 'pointer',
          fontSize: '1rem',
        }}
      >
        {isSubmitting ? 'Paiement…' : 'Payer'}
      </button>
    </form>
  );
}
