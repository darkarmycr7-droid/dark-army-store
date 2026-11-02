import { Router } from 'express';
import { z } from 'zod';
import { prisma, money } from '../lib/prisma';
import { HttpError } from '../middleware/error';

export const catalog = Router();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeProduct(p: any) {
  return {
    id: p.id,
    name: p.name,
    nameAr: p.nameAr,
    slug: p.slug,
    sku: p.sku,
    barcode: p.barcode,
    description: p.description,
    descriptionAr: p.descriptionAr,
    specs: p.specs ? safeJson(p.specs) : [],
    unit: p.unit,
    category: p.category ? { id: p.category.id, name: p.category.name, nameAr: p.category.nameAr, slug: p.category.slug } : null,
    brand: p.brand ? { id: p.brand.id, name: p.brand.name } : null,
    price: money(p.sellingPrice),
    compareAtPrice: p.compareAtPrice != null ? money(p.compareAtPrice) : null,
    inStock: p.stockQty > 0,
    stockQty: p.stockQty,
    isFeatured: p.isFeatured,
    isBestSeller: p.isBestSeller,
    soldCount: p.soldCount,
    ratingAvg: p.ratingAvg,
    ratingCount: p.ratingCount,
    images: (p.images || []).map((i: any) => ({ url: i.url, alt: i.alt })),
    image: p.images?.[0]?.url ?? null,
  };
}

function safeJson(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return [];
  }
}

// ---- Categories ----
catalog.get('/categories', async (_req, res) => {
  const cats = await prisma.category.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { products: true } } },
  });
  res.json(
    cats.map((c) => ({
      id: c.id,
      name: c.name,
      nameAr: c.nameAr,
      slug: c.slug,
      description: c.description,
      imageUrl: c.imageUrl,
      parentId: c.parentId,
      productCount: c._count.products,
    }))
  );
});

// ---- Product listing with search / filters / sort / pagination ----
const listQuery = z.object({
  q: z.string().optional(),
  category: z.string().optional(), // slug
  brand: z.string().optional(),
  minPrice: z.coerce.number().optional(),
  maxPrice: z.coerce.number().optional(),
  inStock: z.coerce.boolean().optional(),
  featured: z.coerce.boolean().optional(),
  bestSeller: z.coerce.boolean().optional(),
  onSale: z.coerce.boolean().optional(),
  sort: z.enum(['newest', 'price_asc', 'price_desc', 'popular', 'name']).default('newest'),
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(60).default(12),
});

catalog.get('/products', async (req, res) => {
  const q = listQuery.parse(req.query);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { isActive: true };
  if (q.q) {
    where.OR = [
      { name: { contains: q.q } },
      { sku: { contains: q.q } },
      { description: { contains: q.q } },
      { barcode: { contains: q.q } },
    ];
  }
  if (q.category) where.category = { slug: q.category };
  if (q.brand) where.brand = { slug: q.brand };
  if (q.featured) where.isFeatured = true;
  if (q.bestSeller) where.isBestSeller = true;
  if (q.onSale) where.compareAtPrice = { not: null };
  if (q.inStock) where.stockQty = { gt: 0 };
  if (q.minPrice != null || q.maxPrice != null) {
    where.sellingPrice = {};
    if (q.minPrice != null) where.sellingPrice.gte = q.minPrice;
    if (q.maxPrice != null) where.sellingPrice.lte = q.maxPrice;
  }

  const orderBy =
    q.sort === 'price_asc'
      ? { sellingPrice: 'asc' as const }
      : q.sort === 'price_desc'
      ? { sellingPrice: 'desc' as const }
      : q.sort === 'popular'
      ? { soldCount: 'desc' as const }
      : q.sort === 'name'
      ? { name: 'asc' as const }
      : { createdAt: 'desc' as const };

  const [total, rows] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy,
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: {
        category: true,
        brand: true,
        images: { orderBy: { sortOrder: 'asc' } },
      },
    }),
  ]);

  res.json({
    items: rows.map(serializeProduct),
    total,
    page: q.page,
    pageSize: q.pageSize,
    totalPages: Math.ceil(total / q.pageSize),
  });
});

// ---- Current data for a set of product IDs (used by "Buy again") ----
// Registered before /:slug so "by-ids" isn't treated as a slug.
catalog.get('/products/by-ids', async (req, res) => {
  const ids = String(req.query.ids || '')
    .split(',')
    .map((n) => Number(n))
    .filter((n) => Number.isInteger(n) && n > 0);
  if (!ids.length) return res.json([]);

  const rows = await prisma.product.findMany({
    where: { id: { in: ids }, isActive: true },
    include: { category: true, brand: true, images: { orderBy: { sortOrder: 'asc' } } },
  });
  // Preserve the caller's requested order (important for "recently viewed")
  const byId = new Map(rows.map((p) => [p.id, p]));
  const ordered = ids.map((id) => byId.get(id)).filter(Boolean);
  res.json(ordered.map((p) => serializeProduct(p)));
});

// ---- Single product by slug ----
catalog.get('/products/:slug', async (req, res) => {
  const p = await prisma.product.findUnique({
    where: { slug: req.params.slug },
    include: { category: true, brand: true, images: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!p || !p.isActive) throw new HttpError(404, 'Product not found');

  // a few related items from the same category
  const related = await prisma.product.findMany({
    where: { isActive: true, categoryId: p.categoryId, id: { not: p.id } },
    take: 4,
    include: { category: true, brand: true, images: { orderBy: { sortOrder: 'asc' } } },
  });

  res.json({ ...serializeProduct(p), related: related.map(serializeProduct) });
});

// ---- Reviews for a product (public) ----
catalog.get('/products/:slug/reviews', async (req, res) => {
  const product = await prisma.product.findUnique({ where: { slug: req.params.slug } });
  if (!product) throw new HttpError(404, 'Product not found');
  const reviews = await prisma.review.findMany({
    where: { productId: product.id },
    orderBy: { createdAt: 'desc' },
    include: { customer: { select: { name: true } } },
    take: 50,
  });
  res.json(
    reviews.map((r) => ({
      id: r.id,
      rating: r.rating,
      title: r.title,
      body: r.body,
      author: r.customer.name,
      createdAt: r.createdAt,
    }))
  );
});

// ---- Brands ----
catalog.get('/brands', async (_req, res) => {
  const brands = await prisma.brand.findMany({ orderBy: { name: 'asc' } });
  res.json(brands.map((b) => ({ id: b.id, name: b.name, slug: b.slug, logoUrl: b.logoUrl })));
});

// ---- Hero slider settings (autoplay interval in seconds) ----
catalog.get('/banner-settings', async (_req, res) => {
  const row = await prisma.setting.findUnique({ where: { key: 'heroIntervalSeconds' } });
  res.json({ intervalSeconds: row ? Number(row.value) : 5 });
});

// ---- Homepage banners (active only) ----
catalog.get('/banners', async (_req, res) => {
  const rows = await prisma.banner.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  });
  res.json(
    rows.map((b) => ({
      id: b.id,
      title: b.title,
      titleAr: b.titleAr,
      subtitle: b.subtitle,
      subtitleAr: b.subtitleAr,
      ctaLabel: b.ctaLabel,
      ctaLabelAr: b.ctaLabelAr,
      ctaHref: b.ctaHref,
      imageUrl: b.imageUrl,
      align: b.align,
      overlay: b.overlay,
    }))
  );
});
