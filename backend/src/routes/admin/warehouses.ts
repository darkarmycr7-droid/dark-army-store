import { Router } from 'express';
import { z } from 'zod';
import { prisma, money } from '../../lib/prisma';
import { HttpError } from '../../middleware/error';
import { applyMovement } from '../../services/inventory.service';

export const adminWarehouses = Router();
// Mounted separately at /api/admin/transfers so that "/:id" on the warehouse
// router cannot swallow the transfer paths.
export const adminTransfers = Router();

/**
 * Central warehouse + branch shops.
 *
 * Product.stockQty stays the company-wide total; WarehouseStock holds the
 * split. Transfers are two-step (send, then receive) so goods in transit are
 * visible and the source stops showing stock it has already despatched.
 *
 * A transfer between our own warehouses posts NO journal entry — the goods
 * never leave the company, and inventory value is unchanged.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeWh(w: any) {
  return {
    id: w.id,
    code: w.code,
    name: w.name,
    nameAr: w.nameAr,
    type: w.type,
    isDefault: w.isDefault,
    area: w.area,
    address: w.address,
    phone: w.phone,
    isActive: w.isActive,
    skuCount: w._count?.stock ?? 0,
  };
}

// ---- Warehouses ----
adminWarehouses.get('/', async (req, res) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};
  const filters = String(req.query.filters || '').split(',').filter(Boolean);
  where.isActive = filters.includes('archived') ? false : true;
  if (filters.includes('central')) where.type = 'CENTRAL';
  if (filters.includes('shops')) where.type = 'SHOP';
  const q = String(req.query.q || '').trim();
  if (q) where.OR = [{ name: { contains: q } }, { code: { contains: q } }, { area: { contains: q } }];

  const rows = await prisma.warehouse.findMany({
    where,
    orderBy: [{ isDefault: 'desc' }, { code: 'asc' }],
    include: { _count: { select: { stock: true } } },
  });

  // Stock value per warehouse, at each product's average cost.
  const totals = await prisma.warehouseStock.findMany({
    where: { warehouseId: { in: rows.map((r) => r.id) } },
    include: { product: { select: { avgCost: true, costPrice: true } } },
  });
  const valueByWh = new Map<number, { units: number; value: number }>();
  for (const s of totals) {
    const cur = valueByWh.get(s.warehouseId) || { units: 0, value: 0 };
    cur.units += s.quantity;
    cur.value += s.quantity * (money(s.product.avgCost) || money(s.product.costPrice));
    valueByWh.set(s.warehouseId, cur);
  }

  res.json({
    rows: rows.map((w) => ({
      ...serializeWh(w),
      units: valueByWh.get(w.id)?.units ?? 0,
      stockValue: money(valueByWh.get(w.id)?.value ?? 0),
    })),
    total: rows.length,
    skip: 0,
    take: rows.length,
  });
});

adminWarehouses.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const w = await prisma.warehouse.findUnique({ where: { id }, include: { _count: { select: { stock: true } } } });
  if (!w) throw new HttpError(404, 'Warehouse not found');

  const stock = await prisma.warehouseStock.findMany({
    where: { warehouseId: id, quantity: { not: 0 } },
    include: { product: { select: { id: true, name: true, sku: true, avgCost: true, costPrice: true, lowStockAlert: true } } },
    orderBy: { product: { name: 'asc' } },
    take: 500,
  });

  res.json({
    ...serializeWh(w),
    stock: stock.map((s) => {
      const cost = money(s.product.avgCost) || money(s.product.costPrice);
      return {
        productId: s.productId,
        name: s.product.name,
        sku: s.product.sku,
        quantity: s.quantity,
        unitCost: cost,
        value: money(s.quantity * cost),
        low: s.quantity <= s.product.lowStockAlert,
      };
    }),
  });
});

const whSchema = z.object({
  code: z.string().min(1).max(12),
  name: z.string().min(2),
  nameAr: z.string().optional().nullable(),
  type: z.enum(['CENTRAL', 'SHOP']).default('SHOP'),
  isDefault: z.boolean().default(false),
  area: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function whData(d: any) {
  return {
    code: d.code.trim().toUpperCase(),
    name: d.name.trim(),
    nameAr: d.nameAr || null,
    type: d.type,
    area: d.area || null,
    address: d.address || null,
    phone: d.phone || null,
    isActive: d.isActive,
  };
}

adminWarehouses.post('/', async (req, res) => {
  const data = whSchema.parse(req.body);
  if (await prisma.warehouse.findUnique({ where: { code: data.code.toUpperCase() } })) {
    throw new HttpError(409, `Warehouse code "${data.code.toUpperCase()}" already exists`);
  }
  const created = await prisma.$transaction(async (tx) => {
    // Exactly one default at any time.
    if (data.isDefault) await tx.warehouse.updateMany({ data: { isDefault: false } });
    return tx.warehouse.create({ data: { ...whData(data), isDefault: data.isDefault } });
  });
  res.status(201).json(serializeWh(created));
});

adminWarehouses.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.warehouse.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, 'Warehouse not found');
  const data = whSchema.parse(req.body);

  if (existing.isDefault && !data.isDefault) {
    throw new HttpError(400, 'Make another warehouse the default first — one is always required');
  }
  if (existing.isDefault && !data.isActive) {
    throw new HttpError(400, 'The default warehouse cannot be archived');
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (data.isDefault) await tx.warehouse.updateMany({ data: { isDefault: false } });
    return tx.warehouse.update({ where: { id }, data: { ...whData(data), isDefault: data.isDefault } });
  });
  res.json(serializeWh(updated));
});

adminWarehouses.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const w = await prisma.warehouse.findUnique({ where: { id } });
  if (!w) throw new HttpError(404, 'Warehouse not found');
  if (w.isDefault) throw new HttpError(400, 'The default warehouse cannot be deleted');

  const held = await prisma.warehouseStock.aggregate({ where: { warehouseId: id }, _sum: { quantity: true } });
  if ((held._sum.quantity ?? 0) !== 0) {
    throw new HttpError(400, 'This warehouse still holds stock — transfer it out first');
  }
  const used = await prisma.stockMovement.count({ where: { warehouseId: id } });
  if (used > 0) {
    await prisma.warehouse.update({ where: { id }, data: { isActive: false } });
    return res.json({ ok: true, archived: true });
  }
  await prisma.warehouse.delete({ where: { id } });
  res.json({ ok: true });
});

// ---- Transfers ----
const TRANSFER_EDITABLE = ['DRAFT'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeTransfer(t: any) {
  return {
    id: t.id,
    reference: t.reference,
    fromWarehouseId: t.fromWarehouseId,
    fromWarehouse: t.fromWarehouse ? { id: t.fromWarehouse.id, code: t.fromWarehouse.code, name: t.fromWarehouse.name } : null,
    toWarehouseId: t.toWarehouseId,
    toWarehouse: t.toWarehouse ? { id: t.toWarehouse.id, code: t.toWarehouse.code, name: t.toWarehouse.name } : null,
    state: t.state,
    note: t.note,
    createdByEmail: t.createdByEmail,
    sentAt: t.sentAt,
    receivedAt: t.receivedAt,
    createdAt: t.createdAt,
    lines: (t.lines || []).map((l: any) => ({
      id: l.id,
      productId: l.productId,
      name: l.name,
      sku: l.sku,
      quantity: l.quantity,
      receivedQty: l.receivedQty,
    })),
  };
}

async function nextTransferRef(): Promise<string> {
  const last = await prisma.stockTransfer.findFirst({ orderBy: { id: 'desc' }, select: { id: true } });
  let seq = (last?.id ?? 0) + 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const r = `TR-${String(seq).padStart(6, '0')}`;
    if (!(await prisma.stockTransfer.findUnique({ where: { reference: r } }))) return r;
    seq++;
  }
}

adminTransfers.get('/', async (req, res) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};
  const filters = String(req.query.filters || '').split(',').filter(Boolean);
  if (filters.includes('draft')) where.state = 'DRAFT';
  if (filters.includes('inTransit')) where.state = 'SENT';
  if (filters.includes('done')) where.state = 'DONE';
  if (filters.includes('cancelled')) where.state = 'CANCELLED';
  else if (!filters.length) where.state = { not: 'CANCELLED' };

  const q = String(req.query.q || '').trim();
  if (q) {
    where.OR = [
      { reference: { contains: q } },
      { fromWarehouse: { name: { contains: q } } },
      { toWarehouse: { name: { contains: q } } },
    ];
  }

  const take = Math.min(Number(req.query.limit) || 40, 200);
  const skip = Number(req.query.skip) || 0;
  const [rows, total] = await Promise.all([
    prisma.stockTransfer.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      skip,
      include: { fromWarehouse: true, toWarehouse: true, lines: true },
    }),
    prisma.stockTransfer.count({ where }),
  ]);

  let groups;
  if (req.query.groupBy === 'state') {
    const g = await prisma.stockTransfer.groupBy({ by: ['state'], where, _count: { _all: true } });
    groups = g.map((x) => ({ key: x.state, label: x.state, count: x._count._all }));
  }

  res.json({ rows: rows.map(serializeTransfer), total, skip, take, groups });
});

adminTransfers.get('/:id', async (req, res) => {
  const t = await prisma.stockTransfer.findUnique({
    where: { id: Number(req.params.id) },
    include: { fromWarehouse: true, toWarehouse: true, lines: { orderBy: { id: 'asc' } } },
  });
  if (!t) throw new HttpError(404, 'Transfer not found');
  res.json(serializeTransfer(t));
});

const transferSchema = z.object({
  fromWarehouseId: z.number().int().positive(),
  toWarehouseId: z.number().int().positive(),
  note: z.string().optional().nullable(),
  lines: z.array(z.object({ productId: z.number().int().positive(), quantity: z.number().int().positive() })).min(1),
});

async function buildTransferLines(items: { productId: number; quantity: number }[]) {
  const products = await prisma.product.findMany({ where: { id: { in: items.map((i) => i.productId) } } });
  const byId = new Map(products.map((p) => [p.id, p]));
  return items.map((i) => {
    const p = byId.get(i.productId);
    if (!p) throw new HttpError(400, `Product ${i.productId} not found`);
    return { productId: p.id, name: p.name, sku: p.sku, quantity: i.quantity };
  });
}

adminTransfers.post('/', async (req, res) => {
  const data = transferSchema.parse(req.body);
  if (data.fromWarehouseId === data.toWarehouseId) {
    throw new HttpError(400, 'Source and destination must be different warehouses');
  }
  const lines = await buildTransferLines(data.lines);
  const created = await prisma.stockTransfer.create({
    data: {
      reference: await nextTransferRef(),
      fromWarehouseId: data.fromWarehouseId,
      toWarehouseId: data.toWarehouseId,
      note: data.note || null,
      createdByEmail: req.auth?.email ?? null,
      lines: { create: lines },
    },
    include: { fromWarehouse: true, toWarehouse: true, lines: { orderBy: { id: 'asc' } } },
  });
  res.status(201).json(serializeTransfer(created));
});

adminTransfers.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.stockTransfer.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, 'Transfer not found');
  if (!TRANSFER_EDITABLE.includes(existing.state)) {
    throw new HttpError(400, 'Only a draft transfer can be edited');
  }
  const data = transferSchema.parse(req.body);
  if (data.fromWarehouseId === data.toWarehouseId) {
    throw new HttpError(400, 'Source and destination must be different warehouses');
  }
  const lines = await buildTransferLines(data.lines);

  const updated = await prisma.$transaction(async (tx) => {
    await tx.stockTransferLine.deleteMany({ where: { transferId: id } });
    return tx.stockTransfer.update({
      where: { id },
      data: {
        fromWarehouseId: data.fromWarehouseId,
        toWarehouseId: data.toWarehouseId,
        note: data.note || null,
        lines: { create: lines },
      },
      include: { fromWarehouse: true, toWarehouse: true, lines: { orderBy: { id: 'asc' } } },
    });
  });
  res.json(serializeTransfer(updated));
});

/** Send — stock leaves the source warehouse and is in transit. */
adminTransfers.post('/:id/send', async (req, res) => {
  const id = Number(req.params.id);
  const t = await prisma.stockTransfer.findUnique({ where: { id }, include: { lines: true, fromWarehouse: true, toWarehouse: true } });
  if (!t) throw new HttpError(404, 'Transfer not found');
  if (t.state !== 'DRAFT') throw new HttpError(400, 'This transfer has already been sent');

  const updated = await prisma.$transaction(async (tx) => {
    for (const l of t.lines) {
      await applyMovement(tx, {
        productId: l.productId,
        qty: -l.quantity,
        type: 'TRANSFER_OUT',
        warehouseId: t.fromWarehouseId,
        refType: 'TRANSFER',
        refId: t.id,
        refLabel: t.reference,
        reason: `Sent to ${t.toWarehouse.name}`,
        actorEmail: req.auth?.email,
      });
    }
    return tx.stockTransfer.update({
      where: { id },
      data: { state: 'SENT', sentAt: new Date() },
      include: { fromWarehouse: true, toWarehouse: true, lines: { orderBy: { id: 'asc' } } },
    });
  });
  res.json(serializeTransfer(updated));
});

/** Receive — goods arrive at the destination. Partial receipts are allowed. */
adminTransfers.post('/:id/receive', async (req, res) => {
  const id = Number(req.params.id);
  const body = z
    .object({ lines: z.array(z.object({ lineId: z.number().int(), qty: z.number().int().positive() })).min(1) })
    .parse(req.body);

  const t = await prisma.stockTransfer.findUnique({ where: { id }, include: { lines: true, fromWarehouse: true, toWarehouse: true } });
  if (!t) throw new HttpError(404, 'Transfer not found');
  if (t.state !== 'SENT') throw new HttpError(400, 'Send the transfer before receiving it');

  for (const l of body.lines) {
    const line = t.lines.find((x) => x.id === l.lineId);
    if (!line) throw new HttpError(400, `Line ${l.lineId} is not on this transfer`);
    const remaining = line.quantity - line.receivedQty;
    if (l.qty > remaining) throw new HttpError(400, `Only ${remaining} of ${line.name} still in transit`);
  }

  const updated = await prisma.$transaction(async (tx) => {
    for (const l of body.lines) {
      const line = t.lines.find((x) => x.id === l.lineId)!;
      await applyMovement(tx, {
        productId: line.productId,
        qty: l.qty,
        type: 'TRANSFER_IN',
        warehouseId: t.toWarehouseId,
        refType: 'TRANSFER',
        refId: t.id,
        refLabel: t.reference,
        reason: `Received from ${t.fromWarehouse.name}`,
        actorEmail: req.auth?.email,
      });
      await tx.stockTransferLine.update({ where: { id: line.id }, data: { receivedQty: { increment: l.qty } } });
    }
    const fresh = await tx.stockTransferLine.findMany({ where: { transferId: id } });
    const complete = fresh.every((l) => l.receivedQty >= l.quantity);
    return tx.stockTransfer.update({
      where: { id },
      data: { state: complete ? 'DONE' : 'SENT', receivedAt: complete ? new Date() : t.receivedAt },
      include: { fromWarehouse: true, toWarehouse: true, lines: { orderBy: { id: 'asc' } } },
    });
  });
  res.json(serializeTransfer(updated));
});

adminTransfers.post('/:id/cancel', async (req, res) => {
  const id = Number(req.params.id);
  const t = await prisma.stockTransfer.findUnique({ where: { id }, include: { lines: true } });
  if (!t) throw new HttpError(404, 'Transfer not found');
  if (t.state === 'DONE') throw new HttpError(400, 'A completed transfer cannot be cancelled');
  if (t.state === 'SENT' && t.lines.some((l) => l.receivedQty > 0)) {
    throw new HttpError(400, 'Part of this transfer has already been received');
  }

  const updated = await prisma.$transaction(async (tx) => {
    // Goods already despatched go back to the source warehouse.
    if (t.state === 'SENT') {
      for (const l of t.lines) {
        await applyMovement(tx, {
          productId: l.productId,
          qty: l.quantity,
          type: 'TRANSFER_IN',
          warehouseId: t.fromWarehouseId,
          refType: 'TRANSFER',
          refId: t.id,
          refLabel: t.reference,
          reason: 'Transfer cancelled — returned to source',
          actorEmail: req.auth?.email,
        });
      }
    }
    return tx.stockTransfer.update({
      where: { id },
      data: { state: 'CANCELLED' },
      include: { fromWarehouse: true, toWarehouse: true, lines: { orderBy: { id: 'asc' } } },
    });
  });
  res.json(serializeTransfer(updated));
});

adminTransfers.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const t = await prisma.stockTransfer.findUnique({ where: { id } });
  if (!t) throw new HttpError(404, 'Transfer not found');
  if (t.state !== 'DRAFT') throw new HttpError(400, 'Only a draft transfer can be deleted');
  await prisma.stockTransfer.delete({ where: { id } });
  res.json({ ok: true });
});
