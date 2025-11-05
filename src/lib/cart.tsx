'use client';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { postJSON } from '@/lib/fetch';
import { trackAddToCart, trackBeginCheckout, trackRemoveFromCart } from '@/lib/analytics';

export type CartMode = 'pickup' | 'delivery';

export type CartLine = {
  key: string;            // unique, ex: itemId-variantId
  itemId: string;
  name: string;
  variantId: string;
  variantName: string;
  unitAmount: number;     // cents
  quantity: number;
};

type AnalyticsShape = {
  itemId: string;
  name: string;
  variantId: string;
  variantName: string;
  unitAmount: number;
};

function toAnalyticsLine(line: AnalyticsShape, quantity: number) {
  return {
    itemId: line.itemId,
    name: line.name,
    variantId: line.variantId,
    variantName: line.variantName,
    unitAmount: line.unitAmount,
    quantity,
  };
}

export type CheckoutResult = {
  clientSecret: string;
  orderId: string;
  amount: number;
  currency: string;
};

export type CheckoutOptions = {
  customerEmail?: string;
};

export type CartConfig = {
  merchantId: string;
  currency?: string;              // 'eur' par défaut
  minOrderMinor?: number;         // minimum de commande (cents) ex: 1000 = 10 €
  serviceFeeMinor?: number;       // frais fixes (cents) ex: 50 = 0,50 €
  deliveryFeeMinor?: number;      // frais livraison (cents)
  tipOptions?: number[];          // options de pourboire (%) ex: [0,5,10]
  allowDelivery?: boolean;        // activer le mode livraison
};

type CartState = {
  lines: CartLine[];
  mode: CartMode;
  tipPct: number;                 // 0, 5, 10...
  customTipMinor: number | null;  // remplace tipPct si défini
  note?: string;                  // optionnel (ex: instructions)
};

type CartCtx = {
  lines: CartLine[];
  add: (l: Omit<CartLine, 'key' | 'quantity'>, qty?: number) => void;
  setQty: (key: string, qty: number) => void;
  remove: (key: string) => void;
  clear: (options?: { silent?: boolean }) => void;

  mode: CartMode;
  setMode: (m: CartMode) => void;

  tipPct: number;
  setTipPct: (pct: number) => void;
  customTipMinor: number | null;
  setCustomTipMinor: (minor: number | null) => void;

  note?: string;
  setNote: (s: string) => void;

  subtotal: number;
  serviceFee: number;
  deliveryFee: number;
  tipMinor: number;
  total: number;

  currency: string;

  canCheckout: boolean;
  reason?: string;

  checkout: (opts?: CheckoutOptions) => Promise<CheckoutResult>;
};

const CartContext = createContext<CartCtx | null>(null);

function fmt(cents: number, currency: string) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100);
}

export function CartProvider({
  children,
  config,
}: {
  children: React.ReactNode;
  config: CartConfig;
}) {
  const currency = (config.currency || 'eur').toLowerCase();
  const storageKey = `snack_cart_${config.merchantId}`;

  const [state, setState] = useState<CartState>({
    lines: [],
    mode: config.allowDelivery ? 'pickup' : 'pickup',
    tipPct: 0,
    customTipMinor: null,
    note: '',
  });

  // load/save localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        // sécurité minimale
        setState({
          lines: Array.isArray(parsed.lines) ? parsed.lines : [],
          mode: parsed.mode === 'delivery' && config.allowDelivery ? 'delivery' : 'pickup',
          tipPct: Number.isFinite(parsed.tipPct) ? parsed.tipPct : 0,
          customTipMinor: Number.isFinite(parsed.customTipMinor) ? parsed.customTipMinor : null,
          note: typeof parsed.note === 'string' ? parsed.note : '',
        });
      }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {}
  }, [state, storageKey]);

  // line ops
  const add: CartCtx['add'] = (l, qty = 1) => {
    const key = `${l.itemId}-${l.variantId}`;
    const quantity = Math.max(1, qty);
    setState(curr => {
      const idx = curr.lines.findIndex(x => x.key === key);
      if (idx >= 0) {
        const copy = [...curr.lines];
        copy[idx] = { ...copy[idx], quantity: copy[idx].quantity + quantity };
        return { ...curr, lines: copy };
      }
      return { ...curr, lines: [...curr.lines, { key, quantity, ...l }] };
    });
    trackAddToCart(
      toAnalyticsLine(
        {
          itemId: l.itemId,
          name: l.name,
          variantId: l.variantId,
          variantName: l.variantName,
          unitAmount: l.unitAmount,
        },
        quantity
      ),
      currency
    );
  };

  const setQty: CartCtx['setQty'] = (key, qty) => {
    let analytics: { type: 'add' | 'remove'; line: CartLine; delta: number } | null = null;
    setState(curr => {
      const idx = curr.lines.findIndex(l => l.key === key);
      if (idx === -1) return curr;
      const target = curr.lines[idx];
      const nextQty = Math.max(0, qty);
      if (nextQty === target.quantity) {
        return curr;
      }

      const delta = nextQty - target.quantity;
      if (delta > 0) {
        analytics = { type: 'add', line: target, delta };
      } else if (delta < 0) {
        analytics = { type: 'remove', line: target, delta: Math.abs(delta) };
      }

      const lines = nextQty > 0
        ? curr.lines.map(l => (l.key === key ? { ...l, quantity: nextQty } : l))
        : curr.lines.filter(l => l.key !== key);

      return { ...curr, lines };
    });

    if (analytics) {
      const payload = toAnalyticsLine(analytics.line, analytics.delta);
      if (analytics.type === 'add') {
        trackAddToCart(payload, currency);
      } else {
        trackRemoveFromCart(payload, currency);
      }
    }
  };

  const remove: CartCtx['remove'] = key => {
    let removed: CartLine | null = null;
    setState(curr => {
      const target = curr.lines.find(l => l.key === key);
      if (!target) return curr;
      removed = target;
      return { ...curr, lines: curr.lines.filter(l => l.key !== key) };
    });

    if (removed) {
      trackRemoveFromCart(
        toAnalyticsLine(
          {
            itemId: removed.itemId,
            name: removed.name,
            variantId: removed.variantId,
            variantName: removed.variantName,
            unitAmount: removed.unitAmount,
          },
          removed.quantity
        ),
        currency
      );
    }
  };

  const clear: CartCtx['clear'] = (options) => {
    let snapshot: CartLine[] = [];
    setState(curr => {
      if (!curr.lines.length) return curr;
      snapshot = curr.lines;
      return { ...curr, lines: [] };
    });

    if (!options?.silent && snapshot.length) {
      snapshot.forEach(line => {
        trackRemoveFromCart(
          toAnalyticsLine(
            {
              itemId: line.itemId,
              name: line.name,
              variantId: line.variantId,
              variantName: line.variantName,
              unitAmount: line.unitAmount,
            },
            line.quantity
          ),
          currency
        );
      });
    }
  };

  const setMode = (m: CartMode) => setState(curr => ({ ...curr, mode: m }));
  const setTipPct = (pct: number) => setState(curr => ({ ...curr, tipPct: Math.max(0, pct), customTipMinor: null }));
  const setCustomTipMinor = (minor: number | null) => setState(curr => ({ ...curr, customTipMinor: minor, tipPct: 0 }));
  const setNote = (s: string) => setState(curr => ({ ...curr, note: s.slice(0, 500) }));

  // totals
  const { subtotal, serviceFee, deliveryFee, tipMinor, total } = useMemo(() => {
    const subtotal = state.lines.reduce((s, l) => s + l.unitAmount * l.quantity, 0);
    const serviceFee = Math.max(0, config.serviceFeeMinor || 0);
    const deliveryFee = state.mode === 'delivery' ? Math.max(0, config.deliveryFeeMinor || 0) : 0;
    const tipMinor =
      state.customTipMinor != null
        ? Math.max(0, state.customTipMinor)
        : Math.round((subtotal * Math.max(0, state.tipPct)) / 100);
    const total = subtotal + serviceFee + deliveryFee + tipMinor;
    return { subtotal, serviceFee, deliveryFee, tipMinor, total };
  }, [state.lines, state.mode, state.tipPct, state.customTipMinor, config.serviceFeeMinor, config.deliveryFeeMinor]);

  // rules
  const min = Math.max(0, config.minOrderMinor || 0);
  const canCheckout = state.lines.length > 0 && subtotal >= min;
  const reason = !state.lines.length ? 'Panier vide' : subtotal < min ? `Minimum ${fmt(min, currency)}` : undefined;

  const checkout: CartCtx['checkout'] = async (opts) => {
    if (!canCheckout) {
      throw new Error(reason || 'Panier invalide');
    }

    const extras: Record<string, unknown> = {
      mode: state.mode,
      serviceFeeMinor: serviceFee || 0,
      deliveryFeeMinor: deliveryFee || 0,
      tipMinor: tipMinor || 0,
    };

    const note = state.note?.trim();
    if (note) {
      extras.note = note;
    }

    const payload = {
      merchantId: config.merchantId,
      currency,
      items: state.lines.map(l => ({
        name: `${l.name} (${l.variantName})`,
        unitAmount: l.unitAmount,
        quantity: l.quantity,
      })),
      extras,
      customerEmail: opts?.customerEmail,
    };

    trackBeginCheckout(
      state.lines.map(l => ({
        itemId: l.itemId,
        name: l.name,
        variantId: l.variantId,
        variantName: l.variantName,
        unitAmount: l.unitAmount,
        quantity: l.quantity,
      })),
      {
        valueMinor: total,
        currency,
        shippingMinor: deliveryFee,
        taxMinor: serviceFee,
        tipMinor: tipMinor || undefined,
      }
    );

    return postJSON<CheckoutResult>('/api/checkout/create', payload);
  };

  const ctx: CartCtx = {
    lines: state.lines,
    add,
    setQty,
    remove,
    clear,
    mode: state.mode,
    setMode,
    tipPct: state.tipPct,
    setTipPct,
    customTipMinor: state.customTipMinor,
    setCustomTipMinor,
    note: state.note,
    setNote,
    subtotal,
    serviceFee,
    deliveryFee,
    tipMinor,
    total,
    canCheckout,
    currency,
    reason,
    checkout,
  };

  return <CartContext.Provider value={ctx}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>');
  return ctx;
}
