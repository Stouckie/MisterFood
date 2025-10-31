import { NextRequest, NextResponse } from 'next/server';
import { z, ValidationError } from 'zod';
import { uberFetch } from '@/lib/uber';
import { prisma } from '@/lib/prisma';
import { captureException } from '@/lib/observability';

const Query = z.object({
  deliveryId: z.string().min(1),
});

type DeliveryResponse = {
  id?: string;
  status?: string;
  tracking_url?: string;
  tracking?: { url?: string };
  fee?: { amount: number; currency_code: string };
  total?: { amount: number; currency: string };
  currency?: string;
};

export async function GET(req: NextRequest) {
  const params = Object.fromEntries(req.nextUrl.searchParams.entries());

  let query: z.infer<typeof Query>;
  try {
    query = Query.parse(params);
  } catch (err) {
    const message = err instanceof ValidationError ? err.message : 'Paramètres invalides';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const data = await uberFetch<DeliveryResponse>(`/v2/deliveries/${encodeURIComponent(query.deliveryId)}`);

    const trackingUrl = data.tracking_url ?? data.tracking?.url;
    const feeAmount = data.total?.amount ?? data.fee?.amount ?? null;
    const feeCurrency = data.total?.currency ?? data.fee?.currency_code ?? data.currency ?? undefined;

    await prisma.delivery.updateMany({
      where: { deliveryId: query.deliveryId },
      data: {
        status: data.status ?? undefined,
        trackingUrl: trackingUrl ?? undefined,
        feeTotal: feeAmount ?? undefined,
        currency: feeCurrency ?? undefined,
      },
    });

    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur Uber Direct';
    captureException(err, {
      tags: { handler: 'uber-status' },
      extra: { deliveryId: query.deliveryId },
    });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
