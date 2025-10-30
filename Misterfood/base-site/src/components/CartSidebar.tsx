'use client';
import { useState } from 'react';
import { useCart } from '@/lib/cart';

function Money({ cents, currency = 'eur' }: { cents: number; currency?: string }) {
  return <>{(cents / 100).toFixed(2).replace('.', ',')} €</>;
}

export default function CartSidebar({
  currency = 'eur',
  tipOptions = [0, 5, 10],
  allowDelivery = false,
}: {
  currency?: string;
  tipOptions?: number[];
  allowDelivery?: boolean;
}) {
  const {
    lines, setQty, remove, clear,
    subtotal, serviceFee, deliveryFee, tipMinor, total,
    mode, setMode,
    tipPct, setTipPct, customTipMinor, setCustomTipMinor,
    note, setNote,
    canCheckout, reason, checkout,
    currency: cartCurrency,
  } = useCart();

  const [customTipStr, setCustomTipStr] = useState(
    customTipMinor != null ? (customTipMinor / 100).toFixed(2).replace('.', ',') : ''
  );
  const moneyCurrency = cartCurrency || currency;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCheckout() {
    if (!canCheckout || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const { clientSecret, orderId, amount, currency: checkoutCurrency } = await checkout();
      const params = new URLSearchParams({
        client_secret: clientSecret,
        order_id: orderId,
        amount: String(amount),
        currency: (checkoutCurrency || cartCurrency || currency).toLowerCase(),
      });
      window.location.href = `/checkout/pay?${params.toString()}`;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Impossible de démarrer le paiement';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <aside style={{ position: 'sticky', top: 24, alignSelf: 'start' }}>
      <div style={{ border: '1px solid #ddd', borderRadius: 12, padding: 16, background: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>Panier</h2>
          {lines.length > 0 && (
            <button onClick={clear} style={{ fontSize: 12, opacity: 0.7 }}>Vider</button>
          )}
        </div>

        {allowDelivery && (
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <button
              onClick={() => setMode('pickup')}
              style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #ccc', background: mode === 'pickup' ? '#f3f3f3' : '#fff' }}
            >
              À emporter
            </button>
            <button
              onClick={() => setMode('delivery')}
              style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #ccc', background: mode === 'delivery' ? '#f3f3f3' : '#fff' }}
            >
              Livraison
            </button>
          </div>
        )}

        <div style={{ marginTop: 12 }}>
          {lines.length === 0 && <p>Votre panier est vide.</p>}
          {lines.map(l => (
            <div key={l.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '8px 0', borderTop: '1px dashed #eee' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.name}</div>
                <div style={{ fontSize: 12, color: '#666' }}>{l.variantName}</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
                  <button onClick={() => setQty(l.key, l.quantity - 1)}>-</button>
                  <span>{l.quantity}</span>
                  <button onClick={() => setQty(l.key, l.quantity + 1)}>+</button>
                  <button onClick={() => remove(l.key)} style={{ marginLeft: 8 }}>Suppr</button>
                </div>
              </div>
              <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                <Money cents={l.unitAmount * l.quantity} currency={currency} />
              </div>
            </div>
          ))}
        </div>

        {/* Pourboire */}
        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Pourboire</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {tipOptions.map(p => (
              <button
                key={p}
                onClick={() => { setCustomTipMinor(null); setTipPct(p); setCustomTipStr(''); }}
                style={{
                  padding: '6px 10px', borderRadius: 8, border: '1px solid #ccc',
                  background: (p === tipPct && customTipMinor == null) ? '#f3f3f3' : '#fff'
                }}
              >
                {p}%
              </button>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                placeholder="Montant €"
                value={customTipStr}
                onChange={(e) => {
                  const raw = e.target.value.replace(',', '.');
                  setCustomTipStr(e.target.value);
                  const n = Number(raw);
                  if (!isNaN(n)) setCustomTipMinor(Math.round(n * 100));
                }}
                style={{ width: 90, padding: '6px 8px', border: '1px solid #ccc', borderRadius: 8 }}
              />
              {customTipMinor != null && <button onClick={() => { setCustomTipMinor(null); setCustomTipStr(''); }}>✕</button>}
            </div>
          </div>
        </div>

        {/* Note */}
        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Note</div>
          <textarea
            placeholder="Allergies, instructions..."
            value={note || ''}
            onChange={(e) => setNote(e.target.value)}
            style={{ width: '100%', minHeight: 60, border: '1px solid #ccc', borderRadius: 8, padding: 8 }}
          />
        </div>

        {/* Totaux */}
        <div style={{ marginTop: 12, borderTop: '1px solid #eee', paddingTop: 12 }}>
          <Row label="Sous-total"><Money cents={subtotal} currency={moneyCurrency} /></Row>
          {serviceFee > 0 && <Row label="Frais"><Money cents={serviceFee} currency={moneyCurrency} /></Row>}
          {deliveryFee > 0 && <Row label="Livraison"><Money cents={deliveryFee} currency={moneyCurrency} /></Row>}
          {tipMinor > 0 && <Row label="Pourboire"><Money cents={tipMinor} currency={moneyCurrency} /></Row>}
          <Row label={<b>Total</b>} bold>
            <b><Money cents={total} currency={moneyCurrency} /></b>
          </Row>
        </div>

        <button
          onClick={handleCheckout}
          disabled={!canCheckout || isSubmitting}
          style={{
            marginTop: 12, width: '100%', padding: '10px 14px', borderRadius: 10,
            background: canCheckout && !isSubmitting ? 'black' : '#bbb', color: 'white', border: 'none', cursor: canCheckout && !isSubmitting ? 'pointer' : 'not-allowed'
          }}
          title={reason || ''}
          aria-busy={isSubmitting}
        >
          {isSubmitting ? 'Paiement en cours...' : reason ? reason : 'Commander'}
        </button>
        {error && (
          <p role="alert" style={{ color: '#b00020', marginTop: 8 }}>
            {error}
          </p>
        )}
      </div>
    </aside>
  );
}

function Row({ label, children, bold }: { label: React.ReactNode; children: React.ReactNode; bold?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontWeight: bold ? 700 : 400 }}>
      <span style={{ color: '#444' }}>{label}</span>
      <span>{children}</span>
    </div>
  );
}
