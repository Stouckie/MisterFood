"use client";

import { useMemo, useState } from "react";
import { useCart } from "@/lib/cart";

type Line = {
  id?: string;
  itemId?: string;
  name: string;
  variantId?: string;
  variantName?: string;
  unitAmount: number; // en centimes
  qty?: number;       // certains stores
  quantity?: number;  // d'autres
};

function centsToEUR(v = 0) {
  return (v / 100).toFixed(2) + " €";
}

export default function CartEmbed({
  currency = "eur",
  allowDelivery = false,
  tipOptions = [0, 5, 10],
}: {
  currency?: "eur" | string;
  allowDelivery?: boolean;
  tipOptions?: number[];
}) {
  const cart: any = useCart();

  const lines: Line[] = cart?.lines ?? cart?.items ?? [];
  const note: string = cart?.note ?? "";

  const subtotalMinor = useMemo(
    () =>
      (lines || []).reduce(
        (acc, l) => acc + (l.unitAmount || 0) * (l.qty ?? l.quantity ?? 1),
        0
      ),
    [lines]
  );

  const serviceFeeMinor = cart?.serviceFeeMinor ?? 0;
  const deliveryFeeMinor =
    allowDelivery && cart?.deliveryFeeMinor ? cart.deliveryFeeMinor : 0;

  const tipMinor =
    cart?.tipMinor ??
    (typeof cart?.getTipMinor === "function" ? cart.getTipMinor() : 0);

  const totalMinor =
    cart?.totalMinor ??
    (typeof cart?.getTotalMinor === "function"
      ? cart.getTotalMinor()
      : subtotalMinor + serviceFeeMinor + deliveryFeeMinor + tipMinor);

  const setQty = (line: Line, q: number) => {
    if (typeof cart?.setQty === "function") cart.setQty(line, q);
  };
  const remove = (line: Line) => {
    if (typeof cart?.remove === "function") cart.remove(line);
  };
  const clear = () => {
    if (typeof cart?.clear === "function") cart.clear();
  };
  const setNote = (v: string) => {
    if (typeof cart?.setNote === "function") cart.setNote(v);
  };
  const setTipPercent = (p?: number) => {
    if (typeof cart?.setTipPercent === "function") cart.setTipPercent(p ?? 0);
  };
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkout = async () => {
    if (isSubmitting) return;
    if (typeof cart?.checkout !== "function" || !lines?.length) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const { clientSecret, orderId, amount, currency: checkoutCurrency } = await cart.checkout();
      const params = new URLSearchParams({
        client_secret: clientSecret,
        order_id: orderId,
        amount: String(amount),
        currency: (checkoutCurrency || currency || "eur").toLowerCase(),
      });
      window.location.href = `/checkout/pay?${params.toString()}`;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Impossible de démarrer le paiement";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="block"
      style={{
        width: "100%",
        position: "relative",
      }}
    >
      <h2 className="section-title" style={{ marginTop: 0 }}>
        Panier
      </h2>

      {/* Lignes */}
      {lines?.length ? (
        <div style={{ display: "grid", gap: 10, marginBottom: 12 }}>
          {lines.map((l, idx) => {
            const q = l.qty ?? l.quantity ?? 1;
            const lineTotal = (l.unitAmount || 0) * q;
            return (
              <div
                key={(l.id || l.variantId || l.itemId || idx) + ":" + idx}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: 8,
                  alignItems: "center",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: "10px 12px",
                  background: "var(--panel-2)",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, lineHeight: 1.2 }}>
                    {l.name}
                  </div>
                  {l.variantName && (
                    <div style={{ color: "var(--muted)", fontSize: ".9rem" }}>
                      {l.variantName}
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button
                    className="btn"
                    onClick={() => setQty(l, Math.max(1, q - 1))}
                    aria-label="Diminuer"
                  >
                    −
                  </button>
                  <div style={{ minWidth: 28, textAlign: "center" }}>{q}</div>
                  <button
                    className="btn"
                    onClick={() => setQty(l, q + 1)}
                    aria-label="Augmenter"
                  >
                    +
                  </button>
                  <div style={{ width: 72, textAlign: "right", fontWeight: 700 }}>
                    {centsToEUR(lineTotal)}
                  </div>
                  <button className="btn" onClick={() => remove(l)}>
                    Retirer
                  </button>
                </div>
              </div>
            );
          })}
          <button className="btn" onClick={clear}>
            Vider le panier
          </button>
        </div>
      ) : (
        <p style={{ color: "var(--muted)", marginTop: 4 }}>
          Votre panier est vide.
        </p>
      )}

      {/* Pourboire */}
      <div style={{ marginTop: 8 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Pourboire</div>
        <div style={{ display: "flex", gap: 8 }}>
          {tipOptions.map((p) => (
            <button key={p} className="btn" onClick={() => setTipPercent(p)}>
              {p}%
            </button>
          ))}
          <button className="btn" onClick={() => setTipPercent(0)}>
            0%
          </button>
        </div>
      </div>

      {/* Note */}
      <div style={{ marginTop: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Note</div>
        <textarea
          rows={3}
          placeholder="Allergies, instructions..."
          value={note}
          onChange={(e) => setNote(e.target.value)}
          style={{
            width: "100%",
            resize: "vertical",
            borderRadius: 12,
            border: "1px solid var(--border)",
            background: "var(--panel-2)",
            color: "var(--text)",
            padding: "10px 12px",
          }}
        />
      </div>

      {/* Totaux */}
      <div style={{ marginTop: 12, display: "grid", gap: 6 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            color: "var(--muted)",
          }}
        >
          <span>Sous-total</span>
          <span>{centsToEUR(subtotalMinor)}</span>
        </div>
        {serviceFeeMinor ? (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              color: "var(--muted)",
            }}
          >
            <span>Frais</span>
            <span>{centsToEUR(serviceFeeMinor)}</span>
          </div>
        ) : null}
        {deliveryFeeMinor ? (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              color: "var(--muted)",
            }}
          >
            <span>Livraison</span>
            <span>{centsToEUR(deliveryFeeMinor)}</span>
          </div>
        ) : null}
        {tipMinor ? (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              color: "var(--muted)",
            }}
          >
            <span>Pourboire</span>
            <span>{centsToEUR(tipMinor)}</span>
          </div>
        ) : null}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontWeight: 900,
            marginTop: 4,
          }}
        >
          <span>Total</span>
          <span>{centsToEUR(totalMinor)}</span>
        </div>
      </div>

      <button
        className="btn btn-primary"
        style={{ width: "100%", marginTop: 12 }}
        onClick={checkout}
        disabled={!lines?.length || isSubmitting}
        aria-busy={isSubmitting}
      >
        {isSubmitting ? "Paiement en cours..." : lines?.length ? "Payer" : "Panier vide"}
      </button>
      {error && (
        <p role="alert" style={{ color: "#b00020", marginTop: 8 }}>
          {error}
        </p>
      )}
    </div>
  );
}
