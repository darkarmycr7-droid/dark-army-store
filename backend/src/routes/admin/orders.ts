import { Router } from 'express';
import { z } from 'zod';
import { prisma, money } from '../../lib/prisma';
import { serializeOrder, notifyOrderStatus } from '../../services/order.service';
import { applyMovement } from '../../services/inventory.service';
import { postOrderPayment, postSaleReversal } from '../../services/accounting.service';
import { HttpError } from '../../middleware/error';

export const adminOrders = Router();

const STATUSES = ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED'];

// ---- List with optional status filter ----
adminOrders.get('/', async (req, res) => {
  const status = req.query.status as string | undefined;
  const q = req.query.q as string | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};
  if (status && STATUSES.includes(status)) where.status = status;
  if (q) where.OR = [
    { orderNumber: { contains: q } },
    { trackingNumber: { contains: q.toUpperCase() } },
    { contactName: { contains: q } },
    { contactPhone: { contains: q } },
  ];

  const rows = await prisma.order.findMany({
    where,
    orderBy: { placedAt: 'desc' },
    include: { items: true, _count: { select: { items: true } } },
    take: 200,
  });
  res.json(rows.map((o) => serializeOrder(o)));
});

// ---- Single order ----
adminOrders.get('/:id', async (req, res) => {
  const o = await prisma.order.findUnique({
    where: { id: Number(req.params.id) },
    include: { items: true, events: { orderBy: { createdAt: 'asc' } }, payment: true },
  });
  if (!o) throw new HttpError(404, 'Order not found');
  res.json(serializeOrder(o));
});

// ---- Update status (logs an event; can restock on cancel) ----
const updateSchema = z.object({
  status: z.enum(['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED']),
  note: z.string().optional(),
  driverName: z.string().optional(),
});

adminOrders.patch('/:id/status', async (req, res) => {
  const id = Number(req.params.id);
  const { status, note, driverName } = updateSchema.parse(req.body);
  const order = await prisma.order.findUnique({ where: { id }, include: { items: true } });
  if (!order) throw new HttpError(404, 'Order not found');

  const updated = await prisma.$transaction(async (tx) => {
    // Restock if moving to CANCELLED/RETURNED from an active state
    const restock =
      (status === 'CANCELLED' || status === 'RETURNED') &&
      !['CANCELLED', 'RETURNED'].includes(order.status);
    if (restock) {
      for (const it of order.items) {
        // Back through the ledger at the cost it left at, so returning goods
        // reverses the original COGS rather than revaluing them.
        await applyMovement(tx, {
          productId: it.productId,
          qty: it.quantity,
          type: 'RETURN',
          unitCost: money(it.unitCost),
          refType: 'ORDER',
          refId: id,
          refLabel: order.orderNumber,
          reason: `Order ${status.toLowerCase()}`,
          actorEmail: req.auth?.email,
        });
        await tx.product.update({
          where: { id: it.productId },
          data: { soldCount: { decrement: it.quantity } },
        });
      }
    }

    const payStatus = status === 'DELIVERED' && order.payMethod === 'COD' ? 'PAID' : order.payStatus;

    const o = await tx.order.update({
      where: { id },
      data: { status, payStatus, driverName: driverName ?? order.driverName },
      include: { items: true, events: { orderBy: { createdAt: 'asc' } }, payment: true },
    });
    await tx.orderEvent.create({
      data: { orderId: id, status, note: note || `Status changed to ${status}` },
    });

    // COD collected on delivery — clear the receivable.
    if (payStatus === 'PAID' && order.payStatus !== 'PAID') {
      await postOrderPayment(tx, o, req.auth?.email);
    }
    // Cancelled or returned before any refund — back the sale out of the books.
    if (restock) {
      await postSaleReversal(tx, id, order.orderNumber, `Order ${status.toLowerCase()}`, req.auth?.email);
    }
    return o;
  });

  // Notify the customer of the status change (non-blocking)
  notifyOrderStatus(status, {
    contactEmail: updated.contactEmail,
    contactName: updated.contactName,
    orderNumber: updated.orderNumber,
    trackingNumber: updated.trackingNumber,
    total: money(updated.total),
    items: updated.items.map((it) => ({ name: it.name, quantity: it.quantity, lineTotal: money(it.lineTotal) })),
  });

  res.json(serializeOrder(updated));
});

// ---- Refund an order (marks payment refunded, returns goods to stock) ----
adminOrders.post('/:id/refund', async (req, res) => {
  const id = Number(req.params.id);
  const { reason } = z.object({ reason: z.string().optional() }).parse(req.body || {});

  const order = await prisma.order.findUnique({ where: { id }, include: { items: true, payment: true } });
  if (!order) throw new HttpError(404, 'Order not found');
  if (order.payStatus === 'REFUNDED') throw new HttpError(400, 'This order is already refunded');

  const updated = await prisma.$transaction(async (tx) => {
    // Return goods to stock unless they were already returned/cancelled
    const goodsAlreadyBack = ['CANCELLED', 'RETURNED'].includes(order.status);
    if (!goodsAlreadyBack) {
      for (const it of order.items) {
        await applyMovement(tx, {
          productId: it.productId,
          qty: it.quantity,
          type: 'REFUND_RESTOCK',
          unitCost: money(it.unitCost),
          refType: 'ORDER',
          refId: id,
          refLabel: order.orderNumber,
          reason: reason ? `Refunded: ${reason}` : 'Order refunded',
          actorEmail: req.auth?.email,
        });
        await tx.product.update({
          where: { id: it.productId },
          data: { soldCount: { decrement: it.quantity } },
        });
      }
    }
    const o = await tx.order.update({
      where: { id },
      data: { payStatus: 'REFUNDED', status: goodsAlreadyBack ? order.status : 'RETURNED' },
      include: { items: true, events: { orderBy: { createdAt: 'asc' } }, payment: true },
    });
    if (order.payment) {
      await tx.payment.update({ where: { orderId: id }, data: { status: 'REFUNDED' } });
    }
    // Reverse loyalty: credit redeemed points back, remove points earned
    if (order.customerId && (order.pointsEarned > 0 || order.pointsRedeemed > 0)) {
      const cust = await tx.customer.findUnique({ where: { id: order.customerId } });
      if (cust) {
        const newBal = Math.max(0, cust.loyaltyPoints + order.pointsRedeemed - order.pointsEarned);
        await tx.customer.update({ where: { id: order.customerId }, data: { loyaltyPoints: newBal } });
        await tx.loyaltyTransaction.create({
          data: { customerId: order.customerId, orderId: id, points: order.pointsRedeemed - order.pointsEarned, type: 'REVERSAL', note: `Refund of ${order.orderNumber}` },
        });
      }
    }
    await tx.orderEvent.create({
      data: { orderId: id, status: 'RETURNED', note: reason ? `Refunded: ${reason}` : 'Order refunded by admin' },
    });
    await postSaleReversal(tx, id, order.orderNumber, reason, req.auth?.email);
    return o;
  });

  notifyOrderStatus('RETURNED', {
    contactEmail: updated.contactEmail,
    contactName: updated.contactName,
    orderNumber: updated.orderNumber,
    trackingNumber: updated.trackingNumber,
    total: money(updated.total),
    items: updated.items.map((it) => ({ name: it.name, quantity: it.quantity, lineTotal: money(it.lineTotal) })),
  });

  res.json(serializeOrder(updated));
});
