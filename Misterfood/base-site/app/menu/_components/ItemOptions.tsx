"use client";
import { useMemo, useState } from "react";

type Choice = { id?: string; label?: string; name?: string; priceDelta?: number; price?: number };
type OptionGroup = {
  id?: string; name?: string; title?: string;
  type?: "single" | "multiple"; required?: boolean;
  choices?: Choice[]; options?: Choice[]; items?: Choice[];
};
type MenuItem = {
  id?: string | number;
  name?: string;
  price?: number;
  options?: OptionGroup[];
};

function choicesOf(g: OptionGroup): Choice[] {
  return g.choices ?? g.options ?? g.items ?? [];
}

export default function ItemOptions({ item }: { item: MenuItem }) {
  const [qty, setQty] = useState(1);

  // sélection par groupe : single => string | undefined, multiple => Set<string>
  const [selected, setSelected] = useState<Record<string, Set<string> | string>>({});

  const groups = item.options ?? [];

  const base = item.price ?? 0;
  const extra = useMemo(() => {
    let sum = 0;
    for (const g of groups) {
      const key = g.id ?? g.name ?? g.title ?? "";
      const list = choicesOf(g);
      const sel = selected[key];

      if (g.type === "multiple") {
        const set = sel instanceof Set ? sel : new Set();
        for (const c of list) {
          const id = c.id ?? c.label ?? c.name ?? "";
          if (set.has(id)) sum += c.priceDelta ?? c.price ?? 0;
        }
      } else {
        const id = typeof sel === "string" ? sel : undefined;
        const choice = list.find(c => (c.id ?? c.label ?? c.name) === id);
        if (choice) sum += choice.priceDelta ?? choice.price ?? 0;
      }
    }
    return sum;
  }, [groups, selected]);

  const total = (base + extra) * qty;

  return (
    <div style={{display:"grid",gap:".9rem"}}>
      {groups.map((g, idx) => {
        const key = g.id ?? g.name ?? g.title ?? String(idx);
        const list = choicesOf(g);
        const type = g.type ?? "single";
        const required = g.required ?? false;

        return (
          <fieldset key={key} className="card" style={{padding:".75rem"}}>
            <legend style={{fontWeight:700}}>{g.name ?? g.title ?? `Option ${idx+1}`}{required ? " *" : ""}</legend>
            <div style={{display:"grid",gap:".5rem",marginTop:".5rem"}}>
              {list.map((c, i) => {
                const id = c.id ?? c.label ?? c.name ?? String(i);
                const label = c.label ?? c.name ?? id;
                const delta = c.priceDelta ?? c.price ?? 0;

                if (type === "multiple") {
                  const set = (selected[key] instanceof Set) ? (selected[key] as Set<string>) : new Set<string>();
                  const checked = set.has(id);
                  return (
                    <label key={id} style={{display:"flex",justifyContent:"space-between",gap:".5rem"}}>
                      <span>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const next = new Set(set);
                            e.target.checked ? next.add(id) : next.delete(id);
                            setSelected(s => ({...s, [key]: next}));
                          }}
                        />{" "}
                        {label}
                      </span>
                      {delta ? <span className="price">+{delta.toFixed(2)} €</span> : null}
                    </label>
                  );
                }

                const current = typeof selected[key] === "string" ? (selected[key] as string) : "";
                return (
                  <label key={id} style={{display:"flex",justifyContent:"space-between",gap:".5rem"}}>
                    <span>
                      <input
                        type="radio" name={key} value={id}
                        checked={current === id}
                        onChange={() => setSelected(s => ({...s, [key]: id}))}
                        required={required}
                      />{" "}
                      {label}
                    </span>
                    {delta ? <span className="price">+{delta.toFixed(2)} €</span> : null}
                  </label>
                );
              })}
            </div>
          </fieldset>
        );
      })}

      {/* quantité + total */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:".75rem"}}>
        <div>
          <label style={{fontWeight:600,marginRight:".5rem"}}>Qté</label>
          <input
            type="number" min={1} value={qty}
            onChange={(e)=>setQty(Math.max(1, Number(e.target.value)||1))}
            style={{width:"70px",padding:".35rem .5rem",border:"1px solid var(--card-border)",borderRadius:"8px",background:"var(--card)"}}
          />
        </div>
        <strong className="price" aria-live="polite">{total.toFixed(2)} €</strong>
      </div>

      {/* bouton d’action (à brancher plus tard au panier) */}
      <button
        className="cta"
        onClick={()=>{
          // Ici tu branches vers ton panier (API route / server action).
          console.log("ADD_TO_CART", { item, selected, qty, total });
          alert("Article ajouté (démo). Regarde la console !");
        }}
      >
        Ajouter au panier
      </button>
    </div>
  );
}
