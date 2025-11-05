import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const merchant = await prisma.merchant.findFirst();
  if (!merchant) return NextResponse.json({ error: 'No merchant' }, { status: 500 });

  const now = new Date();
  const categories = await prisma.menuCategory.findMany({
    where: { merchantId: merchant.id, isHidden: false },
    orderBy: { position: 'asc' },
    include: {
      items: {
        where: {
          isHidden: false,
          OR: [{ soldOutUntil: null }, { soldOutUntil: { lt: now } }],
        },
        orderBy: { position: 'asc' },
        include: {
          variants: { orderBy: { position: 'asc' } },
        },
      },
    },
  });

  return NextResponse.json({
    merchant: { id: merchant.id, name: merchant.name, slug: merchant.slug },
    categories,
  });
}
