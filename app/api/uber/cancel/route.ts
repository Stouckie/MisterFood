import { NextRequest, NextResponse } from 'next/server';
import { z, ValidationError } from 'zod';
import { uberFetch } from '@/lib/uber';
import { computeUberIdempotencyKey } from '@/lib/delivery-rules';
import { prisma } from '@/lib/prisma';
import { captureException } from '@/lib/observability';

const Body = z.object({
  deliveryId: z.string().min(1),
  reason: z.string().min(1).optional(),
});

type CancelResponse = {
  id?: string;
  status?: string;
  delivery_id?: string;
};

export async function POST(req: NextRequest) {
  let payload: z.infer<typeof Body>;
  try {
    payload = Body.parse(await req.json());
  } catch (err) {
    const message = err instanceof ValidationError ? err.message : 'Payload invalide';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const reason = payload.reason ?? 'merchant_canceled';
    const idempotencyKey = computeUberIdempotencyKey('uber-cancel', {
      deliveryId: payload.deliveryId,
      reason,
    });

    const data = await uberFetch<CancelResponse | undefined>(
      `/v2/deliveries/${encodeURIComponent(payload.deliveryId)}/cancel`,
      {
        method: 'POST',
        body: JSON.stringify({ reason }),
      },
      { idempotencyKey, retries: 1 },
    );

    const deliveryId = data?.id ?? data?.delivery_id ?? payload.deliveryId;
    const status = data?.status ?? 'canceled';

    const updated = await prisma.delivery.updateMany({
      where: { deliveryId },
      data: { status },
    });

    if (updated > 0) {
      const record = await prisma.delivery.findFirst({ where: { deliveryId }, select: { orderId: true } });
      if (record?.orderId) {
        await prisma.order
          .update({ where: { id: record.orderId }, data: { status: status === 'failed' ? 'FAILED' : 'CANCELED' } })
          .catch(() => undefined);
      }
    }

    return NextResponse.json(data ?? { deliveryId, status: 'canceled' }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur Uber Direct';
    captureException(err, {
      tags: { handler: 'uber-cancel' },
      extra: { deliveryId: payload.deliveryId },
    });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
