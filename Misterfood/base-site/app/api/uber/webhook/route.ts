import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { normalizeUberStatus, verifyUberSignature } from '@/lib/uber';
import { OrderStatus } from '@prisma/client';
import { captureException, captureMessage } from '@/lib/observability';

export const runtime = 'nodejs';

interface UberDeliveryPayload {
  id?: string;
  delivery_id?: string;
  quote_id?: string;
  status?: string;
  tracking_url?: string;
  tracking?: { url?: string };
  external_reference?: string;
  external_reference_id?: string;
  external_order_id?: string;
  external_reason?: string;
  fee?: { amount?: number; currency_code?: string };
  total?: { amount?: number; currency?: string };
  currency?: string;
  pickup_at?: string | number;
  pickup_time?: string | number;
  pickup_at_ms?: number;
}

interface UberWebhookBody {
  event_type?: string;
  event_time?: string;
  meta?: { resource_id?: string };
  data?: UberDeliveryPayload | { delivery?: UberDeliveryPayload };
  event?: { status?: string };
  resource?: UberDeliveryPayload;
  status?: string;
  delivery_id?: string;
  quote_id?: string;
  external_reference_id?: string;
}

function extractDelivery(body: UberWebhookBody): UberDeliveryPayload & { orderId?: string } {
  const candidate =
    (body.data && 'delivery' in body.data ? body.data.delivery : body.data) ||
    body.resource ||
    (body as unknown as UberDeliveryPayload);

  const delivery = candidate ?? {};
  const orderId =
    delivery.external_reference ||
    delivery.external_reference_id ||
    delivery.external_order_id ||
    body.external_reference_id ||
    delivery.external_reason;

  return { ...delivery, orderId: orderId ?? undefined };
}

function parsePickupMs(payload: UberDeliveryPayload): bigint | undefined {
  const candidate = payload.pickup_at_ms ?? payload.pickup_at ?? payload.pickup_time;
  if (candidate == null) return undefined;
  if (typeof candidate === 'number' && Number.isFinite(candidate)) {
    return BigInt(Math.round(candidate));
  }
  if (typeof candidate === 'string') {
    const num = Number(candidate);
    if (!Number.isNaN(num) && Number.isFinite(num)) {
      return BigInt(Math.round(num));
    }
    const parsed = Date.parse(candidate);
    if (!Number.isNaN(parsed)) {
      return BigInt(parsed);
    }
  }
  return undefined;
}

const DELIVERY_TO_ORDER_STATUS: Record<string, OrderStatus> = {
  delivered: OrderStatus.PAID,
  canceled: OrderStatus.CANCELED,
  failed: OrderStatus.FAILED,
};

export async function POST(req: NextRequest) {
  const secret = process.env.UBER_WEBHOOK_SECRET;
  const signature = req.headers.get('uber-signature') || req.headers.get('x-uber-signature');
  const rawBody = await req.text();

  if (secret && signature) {
    try {
      verifyUberSignature(rawBody, signature, secret);
    } catch (err) {
      captureException(err, {
        tags: { handler: 'uber-webhook', stage: 'verify' },
      });
      const message = err instanceof Error ? err.message : 'Signature invalide';
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  let payload: UberWebhookBody;
  try {
    payload = rawBody ? (JSON.parse(rawBody) as UberWebhookBody) : {};
  } catch (err) {
    captureException(err, {
      tags: { handler: 'uber-webhook', stage: 'parse' },
    });
    return NextResponse.json({ error: 'Payload JSON invalide' }, { status: 400 });
  }

  const deliveryPayload = extractDelivery(payload);
  const normalizedStatus = normalizeUberStatus(deliveryPayload.status || payload.status);
  const deliveryId = deliveryPayload.delivery_id || deliveryPayload.id || payload.delivery_id || payload.meta?.resource_id;
  const trackingUrl = deliveryPayload.tracking_url || deliveryPayload.tracking?.url;
  const quoteId = deliveryPayload.quote_id || payload.quote_id;
  const feeAmount = deliveryPayload.total?.amount ?? deliveryPayload.fee?.amount;
  const feeCurrency = deliveryPayload.total?.currency ?? deliveryPayload.fee?.currency_code ?? deliveryPayload.currency;
  const pickupAt = parsePickupMs(deliveryPayload);
  const orderId = deliveryPayload.orderId;

  if (!deliveryId && !orderId) {
    return NextResponse.json({ received: true });
  }

  let resolvedOrderId = orderId;

  try {
    await prisma.$transaction(async (tx) => {
      if (!resolvedOrderId && deliveryId) {
        const existing = await tx.delivery.findFirst({ where: { deliveryId } });
        if (existing) {
          resolvedOrderId = existing.orderId;
        }
      }

      if (!resolvedOrderId && deliveryPayload.orderId) {
        resolvedOrderId = deliveryPayload.orderId;
      }

      if (!resolvedOrderId && orderId) {
        resolvedOrderId = orderId;
      }

      const updateData: Parameters<typeof tx.delivery.updateMany>[0]['data'] = {
        status: normalizedStatus ?? undefined,
        trackingUrl: trackingUrl ?? undefined,
        estimateId: quoteId ?? undefined,
        feeTotal: typeof feeAmount === 'number' ? feeAmount : undefined,
        currency: feeCurrency ?? undefined,
        pickupAtMs: pickupAt ?? undefined,
      };

      if (deliveryId) {
        await tx.delivery.updateMany({
          where: { deliveryId },
          data: {
            ...updateData,
            deliveryId,
          },
        });
      }

      if (resolvedOrderId) {
        const result = await tx.delivery.upsert({
          where: { orderId: resolvedOrderId },
          update: {
            ...updateData,
            deliveryId: deliveryId ?? undefined,
          },
          create: {
            orderId: resolvedOrderId,
            provider: 'uber_direct',
            deliveryId: deliveryId ?? undefined,
            status: normalizedStatus ?? undefined,
            trackingUrl: trackingUrl ?? undefined,
            estimateId: quoteId ?? undefined,
            feeTotal: typeof feeAmount === 'number' ? feeAmount : undefined,
            currency: feeCurrency ?? undefined,
            pickupAtMs: pickupAt ?? undefined,
          },
        });

        if (normalizedStatus) {
          const nextOrderStatus = DELIVERY_TO_ORDER_STATUS[normalizedStatus];
          if (nextOrderStatus) {
            await tx.order.update({
              where: { id: result.orderId },
              data: { status: nextOrderStatus },
            }).catch(() => undefined);
          }
        }
      }
    });

    return NextResponse.json({ received: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur Uber Direct';
    captureException(err, {
      tags: { handler: 'uber-webhook', stage: 'persist' },
      extra: {
        deliveryId,
        orderId: resolvedOrderId,
        status: normalizedStatus,
      },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (normalizedStatus && ['failed', 'canceled'].includes(normalizedStatus)) {
    captureMessage(`Uber delivery ${normalizedStatus}`, {
      level: 'warning',
      tags: {
        handler: 'uber-webhook',
        status: normalizedStatus,
      },
      extra: {
        deliveryId,
        orderId: resolvedOrderId,
        quoteId,
      },
    });
  }
}
