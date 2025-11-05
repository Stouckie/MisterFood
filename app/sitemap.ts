import type { MetadataRoute } from 'next';
import { buildMenuSitemap } from '@/lib/schema';

const baseUrl = (process.env.APP_URL || 'https://example.com').replace(/\/$/, '');

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { entries: menuEntries, lastModified } = await buildMenuSitemap(baseUrl);
  const referenceDate = lastModified ?? new Date();

  const staticRoutes = [
    '',
    '/menu',
    '/mentions-legales',
    '/conditions-generales',
    '/politique-confidentialite',
    '/politique-cookies',
  ].map(path => ({
    url: `${baseUrl}${path}`,
    lastModified: referenceDate,
    changefreq: path === '' ? 'weekly' : 'monthly',
    priority: path === '' ? 0.9 : 0.5,
  }));

  return [...staticRoutes, ...menuEntries];
}
