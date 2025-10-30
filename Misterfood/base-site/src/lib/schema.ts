import { getBusinessInfo } from './business';
import { getItemDescription, getItemImage, getItemName, listMenuItems, loadMenuData, priceToMinor } from './menu-data';

function absoluteUrl(baseUrl: string, path: string | null | undefined) {
  if (!path) return undefined;
  try {
    return new URL(path, baseUrl).toString();
  } catch {
    return undefined;
  }
}

export async function buildRestaurantSchema(baseUrl: string) {
  const data = await loadMenuData();
  const business = getBusinessInfo();
  const currency = (business.currency || data.vendor?.currency || 'EUR').toUpperCase();
  const items = listMenuItems(data);

  const sections = (data.categories ?? []).slice(0, 6).map(category => {
    const sectionItems = (category.items ?? []).slice(0, 8).map(item => {
      const name = getItemName(item);
      const priceMinor = priceToMinor(item.price);
      return {
        '@type': 'MenuItem',
        name,
        description: getItemDescription(item) || undefined,
        image: absoluteUrl(baseUrl, getItemImage(item) || undefined),
        offers: priceMinor != null ? {
          '@type': 'Offer',
          priceCurrency: currency,
          price: (priceMinor / 100).toFixed(2),
          availability: 'https://schema.org/InStock',
        } : undefined,
      };
    }).filter(Boolean);

    if (!sectionItems.length) return null;

    return {
      '@type': 'MenuSection',
      name: category.name || 'Section',
      hasMenuItem: sectionItems,
    };
  }).filter(Boolean);

  const openingHours = business.openingHours.map(entry => ({
    '@type': 'OpeningHoursSpecification',
    name: entry,
  }));

  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    name: business.name,
    url: baseUrl,
    telephone: business.phone,
    email: business.email,
    address: {
      '@type': 'PostalAddress',
      streetAddress: business.address,
      postalCode: business.postalCode,
      addressLocality: business.city,
      addressCountry: business.country,
    },
    servesCuisine: ['Street Food', 'Snacking'],
    hasMenu: {
      '@type': 'Menu',
      name: `Menu ${business.name}`,
      hasMenuSection: sections,
    },
  };

  if (openingHours.length) {
    schema.openingHoursSpecification = openingHours;
  }

  if (items.length) {
    schema.menu = {
      '@type': 'Menu',
      name: `Carte ${business.name}`,
      hasMenuSection: sections,
    };
  }

  return schema;
}

export async function buildMenuSitemap(baseUrl: string) {
  const data = await loadMenuData();
  const items = listMenuItems(data);
  return items.map(item => ({
    url: `${baseUrl}/menu/${item.slug}`,
  }));
}
