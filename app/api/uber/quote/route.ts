import { NextRequest, NextResponse } from 'next/server';
import { z, ValidationError } from 'zod';
import { uberFetch, requireUberStoreId } from '@/lib/uber';
import { computeUberIdempotencyKey, evaluateDeliveryEligibility } from '@/lib/delivery-rules';
import { prisma } from '@/lib/prisma';
import { captureException } from '@/lib/observability';

const Item = z.object({
  title: z.string().min(1),
  quantity: z.number().int().positive(),
  price: z.number().int().nonnegative().optional(),
  weight: z.number().nonnegative().optional(),
});

const Point = z
  .object({
    address: z.string().min(1),
    phone: z.string().min(5).optional(),
    name: z.string().min(1).optional(),
    instructions: z.string().max(500).optional(),
    postalCode: z.string().trim().min(3).max(12).optional(),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
  })
  .refine(point => {
    if (point.lat == null && point.lng == null) return true;
    return point.lat != null && point.lng != null;
  }, 'lat et lng doivent être fournis ensemble');

const Body = z.object({
  pickup: Point,
  dropoff: Point,
  items: z.array(Item).min(1),
  orderId: z.string().min(1).optional(),
});

type QuoteResponse = {
  quote_id?: string;
  id?: string;
  total?: { amount: number; currency: string };
  fee?: { amount: number; currency_code: string };
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

  const storeId = requireUberStoreId();

  try {
    const eligibility = evaluateDeliveryEligibility({
      lat: payload.dropoff.lat,
      lng: payload.dropoff.lng,
      postalCode: payload.dropoff.postalCode,
      address: payload.dropoff.address,
    });

    if (!eligibility.eligible) {
      return NextResponse.json(
        {
          error: eligibility.message ?? 'Livraison indisponible pour cette adresse.',
          fallback: eligibility.fallback ?? 'pickup',
          reason: eligibility.reason,
        },
        { status: 409 },
      );
    }

    let orderExists = true;
    if (payload.orderId) {
      orderExists = !!(await prisma.order.findUnique({ where: { id: payload.orderId } }));
    }

    const normalizedItems = [...payload.items]
      .map(item => ({
        title: item.title,
        quantity: item.quantity,
        price: item.price ?? null,
        weight: item.weight ?? null,
      }))
      .sort((a, b) => {
        const titleCompare = a.title.localeCompare(b.title);
        if (titleCompare !== 0) return titleCompare;
        if (a.price !== b.price) {
          return (a.price ?? 0) - (b.price ?? 0);
        }
        return a.quantity - b.quantity;
      });

    const idempotencyKey = computeUberIdempotencyKey('uber-quote', {
      storeId,
      orderId: payload.orderId ?? null,
      dropoff: {
        address: payload.dropoff.address,
        postalCode: payload.dropoff.postalCode ?? null,
        lat: payload.dropoff.lat ?? null,
        lng: payload.dropoff.lng ?? null,
      },
      items: normalizedItems,
    });

    const dropoff = (() => {
      const { postalCode, lat, lng, ...rest } = payload.dropoff;
      const base: Record<string, unknown> = { ...rest };
      if (postalCode) {
        base.postal_code = postalCode;
      }
      if (lat != null && lng != null) {
        base.location = { latitude: lat, longitude: lng };
      }
      return base;
    })();

    const body = {
      external_store_id: storeId,
      pickup: payload.pickup,
      dropoff,
      manifest: { items: payload.items },
      external_reference_id: payload.orderId,
    };

    const data = await uberFetch<QuoteResponse>(
      '/v2/deliveries/quotes',
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
      { idempotencyKey, retries: 2 },
    );

    const estimateId = data.quote_id ?? data.id;
    const feeAmount = data.total?.amount ?? data.fee?.amount ?? null;
    const feeCurrency = data.total?.currency ?? data.fee?.currency_code ?? data.currency ?? null;

    if (payload.orderId && orderExists && (estimateId || feeAmount != null)) {
      await prisma.delivery.upsert({
        where: { orderId: payload.orderId },
        update: {
          estimateId: estimateId ?? undefined,
          feeTotal: feeAmount ?? undefined,
          currency: feeCurrency ?? undefined,
        },
        create: {
          orderId: payload.orderId,
          provider: 'uber_direct',
          estimateId: estimateId ?? undefined,
          feeTotal: feeAmount ?? undefined,
          currency: feeCurrency ?? undefined,
        },
      });
    }

    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur Uber Direct';
    captureException(err, {
      tags: { handler: 'uber-quote' },
      extra: { orderId: payload.orderId },
    });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
