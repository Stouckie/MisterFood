import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';
import {
  createCheckoutSessionSchema,
  CreateCheckoutSessionInput,
  toValidationErrorPayload,
} from '@/lib/validation';

type CheckoutResponse = {
  clientSecret: string;
  orderId: string;
  amount: number;
  currency: string;
};

export async function POST(req: NextRequest) {
  const payload = await req.json().catch(() => null);
  const parsed = createCheckoutSessionSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(toValidationErrorPayload(parsed.error), { status: 400 });
  }

  const body: CreateCheckoutSessionInput = parsed.data;

  const currencyCode = body.currency.toLowerCase();
  const subtotal = body.items.reduce((sum, it) => sum + it.unitAmount * it.quantity, 0);
  const serviceFee = body.extras?.serviceFeeMinor ?? 0;
  const deliveryFee = body.extras?.deliveryFeeMinor ?? 0;
  const tipMinor = body.extras?.tipMinor ?? 0;
  const amountTotal = subtotal + serviceFee + deliveryFee + tipMinor;

  if (amountTotal <= 0) {
    return NextResponse.json({ error: 'Montant invalide' }, { status: 400 });
  }

  const normalizedItems = [...body.items]
    .map(item => ({
      name: item.name,
      unitAmount: item.unitAmount,
      quantity: item.quantity,
    }))
    .sort((a, b) => {
      if (a.name === b.name) {
        if (a.unitAmount === b.unitAmount) {
          return a.quantity - b.quantity;
        }
        return a.unitAmount - b.unitAmount;
      }
      return a.name.localeCompare(b.name);
    });

  const idempotencyPayload = JSON.stringify({
    merchantId: body.merchantId,
    currency: currencyCode,
    amountTotal,
    items: normalizedItems,
  });

  const computedIdempotencyKey = createHash('sha256').update(idempotencyPayload).digest('hex');
  const providedIdempotencyKey = req.headers.get('idempotency-key') ?? undefined;

  if (providedIdempotencyKey && providedIdempotencyKey !== computedIdempotencyKey) {
    return NextResponse.json({ error: 'Idempotency-Key invalide' }, { status: 400 });
  }

  const idempotencyKey = providedIdempotencyKey ?? computedIdempotencyKey;

  const existingOrder = await prisma.order.findUnique({
    where: { idempotencyKey },
  });

  if (existingOrder) {
    if (
      existingOrder.merchantId !== body.merchantId ||
      existingOrder.currency !== currencyCode ||
      existingOrder.amountTotal !== amountTotal
    ) {
      return NextResponse.json(
        { error: 'Requête idempotente incohérente' },
        { status: 409 },
      );
    }

    if (!existingOrder.stripePaymentIntentId) {
      return NextResponse.json(
        { error: 'Une session de paiement est déjà en cours de création' },
        { status: 409 },
      );
    }

    const existingSecret = existingOrder.stripeClientSecret;

    if (existingSecret) {
      return NextResponse.json(
        {
          clientSecret: existingSecret,
          orderId: existingOrder.id,
          amount: existingOrder.amountTotal,
          currency: existingOrder.currency,
        },
        { status: 200 },
      );
    }

    try {
      const intent = await stripe.paymentIntents.retrieve(existingOrder.stripePaymentIntentId);

      if (!intent.client_secret) {
        throw new Error('Client secret introuvable pour le Payment Intent existant.');
      }

      await prisma.order.update({
        where: { id: existingOrder.id },
        data: { stripeClientSecret: intent.client_secret },
      });

      return NextResponse.json(
        {
          clientSecret: intent.client_secret,
          orderId: existingOrder.id,
          amount: existingOrder.amountTotal,
          currency: existingOrder.currency,
        },
        { status: 200 },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur Stripe';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  const merchant = await prisma.merchant.findUnique({ where: { id: body.merchantId } });
  if (!merchant || !merchant.stripeAccountId) {
    return NextResponse.json({ error: 'Merchant non onboardé Stripe' }, { status: 400 });
  }

  const applicationFeeAmount = Math.floor((subtotal * merchant.commissionBps) / 10000);

  const order = await prisma.order.create({
    data: {
      merchantId: merchant.id,
      currency: currencyCode,
      amountTotal,
      idempotencyKey,
      items: {
        create: body.items.map(it => ({
          name: it.name,
          unitAmount: it.unitAmount,
          quantity: it.quantity,
        })),
      },
      ...(body.extras?.mode === 'delivery'
        ? {
            delivery: {
              create: {
                provider: 'uber_direct',
                feeTotal: deliveryFee || null,
                currency: currencyCode,
              },
            },
          }
        : {}),
    },
  });

  try {
    const metadata: Record<string, string> = {
      orderId: order.id,
      merchantId: merchant.id,
      subtotalMinor: String(subtotal),
      serviceFeeMinor: String(serviceFee),
      deliveryFeeMinor: String(deliveryFee),
      tipMinor: String(tipMinor),
    };
    if (body.extras?.mode) metadata.fulfillmentMode = body.extras.mode;
    if (body.extras?.note) metadata.note = body.extras.note;

    const intent = await stripe.paymentIntents.create(
      {
        amount: amountTotal,
        currency: currencyCode,
        automatic_payment_methods: { enabled: true },
        receipt_email: body.customerEmail,
        metadata,
        application_fee_amount: applicationFeeAmount,
        transfer_data: { destination: merchant.stripeAccountId },
      },
      { idempotencyKey },
    );

    if (!intent.client_secret) {
      throw new Error('Client secret introuvable pour le Payment Intent.');
    }

    await prisma.order.update({
      where: { id: order.id },
      data: {
        stripePaymentIntentId: intent.id,
        stripeClientSecret: intent.client_secret,
        amountTotal,
      },
    });

    const response: CheckoutResponse = {
      clientSecret: intent.client_secret,
      orderId: order.id,
      amount: amountTotal,
      currency: currencyCode,
    };
    return NextResponse.json(response, { status: 200 });
  } catch (err) {
    await prisma.order.delete({ where: { id: order.id } }).catch(() => undefined);
    const message = err instanceof Error ? err.message : 'Erreur Stripe';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
