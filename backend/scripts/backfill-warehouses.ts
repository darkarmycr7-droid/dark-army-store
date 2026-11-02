// One-time backfill after introducing warehouses.
//
//   npm run backfill:warehouses
//
// Creates the central warehouse, puts all existing stock in it, and stamps
// every historical movement with it. Idempotent.

import { prisma } from '../src/lib/prisma';

async function main() {
  let central = await prisma.warehouse.findFirst({ where: { isDefault: true } });
  if (!central) {
    central = await prisma.warehouse.findFirst({ where: { code: 'WH' } });
  }
  if (!central) {
    central = await prisma.warehouse.create({
      data: {
        code: 'WH',
        name: 'Main Warehouse',
        nameAr: 'المخزن الرئيسي',
        type: 'CENTRAL',
        isDefault: true,
        area: 'Shuwaikh',
        isActive: true,
      },
    });
    console.log(`[backfill] created central warehouse ${central.code}`);
  }

  // All existing stock belongs to the central warehouse.
  const products = await prisma.product.findMany({ select: { id: true, stockQty: true } });
  let seeded = 0;
  for (const p of products) {
    const existing = await prisma.warehouseStock.findUnique({
      where: { warehouseId_productId: { warehouseId: central.id, productId: p.id } },
    });
    if (existing) continue;
    await prisma.warehouseStock.create({
      data: { warehouseId: central.id, productId: p.id, quantity: p.stockQty },
    });
    seeded++;
  }

  // Historical movements predate warehouses — attribute them to central.
  const stamped = await prisma.stockMovement.updateMany({
    where: { warehouseId: null },
    data: { warehouseId: central.id },
  });

  console.log(
    `[backfill] warehouse=${central.code} stock rows seeded=${seeded} movements stamped=${stamped.count}`
  );
}

main()
  .catch((e) => {
    console.error('[backfill] failed:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
