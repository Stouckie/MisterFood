"use client";
import { useEffect, useMemo, useState } from "react";
import { useCart } from "@/lib/cart";
import { trackViewItem } from "@/lib/analytics";

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
  slug: string;                // utilisé comme itemId pour le panier
  image?: string | null;
  basePrice: string;           // ex: "8.90 €"
  groups: NormGroup[];
}) {
  const { add, currency: cartCurrency } = useCart();
  const base = useMemo(() => parseLabelToValue(basePrice), [basePrice]);
  const [sel, setSel] = useState<Record<number, Set<number>>>({});

  useEffect(() => {
    const unitAmount = Math.max(0, Math.round(base * 100));
    trackViewItem(
      {
        itemId: slug,
        name,
        variantId: 'std',
        variantName: 'Standard',
        unitAmount,
        quantity: 1,
      },
      cartCurrency || 'eur'
    );
  }, [slug, name, base, cartCurrency]);

  const toggle = (gi: number, oi: number, single: boolean, max?: number) => {
    setSel(prev => {
      const next = { ...prev };
      const set = new Set(next[gi] ?? []);

      if (single || max === 1) {
        set.clear();
        set.add(oi);
      } else {
        if (set.has(oi)) {
          set.delete(oi);
        } else {
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
    groups.forEach((g, gi) => {
      const set = sel[gi];
      if (!set) return;
      set.forEach(oi => { t += parseLabelToValue(g.options[oi]?.price ?? null); });
    });
    return t;
  }, [sel, groups, base]);

  const handleAdd = () => {
    // Construire un variantName lisible: "Boisson: Coca • Sauce: Algérienne"
    const parts: string[] = [];
    Object.entries(sel).forEach(([gi, indices]) => {
      const g = groups[Number(gi)];
      const labels = Array.from(indices).map(oi => g.options[oi].name);
      if (labels.length) parts.push(`${g.name}: ${labels.join(", ")}`);
    });
    const variantName = parts.join(" • ") || "Standard";
    const variantId = variantName.toLowerCase().replace(/\s+/g, "-").slice(0, 120) || "std";

    const unitAmount = Math.round(total * 100); // en centimes

    add(
      {
        itemId: slug,
        name,
        variantId,
        variantName,
        unitAmount,
        // (l’API de ton Cart lib gère quantité à part, on passe quantity=1 dans le 2e param)
      },
      1
    );
  };

  return (
    <section style={{marginTop:'12px', display:'grid', gap:'14px'}}>
      {groups.map((g, gi) => {
        const single: boolean = g.max === 1 || (g.required === true && !g.max);

        const hint =
          g.required ? (g.max === 1 ? "(choisir 1 obligatoire)" :
                        g.min ? `(choisir ${g.min}${g.max ? ` à ${g.max}` : "+"})` :
                        "(obligatoire)")
                     : (g.max === 1 ? "(choisir 0–1)" :
                        g.max ? `(jusqu’à ${g.max})` : "");

        const selected = sel[gi] ?? new Set<number>();

        return (
          <div key={gi} style={{border:'1px solid #e5e7eb', borderRadius:'14px', padding:'12px 14px', background:'#fff'}}>
            <div style={{display:'flex', alignItems:'baseline', gap:'8px', marginBottom:'8px'}}>
              <strong style={{fontWeight:700}}>{g.name}</strong>
              <span style={{color:'#6b7280', fontSize:'.9rem'}}>{hint}</span>
            </div>

            <ul style={{listStyle:'none', padding:0, margin:0, display:'grid', gap:'8px'}}>
              {g.options.map((op, oi) => {
                const isActive = selected.has(oi);
                return (
                  <li key={oi}>
                    <button
                      type="button"
                      onClick={() => toggle(gi, oi, single, g.max)}
                      aria-pressed={isActive}
                      style={{
                        width:'100%',
                        display:'flex', alignItems:'center', justifyContent:'space-between', gap:'12px',
                        border:'1px solid #e5e7eb',
                        borderRadius:'12px', padding:'10px 12px',
                        background: isActive ? 'rgba(14,165,233,.08)' : '#fafafa',
                        cursor:'pointer'
                      }}
                    >
                      <span>{op.name}</span>
                      <span style={{display:'inline-flex', alignItems:'center', gap:8}}>
                        {op.price && <span style={{fontWeight:600}}>{op.price}</span>}
                        <span aria-hidden style={{
                          width:18, height:18, borderRadius:999,
                          border:'2px solid #d1d5db',
                          background: isActive ? '#0ea5e9' : 'transparent'
                        }}/>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}

      {/* Footer: total + bouton panier */}
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:8}}>
        <strong>Total</strong>
        <strong>{total.toFixed(2)} €</strong>
      </div>

      <button
        type="button"
        onClick={handleAdd}
        style={{
          alignSelf:'end',
          border:'1px solid #e5e7eb', borderRadius:999,
          padding:'.65rem 1rem', background:'#0ea5e9', color:'white',
          fontWeight:700, cursor:'pointer'
        }}
      >
        Ajouter au panier — {total.toFixed(2)} €
      </button>
    </section>
  );
}
