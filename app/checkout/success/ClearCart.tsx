'use client';

import { useEffect, useRef } from 'react';
import { useCart } from '@/lib/cart';
import { trackPurchase } from '@/lib/analytics';

type Props = {
  orderId?: string;
  amountMinor?: number;
  currency?: string;
};

export default function ClearCart({ orderId, amountMinor, currency }: Props) {
  const { clear, lines, total, currency: cartCurrency, deliveryFee, serviceFee, tipMinor } = useCart();
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    const snapshot = lines.map(line => ({
      itemId: line.itemId,
      name: line.name,
      variantId: line.variantId,
      variantName: line.variantName,
      unitAmount: line.unitAmount,
      quantity: line.quantity,
    }));
    const valueMinor = typeof amountMinor === 'number' ? amountMinor : total;
    const currencyCode = currency || cartCurrency || 'eur';
    trackPurchase(orderId, snapshot, {
      valueMinor,
      currency: currencyCode,
      shippingMinor: deliveryFee,
      taxMinor: serviceFee,
      tipMinor: tipMinor || undefined,
    });
    clear({ silent: true });
  }, [amountMinor, cartCurrency, clear, currency, deliveryFee, lines, orderId, serviceFee, tipMinor, total]);

  return null;
}
