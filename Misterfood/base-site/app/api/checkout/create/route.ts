import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';
import { z, ValidationError } from 'zod';

const Item = z.object({
  name: z.string().min(1),
  unitAmount: z.number().int().positive(),
  quantity: z.number().int().positive(),
});

const Extras = z
  .object({
    mode: z.enum(['pickup', 'delivery']).optional(),
    note: z.string().max(500).optional(),
    serviceFeeMinor: z.number().int().nonnegative().optional(),
    deliveryFeeMinor: z.number().int().nonnegative().optional(),
    tipMinor: z.number().int().nonnegative().optional(),
  })
  .optional();

const Body = z.object({
  merchantId: z.string().min(1),
  currency: z.string().default('eur'),
  items: z.array(Item).min(1),
  extras: Extras,
  customerEmail: z.string().email().optional(),
});

type BodyInput = ReturnType<typeof Body['parse']>;

type CheckoutResponse = {
  clientSecret: string;
  orderId: string;
  amount: number;
  currency: string;
};

export async function POST(req: NextRequest) {
  let body: BodyInput;
  try {
    const payload = await req.json();
    body = Body.parse(payload);
  } catch (err) {
    const message = err instanceof ValidationError ? err.message : 'Payload invalide';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const merchant = await prisma.merchant.findUnique({ where: { id: body.merchantId } });
  if (!merchant || !merchant.stripeAccountId) {
    return NextResponse.json({ error: 'Merchant non onboardé Stripe' }, { status: 400 });
  }

  const currencyCode = body.currency.toLowerCase();
  const subtotal = body.items.reduce((sum, it) => sum + it.unitAmount * it.quantity, 0);
  const serviceFee = body.extras?.serviceFeeMinor ?? 0;
  const deliveryFee = body.extras?.deliveryFeeMinor ?? 0;
  const tipMinor = body.extras?.tipMinor ?? 0;
  const amountTotal = subtotal + serviceFee + deliveryFee + tipMinor;

  if (amountTotal <= 0) {
    return NextResponse.json({ error: 'Montant invalide' }, { status: 400 });
  }

  const applicationFeeAmount = Math.floor((subtotal * merchant.commissionBps) / 10000);

  const order = await prisma.order.create({
    data: {
      merchantId: merchant.id,
      currency: currencyCode,
      amountTotal,
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

    const intent = await stripe.paymentIntents.create({
      amount: amountTotal,
      currency: currencyCode,
      automatic_payment_methods: { enabled: true },
      receipt_email: body.customerEmail,
      metadata,
      application_fee_amount: applicationFeeAmount,
      transfer_data: { destination: merchant.stripeAccountId },
    });

    if (!intent.client_secret) {
      throw new Error('Client secret introuvable pour le Payment Intent.');
    }

    await prisma.order.update({
      where: { id: order.id },
      data: { stripePaymentIntentId: intent.id, amountTotal },
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
