import { Router } from 'express';
import { z } from 'zod';
import { prisma, money } from '../../lib/prisma';
import { HttpError } from '../../middleware/error';

export const adminSuppliers = Router();

const TERMS = ['CASH', 'NET7', 'NET15', 'NET30'] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serialize(s: any) {
  return {
    id: s.id,
    name: s.name,
    nameAr: s.nameAr,
    contactName: s.contactName,
    phone: s.phone,
    email: s.email,
    address: s.address,
    paymentTerms: s.paymentTerms,
    isInternational: s.isInternational,
    currency: s.currency,
    notes: s.notes,
    isActive: s.isActive,
    createdAt: s.createdAt,
    ...(s._count ? { poCount: s._count.purchaseOrders } : {}),
  };
}

// ---- List ----
adminSuppliers.get('/', async (req, res) => {
  const q = (req.query.q as string) || '';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};
  if (q) where.OR = [{ name: { contains: q } }, { contactName: { contains: q } }, { phone: { contains: q } }];
  if (req.query.active === 'true') where.isActive = true;

  const rows = await prisma.supplier.findMany({
    where,
    orderBy: { name: 'asc' },
    include: { _count: { select: { purchaseOrders: true } } },
  });
  res.json(rows.map(serialize));
});

// ---- One supplier, with its purchase history + spend ----
adminSuppliers.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const s = await prisma.supplier.findUnique({
    where: { id },
    include: {
      purchaseOrders: { orderBy: { createdAt: 'desc' }, take: 50 },
      _count: { select: { purchaseOrders: true } },
    },
  });
  if (!s) throw new HttpError(404, 'Supplier not found');

  // Spend counts only what was actually committed, not drafts or cancellations.
  const counted = s.purchaseOrders.filter((p) => !['DRAFT', 'CANCELLED'].includes(p.status));
  res.json({
    ...serialize(s),
    totalSpend: money(counted.reduce((sum, p) => sum + money(p.total), 0)),
    purchaseOrders: s.purchaseOrders.map((p) => ({
      id: p.id,
      poNumber: p.poNumber,
      status: p.status,
      total: money(p.total),
      createdAt: p.createdAt,
      receivedAt: p.receivedAt,
    })),
  });
});

const supplierSchema = z.object({
  name: z.string().min(2),
  nameAr: z.string().optional().nullable(),
  contactName: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  address: z.string().optional().nullable(),
  paymentTerms: z.enum(TERMS).default('CASH'),
  isInternational: z.boolean().default(false),
  currency: z.string().min(3).max(4).default('KWD'),
  notes: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toData(d: any) {
  return {
    name: d.name.trim(),
    nameAr: d.nameAr || null,
    contactName: d.contactName || null,
    phone: d.phone || null,
    email: d.email || null,
    address: d.address || null,
    paymentTerms: d.paymentTerms,
    isInternational: d.isInternational,
    currency: (d.currency || 'KWD').toUpperCase(),
    notes: d.notes || null,
    isActive: d.isActive,
  };
}

// ---- Create ----
adminSuppliers.post('/', async (req, res) => {
  const data = supplierSchema.parse(req.body);
  const created = await prisma.supplier.create({ data: toData(data) });
  res.status(201).json(serialize(created));
});

// ---- Update ----
adminSuppliers.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!(await prisma.supplier.findUnique({ where: { id } }))) {
    throw new HttpError(404, 'Supplier not found');
  }
  const data = supplierSchema.parse(req.body);
  const updated = await prisma.supplier.update({ where: { id }, data: toData(data) });
  res.json(serialize(updated));
});

// ---- Delete (soft when the supplier has purchase history) ----
adminSuppliers.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const used = await prisma.purchaseOrder.count({ where: { supplierId: id } });
  if (used > 0) {
    await prisma.supplier.update({ where: { id }, data: { isActive: false } });
    return res.json({ ok: true, softDeleted: true });
  }
  await prisma.supplier.delete({ where: { id } });
  res.json({ ok: true });
});
