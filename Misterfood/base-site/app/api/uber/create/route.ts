import { NextRequest, NextResponse } from 'next/server';
import { z, ValidationError } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireUberStoreId, uberFetch } from '@/lib/uber';
import { captureException } from '@/lib/observability';

const Item = z.object({
  title: z.string().min(1),
  quantity: z.number().int().positive(),
  price: z.number().int().nonnegative().optional(),
  weight: z.number().nonnegative().optional(),
});

const Point = z.object({
  address: z.string().min(1),
  phone: z.string().min(5).optional(),
  name: z.string().min(1).optional(),
  instructions: z.string().max(500).optional(),
});

const Body = z.object({
  quoteId: z.string().min(1).optional(),
  pickup: Point,
  dropoff: Point,
  items: z.array(Item).min(1),
  orderId: z.string().min(1),
});

type DeliveryResponse = {
  id?: string;
  status?: string;
  tracking_url?: string;
  tracking?: { url?: string };
  quote_id?: string;
  delivery_id?: string;
  external_reference?: string;
  fee?: { amount: number; currency_code: string };
  total?: { amount: number; currency: string };
  currency?: string;
};

export async function POST(req: NextRequest) {
  let payload: z.infer<typeof Body>;
  try {
    payload = Body.parse(await req.json());
  } catch (err) {
    const message = err instanceof ValidationError ? err.message : 'Payload invalide';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const order = await prisma.order.findUnique({ where: { id: payload.orderId }, include: { delivery: true } });
  if (!order) {
    return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 });
  }
  if (order.status !== 'PAID') {
    return NextResponse.json({ error: 'La commande doit être payée avant la livraison' }, { status: 409 });
  }

  const storeId = requireUberStoreId();

  try {
    const body = {
      external_store_id: storeId,
      quote_id: payload.quoteId,
      pickup: payload.pickup,
      dropoff: payload.dropoff,
      manifest: { items: payload.items },
      external_reference_id: payload.orderId,
      external_order_id: payload.orderId,
    };

    const data = await uberFetch<DeliveryResponse>('/v2/deliveries', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    const deliveryId = data.id ?? data.delivery_id;
    const status = data.status;
    const trackingUrl = data.tracking_url ?? data.tracking?.url;
    const estimateId = data.quote_id ?? payload.quoteId;
    const feeAmount = data.total?.amount ?? data.fee?.amount ?? null;
    const feeCurrency = data.total?.currency ?? data.fee?.currency_code ?? data.currency ?? order.currency;

    await prisma.delivery.upsert({
      where: { orderId: order.id },
      update: {
        deliveryId: deliveryId ?? undefined,
        status: status ?? undefined,
        trackingUrl: trackingUrl ?? undefined,
        estimateId: estimateId ?? undefined,
        feeTotal: feeAmount ?? undefined,
        currency: feeCurrency ?? undefined,
      },
      create: {
        orderId: order.id,
        provider: 'uber_direct',
        deliveryId: deliveryId ?? undefined,
        status: status ?? undefined,
        trackingUrl: trackingUrl ?? undefined,
        estimateId: estimateId ?? undefined,
        feeTotal: feeAmount ?? undefined,
        currency: feeCurrency ?? undefined,
      },
    });

    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur Uber Direct';
    captureException(err, {
      tags: { handler: 'uber-create' },
      extra: { orderId: payload.orderId },
    });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
