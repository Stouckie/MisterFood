'use client';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { postJSON } from '@/lib/fetch';

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
  clear: () => void;

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

  canCheckout: boolean;
  reason?: string;

  checkout: () => Promise<void>;
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
    setState(curr => {
      const idx = curr.lines.findIndex(x => x.key === key);
      if (idx >= 0) {
        const copy = [...curr.lines];
        copy[idx] = { ...copy[idx], quantity: copy[idx].quantity + qty };
        return { ...curr, lines: copy };
      }
      return { ...curr, lines: [...curr.lines, { key, quantity: qty, ...l }] };
    });
  };

  const setQty: CartCtx['setQty'] = (key, qty) => {
    setState(curr => ({
      ...curr,
      lines: curr.lines
        .map(l => (l.key === key ? { ...l, quantity: Math.max(0, qty) } : l))
        .filter(l => l.quantity > 0),
    }));
  };

  const remove: CartCtx['remove'] = key => setState(curr => ({ ...curr, lines: curr.lines.filter(l => l.key !== key) }));
  const clear: CartCtx['clear'] = () => setState(curr => ({ ...curr, lines: [] }));

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

  async function checkout() {
    if (!canCheckout) return;

    // payload attendu par /api/checkout/create
    const payload = {
      merchantId: config.merchantId,
      currency,
      items: state.lines.map(l => ({
        name: `${l.name} (${l.variantName})`,
        unitAmount: l.unitAmount,
        quantity: l.quantity,
      })),
      // extras non bloquants pour la route actuelle (seront stockés en metadata éventuellement)
      extras: {
        mode: state.mode,
        note: state.note || '',
        serviceFeeMinor: serviceFee || 0,
        deliveryFeeMinor: deliveryFee || 0,
        tipMinor: tipMinor || 0,
      },
    } as any;

    const { url } = await postJSON<{ url: string }>('/api/checkout/create', payload);
    location.href = url;
  }

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
