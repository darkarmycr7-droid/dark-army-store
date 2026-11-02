import { Router } from 'express';
import { z } from 'zod';
import { prisma, money } from '../../lib/prisma';
import { HttpError } from '../../middleware/error';
import { applyMovement, landedUnitCosts } from '../../services/inventory.service';
import { postGoodsReceipt, postSupplierPayment, postLandedCostPayment } from '../../services/accounting.service';

export const adminPurchaseOrders = Router();

const STATUSES = ['DRAFT', 'ORDERED', 'PARTIAL', 'RECEIVED', 'CANCELLED'] as const;
/** Statuses whose goods are still expected — the only ones you can receive against. */
const RECEIVABLE = ['ORDERED', 'PARTIAL'];
/** Statuses where the PO is still editable (nothing has arrived yet). */
const EDITABLE = ['DRAFT', 'ORDERED'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serialize(p: any) {
  return {
    id: p.id,
    poNumber: p.poNumber,
    supplierId: p.supplierId,
    supplier: p.supplier ? { id: p.supplier.id, name: p.supplier.name } : null,
    status: p.status,
    reference: p.reference,
    notes: p.notes,
    subtotal: money(p.subtotal),
    currency: p.currency,
    exchangeRate: money(p.exchangeRate),
    subtotalKwd: money(money(p.subtotal) * money(p.exchangeRate)),
    shipping: money(p.shipping),
    customsDuty: money(p.customsDuty),
    clearanceFee: money(p.clearanceFee),
    insurance: money(p.insurance),
    otherCost: money(p.otherCost),
    landedTotal: money(
      money(p.shipping) + money(p.customsDuty) + money(p.clearanceFee) + money(p.insurance) + money(p.otherCost)
    ),
    landedPaid: money(p.landedPaid),
    total: money(p.total),
    amountPaid: money(p.amountPaid),
    expectedAt: p.expectedAt,
    orderedAt: p.orderedAt,
    receivedAt: p.receivedAt,
    createdByEmail: p.createdByEmail,
    createdAt: p.createdAt,
    items: (p.items || []).map((i: any) => ({
      id: i.id,
      productId: i.productId,
      name: i.name,
      sku: i.sku,
      unitCost: money(i.unitCost),
      quantity: i.quantity,
      receivedQty: i.receivedQty,
      lineTotal: money(i.lineTotal),
    })),
  };
}

/** Sequential, human-readable PO number (PO-000001), retried on collision. */
async function nextPoNumber(): Promise<string> {
  const last = await prisma.purchaseOrder.findFirst({ orderBy: { id: 'desc' }, select: { id: true } });
  let seq = (last?.id ?? 0) + 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const poNumber = `PO-${String(seq).padStart(6, '0')}`;
    if (!(await prisma.purchaseOrder.findUnique({ where: { poNumber } }))) return poNumber;
    seq++;
  }
}

// ---- List ----
adminPurchaseOrders.get('/', async (req, res) => {
  const q = (req.query.q as string) || '';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};
  const status = req.query.status as string | undefined;
  if (status && (STATUSES as readonly string[]).includes(status)) where.status = status;
  if (req.query.supplierId) where.supplierId = Number(req.query.supplierId);
  if (q) where.OR = [{ poNumber: { contains: q } }, { reference: { contains: q } }, { supplier: { name: { contains: q } } }];

  const rows = await prisma.purchaseOrder.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: { supplier: true, items: true },
  });
  res.json(rows.map(serialize));
});

adminPurchaseOrders.get('/:id', async (req, res) => {
  const po = await prisma.purchaseOrder.findUnique({
    where: { id: Number(req.params.id) },
    include: { supplier: true, items: { orderBy: { id: 'asc' } } },
  });
  if (!po) throw new HttpError(404, 'Purchase order not found');
  res.json(serialize(po));
});

const poSchema = z.object({
  supplierId: z.number().int().positive(),
  status: z.enum(['DRAFT', 'ORDERED']).default('DRAFT'),
  reference: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  // Supplier's invoicing currency, and KWD per 1 unit of it.
  currency: z.string().min(3).max(4).default('KWD'),
  exchangeRate: z.number().positive().default(1),
  // Landed costs, always entered in KWD.
  shipping: z.number().min(0).default(0),
  customsDuty: z.number().min(0).default(0),
  clearanceFee: z.number().min(0).default(0),
  insurance: z.number().min(0).default(0),
  otherCost: z.number().min(0).default(0),
  expectedAt: z.string().optional().nullable(),
  items: z
    .array(
      z.object({
        productId: z.number().int().positive(),
        quantity: z.number().int().positive(),
        unitCost: z.number().min(0),
      })
    )
    .min(1, 'Add at least one product'),
});

/** All landed costs on an order, always in KWD. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function landedSum(d: any) {
  return money(
    money(d.shipping) + money(d.customsDuty) + money(d.clearanceFee) + money(d.insurance) + money(d.otherCost)
  );
}

/** Snapshot product name/sku and price each line. */
async function buildLines(items: z.infer<typeof poSchema>['items']) {
  const products = await prisma.product.findMany({ where: { id: { in: items.map((i) => i.productId) } } });
  const byId = new Map(products.map((p) => [p.id, p]));
  return items.map((i) => {
    const p = byId.get(i.productId);
    if (!p) throw new HttpError(400, `Product ${i.productId} not found`);
    return {
      productId: p.id,
      name: p.name,
      sku: p.sku,
      unitCost: money(i.unitCost),
      quantity: i.quantity,
      lineTotal: money(money(i.unitCost) * i.quantity),
    };
  });
}

// ---- Create ----
adminPurchaseOrders.post('/', async (req, res) => {
  const data = poSchema.parse(req.body);
  if (!(await prisma.supplier.findUnique({ where: { id: data.supplierId } }))) {
    throw new HttpError(400, 'Supplier not found');
  }
  const lines = await buildLines(data.items);
  const subtotal = money(lines.reduce((s, l) => s + l.lineTotal, 0));
  const poNumber = await nextPoNumber();

  const created = await prisma.purchaseOrder.create({
    data: {
      poNumber,
      supplierId: data.supplierId,
      status: data.status,
      reference: data.reference || null,
      notes: data.notes || null,
      subtotal,
      currency: data.currency.toUpperCase(),
      exchangeRate: data.exchangeRate,
      shipping: data.shipping,
      customsDuty: data.customsDuty,
      clearanceFee: data.clearanceFee,
      insurance: data.insurance,
      otherCost: data.otherCost,
      total: money(subtotal * data.exchangeRate + landedSum(data)),
      expectedAt: data.expectedAt ? new Date(data.expectedAt) : null,
      orderedAt: data.status === 'ORDERED' ? new Date() : null,
      createdByEmail: req.auth?.email ?? null,
      items: { create: lines },
    },
    include: { supplier: true, items: { orderBy: { id: 'asc' } } },
  });
  res.status(201).json(serialize(created));
});

// ---- Update (only while nothing has been received) ----
adminPurchaseOrders.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.purchaseOrder.findUnique({ where: { id }, include: { items: true } });
  if (!existing) throw new HttpError(404, 'Purchase order not found');
  if (!EDITABLE.includes(existing.status)) {
    throw new HttpError(400, `A ${existing.status.toLowerCase()} purchase order cannot be edited`);
  }
  if (existing.items.some((i) => i.receivedQty > 0)) {
    throw new HttpError(400, 'Goods have already been received against this order');
  }

  const data = poSchema.parse(req.body);
  const lines = await buildLines(data.items);
  const subtotal = money(lines.reduce((s, l) => s + l.lineTotal, 0));

  const updated = await prisma.$transaction(async (tx) => {
    await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: id } });
    return tx.purchaseOrder.update({
      where: { id },
      data: {
        supplierId: data.supplierId,
        status: data.status,
        reference: data.reference || null,
        notes: data.notes || null,
        subtotal,
        currency: data.currency.toUpperCase(),
        exchangeRate: data.exchangeRate,
        shipping: data.shipping,
        customsDuty: data.customsDuty,
        clearanceFee: data.clearanceFee,
        insurance: data.insurance,
        otherCost: data.otherCost,
        total: money(subtotal * data.exchangeRate + landedSum(data)),
        expectedAt: data.expectedAt ? new Date(data.expectedAt) : null,
        orderedAt: data.status === 'ORDERED' ? existing.orderedAt ?? new Date() : null,
        items: { create: lines },
      },
      include: { supplier: true, items: { orderBy: { id: 'asc' } } },
    });
  });
  res.json(serialize(updated));
});

// ---- Status (send to supplier / cancel) ----
adminPurchaseOrders.patch('/:id/status', async (req, res) => {
  const id = Number(req.params.id);
  const { status } = z.object({ status: z.enum(['DRAFT', 'ORDERED', 'CANCELLED']) }).parse(req.body);
  const existing = await prisma.purchaseOrder.findUnique({ where: { id }, include: { items: true } });
  if (!existing) throw new HttpError(404, 'Purchase order not found');
  if (existing.status === 'RECEIVED') throw new HttpError(400, 'This purchase order is already fully received');
  if (status === 'CANCELLED' && existing.items.some((i) => i.receivedQty > 0)) {
    throw new HttpError(400, 'Goods have already been received — cancel is no longer possible');
  }

  const updated = await prisma.purchaseOrder.update({
    where: { id },
    data: { status, orderedAt: status === 'ORDERED' ? existing.orderedAt ?? new Date() : existing.orderedAt },
    include: { supplier: true, items: { orderBy: { id: 'asc' } } },
  });
  res.json(serialize(updated));
});

// ---- Receive goods ----
// Increments stock, recomputes weighted-average landed cost and writes one
// PURCHASE movement per line — all inside a single transaction.
const receiveSchema = z.object({
  lines: z.array(z.object({ itemId: z.number().int().positive(), qty: z.number().int().positive() })).min(1),
  reference: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

adminPurchaseOrders.post('/:id/receive', async (req, res) => {
  const id = Number(req.params.id);
  const body = receiveSchema.parse(req.body);
  const po = await prisma.purchaseOrder.findUnique({ where: { id }, include: { items: { orderBy: { id: 'asc' } } } });
  if (!po) throw new HttpError(404, 'Purchase order not found');
  if (!RECEIVABLE.includes(po.status)) {
    throw new HttpError(400, `Cannot receive against a ${po.status.toLowerCase()} purchase order`);
  }

  // Line costs are in the supplier's currency, landed costs are in KWD, so
  // convert the goods first and then spread freight / customs / clearance /
  // insurance over every line of the PO (not just this receipt) pro-rata by
  // value. Partial receipts therefore all carry the same per-unit surcharge
  // and the full landed cost lands exactly once.
  const rate = money(po.exchangeRate) || 1;
  const landedTotal = money(
    money(po.shipping) + money(po.customsDuty) + money(po.clearanceFee) + money(po.insurance) + money(po.otherCost)
  );
  const landed = landedUnitCosts(
    po.items.map((i) => ({ qty: i.quantity, unitCost: money(money(i.unitCost) * rate) })),
    landedTotal
  );
  const costByItemId = new Map(po.items.map((i, idx) => [i.id, landed[idx]]));
  /** Goods-only cost in KWD, i.e. what the supplier is actually owed. */
  const goodsCostByItemId = new Map(po.items.map((i) => [i.id, money(money(i.unitCost) * rate)]));

  for (const line of body.lines) {
    const item = po.items.find((i) => i.id === line.itemId);
    if (!item) throw new HttpError(400, `Line ${line.itemId} is not on this purchase order`);
    const remaining = item.quantity - item.receivedQty;
    if (line.qty > remaining) {
      throw new HttpError(400, `Only ${remaining} of ${item.name} still outstanding on this order`);
    }
  }

  // One key per receipt so partial receipts each post their own entry.
  const receiptKey = `${Date.now()}`;

  const updated = await prisma.$transaction(async (tx) => {
    let receivedValue = 0;
    let goodsValue = 0;
    for (const line of body.lines) {
      const item = po.items.find((i) => i.id === line.itemId)!;
      receivedValue += (costByItemId.get(item.id) ?? money(item.unitCost)) * line.qty;
      goodsValue += (goodsCostByItemId.get(item.id) ?? money(item.unitCost)) * line.qty;
      await applyMovement(tx, {
        productId: item.productId,
        qty: line.qty,
        type: 'PURCHASE',
        unitCost: costByItemId.get(item.id) ?? money(item.unitCost),
        refType: 'PO',
        refId: po.id,
        refLabel: po.poNumber,
        reason: body.reference ? `Received on ${body.reference}` : 'Goods received',
        actorEmail: req.auth?.email,
      });
      await tx.purchaseOrderItem.update({
        where: { id: item.id },
        data: { receivedQty: { increment: line.qty } },
      });
    }

    // Stock on to the balance sheet; the supplier is owed only the goods, the
    // rest is owed to freight agents and customs.
    await postGoodsReceipt(
      tx,
      po,
      money(goodsValue),
      money(receivedValue - goodsValue),
      receiptKey,
      req.auth?.email
    );

    const fresh = await tx.purchaseOrderItem.findMany({ where: { purchaseOrderId: id } });
    const complete = fresh.every((i) => i.receivedQty >= i.quantity);

    return tx.purchaseOrder.update({
      where: { id },
      data: {
        status: complete ? 'RECEIVED' : 'PARTIAL',
        receivedAt: complete ? new Date() : po.receivedAt,
        reference: body.reference ?? po.reference,
        notes: body.notes ?? po.notes,
      },
      include: { supplier: true, items: { orderBy: { id: 'asc' } } },
    });
  });

  res.json(serialize(updated));
});

/** Goods received so far, in KWD — what the supplier is actually owed. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function supplierBilled(po: any): number {
  const rate = money(po.exchangeRate) || 1;
  return money(po.items.reduce((s: number, i: any) => s + money(i.unitCost) * rate * i.receivedQty, 0));
}

/** Landed costs attributable to what has arrived, pro-rata by ordered value. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function landedBilled(po: any): number {
  const orderedValue = money(po.items.reduce((s: number, i: any) => s + money(i.lineTotal), 0));
  if (orderedValue <= 0) return 0;
  const receivedValue = money(po.items.reduce((s: number, i: any) => s + money(i.unitCost) * i.receivedQty, 0));
  const total = money(
    money(po.shipping) + money(po.customsDuty) + money(po.clearanceFee) + money(po.insurance) + money(po.otherCost)
  );
  return money((total * receivedValue) / orderedValue);
}

// ---- Pay a supplier (settles Accounts Payable) ----
adminPurchaseOrders.post('/:id/payments', async (req, res) => {
  const id = Number(req.params.id);
  const { amount, method } = z
    .object({ amount: z.number().positive(), method: z.enum(['CASH', 'BANK']).default('BANK') })
    .parse(req.body);

  const po = await prisma.purchaseOrder.findUnique({ where: { id }, include: { items: true } });
  if (!po) throw new HttpError(404, 'Purchase order not found');
  if (!['PARTIAL', 'RECEIVED'].includes(po.status)) {
    throw new HttpError(400, 'Nothing is payable until goods have been received');
  }

  // The supplier is owed the GOODS only, converted to KWD — freight and
  // customs are owed to other parties and settled separately.
  const billed = supplierBilled(po);
  const outstanding = money(billed - money(po.amountPaid));

  if (money(amount) > outstanding + 0.0005) {
    throw new HttpError(400, `Only ${outstanding.toFixed(3)} is outstanding to this supplier`);
  }

  const updated = await prisma.$transaction(async (tx) => {
    await postSupplierPayment(tx, po, money(amount), method, `${Date.now()}`, req.auth?.email);
    return tx.purchaseOrder.update({
      where: { id },
      data: { amountPaid: { increment: money(amount) } },
      include: { supplier: true, items: { orderBy: { id: 'asc' } } },
    });
  });

  res.status(201).json({ ...serialize(updated), billed, outstanding: money(outstanding - money(amount)) });
});

// ---- Pay freight / customs / clearance (settles Accrued Landed Costs) ----
adminPurchaseOrders.post('/:id/landed-payments', async (req, res) => {
  const id = Number(req.params.id);
  const { amount, method } = z
    .object({ amount: z.number().positive(), method: z.enum(['CASH', 'BANK']).default('BANK') })
    .parse(req.body);

  const po = await prisma.purchaseOrder.findUnique({ where: { id }, include: { items: true } });
  if (!po) throw new HttpError(404, 'Purchase order not found');
  if (!['PARTIAL', 'RECEIVED'].includes(po.status)) {
    throw new HttpError(400, 'Landed costs accrue when the goods arrive');
  }

  const billed = landedBilled(po);
  const outstanding = money(billed - money(po.landedPaid));
  if (outstanding <= 0) throw new HttpError(400, 'No landed costs are outstanding on this order');
  if (money(amount) > outstanding + 0.0005) {
    throw new HttpError(400, `Only ${outstanding.toFixed(3)} of landed costs is outstanding`);
  }

  const updated = await prisma.$transaction(async (tx) => {
    await postLandedCostPayment(tx, po, money(amount), method, `${Date.now()}`, req.auth?.email);
    return tx.purchaseOrder.update({
      where: { id },
      data: { landedPaid: { increment: money(amount) } },
      include: { supplier: true, items: { orderBy: { id: 'asc' } } },
    });
  });

  res.status(201).json({ ...serialize(updated), landedBilled: billed, landedOutstanding: money(outstanding - money(amount)) });
});

// ---- Delete (drafts only; anything committed stays on the record) ----
adminPurchaseOrders.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.purchaseOrder.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, 'Purchase order not found');
  if (existing.status !== 'DRAFT') {
    throw new HttpError(400, 'Only draft purchase orders can be deleted — cancel it instead');
  }
  await prisma.purchaseOrder.delete({ where: { id } });
  res.json({ ok: true });
});
