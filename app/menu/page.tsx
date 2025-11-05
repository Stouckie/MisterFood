import fs from "fs/promises";
import path from "path";
import Link from "next/link";

/* -------- types/utilitaires de base -------- */
type AnyObj = Record<string, any>;
interface MenuRoot { categories?: Category[]; }
interface Category { id?: string; name?: string; items?: Item[]; }
interface Item extends AnyObj {
  id?: string; slug?: string; name?: string; title?: string; displayName?: string;
  description?: string; short_description?: string; subtitle?: string;
  image?: any; imageUrl?: string; image_url?: string; photo?: any; photoUrl?: string; photo_url?: string; images?: any[];
  price?: any;
}

function slugify(s: string){
  return s.toString().normalize("NFKD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"");
}
function parsePrice(p:any): string{
  if (p == null) return "—";
  if (typeof p === "number") return (p >= 200 ? (p/100) : p).toFixed(2)+" €";
  const n = Number(String(p).replace(",", ".").replace(/[^\d.]/g,""));
  if (!Number.isFinite(n)) return String(p);
  return (n >= 200 ? (n/100) : n).toFixed(2)+" €";
}
function getItemImage(it: Item): string | null {
  const c = [it.imageUrl, it.image_url, it.photoUrl, it.photo_url,
    typeof it.image === "string" ? it.image : null,
    typeof it.photo === "string" ? it.photo : null].filter(Boolean) as string[];
  if (c.length) return c[0];
  if (Array.isArray(it.images) && it.images.length){
    const first = it.images[0];
    if (typeof first === "string") return first;
    if (typeof first === "object"){
      for (const k of ["url","src","imageUrl","image_url"]) if (first?.[k]) return String(first[k]);
    }
  }
  return null;
}
async function loadMenu(): Promise<MenuRoot>{
  const dir = process.cwd();
  for (const f of ["data/menu_fixed.json","data/menu.json"]){
    try{
      const raw = await fs.readFile(path.join(dir,f), "utf8");
      return JSON.parse(raw);
    }catch{}
  }
  return { categories: [] };
}

/* ---------------- page ---------------- */
export default async function Page() {
  const data = await loadMenu();
  const cats = data.categories ?? [];

  return (
    <main style={{padding:"20px 0 40px"}}>
      <h1 className="page-title">Menu</h1>

      {/* chips de navigation */}
      <nav className="chipbar">
        {cats.map((c, i) => {
          const id = slugify(c.name || `cat-${i}`);
          return <a key={i} href={`#${id}`} className="chip">{c.name || `Catégorie ${i+1}`}</a>;
        })}
      </nav>

      {/* sections par catégorie */}
      {cats.map((cat, ci) => {
        const cid = slugify(cat.name || `cat-${ci}`);
        const items = cat.items ?? [];
        return (
          <section id={cid} key={ci} style={{marginTop:18}}>
            <div style={{display:"flex", alignItems:"center", justifyContent:"space-between"}}>
              <h2 className="section-title">{cat.name || `Catégorie ${ci+1}`}</h2>
              <a href="#top" className="chip" style={{fontSize:".85rem"}}>↑ Haut</a>
            </div>

            <ul className="reset-list grid-cards">
              {items.map((it, ii) => {
                const name = it.name || it.title || it.displayName || `Produit ${ii+1}`;
                const slug = it.slug ? String(it.slug) : slugify(name);
                const img = getItemImage(it);
                const price = parsePrice(it.price);
                const desc = it.description || it.short_description || it.subtitle || "";
                return (
                  <li key={slug} className="card">
                    <Link className="card-link" href={`/menu/${slug}`}>
                      {img && <img className="card-img" src={img} alt={name} />}
                      <div className="card-body">
                        <div className="card-row">
                          <h3 className="card-title">{name}</h3>
                          <span className="price-pill">{price}</span>
                        </div>
                        {desc && <p className="card-desc">{desc}</p>}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </main>
  );
}
