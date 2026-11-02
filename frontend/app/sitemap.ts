import type { MetadataRoute } from 'next';
import { api } from '@/lib/api';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3200';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base: MetadataRoute.Sitemap = [
    { url: SITE, priority: 1 },
    { url: `${SITE}/products`, priority: 0.9 },
    { url: `${SITE}/track`, priority: 0.3 },
  ];
  try {
    const { items } = await api.products({ pageSize: 60 });
    for (const p of items) {
      base.push({ url: `${SITE}/products/${p.slug}`, priority: 0.7 });
    }
  } catch {
    /* API down at build time — return static routes only */
  }
  return base;
}
