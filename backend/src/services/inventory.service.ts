// Inventory ledger — the ONLY place Product.stockQty is allowed to change.
//
// Every change writes a signed StockMovement row, so stock is always
// explainable. Two invariants hold, and both are checked by
// scripts/check-inventory.ts:
//
//   1. Company-wide, ignoring transfers (which only relocate stock):
//        sum(movements.qty WHERE type NOT IN (TRANSFER_OUT, TRANSFER_IN))
//          === product.stockQty
//
//   2. Per warehouse, counting everything:
//        sum(movements.qty WHERE warehouseId = W) === WarehouseStock(W).quantity
//
// StockMovement.balanceAfter always records the COMPANY-WIDE balance, so on a
// transfer row it is unchanged by design — the warehouse split lives in
// WarehouseStock.
//
// Costing is weighted average (no FIFO layers, single stock pool — multi-
// warehouse is deliberately out of scope). Inbound movements recompute
// Product.avgCost; outbound movements consume it and leave it unchanged.

import { Prisma } from '@prisma/client';
import { money } from '../lib/prisma';
import { HttpError } from '../middleware/error';

/** Prisma transaction client (what $transaction hands the callback). */
export type Tx = Prisma.TransactionClient;

export type MovementType =
  | 'PURCHASE' // goods received against a purchase order
  | 'SALE' // sold through checkout
  | 'RETURN' // order cancelled / returned by admin
  | 'REFUND_RESTOCK' // order refunded, goods back on the shelf
  | 'ADJUSTMENT' // stock count, damage, write-off, manual edit
  | 'INITIAL' // opening balance for a newly created product
  | 'TRANSFER_OUT' // left a warehouse, heading to another
  | 'TRANSFER_IN' // arrived at the destination warehouse
  | 'MANUFACTURE_OUT' // component consumed by a manufacturing order
  | 'MANUFACTURE_IN'; // finished goods produced by a manufacturing order

/** Transfers move stock between our own warehouses, so they never change the
 *  company-wide total — only which warehouse holds it. */
const TRANSFER_TYPES: MovementType[] = ['TRANSFER_OUT', 'TRANSFER_IN'];

/** The warehouse everything lands in unless a caller names another. */
export async function defaultWarehouseId(tx: Tx): Promise<number | null> {
  const wh = await tx.warehouse.findFirst({ where: { isDefault: true, isActive: true } });
  return wh?.id ?? null;
}

export interface MovementInput {
  productId: number;
  /** Signed: positive into stock, negative out of stock. Never 0. */
  qty: number;
  type: MovementType;
  /** Cost per unit for inbound movements. Defaults to the current avgCost. */
  unitCost?: number;
  refType?: 'PO' | 'SO' | 'ORDER' | 'ADJUSTMENT' | 'PRODUCT' | 'TRANSFER' | 'MO';
  refId?: number;
  refLabel?: string;
  reason?: string;
  actorEmail?: string;
  /** Allow the balance to go below zero (never used by normal flows). */
  allowNegative?: boolean;
  /** Warehouse the stock moves in. Defaults to the default warehouse. */
  warehouseId?: number;
}

/**
 * New weighted-average cost after receiving `qty` units at `unitCost`.
 * Falls back to the incoming cost when there is nothing (or negative stock)
 * to average against, which is also what happens on a first receipt.
 */
export function weightedAvg(oldQty: number, oldAvg: number, qty: number, unitCost: number): number {
  if (qty <= 0) return money(oldAvg);
  if (oldQty <= 0) return money(unitCost);
  return money((oldQty * oldAvg + qty * unitCost) / (oldQty + qty));
}

/**
 * Apply one stock movement inside a transaction: update the product's
 * quantity (and average cost, for inbound), then record the ledger row.
 * Returns the created movement.
 */
export async function applyMovement(tx: Tx, input: MovementInput) {
  const qty = Math.trunc(input.qty);
  if (!qty) throw new HttpError(400, 'Stock movement quantity cannot be zero');

  const product = await tx.product.findUnique({ where: { id: input.productId } });
  if (!product) throw new HttpError(404, `Product ${input.productId} not found`);

  const isTransfer = TRANSFER_TYPES.includes(input.type);
  const oldQty = product.stockQty;
  const oldAvg = money(product.avgCost) || money(product.costPrice);
  // A transfer relocates stock without creating or consuming any, so the
  // company-wide balance and the average cost both stay put.
  const balanceAfter = isTransfer ? oldQty : oldQty + qty;

  if (balanceAfter < 0 && !input.allowNegative) {
    throw new HttpError(409, `Only ${oldQty} of ${product.name} in stock`);
  }

  // Inbound moves the average; outbound consumes at the current average.
  const unitCost = input.unitCost != null ? money(input.unitCost) : oldAvg;
  const avgCostAfter = qty > 0 && !isTransfer ? weightedAvg(oldQty, oldAvg, qty, unitCost) : oldAvg;

  if (!isTransfer) {
    await tx.product.update({
      where: { id: product.id },
      data: { stockQty: balanceAfter, avgCost: avgCostAfter },
    });
  }

  // Keep the per-warehouse breakdown in step with every movement.
  const warehouseId = input.warehouseId ?? (await defaultWarehouseId(tx)) ?? undefined;
  if (warehouseId) {
    const existing = await tx.warehouseStock.findUnique({
      where: { warehouseId_productId: { warehouseId, productId: product.id } },
    });
    const nextQty = (existing?.quantity ?? 0) + qty;
    if (nextQty < 0 && !input.allowNegative) {
      throw new HttpError(409, `Only ${existing?.quantity ?? 0} of ${product.name} at that warehouse`);
    }
    if (existing) {
      await tx.warehouseStock.update({ where: { id: existing.id }, data: { quantity: nextQty } });
    } else {
      await tx.warehouseStock.create({ data: { warehouseId, productId: product.id, quantity: nextQty } });
    }
  }

  return tx.stockMovement.create({
    data: {
      productId: product.id,
      warehouseId: warehouseId ?? null,
      qty,
      type: input.type,
      unitCost,
      balanceAfter,
      avgCostAfter,
      refType: input.refType ?? null,
      refId: input.refId ?? null,
      refLabel: input.refLabel ?? null,
      reason: input.reason ?? null,
      actorEmail: input.actorEmail ?? null,
    },
  });
}

/** Cost per unit to use when selling now — average cost, falling back to the
 *  manually entered cost for products that have never been received. */
export function currentUnitCost(product: { avgCost?: unknown; costPrice?: unknown }): number {
  return money(product.avgCost) || money(product.costPrice);
}

/**
 * Split a purchase order's freight / customs across the lines being received,
 * pro-rata by line value, and return the landed cost per unit for each line.
 * Falls back to an even per-unit split when the lines have no value.
 */
export function landedUnitCosts(
  lines: { qty: number; unitCost: number }[],
  extraCost: number
): number[] {
  const values = lines.map((l) => l.qty * l.unitCost);
  const totalValue = values.reduce((s, v) => s + v, 0);
  const totalQty = lines.reduce((s, l) => s + l.qty, 0);
  const extra = money(extraCost);

  return lines.map((l, i) => {
    if (l.qty <= 0) return money(l.unitCost);
    const share =
      extra <= 0 ? 0 : totalValue > 0 ? (extra * values[i]) / totalValue : (extra * l.qty) / (totalQty || 1);
    return money(l.unitCost + share / l.qty);
  });
}
