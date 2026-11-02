import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { prisma, money } from '../../lib/prisma';
import { storage } from '../../services/storage.service';
import { HttpError } from '../../middleware/error';
import { applyMovement } from '../../services/inventory.service';

export const adminProducts = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serialize(p: any) {
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
    categoryId: p.categoryId,
    category: p.category ? { id: p.category.id, name: p.category.name } : null,
    brandId: p.brandId,
    unit: p.unit,
    costPrice: money(p.costPrice),
    avgCost: money(p.avgCost),
    sellingPrice: money(p.sellingPrice),
    compareAtPrice: p.compareAtPrice != null ? money(p.compareAtPrice) : null,
    margin: money(money(p.sellingPrice) - money(p.costPrice)),
    stockQty: p.stockQty,
    lowStockAlert: p.lowStockAlert,
    isActive: p.isActive,
    isFeatured: p.isFeatured,
    isBestSeller: p.isBestSeller,
    soldCount: p.soldCount,
    images: (p.images || []).map((i: any) => ({ id: i.id, url: i.url, alt: i.alt })),
    image: p.images?.[0]?.url ?? null,
  };
}
function safeJson(s: string) {
  try { return JSON.parse(s); } catch { return []; }
}

// ---- Image upload ----
adminProducts.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) throw new HttpError(400, 'No file uploaded');
  const url = await storage.save(req.file.buffer, req.file.originalname);
  res.status(201).json({ url });
});

// ---- List (admin sees everything incl. inactive) ----
adminProducts.get('/', async (req, res) => {
  const q = (req.query.q as string) || '';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};
  if (q) where.OR = [{ name: { contains: q } }, { sku: { contains: q } }];
  if (req.query.lowStock === 'true') where.stockQty = { lte: 5 };

  const rows = await prisma.product.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: { category: true, images: { orderBy: { sortOrder: 'asc' } } },
  });
  res.json(rows.map(serialize));
});

adminProducts.get('/:id', async (req, res) => {
  const p = await prisma.product.findUnique({
    where: { id: Number(req.params.id) },
    include: { category: true, images: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!p) throw new HttpError(404, 'Product not found');
  res.json(serialize(p));
});

const productSchema = z.object({
  name: z.string().min(2),
  nameAr: z.string().optional().nullable(),
  sku: z.string().min(1).optional(),
  barcode: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  descriptionAr: z.string().optional().nullable(),
  specs: z.array(z.object({ key: z.string(), value: z.string() })).optional(),
  categoryId: z.number().int().nullable().optional(),
  unit: z.string().optional(),
  costPrice: z.number().min(0).default(0),
  sellingPrice: z.number().min(0),
  compareAtPrice: z.number().min(0).nullable().optional(),
  stockQty: z.number().int().min(0).default(0),
  lowStockAlert: z.number().int().min(0).default(5),
  isActive: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
  isBestSeller: z.boolean().default(false),
  // Accept relative (/uploads/..) and absolute (http..) image URLs
  images: z.array(z.string().min(1)).optional(),
});

async function uniqueSlug(base: string, ignoreId?: number) {
  let slug = base || 'product';
  let n = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const found = await prisma.product.findUnique({ where: { slug } });
    if (!found || found.id === ignoreId) return slug;
    slug = `${base}-${++n}`;
  }
}

// ---- Create ----
adminProducts.post('/', async (req, res) => {
  const data = productSchema.parse(req.body);
  const slug = await uniqueSlug(slugify(data.name));
  const sku = data.sku || `DA-${Date.now().toString().slice(-7)}`;

  if (await prisma.product.findUnique({ where: { sku } })) {
    throw new HttpError(409, `SKU "${sku}" already exists`);
  }

  // Stock is created at zero and booked in as an INITIAL movement, so even a
  // brand-new product's quantity is backed by a ledger row.
  const created = await prisma.$transaction(async (tx) => {
    const p = await tx.product.create({
      data: {
        name: data.name,
        nameAr: data.nameAr || null,
        slug,
        sku,
        barcode: data.barcode || null,
        description: data.description || null,
        descriptionAr: data.descriptionAr || null,
        specs: data.specs ? JSON.stringify(data.specs) : null,
        categoryId: data.categoryId ?? null,
        unit: data.unit || 'PCS',
        costPrice: data.costPrice,
        avgCost: data.costPrice,
        sellingPrice: data.sellingPrice,
        compareAtPrice: data.compareAtPrice ?? null,
        stockQty: 0,
        lowStockAlert: data.lowStockAlert,
        isActive: data.isActive,
        isFeatured: data.isFeatured,
        isBestSeller: data.isBestSeller,
        images: data.images?.length
          ? { create: data.images.map((url, i) => ({ url, alt: data.name, sortOrder: i })) }
          : undefined,
      },
      include: { category: true, images: true },
    });

    if (data.stockQty > 0) {
      await applyMovement(tx, {
        productId: p.id,
        qty: data.stockQty,
        type: 'INITIAL',
        unitCost: data.costPrice,
        refType: 'PRODUCT',
        refId: p.id,
        reason: 'Opening balance',
        actorEmail: req.auth?.email,
      });
      return { ...p, stockQty: data.stockQty };
    }
    return p;
  });
  res.status(201).json(serialize(created));
});

// ---- Update ----
adminProducts.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, 'Product not found');
  const data = productSchema.parse(req.body);

  if (data.sku && data.sku !== existing.sku) {
    const dupe = await prisma.product.findUnique({ where: { sku: data.sku } });
    if (dupe) throw new HttpError(409, `SKU "${data.sku}" already exists`);
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (data.images) {
      await tx.productImage.deleteMany({ where: { productId: id } });
    }
    // stockQty is deliberately absent below: editing the quantity here books an
    // ADJUSTMENT movement instead of letting stock jump without a trace.
    const p = await tx.product.update({
      where: { id },
      data: {
        name: data.name,
        nameAr: data.nameAr || null,
        sku: data.sku || existing.sku,
        barcode: data.barcode || null,
        description: data.description || null,
        descriptionAr: data.descriptionAr || null,
        specs: data.specs ? JSON.stringify(data.specs) : null,
        categoryId: data.categoryId ?? null,
        unit: data.unit || 'PCS',
        costPrice: data.costPrice,
        sellingPrice: data.sellingPrice,
        compareAtPrice: data.compareAtPrice ?? null,
        lowStockAlert: data.lowStockAlert,
        isActive: data.isActive,
        isFeatured: data.isFeatured,
        isBestSeller: data.isBestSeller,
        images: data.images?.length
          ? { create: data.images.map((url, i) => ({ url, alt: data.name, sortOrder: i })) }
          : undefined,
      },
      include: { category: true, images: { orderBy: { sortOrder: 'asc' } } },
    });

    const delta = data.stockQty - existing.stockQty;
    if (delta !== 0) {
      await applyMovement(tx, {
        productId: id,
        qty: delta,
        type: 'ADJUSTMENT',
        // An increase is valued at the cost on the form; a write-down keeps
        // the existing average.
        unitCost: delta > 0 ? data.costPrice : undefined,
        refType: 'PRODUCT',
        refId: id,
        reason: 'Stock edited on the product form',
        actorEmail: req.auth?.email,
      });
      // Re-read so the response carries the recalculated quantity + avgCost.
      return tx.product.findUniqueOrThrow({
        where: { id },
        include: { category: true, images: { orderBy: { sortOrder: 'asc' } } },
      });
    }
    return p;
  });
  res.json(serialize(updated));
});

// ---- Delete ----
adminProducts.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  try {
    await prisma.product.delete({ where: { id } });
    res.json({ ok: true });
  } catch {
    // FK violation (product referenced by an order) → soft delete instead
    await prisma.product.update({ where: { id }, data: { isActive: false } });
    res.json({ ok: true, softDeleted: true });
  }
});

// ---- Categories (list + create) ----
adminProducts.get('/meta/categories', async (_req, res) => {
  const cats = await prisma.category.findMany({ orderBy: { sortOrder: 'asc' } });
  res.json(cats.map((c) => ({ id: c.id, name: c.name, slug: c.slug })));
});

adminProducts.post('/meta/categories', async (req, res) => {
  const { name } = z.object({ name: z.string().min(2) }).parse(req.body);
  const slug = await (async () => {
    let s = slugify(name);
    let n = 1;
    // eslint-disable-next-line no-constant-condition
    while (await prisma.category.findUnique({ where: { slug: s } })) s = `${slugify(name)}-${++n}`;
    return s;
  })();
  const cat = await prisma.category.create({ data: { name, slug } });
  res.status(201).json({ id: cat.id, name: cat.name, slug: cat.slug });
});
