import { Router } from 'express';
import { z } from 'zod';
import { prisma, money } from '../../lib/prisma';
import { HttpError } from '../../middleware/error';
import { applyMovement } from '../../services/inventory.service';
import { postStockAdjustment } from '../../services/accounting.service';

export const adminStock = Router();

const TYPES = ['PURCHASE', 'SALE', 'RETURN', 'REFUND_RESTOCK', 'ADJUSTMENT', 'INITIAL'] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serialize(m: any) {
  return {
    id: m.id,
    productId: m.productId,
    product: m.product ? { id: m.product.id, name: m.product.name, sku: m.product.sku } : null,
    qty: m.qty,
    type: m.type,
    unitCost: money(m.unitCost),
    value: money(money(m.unitCost) * m.qty),
    balanceAfter: m.balanceAfter,
    avgCostAfter: money(m.avgCostAfter),
    refType: m.refType,
    refId: m.refId,
    refLabel: m.refLabel,
    reason: m.reason,
    actorEmail: m.actorEmail,
    createdAt: m.createdAt,
  };
}

// ---- Movement ledger ----
adminStock.get('/movements', async (req, res) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};
  if (req.query.productId) where.productId = Number(req.query.productId);
  const type = req.query.type as string | undefined;
  if (type && (TYPES as readonly string[]).includes(type)) where.type = type;
  if (req.query.from || req.query.to) {
    where.createdAt = {
      ...(req.query.from ? { gte: new Date(`${req.query.from}T00:00:00.000`) } : {}),
      ...(req.query.to ? { lte: new Date(`${req.query.to}T23:59:59.999`) } : {}),
    };
  }

  const take = Math.min(Number(req.query.limit) || 100, 500);
  const skip = Number(req.query.skip) || 0;
  const [rows, total] = await Promise.all([
    prisma.stockMovement.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      skip,
      include: { product: { select: { id: true, name: true, sku: true } } },
    }),
    prisma.stockMovement.count({ where }),
  ]);

  res.json({ rows: rows.map(serialize), total, skip, take });
});

// ---- Manual adjustment: stock count, damage, write-off ----
// Either an absolute countedQty (the ledger works out the delta) or a signed qty.
const adjustSchema = z
  .object({
    productId: z.number().int().positive(),
    countedQty: z.number().int().min(0).optional(),
    qty: z.number().int().optional(),
    reason: z.string().min(2, 'A reason is required'),
    unitCost: z.number().min(0).optional(),
  })
  .refine((d) => d.countedQty !== undefined || (d.qty !== undefined && d.qty !== 0), {
    message: 'Provide a counted quantity or a non-zero adjustment',
  });

adminStock.post('/adjust', async (req, res) => {
  const data = adjustSchema.parse(req.body);
  const product = await prisma.product.findUnique({ where: { id: data.productId } });
  if (!product) throw new HttpError(404, 'Product not found');

  const delta = data.countedQty !== undefined ? data.countedQty - product.stockQty : data.qty!;
  if (delta === 0) throw new HttpError(400, 'Counted quantity already matches the system quantity');

  const movement = await prisma.$transaction(async (tx) => {
    const m = await applyMovement(tx, {
      productId: product.id,
      qty: delta,
      type: 'ADJUSTMENT',
      // Only an increase can carry a new cost; write-offs leave the average alone.
      unitCost: delta > 0 ? data.unitCost : undefined,
      refType: 'ADJUSTMENT',
      reason: data.reason,
      actorEmail: req.auth?.email,
      // A stock count is the source of truth, even if it lands on a negative.
      allowNegative: data.countedQty !== undefined,
    });
    // Value the difference at the movement's own cost and book it to the P&L.
    await postStockAdjustment(
      tx,
      m.id,
      product.name,
      money(money(m.unitCost) * delta),
      data.reason,
      req.auth?.email
    );
    return m;
  });

  const fresh = await prisma.product.findUnique({
    where: { id: product.id },
    select: { id: true, name: true, sku: true, stockQty: true, avgCost: true },
  });
  res.status(201).json({
    movement: serialize(movement),
    product: fresh ? { ...fresh, avgCost: money(fresh.avgCost) } : null,
  });
});
