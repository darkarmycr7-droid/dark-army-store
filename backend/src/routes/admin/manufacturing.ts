import { Router } from 'express';
import { z } from 'zod';
import { prisma, money } from '../../lib/prisma';
import { HttpError } from '../../middleware/error';
import { explodeBom, produce, nextRef } from '../../services/manufacturing.service';
import { currentUnitCost } from '../../services/inventory.service';

export const adminBoms = Router();
export const adminMos = Router();

// ---------------------------------------------------------------------------
// Bills of materials
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeBom(b: any) {
  const lines = (b.lines || []).map((l: any) => ({
    id: l.id,
    componentId: l.componentId,
    name: l.component?.name ?? '',
    sku: l.component?.sku ?? '',
    quantity: l.quantity,
    unitCost: l.component ? currentUnitCost(l.component) : 0,
    lineCost: l.component ? money(currentUnitCost(l.component) * l.quantity) : 0,
  }));
  const totalCost = money(lines.reduce((s: number, l: any) => s + l.lineCost, 0));
  return {
    id: b.id,
    reference: b.reference,
    productId: b.productId,
    productName: b.product?.name ?? null,
    productSku: b.product?.sku ?? null,
    quantity: b.quantity,
    name: b.name,
    isActive: b.isActive,
    lines,
    totalCost,
    unitCost: money(totalCost / (b.quantity || 1)),
    createdAt: b.createdAt,
  };
}

const bomInclude = { product: true, lines: { include: { component: true }, orderBy: { sequence: 'asc' as const } } };

adminBoms.get('/', async (req, res) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};
  const filters = String(req.query.filters || '').split(',').filter(Boolean);
  where.isActive = filters.includes('archived') ? false : true;
  const q = String(req.query.q || '').trim();
  if (q) where.OR = [{ reference: { contains: q } }, { name: { contains: q } }, { product: { name: { contains: q } } }];

  const take = Math.min(Number(req.query.limit) || 40, 200);
  const skip = Number(req.query.skip) || 0;
  const [rows, total] = await Promise.all([
    prisma.billOfMaterials.findMany({ where, orderBy: { createdAt: 'desc' }, take, skip, include: bomInclude }),
    prisma.billOfMaterials.count({ where }),
  ]);
  res.json({ rows: rows.map(serializeBom), total, skip, take });
});

adminBoms.get('/:id', async (req, res) => {
  const b = await prisma.billOfMaterials.findUnique({ where: { id: Number(req.params.id) }, include: bomInclude });
  if (!b) throw new HttpError(404, 'Bill of materials not found');
  res.json(serializeBom(b));
});

const bomSchema = z.object({
  productId: z.number().int().positive(),
  quantity: z.number().int().positive().default(1),
  name: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
  lines: z
    .array(z.object({ componentId: z.number().int().positive(), quantity: z.number().int().positive() }))
    .min(1, 'Add at least one component'),
});

/** A product cannot be a component of its own bill of materials. */
function assertNoSelfReference(productId: number, lines: { componentId: number }[]) {
  if (lines.some((l) => l.componentId === productId)) {
    throw new HttpError(400, 'A product cannot be a component of itself');
  }
}

adminBoms.post('/', async (req, res) => {
  const data = bomSchema.parse(req.body);
  assertNoSelfReference(data.productId, data.lines);
  const created = await prisma.billOfMaterials.create({
    data: {
      reference: await nextRef('bom'),
      productId: data.productId,
      quantity: data.quantity,
      name: data.name || null,
      isActive: data.isActive,
      lines: { create: data.lines.map((l, i) => ({ componentId: l.componentId, quantity: l.quantity, sequence: i })) },
    },
    include: bomInclude,
  });
  res.status(201).json(serializeBom(created));
});

adminBoms.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!(await prisma.billOfMaterials.findUnique({ where: { id } }))) {
    throw new HttpError(404, 'Bill of materials not found');
  }
  const data = bomSchema.parse(req.body);
  assertNoSelfReference(data.productId, data.lines);

  const updated = await prisma.$transaction(async (tx) => {
    await tx.bomLine.deleteMany({ where: { bomId: id } });
    return tx.billOfMaterials.update({
      where: { id },
      data: {
        productId: data.productId,
        quantity: data.quantity,
        name: data.name || null,
        isActive: data.isActive,
        lines: { create: data.lines.map((l, i) => ({ componentId: l.componentId, quantity: l.quantity, sequence: i })) },
      },
      include: bomInclude,
    });
  });
  res.json(serializeBom(updated));
});

adminBoms.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const used = await prisma.manufacturingOrder.count({ where: { bomId: id } });
  if (used > 0) {
    await prisma.billOfMaterials.update({ where: { id }, data: { isActive: false } });
    return res.json({ ok: true, archived: true });
  }
  await prisma.billOfMaterials.delete({ where: { id } });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Manufacturing orders
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeMo(m: any) {
  const components = (m.components || []).map((c: any) => ({
    id: c.id,
    productId: c.productId,
    name: c.name,
    sku: c.sku,
    quantityRequired: c.quantityRequired,
    quantityConsumed: c.quantityConsumed,
    unitCost: money(c.unitCost),
  }));
  return {
    id: m.id,
    reference: m.reference,
    productId: m.productId,
    productName: m.product?.name ?? null,
    productSku: m.product?.sku ?? null,
    bomId: m.bomId,
    bomReference: m.bom?.reference ?? null,
    warehouseId: m.warehouseId,
    warehouseName: m.warehouse?.name ?? null,
    quantity: m.quantity,
    producedQty: m.producedQty,
    state: m.state,
    unitCost: money(m.unitCost),
    totalCost: money(money(m.unitCost) * m.producedQty),
    scheduledAt: m.scheduledAt,
    doneAt: m.doneAt,
    note: m.note,
    createdByEmail: m.createdByEmail,
    createdAt: m.createdAt,
    components,
  };
}

const moInclude = { product: true, bom: true, warehouse: true, components: { orderBy: { id: 'asc' as const } } };

adminMos.get('/', async (req, res) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};
  const filters = String(req.query.filters || '').split(',').filter(Boolean);
  if (filters.includes('draft')) where.state = 'DRAFT';
  if (filters.includes('inProgress')) where.state = 'CONFIRMED';
  if (filters.includes('done')) where.state = 'DONE';
  if (filters.includes('cancelled')) where.state = 'CANCELLED';
  else if (!filters.length) where.state = { not: 'CANCELLED' };

  const q = String(req.query.q || '').trim();
  if (q) where.OR = [{ reference: { contains: q } }, { product: { name: { contains: q } } }];

  const take = Math.min(Number(req.query.limit) || 40, 200);
  const skip = Number(req.query.skip) || 0;
  const [rows, total] = await Promise.all([
    prisma.manufacturingOrder.findMany({ where, orderBy: { createdAt: 'desc' }, take, skip, include: moInclude }),
    prisma.manufacturingOrder.count({ where }),
  ]);

  let groups;
  if (req.query.groupBy === 'state') {
    const g = await prisma.manufacturingOrder.groupBy({ by: ['state'], where, _count: { _all: true } });
    groups = g.map((x) => ({ key: x.state, label: x.state, count: x._count._all }));
  }
  res.json({ rows: rows.map(serializeMo), total, skip, take, groups });
});

adminMos.get('/:id', async (req, res) => {
  const m = await prisma.manufacturingOrder.findUnique({ where: { id: Number(req.params.id) }, include: moInclude });
  if (!m) throw new HttpError(404, 'Manufacturing order not found');

  // Live availability at the order's warehouse, so the UI can warn before start.
  const held = m.warehouseId
    ? await prisma.warehouseStock.findMany({
        where: { warehouseId: m.warehouseId, productId: { in: m.components.map((c) => c.productId) } },
      })
    : [];
  const onHand = new Map(held.map((h) => [h.productId, h.quantity]));

  res.json({
    ...serializeMo(m),
    components: serializeMo(m).components.map((c: any) => ({
      ...c,
      available: m.warehouseId ? onHand.get(c.productId) ?? 0 : undefined,
    })),
  });
});

/** Preview what a run would need, before committing to an order. */
adminMos.get('/explode/:bomId', async (req, res) => {
  const qty = Number(req.query.quantity) || 1;
  const warehouseId = req.query.warehouseId ? Number(req.query.warehouseId) : null;
  res.json(await explodeBom(Number(req.params.bomId), qty, warehouseId));
});

const moSchema = z.object({
  productId: z.number().int().positive(),
  bomId: z.number().int().positive().optional().nullable(),
  warehouseId: z.number().int().positive().optional().nullable(),
  quantity: z.number().int().positive(),
  scheduledAt: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
  /** Override the exploded components; omit to take them from the BoM. */
  components: z
    .array(z.object({ productId: z.number().int().positive(), quantityRequired: z.number().int().positive() }))
    .optional(),
});

adminMos.post('/', async (req, res) => {
  const data = moSchema.parse(req.body);

  const warehouseId =
    data.warehouseId ?? (await prisma.warehouse.findFirst({ where: { isDefault: true, isActive: true } }))?.id ?? null;

  let components = data.components;
  if (!components?.length) {
    if (!data.bomId) throw new HttpError(400, 'Choose a bill of materials, or list the components yourself');
    const exploded = await explodeBom(data.bomId, data.quantity, warehouseId);
    components = exploded.map((c) => ({ productId: c.productId, quantityRequired: c.quantityRequired }));
  }

  const products = await prisma.product.findMany({ where: { id: { in: components.map((c) => c.productId) } } });
  const byId = new Map(products.map((p) => [p.id, p]));

  const created = await prisma.manufacturingOrder.create({
    data: {
      reference: await nextRef('mo'),
      productId: data.productId,
      bomId: data.bomId ?? null,
      warehouseId,
      quantity: data.quantity,
      scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
      note: data.note || null,
      createdByEmail: req.auth?.email ?? null,
      components: {
        create: components.map((c) => {
          const p = byId.get(c.productId);
          if (!p) throw new HttpError(400, `Component ${c.productId} not found`);
          return { productId: p.id, name: p.name, sku: p.sku, quantityRequired: c.quantityRequired };
        }),
      },
    },
    include: moInclude,
  });
  res.status(201).json(serializeMo(created));
});

adminMos.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.manufacturingOrder.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, 'Manufacturing order not found');
  if (existing.state !== 'DRAFT') throw new HttpError(400, 'Only a draft order can be edited');

  const data = moSchema.parse(req.body);
  const warehouseId = data.warehouseId ?? existing.warehouseId;
  let components = data.components;
  if (!components?.length && data.bomId) {
    const exploded = await explodeBom(data.bomId, data.quantity, warehouseId);
    components = exploded.map((c) => ({ productId: c.productId, quantityRequired: c.quantityRequired }));
  }
  if (!components?.length) throw new HttpError(400, 'A manufacturing order needs components');

  const products = await prisma.product.findMany({ where: { id: { in: components.map((c) => c.productId) } } });
  const byId = new Map(products.map((p) => [p.id, p]));

  const updated = await prisma.$transaction(async (tx) => {
    await tx.moComponent.deleteMany({ where: { moId: id } });
    return tx.manufacturingOrder.update({
      where: { id },
      data: {
        productId: data.productId,
        bomId: data.bomId ?? null,
        warehouseId,
        quantity: data.quantity,
        scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
        note: data.note || null,
        components: {
          create: components!.map((c) => {
            const p = byId.get(c.productId);
            if (!p) throw new HttpError(400, `Component ${c.productId} not found`);
            return { productId: p.id, name: p.name, sku: p.sku, quantityRequired: c.quantityRequired };
          }),
        },
      },
      include: moInclude,
    });
  });
  res.json(serializeMo(updated));
});

adminMos.post('/:id/confirm', async (req, res) => {
  const id = Number(req.params.id);
  const mo = await prisma.manufacturingOrder.findUnique({ where: { id } });
  if (!mo) throw new HttpError(404, 'Manufacturing order not found');
  if (mo.state !== 'DRAFT') throw new HttpError(400, 'This order has already been confirmed');
  const updated = await prisma.manufacturingOrder.update({ where: { id }, data: { state: 'CONFIRMED' }, include: moInclude });
  res.json(serializeMo(updated));
});

/** Produce — consumes components and creates the finished goods. */
adminMos.post('/:id/produce', async (req, res) => {
  const id = Number(req.params.id);
  const { quantity } = z.object({ quantity: z.number().int().positive() }).parse(req.body);
  const updated = await prisma.$transaction((tx) => produce(tx, id, quantity, req.auth?.email));
  res.json(serializeMo(updated));
});

adminMos.post('/:id/cancel', async (req, res) => {
  const id = Number(req.params.id);
  const mo = await prisma.manufacturingOrder.findUnique({ where: { id } });
  if (!mo) throw new HttpError(404, 'Manufacturing order not found');
  if (mo.state === 'DONE') throw new HttpError(400, 'A completed order cannot be cancelled');
  if (mo.producedQty > 0) throw new HttpError(400, 'Goods have already been produced on this order');
  const updated = await prisma.manufacturingOrder.update({ where: { id }, data: { state: 'CANCELLED' }, include: moInclude });
  res.json(serializeMo(updated));
});

adminMos.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const mo = await prisma.manufacturingOrder.findUnique({ where: { id } });
  if (!mo) throw new HttpError(404, 'Manufacturing order not found');
  if (mo.state !== 'DRAFT') throw new HttpError(400, 'Only a draft order can be deleted');
  await prisma.manufacturingOrder.delete({ where: { id } });
  res.json({ ok: true });
});
