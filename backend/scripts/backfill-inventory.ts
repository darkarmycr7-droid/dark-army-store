// One-time backfill after adding the inventory ledger (Product.avgCost,
// OrderItem.unitCost, StockMovement).
//
//   npm run backfill:inventory
//
// Idempotent: seeds avgCost from costPrice, stamps the cost that was in force
// onto historical order lines so existing P&L keeps its current numbers, and
// writes one INITIAL opening-balance movement per product that has none.

import { prisma, money } from '../src/lib/prisma';

async function main() {
  const products = await prisma.product.findMany();
  let costs = 0;
  let openings = 0;
  let lines = 0;

  for (const p of products) {
    const cost = money(p.costPrice);

    // 1. Seed the average cost from the manually entered cost.
    if (money(p.avgCost) === 0 && cost > 0) {
      await prisma.product.update({ where: { id: p.id }, data: { avgCost: cost } });
      costs++;
    }

    // 2. Stamp historical sold lines with the cost the reports were using, so
    //    switching COGS to OrderItem.unitCost doesn't zero out past periods.
    const stamped = await prisma.orderItem.updateMany({
      where: { productId: p.id, unitCost: 0 },
      data: { unitCost: cost },
    });
    lines += stamped.count;

    // 3. Opening balance, so sum(movements) === stockQty from here on.
    const existing = await prisma.stockMovement.count({ where: { productId: p.id } });
    if (existing === 0 && p.stockQty !== 0) {
      await prisma.stockMovement.create({
        data: {
          productId: p.id,
          qty: p.stockQty,
          type: 'INITIAL',
          unitCost: cost,
          balanceAfter: p.stockQty,
          avgCostAfter: cost,
          refType: 'PRODUCT',
          refId: p.id,
          reason: 'Opening balance (backfill)',
        },
      });
      openings++;
    }
  }

  console.log(
    `[backfill] products=${products.length} avgCost seeded=${costs} ` +
      `opening movements=${openings} order lines costed=${lines}`
  );
}

main()
  .catch((e) => {
    console.error('[backfill] failed:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
