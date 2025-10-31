import { NextRequest, NextResponse } from 'next/server';
import { z, ValidationError } from 'zod';
import { uberFetch, requireUberStoreId } from '@/lib/uber';
import { prisma } from '@/lib/prisma';
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
    let orderExists = true;
    if (payload.orderId) {
      orderExists = !!(await prisma.order.findUnique({ where: { id: payload.orderId } }));
    }

    const body = {
      external_store_id: storeId,
      pickup: payload.pickup,
      dropoff: payload.dropoff,
      manifest: { items: payload.items },
      external_reference_id: payload.orderId,
    };

    const data = await uberFetch<QuoteResponse>('/v2/deliveries/quotes', {
      method: 'POST',
      body: JSON.stringify(body),
    });

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
