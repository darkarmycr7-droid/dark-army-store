// Manufacturing — assemble finished goods from components.
//
// Costing: components leave stock at their weighted-average cost, and the
// finished good enters stock at the rolled-up total divided by the quantity
// produced. Value is therefore preserved across the operation, which is why
// manufacturing posts NO journal entry — the Inventory account is debited and
// credited by the same amount, so the pair would net to zero.
//
// (Labour and overhead absorption would change that. They are deliberately out
// of scope: adding them means a Work-In-Progress account and a costing policy,
// which is a decision for the business, not a default.)

import { prisma, money } from '../lib/prisma';
import { HttpError } from '../middleware/error';
import { applyMovement, currentUnitCost, Tx } from './inventory.service';

export interface ExplodedComponent {
  productId: number;
  name: string;
  sku: string;
  quantityRequired: number;
  unitCost: number;
  available: number;
}

/** Sequential reference (MO-000001 / BOM-000001), retried on collision. */
export async function nextRef(model: 'mo' | 'bom'): Promise<string> {
  const prefix = model === 'mo' ? 'MO' : 'BOM';
  const last =
    model === 'mo'
      ? await prisma.manufacturingOrder.findFirst({ orderBy: { id: 'desc' }, select: { id: true } })
      : await prisma.billOfMaterials.findFirst({ orderBy: { id: 'desc' }, select: { id: true } });
  let seq = (last?.id ?? 0) + 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const ref = `${prefix}-${String(seq).padStart(6, '0')}`;
    const clash =
      model === 'mo'
        ? await prisma.manufacturingOrder.findUnique({ where: { reference: ref } })
        : await prisma.billOfMaterials.findUnique({ where: { reference: ref } });
    if (!clash) return ref;
    seq++;
  }
}

/**
 * Work out what a run needs. A BoM yields `bom.quantity` finished units, so
 * component requirements scale with the number of runs — rounded up, because
 * you cannot consume half a component.
 */
export async function explodeBom(
  bomId: number,
  quantityToProduce: number,
  warehouseId?: number | null
): Promise<ExplodedComponent[]> {
  const bom = await prisma.billOfMaterials.findUnique({
    where: { id: bomId },
    include: { lines: { include: { component: true }, orderBy: { sequence: 'asc' } } },
  });
  if (!bom) throw new HttpError(404, 'Bill of materials not found');
  if (!bom.lines.length) throw new HttpError(400, 'This bill of materials has no components');

  const runs = quantityToProduce / (bom.quantity || 1);

  const held = warehouseId
    ? await prisma.warehouseStock.findMany({
        where: { warehouseId, productId: { in: bom.lines.map((l) => l.componentId) } },
      })
    : [];
  const onHand = new Map(held.map((h) => [h.productId, h.quantity]));

  return bom.lines.map((l) => ({
    productId: l.componentId,
    name: l.component.name,
    sku: l.component.sku,
    quantityRequired: Math.ceil(l.quantity * runs),
    unitCost: currentUnitCost(l.component),
    available: warehouseId ? onHand.get(l.componentId) ?? 0 : l.component.stockQty,
  }));
}

/**
 * Complete a manufacturing order: consume the components, produce the finished
 * goods, and set the finished product's cost from the components it absorbed.
 * Partial production is supported — call it again for the remainder.
 */
export async function produce(
  tx: Tx,
  moId: number,
  quantityToProduce: number,
  actorEmail?: string
) {
  const mo = await tx.manufacturingOrder.findUnique({
    where: { id: moId },
    include: { components: true, product: true },
  });
  if (!mo) throw new HttpError(404, 'Manufacturing order not found');
  if (mo.state !== 'CONFIRMED') throw new HttpError(400, 'Confirm the manufacturing order before producing');

  const remaining = mo.quantity - mo.producedQty;
  if (quantityToProduce > remaining) {
    throw new HttpError(400, `Only ${remaining} left to produce on this order`);
  }

  // Components scale to the quantity actually being produced now.
  const fraction = quantityToProduce / mo.quantity;
  let totalCost = 0;

  for (const c of mo.components) {
    const consume = Math.ceil(c.quantityRequired * fraction);
    if (consume <= 0) continue;

    const component = await tx.product.findUniqueOrThrow({ where: { id: c.productId } });
    const unitCost = currentUnitCost(component);
    totalCost += unitCost * consume;

    await applyMovement(tx, {
      productId: c.productId,
      qty: -consume,
      type: 'MANUFACTURE_OUT',
      unitCost,
      warehouseId: mo.warehouseId ?? undefined,
      refType: 'MO',
      refId: mo.id,
      refLabel: mo.reference,
      reason: `Consumed for ${mo.product.name}`,
      actorEmail,
    });

    await tx.moComponent.update({
      where: { id: c.id },
      data: { quantityConsumed: { increment: consume }, unitCost },
    });
  }

  // The finished good enters stock carrying exactly the cost it absorbed.
  const unitCost = money(totalCost / quantityToProduce);
  await applyMovement(tx, {
    productId: mo.productId,
    qty: quantityToProduce,
    type: 'MANUFACTURE_IN',
    unitCost,
    warehouseId: mo.warehouseId ?? undefined,
    refType: 'MO',
    refId: mo.id,
    refLabel: mo.reference,
    reason: `Produced on ${mo.reference}`,
    actorEmail,
  });

  const producedQty = mo.producedQty + quantityToProduce;
  const complete = producedQty >= mo.quantity;

  return tx.manufacturingOrder.update({
    where: { id: moId },
    data: {
      producedQty,
      unitCost,
      state: complete ? 'DONE' : 'CONFIRMED',
      doneAt: complete ? new Date() : null,
    },
    include: { components: true, product: true, bom: true, warehouse: true },
  });
}
