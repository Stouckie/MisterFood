import fs from 'fs/promises';
import path from 'path';

export interface MenuItem {
  id?: string;
  slug?: string;
  name?: string;
  title?: string;
  displayName?: string;
  description?: string;
  short_description?: string;
  subtitle?: string;
  image?: any;
  imageUrl?: string;
  image_url?: string;
  photo?: any;
  photoUrl?: string;
  photo_url?: string;
  images?: any[];
  price?: any;
}

export interface MenuCategory {
  id?: string;
  name?: string;
  items?: MenuItem[];
}

export interface MenuData {
  vendor?: {
    name?: string;
    address?: string;
    phone?: string;
    currency?: string;
  };
  categories?: MenuCategory[];
}

export async function loadMenuData(): Promise<MenuData> {
  const root = process.cwd();
  const candidates = ['data/menu_fixed.json', 'data/menu.json'];
  for (const file of candidates) {
    try {
      const raw = await fs.readFile(path.join(root, file), 'utf8');
      return JSON.parse(raw) as MenuData;
    } catch {
      // ignore missing file
    }
  }
  return { categories: [] };
}

export function slugify(input: string): string {
  return input
    .toString()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function getItemName(item: MenuItem): string {
  return (
    item.name ||
    item.title ||
    item.displayName ||
    item.id ||
    'Produit'
  );
}

export function getItemDescription(item: MenuItem): string {
  return (
    item.description ||
    item.short_description ||
    item.subtitle ||
    ''
  );
}

export function getItemImage(item: MenuItem): string | null {
  const candidates = [
    item.imageUrl,
    item.image_url,
    item.photoUrl,
    item.photo_url,
    typeof item.image === 'string' ? item.image : null,
    typeof item.photo === 'string' ? item.photo : null,
  ].filter(Boolean) as string[];
  if (candidates.length) return candidates[0];

  if (Array.isArray(item.images) && item.images.length) {
    const first = item.images[0];
    if (typeof first === 'string') return first;
    if (first && typeof first === 'object') {
      for (const key of ['url', 'src', 'imageUrl', 'image_url']) {
        if (first[key]) return String(first[key]);
      }
    }
  }
  return null;
}

export function priceToMinor(value: any): number | undefined {
  if (value == null) return undefined;
  if (typeof value === 'number') {
    if (value > 1000) return Math.round(value);
    return Math.round(value * 100);
  }
  if (typeof value === 'string') {
    const numeric = Number(value.replace(',', '.').replace(/[^\d.\-]/g, ''));
    return Number.isFinite(numeric) ? Math.round(numeric * 100) : undefined;
  }
  if (typeof value === 'object') {
    for (const key of ['amount', 'cents', 'value', 'price', 'priceCents', 'price_cents']) {
      const raw = (value as Record<string, unknown>)[key];
      if (raw == null) continue;
      const num = Number(raw);
      if (!Number.isFinite(num)) continue;
      if (key.includes('cent') || Math.abs(num) >= 1000) {
        return Math.round(num);
      }
      return Math.round(num * 100);
    }
  }
  return undefined;
}

export function listMenuItems(data: MenuData) {
  const items: {
    slug: string;
    name: string;
    description: string;
    priceMinor?: number;
    image?: string | null;
    category?: string;
  }[] = [];

  for (const category of data.categories ?? []) {
    const categoryName = category?.name || undefined;
    for (const item of category?.items ?? []) {
      const name = getItemName(item);
      const slug = item.slug ? String(item.slug) : slugify(name);
      items.push({
        slug,
        name,
        description: getItemDescription(item),
        priceMinor: priceToMinor(item.price),
        image: getItemImage(item),
        category: categoryName,
      });
    }
  }
  return items;
}

export function findMenuItem(data: MenuData, slug: string) {
  for (const category of data.categories ?? []) {
    for (const item of category?.items ?? []) {
      const name = getItemName(item);
      const itemSlug = item.slug ? String(item.slug) : slugify(name);
      if (itemSlug === slug) {
        return { item, category };
      }
    }
  }
  return null;
}

export async function getMenuLastModified(): Promise<Date | undefined> {
  const root = process.cwd();
  const candidates = ['data/menu_fixed.json', 'data/menu.json'];
  let latest: Date | undefined;

  for (const file of candidates) {
    try {
      const stat = await fs.stat(path.join(root, file));
      if (!latest || stat.mtime > latest) {
        latest = stat.mtime;
      }
    } catch {
      // ignore missing files
    }
  }

  return latest;
}
