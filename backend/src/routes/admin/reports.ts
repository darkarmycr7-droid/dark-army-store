import { Router } from 'express';
import { prisma, money } from '../../lib/prisma';

export const adminReports = Router();

/** Reports return a generic shape so the frontend can render + export any of
 *  them the same way: { title, columns, rows, summary }. Money columns are
 *  flagged so the UI formats them as KD while exports keep raw numbers. */
type Col = { key: string; label: string; money?: boolean };

function parseRange(q: Record<string, unknown>) {
  const to = q.to ? new Date(`${q.to}T23:59:59.999`) : new Date();
  const from = q.from ? new Date(`${q.from}T00:00:00.000`) : new Date(Date.now() - 30 * 864e5);
  return { from, to };
}

const ACTIVE = { status: { not: 'CANCELLED' } };

/** Cost of one sold unit: the cost snapshotted at sale time, falling back to
 *  the product's current cost for rows written before the inventory ledger. */
function soldUnitCost(it: { unitCost: unknown; product: { costPrice: unknown; avgCost: unknown } }) {
  return money(it.unitCost) || money(it.product.avgCost) || money(it.product.costPrice);
}

/** Valuation cost of one unit on hand: weighted average, else the manual cost. */
function stockUnitCost(p: { avgCost: unknown; costPrice: unknown }) {
  return money(p.avgCost) || money(p.costPrice);
}

// ---- Sales ----
adminReports.get('/sales', async (req, res) => {
  const { from, to } = parseRange(req.query);
  // ?channel=ONLINE|POS splits storefront takings from counter takings.
  const channel = req.query.channel as string | undefined;
  const orders = await prisma.order.findMany({
    where: {
      ...ACTIVE,
      placedAt: { gte: from, lte: to },
      ...(channel === 'ONLINE' || channel === 'POS' ? { channel } : {}),
    },
    orderBy: { placedAt: 'desc' },
    include: { items: true },
  });

  const rows = orders.map((o) => ({
    date: o.placedAt.toISOString().slice(0, 10),
    order: o.orderNumber,
    channel: o.channel,
    customer: o.contactName,
    items: o.items.length,
    subtotal: money(o.subtotal),
    discount: money(o.discount),
    shipping: money(o.shipping),
    total: money(o.total),
    status: o.status,
    payment: o.payMethod,
  }));

  const revenue = money(rows.reduce((s, r) => s + r.total, 0));
  const discount = money(rows.reduce((s, r) => s + r.discount, 0));

  res.json({
    title: 'Sales Report',
    columns: [
      { key: 'date', label: 'Date' },
      { key: 'order', label: 'Order #' },
      { key: 'channel', label: 'Channel' },
      { key: 'customer', label: 'Customer' },
      { key: 'items', label: 'Items' },
      { key: 'subtotal', label: 'Subtotal', money: true },
      { key: 'discount', label: 'Discount', money: true },
      { key: 'shipping', label: 'Delivery', money: true },
      { key: 'total', label: 'Total', money: true },
      { key: 'status', label: 'Status' },
      { key: 'payment', label: 'Payment' },
    ] as Col[],
    rows,
    summary: [
      { label: 'Orders', value: rows.length },
      { label: 'Revenue', value: revenue, money: true },
      { label: 'Discounts', value: discount, money: true },
      { label: 'Avg. Order', value: rows.length ? money(revenue / rows.length) : 0, money: true },
    ],
  });
});

// ---- Products (units sold, revenue, profit) ----
adminReports.get('/products', async (req, res) => {
  const { from, to } = parseRange(req.query);
  const [products, items] = await Promise.all([
    prisma.product.findMany({ include: { category: true } }),
    prisma.orderItem.findMany({
      where: { order: { ...ACTIVE, placedAt: { gte: from, lte: to } } },
      include: { product: { select: { costPrice: true, avgCost: true } } },
    }),
  ]);

  const agg = new Map<number, { units: number; revenue: number; cost: number }>();
  for (const it of items) {
    const a = agg.get(it.productId) || { units: 0, revenue: 0, cost: 0 };
    a.units += it.quantity;
    a.revenue += money(it.lineTotal);
    a.cost += soldUnitCost(it) * it.quantity;
    agg.set(it.productId, a);
  }

  const rows = products
    .map((p) => {
      const a = agg.get(p.id) || { units: 0, revenue: 0, cost: 0 };
      return {
        product: p.name,
        sku: p.sku,
        category: p.category?.name || '—',
        price: money(p.sellingPrice),
        unitsSold: a.units,
        revenue: money(a.revenue),
        cost: money(a.cost),
        profit: money(a.revenue - a.cost),
        stock: p.stockQty,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);

  res.json({
    title: 'Products Report',
    columns: [
      { key: 'product', label: 'Product' },
      { key: 'sku', label: 'SKU' },
      { key: 'category', label: 'Category' },
      { key: 'price', label: 'Price', money: true },
      { key: 'unitsSold', label: 'Units Sold' },
      { key: 'revenue', label: 'Revenue', money: true },
      { key: 'cost', label: 'Cost', money: true },
      { key: 'profit', label: 'Profit', money: true },
      { key: 'stock', label: 'In Stock' },
    ] as Col[],
    rows,
    summary: [
      { label: 'Units Sold', value: rows.reduce((s, r) => s + r.unitsSold, 0) },
      { label: 'Revenue', value: money(rows.reduce((s, r) => s + r.revenue, 0)), money: true },
      { label: 'Profit', value: money(rows.reduce((s, r) => s + r.profit, 0)), money: true },
    ],
  });
});

// ---- Customers ----
adminReports.get('/customers', async (req, res) => {
  const { from, to } = parseRange(req.query);
  const orders = await prisma.order.findMany({
    where: { ...ACTIVE, placedAt: { gte: from, lte: to }, customerId: { not: null } },
    include: { customer: true },
  });

  const agg = new Map<number, { name: string; email: string; orders: number; spent: number; last: Date }>();
  for (const o of orders) {
    if (!o.customer) continue;
    const a = agg.get(o.customer.id) || { name: o.customer.name, email: o.customer.email, orders: 0, spent: 0, last: o.placedAt };
    a.orders += 1;
    a.spent += money(o.total);
    if (o.placedAt > a.last) a.last = o.placedAt;
    agg.set(o.customer.id, a);
  }

  const rows = [...agg.values()]
    .map((a) => ({ customer: a.name, email: a.email, orders: a.orders, spent: money(a.spent), lastOrder: a.last.toISOString().slice(0, 10) }))
    .sort((a, b) => b.spent - a.spent);

  res.json({
    title: 'Customers Report',
    columns: [
      { key: 'customer', label: 'Customer' },
      { key: 'email', label: 'Email' },
      { key: 'orders', label: 'Orders' },
      { key: 'spent', label: 'Total Spent', money: true },
      { key: 'lastOrder', label: 'Last Order' },
    ] as Col[],
    rows,
    summary: [
      { label: 'Customers', value: rows.length },
      { label: 'Revenue', value: money(rows.reduce((s, r) => s + r.spent, 0)), money: true },
    ],
  });
});

// ---- Inventory valuation (no date range) ----
adminReports.get('/inventory', async (_req, res) => {
  const products = await prisma.product.findMany({ include: { category: true }, orderBy: { name: 'asc' } });
  const rows = products.map((p) => {
    const cost = stockUnitCost(p);
    const price = money(p.sellingPrice);
    return {
      product: p.name,
      sku: p.sku,
      category: p.category?.name || '—',
      stock: p.stockQty,
      cost,
      price,
      stockValue: money(p.stockQty * cost),
      retailValue: money(p.stockQty * price),
      status: p.stockQty === 0 ? 'Out of stock' : p.stockQty <= p.lowStockAlert ? 'Low' : 'OK',
    };
  });

  const stockValue = money(rows.reduce((s, r) => s + r.stockValue, 0));
  const retailValue = money(rows.reduce((s, r) => s + r.retailValue, 0));

  res.json({
    title: 'Inventory Report',
    columns: [
      { key: 'product', label: 'Product' },
      { key: 'sku', label: 'SKU' },
      { key: 'category', label: 'Category' },
      { key: 'stock', label: 'Stock' },
      { key: 'cost', label: 'Avg. Cost', money: true },
      { key: 'price', label: 'Unit Price', money: true },
      { key: 'stockValue', label: 'Stock Value', money: true },
      { key: 'retailValue', label: 'Retail Value', money: true },
      { key: 'status', label: 'Status' },
    ] as Col[],
    rows,
    summary: [
      { label: 'Products', value: rows.length },
      { label: 'Inventory Value (cost)', value: stockValue, money: true },
      { label: 'Retail Value', value: retailValue, money: true },
      { label: 'Potential Profit', value: money(retailValue - stockValue), money: true },
    ],
  });
});

// ---- Profit & Loss ----
adminReports.get('/pnl', async (req, res) => {
  const { from, to } = parseRange(req.query);
  const [orders, items] = await Promise.all([
    prisma.order.findMany({ where: { ...ACTIVE, placedAt: { gte: from, lte: to } } }),
    prisma.orderItem.findMany({
      where: { order: { ...ACTIVE, placedAt: { gte: from, lte: to } } },
      include: { product: { select: { costPrice: true, avgCost: true } } },
    }),
  ]);

  const grossSales = money(orders.reduce((s, o) => s + money(o.subtotal), 0));
  const discounts = money(orders.reduce((s, o) => s + money(o.discount), 0));
  const shipping = money(orders.reduce((s, o) => s + money(o.shipping), 0));
  const cogs = money(items.reduce((s, it) => s + soldUnitCost(it) * it.quantity, 0));
  const netProductRevenue = money(grossSales - discounts);
  const grossProfit = money(netProductRevenue - cogs);
  const margin = netProductRevenue ? Math.round((grossProfit / netProductRevenue) * 1000) / 10 : 0;

  const rows = [
    { item: 'Gross Sales', amount: grossSales },
    { item: 'Less: Discounts', amount: -discounts },
    { item: 'Net Product Revenue', amount: netProductRevenue },
    { item: 'Less: Cost of Goods Sold (COGS)', amount: -cogs },
    { item: 'Gross Profit', amount: grossProfit },
    { item: 'Add: Delivery Collected', amount: shipping },
  ];

  res.json({
    title: 'Profit & Loss',
    columns: [
      { key: 'item', label: 'Line Item' },
      { key: 'amount', label: 'Amount', money: true },
    ] as Col[],
    rows,
    summary: [
      { label: 'Orders', value: orders.length },
      { label: 'Gross Profit', value: grossProfit, money: true },
      { label: 'Margin', value: `${margin}%` },
    ],
  });
});

// ---- Purchases (spend by supplier, from committed purchase orders) ----
adminReports.get('/purchases', async (req, res) => {
  const { from, to } = parseRange(req.query);
  const pos = await prisma.purchaseOrder.findMany({
    where: { status: { notIn: ['DRAFT', 'CANCELLED'] }, createdAt: { gte: from, lte: to } },
    orderBy: { createdAt: 'desc' },
    include: { supplier: true, items: true },
  });

  const rows = pos.map((p) => {
    const ordered = p.items.reduce((s, i) => s + i.quantity, 0);
    const received = p.items.reduce((s, i) => s + i.receivedQty, 0);
    return {
      date: p.createdAt.toISOString().slice(0, 10),
      po: p.poNumber,
      supplier: p.supplier.name,
      reference: p.reference || '—',
      lines: p.items.length,
      ordered,
      received,
      goods: money(p.subtotal),
      landed: money(money(p.shipping) + money(p.otherCost)),
      total: money(p.total),
      status: p.status,
    };
  });

  res.json({
    title: 'Purchases Report',
    columns: [
      { key: 'date', label: 'Date' },
      { key: 'po', label: 'PO #' },
      { key: 'supplier', label: 'Supplier' },
      { key: 'reference', label: 'Invoice Ref' },
      { key: 'lines', label: 'Lines' },
      { key: 'ordered', label: 'Qty Ordered' },
      { key: 'received', label: 'Qty Received' },
      { key: 'goods', label: 'Goods', money: true },
      { key: 'landed', label: 'Freight + Other', money: true },
      { key: 'total', label: 'Total', money: true },
      { key: 'status', label: 'Status' },
    ] as Col[],
    rows,
    summary: [
      { label: 'Purchase Orders', value: rows.length },
      { label: 'Total Spend', value: money(rows.reduce((s, r) => s + r.total, 0)), money: true },
      { label: 'Landed Cost', value: money(rows.reduce((s, r) => s + r.landed, 0)), money: true },
      { label: 'Units Received', value: rows.reduce((s, r) => s + r.received, 0) },
    ],
  });
});

// ---- Cash sessions (till reconciliation for a period) ----
adminReports.get('/sessions', async (req, res) => {
  const { from, to } = parseRange(req.query);
  const sessions = await prisma.posSession.findMany({
    where: { openedAt: { gte: from, lte: to } },
    orderBy: { openedAt: 'desc' },
    include: { payments: true, orders: true },
  });

  const rows = sessions.map((s) => {
    const cash = money(s.payments.filter((p) => p.method === 'CASH').reduce((t, p) => t + money(p.amount), 0));
    const card = money(s.payments.filter((p) => p.method !== 'CASH').reduce((t, p) => t + money(p.amount), 0));
    return {
      session: s.sessionNumber,
      register: s.registerName,
      opened: s.openedAt.toISOString().slice(0, 10),
      closed: s.closedAt ? s.closedAt.toISOString().slice(0, 10) : '—',
      sales: s.orders.length,
      float: money(s.openingFloat),
      cash,
      card,
      takings: money(cash + card),
      expected: s.expectedCash != null ? money(s.expectedCash) : 0,
      counted: s.closingCounted != null ? money(s.closingCounted) : 0,
      variance: s.variance != null ? money(s.variance) : 0,
      status: s.status,
    };
  });

  res.json({
    title: 'Cash Sessions',
    columns: [
      { key: 'session', label: 'Session' },
      { key: 'register', label: 'Register' },
      { key: 'opened', label: 'Opened' },
      { key: 'closed', label: 'Closed' },
      { key: 'sales', label: 'Sales' },
      { key: 'float', label: 'Float', money: true },
      { key: 'cash', label: 'Cash', money: true },
      { key: 'card', label: 'Card / KNET', money: true },
      { key: 'takings', label: 'Takings', money: true },
      { key: 'expected', label: 'Expected', money: true },
      { key: 'counted', label: 'Counted', money: true },
      { key: 'variance', label: 'Variance', money: true },
      { key: 'status', label: 'Status' },
    ] as Col[],
    rows,
    summary: [
      { label: 'Sessions', value: rows.length },
      { label: 'Takings', value: money(rows.reduce((s, r) => s + r.takings, 0)), money: true },
      { label: 'Cash', value: money(rows.reduce((s, r) => s + r.cash, 0)), money: true },
      { label: 'Total Variance', value: money(rows.reduce((s, r) => s + r.variance, 0)), money: true },
    ],
  });
});

// ---- Stock movements (the full inventory ledger for a period) ----
adminReports.get('/movements', async (req, res) => {
  const { from, to } = parseRange(req.query);
  const moves = await prisma.stockMovement.findMany({
    where: { createdAt: { gte: from, lte: to } },
    orderBy: { createdAt: 'desc' },
    include: { product: { select: { name: true, sku: true } } },
    take: 2000,
  });

  const rows = moves.map((m) => ({
    date: m.createdAt.toISOString().slice(0, 10),
    product: m.product.name,
    sku: m.product.sku,
    type: m.type,
    qty: m.qty,
    unitCost: money(m.unitCost),
    value: money(money(m.unitCost) * m.qty),
    balance: m.balanceAfter,
    reference: m.refLabel || m.reason || '—',
    by: m.actorEmail || 'system',
  }));

  const inQty = rows.filter((r) => r.qty > 0).reduce((s, r) => s + r.qty, 0);
  const outQty = rows.filter((r) => r.qty < 0).reduce((s, r) => s + r.qty, 0);

  res.json({
    title: 'Stock Movements',
    columns: [
      { key: 'date', label: 'Date' },
      { key: 'product', label: 'Product' },
      { key: 'sku', label: 'SKU' },
      { key: 'type', label: 'Type' },
      { key: 'qty', label: 'Qty' },
      { key: 'unitCost', label: 'Unit Cost', money: true },
      { key: 'value', label: 'Value', money: true },
      { key: 'balance', label: 'Balance' },
      { key: 'reference', label: 'Reference' },
      { key: 'by', label: 'By' },
    ] as Col[],
    rows,
    summary: [
      { label: 'Movements', value: rows.length },
      { label: 'Units In', value: inQty },
      { label: 'Units Out', value: Math.abs(outQty) },
      { label: 'Net Value', value: money(rows.reduce((s, r) => s + r.value, 0)), money: true },
    ],
  });
});
