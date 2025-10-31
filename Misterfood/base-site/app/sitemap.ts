import type { MetadataRoute } from 'next';
import { buildMenuSitemap } from '@/lib/schema';

const baseUrl = (process.env.APP_URL || 'https://example.com').replace(/\/$/, '');

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const menuEntries = await buildMenuSitemap(baseUrl);
  const staticRoutes = [
    '',
    '/menu',
    '/mentions-legales',
    '/conditions-generales',
    '/politique-confidentialite',
    '/politique-cookies',
  ].map(path => ({
    url: `${baseUrl}${path}`,
  }));

  return [...staticRoutes, ...menuEntries];
}
