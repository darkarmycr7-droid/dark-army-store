// Inventory integrity check. Run it after any change that touches stock.
//
//   npm run check:inventory
//
// Verifies the two invariants documented in services/inventory.service.ts:
//   1. sum(movements excluding transfers) === product.stockQty
//   2. sum(movements at warehouse W)      === WarehouseStock(W).quantity
// and that stock on hand plus goods in transit reconciles to the company total.

import { prisma } from '../src/lib/prisma';

const TRANSFERS = ['TRANSFER_OUT', 'TRANSFER_IN'];

async function main() {
  const problems: string[] = [];

  // ---- 1. Company-wide, ignoring transfers ----
  const products = await prisma.product.findMany({ select: { id: true, name: true, stockQty: true } });
  for (const p of products) {
    const agg = await prisma.stockMovement.aggregate({
      where: { productId: p.id, type: { notIn: TRANSFERS } },
      _sum: { qty: true },
    });
    const sum = agg._sum.qty ?? 0;
    if (sum !== p.stockQty) problems.push(`company: ${p.name} ledger=${sum} stockQty=${p.stockQty}`);
  }

  // ---- 2. Per warehouse, counting everything ----
  const warehouses = await prisma.warehouse.findMany();
  for (const w of warehouses) {
    const rows = await prisma.warehouseStock.findMany({ where: { warehouseId: w.id } });
    for (const r of rows) {
      const agg = await prisma.stockMovement.aggregate({
        where: { warehouseId: w.id, productId: r.productId },
        _sum: { qty: true },
      });
      const sum = agg._sum.qty ?? 0;
      if (sum !== r.quantity) {
        problems.push(`warehouse ${w.code}: product ${r.productId} ledger=${sum} onHand=${r.quantity}`);
      }
    }
  }

  // ---- 3. On hand + in transit === company total ----
  const inTransitLines = await prisma.stockTransferLine.findMany({
    where: { transfer: { state: 'SENT' } },
  });
  const transit = new Map<number, number>();
  for (const l of inTransitLines) {
    transit.set(l.productId, (transit.get(l.productId) ?? 0) + (l.quantity - l.receivedQty));
  }
  for (const p of products) {
    const onHandAgg = await prisma.warehouseStock.aggregate({
      where: { productId: p.id },
      _sum: { quantity: true },
    });
    const onHand = onHandAgg._sum.quantity ?? 0;
    const inTransit = transit.get(p.id) ?? 0;
    if (onHand + inTransit !== p.stockQty) {
      problems.push(`reconcile: ${p.name} onHand=${onHand} + transit=${inTransit} != total=${p.stockQty}`);
    }
  }

  const transfers = await prisma.stockTransfer.count();
  console.log(
    `[check] products=${products.length} warehouses=${warehouses.length} transfers=${transfers} problems=${problems.length}`
  );
  problems.slice(0, 25).forEach((p) => console.log('  !', p));
  if (problems.length) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error('[check] failed:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
