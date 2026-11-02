import { Router } from 'express';
import { z } from 'zod';
import { prisma, money } from '../../lib/prisma';
import { HttpError } from '../../middleware/error';

export const adminCoupons = Router();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serialize(c: any) {
  return {
    id: c.id,
    code: c.code,
    type: c.type,
    value: money(c.value),
    minSubtotal: money(c.minSubtotal),
    maxUses: c.maxUses,
    usedCount: c.usedCount,
    expiresAt: c.expiresAt,
    isActive: c.isActive,
    createdAt: c.createdAt,
  };
}

adminCoupons.get('/', async (_req, res) => {
  const rows = await prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } });
  res.json(rows.map(serialize));
});

const couponSchema = z.object({
  code: z.string().min(2).max(40),
  type: z.enum(['PERCENT', 'FIXED']).default('PERCENT'),
  value: z.number().positive(),
  minSubtotal: z.number().min(0).default(0),
  maxUses: z.number().int().positive().nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  isActive: z.boolean().default(true),
});

adminCoupons.post('/', async (req, res) => {
  const data = couponSchema.parse(req.body);
  const code = data.code.toUpperCase().trim();
  if (await prisma.coupon.findUnique({ where: { code } })) {
    throw new HttpError(409, `Coupon "${code}" already exists`);
  }
  if (data.type === 'PERCENT' && data.value > 100) throw new HttpError(400, 'Percent value cannot exceed 100');
  const created = await prisma.coupon.create({
    data: {
      code,
      type: data.type,
      value: data.value,
      minSubtotal: data.minSubtotal,
      maxUses: data.maxUses ?? null,
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
      isActive: data.isActive,
    },
  });
  res.status(201).json(serialize(created));
});

adminCoupons.patch('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.coupon.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, 'Coupon not found');
  const data = z
    .object({
      value: z.number().positive().optional(),
      minSubtotal: z.number().min(0).optional(),
      maxUses: z.number().int().positive().nullable().optional(),
      expiresAt: z.string().datetime().nullable().optional(),
      isActive: z.boolean().optional(),
    })
    .parse(req.body);

  const updated = await prisma.coupon.update({
    where: { id },
    data: {
      ...(data.value !== undefined ? { value: data.value } : {}),
      ...(data.minSubtotal !== undefined ? { minSubtotal: data.minSubtotal } : {}),
      ...(data.maxUses !== undefined ? { maxUses: data.maxUses } : {}),
      ...(data.expiresAt !== undefined ? { expiresAt: data.expiresAt ? new Date(data.expiresAt) : null } : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
    },
  });
  res.json(serialize(updated));
});

adminCoupons.delete('/:id', async (req, res) => {
  await prisma.coupon.delete({ where: { id: Number(req.params.id) } });
  res.json({ ok: true });
});
