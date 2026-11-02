import { Router } from 'express';
import { prisma, money } from '../../lib/prisma';
import { serializeOrder } from '../../services/order.service';

export const adminDashboard = Router();

adminDashboard.get('/', async (_req, res) => {
  const [products, orders, customers, allProducts, recentRows, ordersForRevenue] = await Promise.all([
    prisma.product.count(),
    prisma.order.count(),
    prisma.customer.count(),
    prisma.product.findMany({ select: { stockQty: true, costPrice: true, avgCost: true, sellingPrice: true, lowStockAlert: true, id: true, name: true, sku: true } }),
    prisma.order.findMany({ orderBy: { placedAt: 'desc' }, take: 8, include: { items: true } }),
    prisma.order.findMany({ where: { status: { not: 'CANCELLED' } }, select: { total: true, placedAt: true, status: true } }),
  ]);

  const revenue = money(ordersForRevenue.reduce((s, o) => s + money(o.total), 0));
  // Valued at weighted-average cost, falling back to the manually entered cost.
  const inventoryValue = money(
    allProducts.reduce((s, p) => s + p.stockQty * (money(p.avgCost) || money(p.costPrice)), 0)
  );
  const retailValue = money(allProducts.reduce((s, p) => s + p.stockQty * money(p.sellingPrice), 0));

  // Status breakdown
  const statusCounts: Record<string, number> = {};
  const allStatuses = await prisma.order.groupBy({ by: ['status'], _count: { _all: true } });
  allStatuses.forEach((s) => (statusCounts[s.status] = s._count._all));

  // Sales last 14 days
  const days: { date: string; sales: number; orders: number }[] = [];
  const today = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({ date: key, sales: 0, orders: 0 });
  }
  const dayMap = new Map(days.map((d) => [d.date, d]));
  for (const o of ordersForRevenue) {
    const key = new Date(o.placedAt).toISOString().slice(0, 10);
    const bucket = dayMap.get(key);
    if (bucket) {
      bucket.sales = money(bucket.sales + money(o.total));
      bucket.orders += 1;
    }
  }

  const lowStock = allProducts
    .filter((p) => p.stockQty <= p.lowStockAlert)
    .sort((a, b) => a.stockQty - b.stockQty)
    .slice(0, 8)
    .map((p) => ({ id: p.id, name: p.name, sku: p.sku, stockQty: p.stockQty, lowStockAlert: p.lowStockAlert }));

  // Top products by soldCount
  const topRows = await prisma.product.findMany({
    orderBy: { soldCount: 'desc' },
    take: 5,
    select: { id: true, name: true, soldCount: true, sellingPrice: true },
  });

  res.json({
    cards: {
      revenue,
      orders,
      customers,
      products,
      inventoryValue,
      retailValue,
      potentialProfit: money(retailValue - inventoryValue),
    },
    statusCounts,
    salesByDay: days,
    lowStock,
    topProducts: topRows.map((p) => ({ id: p.id, name: p.name, soldCount: p.soldCount, price: money(p.sellingPrice) })),
    recentOrders: recentRows.map((o) => serializeOrder(o)),
  });
});
