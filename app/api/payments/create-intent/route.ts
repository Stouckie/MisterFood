import { NextRequest, NextResponse } from 'next/server';
import { z, ValidationError } from 'zod';
import { stripe } from '@/lib/stripe';

const Body = z.object({
  amount: z.number().int().positive(),
  currency: z.string().default('eur'),
  customerEmail: z.string().email().optional(),
  metadata: z.record(z.string()).optional(),
});

export async function POST(req: NextRequest) {
  let payload: ReturnType<typeof Body['parse']>;
  try {
    const json = await req.json();
    payload = Body.parse(json);
  } catch (err) {
    const message = err instanceof ValidationError ? err.message : 'Payload invalide';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const currencyCode = payload.currency.toLowerCase();
    const intent = await stripe.paymentIntents.create({
      amount: payload.amount,
      currency: currencyCode,
      automatic_payment_methods: { enabled: true },
      receipt_email: payload.customerEmail,
      metadata: payload.metadata,
    });

    if (!intent.client_secret) {
      throw new Error('Client secret introuvable pour le Payment Intent.');
    }

    return NextResponse.json({ clientSecret: intent.client_secret, currency: currencyCode }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur Stripe';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
