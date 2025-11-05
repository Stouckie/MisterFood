import { NextRequest, NextResponse } from 'next/server';
import { Buffer } from 'node:buffer';
import { stripe } from '@/lib/stripe';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { notifyMerchant } from '@/lib/notify';
import { captureException, captureMessage } from '@/lib/observability';
import {
  stripeChargeSchema,
  stripePaymentIntentSchema,
  StripeChargePayload,
  StripePaymentIntentPayload,
  toValidationErrorPayload,
} from '@/lib/validation';
import type Stripe from 'stripe';

export const runtime = 'nodejs'; // allow reading raw body

const WEBHOOK_LATENCY_WARNING_MS = 5 * 60_000;

export async function POST(req: NextRequest) {
  const sig = req.headers.get('stripe-signature');
  if (!sig) {
    captureMessage('Stripe webhook without signature', {
      level: 'warning',
      tags: { handler: 'stripe-webhook' },
    });
    return NextResponse.json({ error: 'Signature manquante' }, { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    captureMessage('Stripe webhook secret missing', {
      level: 'error',
      tags: { handler: 'stripe-webhook' },
    });
    return NextResponse.json({ error: 'Configuration serveur incomplète' }, { status: 500 });
  }

  const rawBodyBuffer = Buffer.from(await req.arrayBuffer());

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBodyBuffer, sig, webhookSecret);
  } catch (err: any) {
    captureException(err, {
      tags: { handler: 'stripe-webhook', stage: 'verify' },
      extra: { rawLength: rawBodyBuffer.byteLength },
    });
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
  }

  let notifyOrderId: string | null = null;
  let paymentIntentPayload: StripePaymentIntentPayload | null = null;
  let chargePayload: StripeChargePayload | null = null;
  const alerts: Array<
    | {
        type: 'payment_failed';
        orderId: string;
        paymentIntentId: string;
        reason?: string | null;
      }
    | { type: 'slow_webhook'; latencyMs: number; eventType: string; eventId: string }
  > = [];

  if (typeof event.created === 'number') {
    const latencyMs = Date.now() - event.created * 1000;
    if (latencyMs > WEBHOOK_LATENCY_WARNING_MS) {
      alerts.push({
        type: 'slow_webhook',
        latencyMs,
        eventType: event.type,
        eventId: event.id,
      });
    }
  }

  if (
    event.type === 'payment_intent.succeeded' ||
    event.type === 'payment_intent.payment_failed' ||
    event.type === 'payment_intent.canceled'
  ) {
    const parsed = stripePaymentIntentSchema.safeParse(event.data.object);
    if (!parsed.success) {
      const validation = toValidationErrorPayload(parsed.error);
      captureMessage('Stripe webhook payment_intent payload invalide', {
        level: 'warning',
        tags: { handler: 'stripe-webhook', stage: 'validate', eventType: event.type },
        extra: { issues: validation.issues },
      });
      return NextResponse.json(validation, { status: 400 });
    }
    paymentIntentPayload = parsed.data;
  } else if (event.type === 'charge.refunded') {
    const parsed = stripeChargeSchema.safeParse(event.data.object);
    if (!parsed.success) {
      const validation = toValidationErrorPayload(parsed.error);
      captureMessage('Stripe webhook charge payload invalide', {
        level: 'warning',
        tags: { handler: 'stripe-webhook', stage: 'validate', eventType: event.type },
        extra: { issues: validation.issues },
      });
      return NextResponse.json(validation, { status: 400 });
    }
    chargePayload = parsed.data;
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.webhookEvent.create({ data: { id: event.id, type: event.type } });

      switch (event.type) {
        case 'payment_intent.succeeded': {
          const pi = paymentIntentPayload!;
          const orderId = pi.metadata?.orderId;
          if (!orderId) break;

          const amount = typeof pi.amount_received === 'number' ? pi.amount_received : pi.amount ?? undefined;
          const updated = await tx.order.update({
            where: { id: orderId },
            data: {
              status: 'PAID',
              amountTotal: amount ?? undefined,
              stripePaymentIntentId: pi.id,
            },
          });

          if (!updated.notifiedAt) {
            notifyOrderId = updated.id;
          }
          break;
        }

        case 'payment_intent.payment_failed': {
          const pi = paymentIntentPayload!;
          const orderId = pi.metadata?.orderId;
          if (orderId) {
            await tx.order.update({
              where: { id: orderId },
              data: { status: 'FAILED', stripePaymentIntentId: pi.id },
            }).catch(() => undefined);
            alerts.push({
              type: 'payment_failed',
              orderId,
              paymentIntentId: pi.id,
              reason: pi.last_payment_error?.message,
            });
          }
          break;
        }

        case 'payment_intent.canceled': {
          const pi = paymentIntentPayload!;
          const orderId = pi.metadata?.orderId;
          if (orderId) {
            await tx.order.update({
              where: { id: orderId },
              data: { status: 'CANCELED', stripePaymentIntentId: pi.id },
            }).catch(() => undefined);
          }
          break;
        }

        case 'charge.refunded': {
          const charge = chargePayload!;
          const piRef = charge.payment_intent;
          const piId = typeof piRef === 'string' ? piRef : piRef?.id;
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
        captureException(e, {
          tags: { handler: 'stripe-webhook', stage: 'notify' },
          extra: { orderId: notifyOrderId },
        });
      } finally {
        await prisma.order.update({
          where: { id: notifyOrderId },
          data: { notifiedAt: new Date() },
        });
      }
    }

    for (const alert of alerts) {
      if (alert.type === 'payment_failed') {
        captureMessage('Stripe payment failed', {
          level: 'warning',
          tags: {
            handler: 'stripe-webhook',
            orderId: alert.orderId,
          },
          extra: {
            paymentIntentId: alert.paymentIntentId,
            reason: alert.reason,
          },
        });
      } else if (alert.type === 'slow_webhook') {
        captureMessage('Stripe webhook latency exceeded threshold', {
          level: 'warning',
          tags: {
            handler: 'stripe-webhook',
            eventType: alert.eventType,
          },
          extra: {
            eventId: alert.eventId,
            latencyMs: alert.latencyMs,
          },
        });
      }
    }

    return NextResponse.json({ received: true });
  } catch (e: any) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return NextResponse.json({ received: true });
    }
    captureException(e, {
      tags: { handler: 'stripe-webhook', stage: 'persist' },
      extra: { eventId: event.id, eventType: event.type },
    });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
