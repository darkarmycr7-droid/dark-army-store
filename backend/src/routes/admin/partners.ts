import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { HttpError } from '../../middleware/error';

export const adminPartners = Router();

/**
 * Contacts — the master record every other module points at, modelled on
 * Odoo's res.partner: one contact can be a customer, a supplier, or both,
 * and archiving (active = false) hides it without destroying history.
 *
 * The list endpoint speaks the same language as an Odoo list view:
 * search + filters + group-by + pager, so the generic view components on the
 * frontend can drive any model that implements this shape.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serialize(p: any) {
  return {
    id: p.id,
    name: p.name,
    nameAr: p.nameAr,
    ref: p.ref,
    isCompany: p.isCompany,
    parentId: p.parentId,
    parentName: p.parent?.name ?? null,
    customerRank: p.customerRank,
    supplierRank: p.supplierRank,
    jobTitle: p.jobTitle,
    email: p.email,
    phone: p.phone,
    mobile: p.mobile,
    website: p.website,
    vat: p.vat,
    street: p.street,
    street2: p.street2,
    area: p.area,
    block: p.block,
    building: p.building,
    floor: p.floor,
    city: p.city,
    country: p.country,
    zip: p.zip,
    imageUrl: p.imageUrl,
    comment: p.comment,
    paymentTerms: p.paymentTerms,
    creditLimit: Number(p.creditLimit ?? 0),
    active: p.active,
    tags: (p.tags || []).map((t: any) => ({ id: t.tag.id, name: t.tag.name, color: t.tag.color })),
    childCount: p._count?.children ?? 0,
    createdAt: p.createdAt,
  };
}

/** Filters the list view exposes, mirroring Odoo's filter dropdown. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildWhere(q: any) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};
  const filters = String(q.filters || '').split(',').filter(Boolean);

  where.active = filters.includes('archived') ? false : true;
  if (filters.includes('customers')) where.customerRank = { gt: 0 };
  if (filters.includes('suppliers')) where.supplierRank = { gt: 0 };
  if (filters.includes('companies')) where.isCompany = true;
  if (filters.includes('individuals')) where.isCompany = false;

  const search = String(q.q || '').trim();
  if (search) {
    where.OR = [
      { name: { contains: search } },
      { nameAr: { contains: search } },
      { email: { contains: search } },
      { phone: { contains: search } },
      { mobile: { contains: search } },
      { ref: { contains: search } },
      { vat: { contains: search } },
      { city: { contains: search } },
      { area: { contains: search } },
    ];
  }
  if (q.tagId) where.tags = { some: { tagId: Number(q.tagId) } };
  return where;
}

// ---- List (search / filter / group / page) ----
adminPartners.get('/', async (req, res) => {
  const where = buildWhere(req.query);
  const take = Math.min(Number(req.query.limit) || 80, 500);
  const skip = Number(req.query.skip) || 0;
  const orderBy = String(req.query.order || 'name');
  const dir = String(req.query.dir || 'asc') === 'desc' ? 'desc' : 'asc';

  const [rows, total] = await Promise.all([
    prisma.partner.findMany({
      where,
      orderBy: { [orderBy]: dir },
      take,
      skip,
      include: { tags: { include: { tag: true } }, parent: true, _count: { select: { children: true } } },
    }),
    prisma.partner.count({ where }),
  ]);

  // Group-by counts for the sidebar / grouped list, Odoo style.
  let groups: { key: string; label: string; count: number }[] | undefined;
  const groupBy = String(req.query.groupBy || '');
  if (groupBy === 'type') {
    const [customers, suppliers, both, neither] = await Promise.all([
      prisma.partner.count({ where: { ...where, customerRank: { gt: 0 }, supplierRank: 0 } }),
      prisma.partner.count({ where: { ...where, supplierRank: { gt: 0 }, customerRank: 0 } }),
      prisma.partner.count({ where: { ...where, supplierRank: { gt: 0 }, customerRank: { gt: 0 } } }),
      prisma.partner.count({ where: { ...where, supplierRank: 0, customerRank: 0 } }),
    ]);
    groups = [
      { key: 'customer', label: 'Customers', count: customers },
      { key: 'supplier', label: 'Suppliers', count: suppliers },
      { key: 'both', label: 'Customer & Supplier', count: both },
      { key: 'none', label: 'Uncategorised', count: neither },
    ].filter((g) => g.count > 0);
  } else if (groupBy === 'city' || groupBy === 'area' || groupBy === 'country') {
    const grouped = await prisma.partner.groupBy({
      by: [groupBy as 'city'],
      where,
      _count: { _all: true },
      orderBy: { _count: { id: 'desc' } },
    });
    groups = grouped.map((g) => ({
      key: String(g[groupBy as 'city'] ?? ''),
      label: String(g[groupBy as 'city'] ?? 'None'),
      count: g._count._all,
    }));
  }

  res.json({ rows: rows.map(serialize), total, skip, take, groups });
});

// ---- Read one ----
adminPartners.get('/:id', async (req, res) => {
  const p = await prisma.partner.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      tags: { include: { tag: true } },
      parent: true,
      _count: { select: { children: true } },
      children: { where: { active: true }, select: { id: true, name: true, jobTitle: true, email: true, phone: true } },
    },
  });
  if (!p) throw new HttpError(404, 'Contact not found');

  // Smart-button figures, resolved through the linked customer / supplier rows.
  const [customer, supplier] = await Promise.all([
    prisma.customer.findFirst({ where: { partnerId: p.id } }),
    prisma.supplier.findFirst({ where: { partnerId: p.id } }),
  ]);
  const [orderCount, poCount] = await Promise.all([
    customer ? prisma.order.count({ where: { customerId: customer.id } }) : 0,
    supplier ? prisma.purchaseOrder.count({ where: { supplierId: supplier.id } }) : 0,
  ]);

  res.json({
    ...serialize(p),
    children: p.children,
    stats: { orderCount, poCount, customerId: customer?.id ?? null, supplierId: supplier?.id ?? null },
  });
});

const partnerSchema = z.object({
  name: z.string().min(2),
  nameAr: z.string().optional().nullable(),
  ref: z.string().optional().nullable(),
  isCompany: z.boolean().default(false),
  parentId: z.number().int().positive().nullable().optional(),
  customerRank: z.number().int().min(0).default(0),
  supplierRank: z.number().int().min(0).default(0),
  jobTitle: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  phone: z.string().optional().nullable(),
  mobile: z.string().optional().nullable(),
  website: z.string().optional().nullable(),
  vat: z.string().optional().nullable(),
  street: z.string().optional().nullable(),
  street2: z.string().optional().nullable(),
  area: z.string().optional().nullable(),
  block: z.string().optional().nullable(),
  building: z.string().optional().nullable(),
  floor: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  zip: z.string().optional().nullable(),
  imageUrl: z.string().optional().nullable(),
  comment: z.string().optional().nullable(),
  paymentTerms: z.string().optional().nullable(),
  creditLimit: z.number().min(0).default(0),
  active: z.boolean().default(true),
  tagIds: z.array(z.number().int()).optional(),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toData(d: any) {
  const { tagIds, ...rest } = d;
  return {
    ...rest,
    name: d.name.trim(),
    email: d.email || null,
    nameAr: d.nameAr || null,
    ref: d.ref || null,
    jobTitle: d.jobTitle || null,
    phone: d.phone || null,
    mobile: d.mobile || null,
    website: d.website || null,
    vat: d.vat || null,
    street: d.street || null,
    street2: d.street2 || null,
    area: d.area || null,
    block: d.block || null,
    building: d.building || null,
    floor: d.floor || null,
    city: d.city || null,
    country: d.country || null,
    zip: d.zip || null,
    imageUrl: d.imageUrl || null,
    comment: d.comment || null,
    paymentTerms: d.paymentTerms || 'CASH',
    parentId: d.parentId ?? null,
  };
}

adminPartners.post('/', async (req, res) => {
  const data = partnerSchema.parse(req.body);
  const created = await prisma.$transaction(async (tx) => {
    const p = await tx.partner.create({ data: toData(data) });
    if (data.tagIds?.length) {
      await tx.partnerTagLink.createMany({ data: data.tagIds.map((tagId) => ({ partnerId: p.id, tagId })) });
    }
    await tx.mailMessage.create({
      data: { resModel: 'partner', resId: p.id, partnerId: p.id, type: 'LOG', body: 'Contact created', authorEmail: req.auth?.email },
    });
    return tx.partner.findUniqueOrThrow({
      where: { id: p.id },
      include: { tags: { include: { tag: true } }, parent: true, _count: { select: { children: true } } },
    });
  });
  res.status(201).json(serialize(created));
});

adminPartners.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!(await prisma.partner.findUnique({ where: { id } }))) throw new HttpError(404, 'Contact not found');
  const data = partnerSchema.parse(req.body);
  if (data.parentId === id) throw new HttpError(400, 'A contact cannot be its own parent company');

  const updated = await prisma.$transaction(async (tx) => {
    await tx.partner.update({ where: { id }, data: toData(data) });
    if (data.tagIds) {
      await tx.partnerTagLink.deleteMany({ where: { partnerId: id } });
      if (data.tagIds.length) {
        await tx.partnerTagLink.createMany({ data: data.tagIds.map((tagId) => ({ partnerId: id, tagId })) });
      }
    }
    // Keep the linked customer / supplier names in step.
    await tx.customer.updateMany({ where: { partnerId: id }, data: { name: data.name } });
    await tx.supplier.updateMany({ where: { partnerId: id }, data: { name: data.name } });
    return tx.partner.findUniqueOrThrow({
      where: { id },
      include: { tags: { include: { tag: true } }, parent: true, _count: { select: { children: true } } },
    });
  });
  res.json(serialize(updated));
});

/** Archive / unarchive — Odoo's alternative to deleting. */
adminPartners.patch('/:id/active', async (req, res) => {
  const id = Number(req.params.id);
  const { active } = z.object({ active: z.boolean() }).parse(req.body);
  const p = await prisma.partner.update({ where: { id }, data: { active } });
  await prisma.mailMessage.create({
    data: { resModel: 'partner', resId: id, partnerId: id, type: 'LOG', body: active ? 'Contact unarchived' : 'Contact archived', authorEmail: req.auth?.email },
  });
  res.json({ ok: true, active: p.active });
});

adminPartners.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const [customers, suppliers] = await Promise.all([
    prisma.customer.count({ where: { partnerId: id } }),
    prisma.supplier.count({ where: { partnerId: id } }),
  ]);
  if (customers || suppliers) {
    await prisma.partner.update({ where: { id }, data: { active: false } });
    return res.json({ ok: true, archived: true });
  }
  await prisma.partner.delete({ where: { id } });
  res.json({ ok: true });
});

// ---- Tags ----
adminPartners.get('/meta/tags', async (_req, res) => {
  res.json(await prisma.partnerTag.findMany({ orderBy: { name: 'asc' } }));
});

adminPartners.post('/meta/tags', async (req, res) => {
  const { name, color } = z.object({ name: z.string().min(1), color: z.string().default('slate') }).parse(req.body);
  const existing = await prisma.partnerTag.findUnique({ where: { name } });
  if (existing) return res.json(existing);
  res.status(201).json(await prisma.partnerTag.create({ data: { name, color } }));
});

// ---- Chatter ----
adminPartners.get('/:id/messages', async (req, res) => {
  const rows = await prisma.mailMessage.findMany({
    where: { resModel: 'partner', resId: Number(req.params.id) },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  res.json(rows);
});

adminPartners.post('/:id/messages', async (req, res) => {
  const { body } = z.object({ body: z.string().min(1) }).parse(req.body);
  const msg = await prisma.mailMessage.create({
    data: {
      resModel: 'partner',
      resId: Number(req.params.id),
      partnerId: Number(req.params.id),
      type: 'COMMENT',
      body,
      authorEmail: req.auth?.email,
      authorName: req.auth?.email?.split('@')[0],
    },
  });
  res.status(201).json(msg);
});
