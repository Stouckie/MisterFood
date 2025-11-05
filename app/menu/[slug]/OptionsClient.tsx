"use client";
import { useMemo, useState } from "react";
import { useCart } from "@/lib/cart";

export type NormOption = { id?: string; name: string; price?: string | null };
export type NormGroup  = { id?: string; name: string; required?: boolean; min?: number; max?: number; options: NormOption[] };

function parseLabelToValue(label?: string|null): number {
  if (!label) return 0;
  const m = String(label).replace(",", ".").match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : 0;
}

export default function OptionsClient({
  name,
  slug,
  image,
  basePrice,
  groups,
}: {
  name: string;
  slug: string;
  image?: string | null;
  basePrice: string;
  groups: NormGroup[];
}) {
  const cart = useCart();
  const base = useMemo(() => parseLabelToValue(basePrice), [basePrice]);
  const [sel, setSel] = useState<Record<number, Set<number>>>({});

  const toggle = (gi: number, oi: number, single: boolean, max?: number) => {
    setSel(prev => {
      const next = { ...prev };
      const set = new Set(next[gi] ?? new Set<number>());
      if (single || max === 1) {
        set.clear();
        set.add(oi);
      } else {
        if (set.has(oi)) set.delete(oi);
        else {
          if (typeof max === "number" && max > 0 && set.size >= max) return prev;
          set.add(oi);
        }
      }
      next[gi] = set;
      return next;
    });
  };

  const total = useMemo(() => {
    let t = base;
    for (const [giStr, set] of Object.entries(sel)) {
      const gi = Number(giStr);
      if (!Number.isFinite(gi)) continue;
      set.forEach(oi => {
        const op = groups[gi]?.options?.[oi];
        t += parseLabelToValue(op?.price ?? null);
      });
    }
    return t;
  }, [sel, groups, base]);

  const handleAdd = () => {
    const parts: string[] = [];
    Object.entries(sel).forEach(([giStr, set]) => {
      const gi = Number(giStr);
      const g = groups[gi];
      const labels = Array.from(set).map(oi => g.options[oi].name);
      if (labels.length) parts.push(`${g.name}: ${labels.join(", ")}`);
    });
    const variantName = parts.join(" • ") || "Standard";
    const variantId = variantName.toLowerCase().replace(/\s+/g, "-").slice(0, 120) || "std";
    const unitAmount = Math.round(total * 100);

    cart.add({ itemId: slug, name, variantId, variantName, unitAmount }, 1);
    // ❌ ne plus ouvrir le popover (on utilise le panier intégré à droite)
  };

  return (
    <section style={{ marginTop: "12px", display: "grid", gap: "14px" }}>
      {groups.map((g, gi) => {
        const single: boolean = g.max === 1 || (g.required === true && !g.max);
        const hint = g.required
          ? g.max === 1
            ? "(choisir 1 obligatoire)"
            : g.min
            ? `(choisir ${g.min}${g.max ? ` à ${g.max}` : "+"})`
            : "(obligatoire)"
          : g.max === 1
          ? "(choisir 0–1)"
          : g.max
          ? `(jusqu’à ${g.max})`
          : "";

        const selected = sel[gi] ?? new Set<number>();

        return (
          <div
            key={gi}
            style={{ border: "1px solid #1f2a37", borderRadius: "14px", padding: "12px 14px", background: "var(--panel)" }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginBottom: "8px" }}>
              <strong style={{ fontWeight: 700 }}>{g.name}</strong>
              <span style={{ color: "var(--muted)", fontSize: ".9rem" }}>{hint}</span>
            </div>

            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "8px" }}>
              {g.options.map((op, oi) => {
                const isActive = selected.has(oi);
                return (
                  <li key={oi}>
                    <button
                      type="button"
                      onClick={() => toggle(gi, oi, single, g.max)}
                      aria-pressed={isActive}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "12px",
                        border: "1px solid var(--border)",
                        borderRadius: "12px",
                        padding: "10px 12px",
                        background: isActive ? "rgba(14,165,233,.12)" : "var(--panel-2)",
                        cursor: "pointer",
                        color: "var(--text)",
                      }}
                    >
                      <span>{op.name}</span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        {op.price && <span style={{ fontWeight: 600 }}>{op.price}</span>}
                        <span
                          aria-hidden
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: 999,
                            border: "2px solid #415063",
                            background: isActive ? "var(--accent)" : "transparent",
                          }}
                        />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
        <strong>Total</strong>
        <strong>{total.toFixed(2)} €</strong>
      </div>
      <button
        type="button"
        onClick={handleAdd}
        style={{
          alignSelf: "end",
          border: "1px solid var(--border)",
          borderRadius: 999,
          padding: ".65rem 1rem",
          background: "var(--accent)",
          color: "white",
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        Ajouter au panier — {total.toFixed(2)} €
      </button>
    </section>
  );
}
