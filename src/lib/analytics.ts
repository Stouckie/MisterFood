'use client';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: any[]) => void;
  }
}

type BaseLine = {
  itemId: string;
  name: string;
  variantId: string;
  variantName: string;
  unitAmount: number;
  quantity: number;
};

type Totals = {
  valueMinor: number;
  currency: string;
  shippingMinor?: number;
  taxMinor?: number;
  tipMinor?: number;
};

function toCurrency(currency: string | undefined) {
  return (currency || 'eur').toUpperCase();
}

function toPrice(amountMinor: number) {
  return Math.round(amountMinor) / 100;
}

function mapLine(line: BaseLine) {
  return {
    item_id: `${line.itemId}:${line.variantId}`,
    item_name: line.name,
    item_variant: line.variantName,
    price: toPrice(line.unitAmount),
    quantity: line.quantity,
  };
}

function emit(eventName: string, payload: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  if (typeof window.gtag === 'function') {
    window.gtag('event', eventName, payload);
  } else {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: eventName, ...payload });
  }
}

export function trackViewItem(line: BaseLine, currency: string) {
  emit('view_item', {
    currency: toCurrency(currency),
    value: toPrice(line.unitAmount * line.quantity),
    items: [mapLine(line)],
  });
}

export function trackAddToCart(line: BaseLine, currency: string) {
  emit('add_to_cart', {
    currency: toCurrency(currency),
    value: toPrice(line.unitAmount * line.quantity),
    items: [mapLine(line)],
  });
}

export function trackRemoveFromCart(line: BaseLine, currency: string) {
  emit('remove_from_cart', {
    currency: toCurrency(currency),
    value: toPrice(line.unitAmount * line.quantity),
    items: [mapLine(line)],
  });
}

export function trackBeginCheckout(lines: BaseLine[], totals: Totals) {
  const items = lines.map(mapLine);
  emit('begin_checkout', {
    currency: toCurrency(totals.currency),
    value: toPrice(totals.valueMinor),
    shipping: totals.shippingMinor != null ? toPrice(totals.shippingMinor) : undefined,
    tax: totals.taxMinor != null ? toPrice(totals.taxMinor) : undefined,
    tip: totals.tipMinor != null ? toPrice(totals.tipMinor) : undefined,
    items,
  });
}

export function trackPurchase(orderId: string | undefined, lines: BaseLine[], totals: Totals) {
  const items = lines.map(mapLine);
  emit('purchase', {
    transaction_id: orderId || `order-${Date.now()}`,
    currency: toCurrency(totals.currency),
    value: toPrice(totals.valueMinor),
    shipping: totals.shippingMinor != null ? toPrice(totals.shippingMinor) : undefined,
    tax: totals.taxMinor != null ? toPrice(totals.taxMinor) : undefined,
    tip: totals.tipMinor != null ? toPrice(totals.tipMinor) : undefined,
    items,
  });
}
