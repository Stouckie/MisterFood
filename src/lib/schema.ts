import { getBusinessInfo } from './business';
import {
  findMenuItem,
  getItemDescription,
  getItemImage,
  getItemName,
  getMenuLastModified,
  listMenuItems,
  loadMenuData,
  priceToMinor,
  slugify,
  type MenuData,
} from './menu-data';

function absoluteUrl(baseUrl: string, path: string | null | undefined) {
  if (!path) return undefined;
  try {
    return new URL(path, baseUrl).toString();
  } catch {
    return undefined;
  }
}

function cleanObject<T extends Record<string, unknown>>(value: T): T {
  const entries = Object.entries(value).filter(([, v]) => v !== undefined && v !== null && v !== '');
  return Object.fromEntries(entries) as T;
}

const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const DAY_LOOKUP: Record<string, (typeof DAY_ORDER)[number]> = {
  mon: 'Monday',
  monday: 'Monday',
  lun: 'Monday',
  lundi: 'Monday',
  tue: 'Tuesday',
  tues: 'Tuesday',
  tuesday: 'Tuesday',
  mar: 'Tuesday',
  mardi: 'Tuesday',
  wed: 'Wednesday',
  weds: 'Wednesday',
  wednesday: 'Wednesday',
  mer: 'Wednesday',
  mercredi: 'Wednesday',
  thu: 'Thursday',
  thur: 'Thursday',
  thurs: 'Thursday',
  thursday: 'Thursday',
  jeu: 'Thursday',
  jeudi: 'Thursday',
  fri: 'Friday',
  friday: 'Friday',
  ven: 'Friday',
  vendredi: 'Friday',
  sat: 'Saturday',
  saturday: 'Saturday',
  sam: 'Saturday',
  samedi: 'Saturday',
  sun: 'Sunday',
  sunday: 'Sunday',
  dim: 'Sunday',
  dimanche: 'Sunday',
};

function expandDayToken(token: string) {
  const normalized = token.trim().toLowerCase();
  if (!normalized) return [] as (typeof DAY_ORDER)[number][];
  if (normalized.includes('-')) {
    const [startRaw, endRaw] = normalized.split('-').map(part => part.trim());
    const start = DAY_LOOKUP[startRaw];
    const end = DAY_LOOKUP[endRaw];
    if (!start || !end) return [] as (typeof DAY_ORDER)[number][];
    const startIndex = DAY_ORDER.indexOf(start);
    const endIndex = DAY_ORDER.indexOf(end);
    if (startIndex === -1 || endIndex === -1) return [] as (typeof DAY_ORDER)[number][];
    const days: (typeof DAY_ORDER)[number][] = [];
    let cursor = startIndex;
    let guard = 0;
    while (guard < 7) {
      days.push(DAY_ORDER[cursor]);
      if (cursor === endIndex) break;
      cursor = (cursor + 1) % DAY_ORDER.length;
      guard += 1;
    }
    return days;
  }
  const day = DAY_LOOKUP[normalized];
  return day ? [day] : [];
}

function parseOpeningEntry(entry: string) {
  const pattern = /^(?<days>[A-Za-zÀ-ÿ,\-\s]+)\s+(?<open>\d{1,2}:\d{2})\s*-\s*(?<close>\d{1,2}:\d{2})$/u;
  const match = entry.trim().match(pattern);
  if (!match || !match.groups) {
    return [cleanObject({ '@type': 'OpeningHoursSpecification', description: entry.trim() })];
  }

  const { days, open, close } = match.groups as { days: string; open: string; close: string };
  const tokens = days.split(',').map(part => part.trim()).filter(Boolean);
  const expandedDays = tokens.flatMap(expandDayToken);
  if (!expandedDays.length) {
    return [cleanObject({ '@type': 'OpeningHoursSpecification', description: entry.trim() })];
  }

  return expandedDays.map(day => ({
    '@type': 'OpeningHoursSpecification',
    dayOfWeek: `https://schema.org/${day}`,
    opens: open,
    closes: close,
  }));
}

function buildOpeningHours(entries: string[]) {
  return entries.flatMap(parseOpeningEntry);
}

function determinePriceRange(prices: number[]) {
  if (!prices.length) return undefined;
  const euros = prices.map(price => price / 100).sort((a, b) => a - b);
  const median = euros[Math.floor(euros.length / 2)];
  if (median < 8) return '€';
  if (median < 18) return '€€';
  return '€€€';
}

export async function buildRestaurantSchema(baseUrl: string) {
  const data = await loadMenuData();
  const business = getBusinessInfo();
  const currency = (business.currency || data.vendor?.currency || 'EUR').toUpperCase();
  const items = listMenuItems(data);
  const openingHours = buildOpeningHours(business.openingHours);
  const itemNodes = items.map(item => {
    const priceMinor = item.priceMinor;
    const offer = priceMinor != null ? cleanObject({
      '@type': 'Offer',
      priceCurrency: currency,
      price: (priceMinor / 100).toFixed(2),
      availability: 'https://schema.org/InStock',
    }) : undefined;

    return cleanObject({
      '@type': 'MenuItem',
      '@id': `${baseUrl}/menu/${item.slug}#menuItem`,
      name: item.name,
      description: item.description || undefined,
      image: absoluteUrl(baseUrl, item.image || undefined),
      url: `${baseUrl}/menu/${item.slug}`,
      category: item.category,
      offers: offer,
    });
  });

  const sectionNodes = (data.categories ?? []).map(category => {
    const sectionSlug = slugify(category?.name || 'section');
    const sectionItems = (category?.items ?? []).map(rawItem => {
      const name = getItemName(rawItem);
      const slug = rawItem.slug ? String(rawItem.slug) : slugify(name);
      return { '@id': `${baseUrl}/menu/${slug}#menuItem` };
    }).filter(Boolean);

    if (!sectionItems.length) return null;

    return cleanObject({
      '@type': 'MenuSection',
      '@id': `${baseUrl}/menu#section-${sectionSlug}`,
      name: category?.name || 'Section',
      hasMenuItem: sectionItems,
    });
  }).filter((section): section is Record<string, unknown> => Boolean(section));

  const priceValues = items
    .map(item => item.priceMinor)
    .filter((value): value is number => value != null);
  const priceRange = determinePriceRange(priceValues);
  const firstImage = items.find(item => item.image)?.image;

  const restaurant = cleanObject({
    '@type': 'Restaurant',
    '@id': `${baseUrl}#restaurant`,
    name: business.name,
    url: baseUrl,
    telephone: business.phone,
    email: business.email,
    address: cleanObject({
      '@type': 'PostalAddress',
      streetAddress: business.address,
      postalCode: business.postalCode,
      addressLocality: business.city,
      addressCountry: business.country,
    }),
    servesCuisine: ['Street Food', 'Snacking'],
    priceRange,
    image: absoluteUrl(baseUrl, firstImage || undefined),
    hasMenu: { '@id': `${baseUrl}/menu#menu` },
    acceptsReservations: false,
    openingHoursSpecification: openingHours.length ? openingHours : undefined,
  });

  const menu = cleanObject({
    '@type': 'Menu',
    '@id': `${baseUrl}/menu#menu`,
    name: `Menu ${business.name}`,
    hasMenuSection: sectionNodes.length ? sectionNodes : undefined,
  });

  const itemList = cleanObject({
    '@type': 'ItemList',
    '@id': `${baseUrl}/menu#itemList`,
    name: `Carte ${business.name}`,
    itemListElement: itemNodes.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: { '@id': item['@id'] },
    })),
  });

  const schemaGraph = [restaurant, menu, itemList, ...itemNodes];

  return {
    '@context': 'https://schema.org',
    '@graph': schemaGraph,
  };
}

export async function buildMenuSitemap(baseUrl: string) {
  const data = await loadMenuData();
  const items = listMenuItems(data);
  const lastModified = await getMenuLastModified();

  return {
    lastModified,
    entries: items.map(item => ({
      url: `${baseUrl}/menu/${item.slug}`,
      lastModified: lastModified ?? undefined,
      changefreq: 'weekly' as const,
      priority: 0.6,
    })),
  };
}

export async function buildMenuItemSchema(baseUrl: string, slug: string, data?: MenuData) {
  const dataset = data ?? (await loadMenuData());
  const match = findMenuItem(dataset, slug);
  if (!match) return null;

  const business = getBusinessInfo();
  const currency = (business.currency || dataset.vendor?.currency || 'EUR').toUpperCase();
  const priceMinor = priceToMinor(match.item.price);

  return cleanObject({
    '@context': 'https://schema.org',
    '@type': 'MenuItem',
    '@id': `${baseUrl}/menu/${slug}#menuItem`,
    name: getItemName(match.item),
    description: getItemDescription(match.item) || undefined,
    image: absoluteUrl(baseUrl, getItemImage(match.item) || undefined),
    url: `${baseUrl}/menu/${slug}`,
    category: match.category?.name,
    offers: priceMinor != null ? cleanObject({
      '@type': 'Offer',
      priceCurrency: currency,
      price: (priceMinor / 100).toFixed(2),
      availability: 'https://schema.org/InStock',
    }) : undefined,
    inMenu: { '@id': `${baseUrl}/menu#menu` },
  });
}
