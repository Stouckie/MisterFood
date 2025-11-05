import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';
import { connectOnboardSchema, toValidationErrorPayload } from '@/lib/validation';
import { captureException } from '@/lib/observability';

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json().catch(() => null);
    const parsed = connectOnboardSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(toValidationErrorPayload(parsed.error), { status: 400 });
    }

    const { merchantId } = parsed.data;

    const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } });
    if (!merchant) return NextResponse.json({ error: 'Merchant introuvable' }, { status: 404 });

    let accountId = merchant.stripeAccountId;

    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'FR',
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_type: 'individual',
      });
      accountId = account.id;

      await prisma.merchant.update({
        where: { id: merchant.id },
        data: { stripeAccountId: accountId },
      });
    }

    const baseUrl = process.env.APP_URL?.replace(/\/$/, '') || '';
    const refresh_url = `${baseUrl}/admin`;
    const return_url = `${baseUrl}/admin`;

    const link = await stripe.accountLinks.create({
      account: accountId!,
      refresh_url,
      return_url,
      type: 'account_onboarding',
    });

    return NextResponse.json({ url: link.url });
  } catch (e: any) {
    captureException(e, { tags: { handler: 'connect-onboard' } });
    return NextResponse.json({ error: 'Erreur interne Stripe' }, { status: 500 });
  }
}
