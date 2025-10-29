import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { notifyMerchant } from '@/lib/notify';

export const runtime = 'nodejs'; // allow reading raw body

export async function POST(req: NextRequest) {
  const sig = req.headers.get('stripe-signature');
  if (!sig) return NextResponse.json({ error: 'Signature manquante' }, { status: 400 });

  const rawBody = await req.text();

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err: any) {
    console.error('Webhook signature verification failed.', err.message);
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
  }

  let notifyOrderId: string | null = null;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.webhookEvent.create({ data: { id: event.id, type: event.type } });

      switch (event.type) {
        case 'checkout.session.completed': {
          const session: any = event.data.object;
          const orderId = session.metadata?.orderId as string | undefined;
          const piId = session.payment_intent as string | undefined;

          if (!orderId) break;

          const updated = await tx.order.update({
            where: { id: orderId },
            data: {
              status: 'PAID',
              amountTotal: session.amount_total ?? undefined,
              stripePaymentIntentId: piId,
            },
          });

          if (!updated.notifiedAt) {
            notifyOrderId = updated.id;
          }
          break;
        }

        case 'payment_intent.payment_failed': {
          const pi: any = event.data.object;
          const orderId = pi.metadata?.orderId as string | undefined;
          if (orderId) {
            await tx.order.update({
              where: { id: orderId },
              data: { status: 'FAILED' },
            });
          }
          break;
        }

        case 'charge.refunded': {
          const charge: any = event.data.object;
          const piId = charge.payment_intent as string | undefined;
          if (piId) {
            await tx.order.updateMany({
              where: { stripePaymentIntentId: piId },
              data: { status: 'CANCELED' },
            });
          }
          break;
        }

        default:
          break;
      }
    });

    if (notifyOrderId) {
      try {
        await notifyMerchant(notifyOrderId);
      } catch (e) {
        console.error('Notify error:', e);
      } finally {
        await prisma.order.update({
          where: { id: notifyOrderId },
          data: { notifiedAt: new Date() },
        });
      }
    }

    return NextResponse.json({ received: true });
  } catch (e: any) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return NextResponse.json({ received: true });
    }
    console.error(e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
