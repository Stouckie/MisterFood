import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';

export async function POST(req: NextRequest) {
  try {
    const { merchantId, items, currency = 'eur' } = await req.json();

    if (!merchantId || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'Payload invalide' }, { status: 400 });
    }

    const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } });
    if (!merchant || !merchant.stripeAccountId) {
      return NextResponse.json({ error: 'Merchant non onboardé Stripe' }, { status: 400 });
    }

    const amountTotal = items.reduce(
      (sum: number, it: any) => sum + Number(it.unitAmount) * Number(it.quantity),
      0
    );
    const applicationFeeAmount = Math.floor(
      amountTotal * (merchant.commissionBps / 10000)
    );

    // Crée l'ordre en PENDING
    const order = await prisma.order.create({
      data: {
        merchantId: merchant.id,
        currency,
        amountTotal,
        items: {
          create: items.map((it: any) => ({
            name: String(it.name),
            unitAmount: Number(it.unitAmount),
            quantity: Number(it.quantity),
          })),
        },
      },
    });

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      currency,
      line_items: items.map((it: any) => ({
        price_data: {
          currency,
          product_data: { name: String(it.name) },
          unit_amount: Number(it.unitAmount),
        },
        quantity: Number(it.quantity),
      })),
      payment_intent_data: {
        application_fee_amount: applicationFeeAmount,
        transfer_data: { destination: merchant.stripeAccountId },
        metadata: {
          orderId: order.id,
          merchantId: merchant.id,
        },
      },
      metadata: {
        orderId: order.id,
        merchantId: merchant.id,
      },
      // ⚠️ BIEN METTRE DES BACKTICKS (``) AUTOUR DES CHAÎNES
      success_url: `${process.env.APP_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.APP_URL}/checkout/cancel`,
    });

    await prisma.order.update({
      where: { id: order.id },
      data: { stripeCheckoutSessionId: session.id },
    });

    return NextResponse.json({ url: session.url });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
