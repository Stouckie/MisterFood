import fs from "fs/promises";
import path from "path";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import OptionsClient from "./OptionsClient";
import { buildMenuItemSchema } from "@/lib/schema";

const baseUrl = (process.env.APP_URL || "https://example.com").replace(/\/$/, "");

/** ---------- Types ---------- */
type AnyObj = Record<string, any>;
interface MenuRoot { vendor?: AnyObj; categories?: Category[]; }
interface Category extends AnyObj { id?: string; name?: string; items?: Item[]; }
interface Item extends AnyObj {
  id?: string; slug?: string; name?: string; title?: string; displayName?: string;
  description?: string; short_description?: string; subtitle?: string;
  image?: any; imageUrl?: string; image_url?: string; photo?: any; photoUrl?: string; photo_url?: string; images?: any[];
  price?: any;
  optionGroups?: any[]; options?: any[]; modifiers?: any[]; modifierGroups?: any[];
  addOns?: any[]; addons?: any[]; ["add-ons"]?: any[]; choices?: any[]; toppings?: any[];
}

/** ---------- Utils ---------- */
function slugify(s: string) {
  return s
    .toString()
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function getItemImage(it: Item): string | null {
  const candidates = [
    it.imageUrl, it.image_url, it.photoUrl, it.photo_url,
    typeof it.image === "string" ? it.image : null,
    typeof it.photo === "string" ? it.photo : null,
  ].filter(Boolean) as string[];
  if (candidates.length) return candidates[0];

  if (Array.isArray(it.images) && it.images.length) {
    const first = it.images[0];
    if (typeof first === "string") return first;
    if (first && typeof first === "object") {
      for (const k of ["url", "src", "imageUrl", "image_url"]) {
        if ((first as AnyObj)[k]) return String((first as AnyObj)[k]);
      }
    }
  }
  return null;
}

function parsePrice(p: any): string {
  if (p == null) return "—";
  if (typeof p === "number") {
    return p >= 200 ? (p / 100).toFixed(2) + " €" : p.toFixed(2) + " €";
  }
  if (typeof p === "string") {
    const n = Number(p.replace(",", ".").replace(/[^\d.]/g, ""));
    if (!Number.isFinite(n)) return p;
    return n >= 200 ? (n / 100).toFixed(2) + " €" : n.toFixed(2) + " €";
  }
  for (const key of ["amount", "value", "price", "cents", "delta", "priceDelta", "addPrice"]) {
    if (p[key] != null) {
      const n = Number(String(p[key]).replace(",", "."));
      if (Number.isFinite(n)) {
        return key === "cents" || n >= 200 ? (n / 100).toFixed(2) + " €" : n.toFixed(2) + " €";
      }
    }
  }
  return "—";
}

/** ---------- Lecture données ---------- */
async function loadMenu(): Promise<MenuRoot> {
  const dir = process.cwd();
  const pFixed = path.join(dir, "data", "menu_fixed.json");
  const pMenu = path.join(dir, "data", "menu.json");

  async function tryRead(file: string) {
    try {
      const raw = await fs.readFile(file, "utf8");
      return JSON.parse(raw) as MenuRoot;
    } catch {
      return null;
    }
  }

  return (await tryRead(pFixed)) ?? (await tryRead(pMenu)) ?? { categories: [] };
}

function findItemBySlug(data: MenuRoot, slug: string): { item: Item; category?: Category } | null {
  for (const cat of data.categories ?? []) {
    for (const it of cat.items ?? []) {
      const name = it.name || it.title || it.displayName || it.id || "";
      const s = it.slug ? String(it.slug) : slugify(String(name));
      if (s === slug) return { item: it, category: cat };
    }
  }
  return null;
}

/** ---------- Normalisation d’options ---------- */
type NormOption = { id?: string; name: string; price?: string | null };
type NormGroup = { id?: string; name: string; required?: boolean; min?: number; max?: number; options: NormOption[] };

function arrayify<T = any>(x: any): T[] { return Array.isArray(x) ? (x as T[]) : (x ? [x as T] : []); }
function pickName(x: AnyObj): string { return String(x?.name ?? x?.label ?? x?.title ?? x?.displayName ?? x?.id ?? "Option"); }
function pickPrice(x: AnyObj): string | null {
  const keys = ["price", "priceDelta", "delta", "addPrice", "value", "amount", "cents", "price_cents", "priceCents"];
  for (const k of keys) if (x?.[k] != null) return parsePrice(x[k]);
  return null;
}

function normalizeGroups(item: Item): NormGroup[] {
  const sources: any[][] = [];
  // groupes -> options
  for (const key of ["optionGroups", "modifiers", "modifierGroups"]) {
    const g = arrayify(item[key]);
    if (g.length && (g[0]?.options || g[0]?.items || g[0]?.choices)) sources.push(g);
  }
  // options à plat -> groupe générique
  for (const key of ["options", "addOns", "addons", "add-ons", "choices", "toppings"]) {
    const opts = arrayify(item[key]);
    if (opts.length && !opts[0]?.options && !opts[0]?.items) {
      sources.push([{ name: "Options", options: opts }]);
    }
  }

  const groups: NormGroup[] = [];
  for (const arr of sources) {
    for (const raw of arr) {
      const gName = pickName(raw);
      const min = Number(raw?.min ?? raw?.minSelect ?? raw?.minimum ?? raw?.minSelections ?? 0) || undefined;
      const max = Number(raw?.max ?? raw?.maxSelect ?? raw?.maximum ?? raw?.maxSelections ?? (raw?.required ? 1 : undefined)) || undefined;
      const required = raw?.required ?? (typeof min === "number" && min > 0) ?? undefined;

      const optionsRaw = arrayify(raw?.options ?? raw?.items ?? raw?.choices ?? raw?.toppings);
      const options: NormOption[] = optionsRaw.map((o: AnyObj) => ({
        id: o?.id,
        name: pickName(o),
        price: pickPrice(o),
      }));

      if (options.length) {
        groups.push({ id: raw?.id, name: gName, required, min, max, options });
      }
    }
  }
  return groups;
}

/** ---------- SEO ---------- */
export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;              // ✅ await
  const data = await loadMenu();
  const found = findItemBySlug(data, slug);
  const title = found?.item?.name || found?.item?.title || "Produit";
  const vendor = (data.vendor && (data.vendor.name || data.vendor.title)) ? ` – ${data.vendor.name || data.vendor.title}` : "";
  return { title: `${title}${vendor}` };
}

/** ---------- Page ---------- */
export default async function Page(
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;              // ✅ await
  const data = await loadMenu();
  const found = findItemBySlug(data, slug);  // ✅
  if (!found) return notFound();

  const { item, category } = found;
  const name = item.name || item.title || item.displayName || "Sans nom";
  const desc = item.description || item.short_description || item.subtitle || "";
  const img = getItemImage(item);
  const price = parsePrice(item.price);
  const groups = normalizeGroups(item);
  const backAnchor = category ? `#${slugify(String(category.name || category.id || "categorie"))}` : "";

  // Slug pour le panier (ou item.id si tu préfères)
  const detailSlug = item.slug ? String(item.slug) : slugify(name);

  const schema = await buildMenuItemSchema(baseUrl, slug); // ✅

  return (
    <>
      <main className="container" style={{ paddingInline: '16px', paddingBlock: '20px' }}>
        <nav style={{ marginBottom: '12px' }}>
          <Link href={`/menu${backAnchor}`}>&larr; Retour au menu</Link>
        </nav>

        <article style={{ display: 'grid', gap: '18px', gridTemplateColumns: 'minmax(0,1fr)' }}>
          <header>
            <h1 style={{ fontSize: 'clamp(1.4rem,2.4vw,2rem)', fontWeight: 800, margin: '0 0 .5rem' }}>{name}</h1>
            {desc && <p style={{ color: '#6b7280', margin: 0 }}>{desc}</p>}
          </header>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: '16px' }}>
            <div style={{ borderRadius: '16px', overflow: 'hidden', border: '1px solid #e5e7eb', background: '#f6f7f9', aspectRatio: '4 / 3' }}>
              {img ? <img src={img} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
            </div>
          </div>

          {/* Options + bouton "Ajouter au panier" (géré côté client) */}
          <OptionsClient
            name={name}
            slug={detailSlug}
            image={img ?? null}
            basePrice={price}
            groups={groups}
          />
        </article>
      </main>
      {schema ? (
        <script
          type="application/ld+json"
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ) : null}
    </>
  );
}

/** ---------- (optionnel) SSG des slugs ---------- */
export async function generateStaticParams() {
  const data = await loadMenu();
  const params: { slug: string }[] = [];
  for (const cat of data.categories ?? []) {
    for (const it of cat.items ?? []) {
      const name = it.name || it.title || it.displayName || it.id || "";
      const slug = it.slug ? String(it.slug) : slugify(String(name));
      params.push({ slug });
    }
  }
  return params;
}
