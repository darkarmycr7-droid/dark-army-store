// Point of sale — till sessions, cash control and counter sales.
//
// Design rule: every money movement is a stored row (PosPayment tenders,
// PosCashMove petty cash, session float/counted cash), never a figure computed
// on the fly. The accounting module can then post these as journal entries
// without re-deriving history.
//
// Stock always leaves through inventory.service so the POS and the storefront
// share one stock ledger.

import { customAlphabet } from 'nanoid';
import { prisma, money } from '../lib/prisma';
import { HttpError } from '../middleware/error';
import { applyMovement, currentUnitCost, Tx } from './inventory.service';
import { postPosSale, postSaleReversal, postCashMove, postCashVariance } from './accounting.service';

const orderNo = customAlphabet('0123456789', 8);
const trackNo = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 10);

export const TENDERS = ['CASH', 'KNET', 'CARD'] as const;
export type Tender = (typeof TENDERS)[number];

export interface PosSaleLine {
  productId: number;
  quantity: number;
  /** Optional per-line override, e.g. a manager discount at the till. */
  unitPrice?: number;
}

export interface PosSaleInput {
  lines: PosSaleLine[];
  tenders: { method: Tender; amount: number; reference?: string }[];
  customerId?: number;
  customerName?: string;
  /** Whole-ticket discount in KD. */
  discount?: number;
  note?: string;
  actorEmail?: string;
}

/** Sequential till session number (POS-000001), retried on collision. */
async function nextSessionNumber(): Promise<string> {
  const last = await prisma.posSession.findFirst({ orderBy: { id: 'desc' }, select: { id: true } });
  let seq = (last?.id ?? 0) + 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const n = `POS-${String(seq).padStart(6, '0')}`;
    if (!(await prisma.posSession.findUnique({ where: { sessionNumber: n } }))) return n;
    seq++;
  }
}

export async function openSession(input: {
  registerId?: number;
  registerName?: string;
  cashierId?: number;
  openingFloat: number;
  openingNote?: string;
  warehouseId?: number;
  actorEmail?: string;
}) {
  // One open session PER REGISTER, not one across the whole business. The
  // reference runs 25 tills across 11 branches that trade simultaneously; a
  // global lock would let Al-Rai 1 stop Khiran 2 from selling.
  const clash = await prisma.posSession.findFirst({
    where: input.registerId
      ? { status: 'OPEN', registerId: input.registerId }
      : { status: 'OPEN', registerId: null },
  });
  if (clash) {
    throw new HttpError(
      409,
      `Session ${clash.sessionNumber} is still open on ${clash.registerName} — close it before opening another.`,
    );
  }

  let register = null;
  if (input.registerId) {
    register = await prisma.posRegister.findUnique({ where: { id: input.registerId } });
    if (!register || !register.active) throw new HttpError(400, 'That register is not available');
  }

  if (input.cashierId) {
    const cashier = await prisma.employee.findUnique({ where: { id: input.cashierId } });
    if (!cashier || !cashier.active) throw new HttpError(400, 'That cashier is not available');
  }

  // The till sells the stock of the shop it stands in: the register's own
  // warehouse wins, then whatever the caller passed, then the default.
  let warehouseId = register?.warehouseId ?? input.warehouseId ?? null;
  if (warehouseId) {
    const wh = await prisma.warehouse.findUnique({ where: { id: warehouseId } });
    if (!wh || !wh.isActive) throw new HttpError(400, 'That warehouse is not available');
  } else {
    warehouseId = (await prisma.warehouse.findFirst({ where: { isDefault: true, isActive: true } }))?.id ?? null;
  }

  return prisma.posSession.create({
    data: {
      sessionNumber: await nextSessionNumber(),
      registerId: register?.id ?? null,
      registerName: register?.name || input.registerName?.trim() || 'Main Register',
      cashierId: input.cashierId ?? null,
      openingNote: input.openingNote?.trim() || null,
      warehouseId,
      openingFloat: money(input.openingFloat),
      openedByEmail: input.actorEmail ?? null,
    },
  });
}

/**
 * The open session on a register. Without a register id this returns any open
 * session, which is what the single-till setup relied on before registers
 * existed — kept so old links keep working.
 */
export function getOpenSession(registerId?: number) {
  return prisma.posSession.findFirst({
    where: registerId ? { status: 'OPEN', registerId } : { status: 'OPEN' },
    orderBy: { openedAt: 'desc' },
  });
}

/**
 * Cash that should be in the drawer right now:
 * opening float + cash tenders (refunds are negative rows) + paid-in - paid-out.
 */
export async function expectedCashFor(sessionId: number): Promise<number> {
  const session = await prisma.posSession.findUnique({ where: { id: sessionId } });
  if (!session) throw new HttpError(404, 'Session not found');

  const [cash, moves] = await Promise.all([
    prisma.posPayment.aggregate({ where: { sessionId, method: 'CASH' }, _sum: { amount: true } }),
    prisma.posCashMove.findMany({ where: { sessionId } }),
  ]);

  const cashTendered = money(cash._sum.amount ?? 0);
  const ins = money(moves.filter((m) => m.type === 'IN').reduce((s, m) => s + money(m.amount), 0));
  const outs = money(moves.filter((m) => m.type === 'OUT').reduce((s, m) => s + money(m.amount), 0));
  return money(money(session.openingFloat) + cashTendered + ins - outs);
}

export async function closeSession(sessionId: number, countedCash: number, actorEmail?: string, note?: string) {
  const session = await prisma.posSession.findUnique({ where: { id: sessionId } });
  if (!session) throw new HttpError(404, 'Session not found');
  if (session.status === 'CLOSED') throw new HttpError(400, 'This session is already closed');

  const expected = await expectedCashFor(sessionId);
  const counted = money(countedCash);

  const variance = money(counted - expected);

  return prisma.$transaction(async (tx) => {
    const closed = await tx.posSession.update({
      where: { id: sessionId },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
        closedByEmail: actorEmail ?? null,
        closingCounted: counted,
        expectedCash: expected,
        variance,
        note: note ?? session.note,
      },
    });
    // The counted drawer is the truth — book any difference to Cash Over/Short.
    await postCashVariance(tx, sessionId, session.sessionNumber, variance, actorEmail);
    return closed;
  });
}

export async function addCashMove(input: { sessionId: number; type: 'IN' | 'OUT'; amount: number; reason: string; actorEmail?: string }) {
  const session = await prisma.posSession.findUnique({ where: { id: input.sessionId } });
  if (!session || session.status !== 'OPEN') throw new HttpError(400, 'The till session is not open');
  if (input.amount <= 0) throw new HttpError(400, 'Amount must be greater than zero');

  return prisma.$transaction(async (tx) => {
    const move = await tx.posCashMove.create({
      data: {
        sessionId: input.sessionId,
        type: input.type,
        amount: money(input.amount),
        reason: input.reason.trim(),
        actorEmail: input.actorEmail ?? null,
      },
    });
    await postCashMove(tx, move.id, input.type, money(input.amount), input.reason.trim(), session.sessionNumber, input.actorEmail);
    return move;
  });
}

/**
 * Ring up a counter sale. Goods change hands immediately, so the order is
 * created already DELIVERED and PAID, with one PosPayment row per tender.
 */
export async function posSale(input: PosSaleInput) {
  const session = await getOpenSession();
  if (!session) throw new HttpError(400, 'Open a till session before selling');
  if (!input.lines?.length) throw new HttpError(400, 'The ticket is empty');
  if (!input.tenders?.length) throw new HttpError(400, 'Take a payment to complete the sale');

  const products = await prisma.product.findMany({
    where: { id: { in: input.lines.map((l) => l.productId) }, isActive: true },
    include: { images: { orderBy: { sortOrder: 'asc' }, take: 1 } },
  });
  const byId = new Map(products.map((p) => [p.id, p]));

  // Availability is judged at THIS shop, not company-wide.
  const onHand = new Map<number, number>();
  if (session.warehouseId) {
    const rows = await prisma.warehouseStock.findMany({
      where: { warehouseId: session.warehouseId, productId: { in: input.lines.map((l) => l.productId) } },
    });
    rows.forEach((r) => onHand.set(r.productId, r.quantity));
  }

  const lines = input.lines.map((l) => {
    const p = byId.get(l.productId);
    if (!p) throw new HttpError(400, `Product ${l.productId} is unavailable`);
    const qty = Math.floor(l.quantity);
    if (qty < 1) throw new HttpError(400, `Invalid quantity for ${p.name}`);
    const available = session.warehouseId ? onHand.get(p.id) ?? 0 : p.stockQty;
    if (available < qty) throw new HttpError(409, `Only ${available} left of ${p.name} at this shop`);
    const unit = l.unitPrice != null ? money(l.unitPrice) : money(p.sellingPrice);
    return {
      product: p,
      name: p.name,
      sku: p.sku,
      imageUrl: p.images[0]?.url ?? null,
      unitPrice: unit,
      unitCost: currentUnitCost(p),
      quantity: qty,
      lineTotal: money(unit * qty),
    };
  });

  const subtotal = money(lines.reduce((s, l) => s + l.lineTotal, 0));
  const discount = Math.min(money(input.discount ?? 0), subtotal);
  const total = money(subtotal - discount);

  const tendered = money(input.tenders.reduce((s, t) => s + money(t.amount), 0));
  if (tendered + 0.0005 < total) {
    throw new HttpError(400, `Short payment: ${tendered.toFixed(3)} tendered for a ${total.toFixed(3)} ticket`);
  }
  // Change is only ever given in cash, so only the cash tender is reduced to
  // the amount actually kept in the drawer.
  const change = money(tendered - total);
  if (change > 0 && !input.tenders.some((t) => t.method === 'CASH')) {
    throw new HttpError(400, 'Overpayment is only possible on a cash tender');
  }

  const orderNumber = `POS-${orderNo()}`;
  const trackingNumber = trackNo();

  const order = await prisma.$transaction(async (tx: Tx) => {
    const created = await tx.order.create({
      data: {
        orderNumber,
        trackingNumber,
        channel: 'POS',
        posSessionId: session.id,
        customerId: input.customerId ?? null,
        contactName: input.customerName?.trim() || 'Walk-in customer',
        status: 'DELIVERED',
        payStatus: 'PAID',
        payMethod: input.tenders.length > 1 ? 'SPLIT' : input.tenders[0].method,
        deliveryMethod: 'PICKUP',
        subtotal,
        discount,
        shipping: 0,
        tax: 0,
        total,
        items: {
          create: lines.map((l) => ({
            productId: l.product.id,
            name: l.name,
            sku: l.sku,
            imageUrl: l.imageUrl,
            unitPrice: l.unitPrice,
            unitCost: l.unitCost,
            quantity: l.quantity,
            lineTotal: l.lineTotal,
          })),
        },
        events: { create: { status: 'DELIVERED', note: input.note || `Counter sale on ${session.sessionNumber}` } },
      },
    });

    for (const t of input.tenders) {
      // Record what actually stayed in the drawer, not what was handed over.
      const amount = t.method === 'CASH' ? money(money(t.amount) - change) : money(t.amount);
      if (amount === 0) continue;
      await tx.posPayment.create({
        data: {
          orderId: created.id,
          sessionId: session.id,
          method: t.method,
          amount,
          reference: t.reference ?? null,
        },
      });
    }

    for (const l of lines) {
      await applyMovement(tx, {
        productId: l.product.id,
        qty: -l.quantity,
        type: 'SALE',
        unitCost: l.unitCost,
        refType: 'ORDER',
        refId: created.id,
        refLabel: orderNumber,
        warehouseId: session.warehouseId ?? undefined,
        reason: `Counter sale on ${session.sessionNumber}`,
        actorEmail: input.actorEmail,
      });
      await tx.product.update({
        where: { id: l.product.id },
        data: { soldCount: { increment: l.quantity } },
      });
    }

    // Post to the books using the tenders actually kept in the drawer.
    await postPosSale(
      tx,
      created,
      input.tenders.map((t) => ({
        method: t.method,
        amount: t.method === 'CASH' ? money(money(t.amount) - change) : money(t.amount),
      })),
      money(lines.reduce((s, l) => s + l.unitCost * l.quantity, 0)),
      input.actorEmail
    );

    return created;
  });

  return { order: await getPosOrder(order.id), change };
}

/** Refund a counter sale in full: goods back on the shelf, negative tenders. */
export async function posRefund(orderId: number, reason?: string, actorEmail?: string) {
  const session = await getOpenSession();
  if (!session) throw new HttpError(400, 'Open a till session before refunding');

  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true, posPayments: true } });
  if (!order) throw new HttpError(404, 'Sale not found');
  if (order.channel !== 'POS') throw new HttpError(400, 'This is not a counter sale');
  if (order.payStatus === 'REFUNDED') throw new HttpError(400, 'This sale is already refunded');

  await prisma.$transaction(async (tx: Tx) => {
    for (const it of order.items) {
      await applyMovement(tx, {
        productId: it.productId,
        qty: it.quantity,
        type: 'REFUND_RESTOCK',
        unitCost: money(it.unitCost),
        refType: 'ORDER',
        refId: order.id,
        refLabel: order.orderNumber,
        // Goods come back to the shop that sold them.
        warehouseId: order.posSessionId
          ? (await tx.posSession.findUnique({ where: { id: order.posSessionId } }))?.warehouseId ?? undefined
          : session.warehouseId ?? undefined,
        reason: reason ? `Till refund: ${reason}` : 'Till refund',
        actorEmail,
      });
      await tx.product.update({ where: { id: it.productId }, data: { soldCount: { decrement: it.quantity } } });
    }

    // Mirror each original tender as a negative row against the open session,
    // so today's drawer reflects money actually handed back today.
    for (const p of order.posPayments) {
      await tx.posPayment.create({
        data: {
          orderId: order.id,
          sessionId: session.id,
          method: p.method,
          amount: money(-money(p.amount)),
          reference: `Refund of ${order.orderNumber}`,
        },
      });
    }

    await tx.order.update({ where: { id: order.id }, data: { status: 'RETURNED', payStatus: 'REFUNDED' } });
    await tx.orderEvent.create({
      data: { orderId: order.id, status: 'RETURNED', note: reason ? `Refunded at the till: ${reason}` : 'Refunded at the till' },
    });
    await postSaleReversal(tx, order.id, order.orderNumber, reason, actorEmail);
  });

  return getPosOrder(orderId);
}

export async function getPosOrder(id: number) {
  const o = await prisma.order.findUnique({
    where: { id },
    include: { items: true, posPayments: true, customer: { select: { id: true, name: true, phone: true } } },
  });
  if (!o) return null;
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    channel: o.channel,
    contactName: o.contactName,
    customer: o.customer,
    status: o.status,
    payStatus: o.payStatus,
    payMethod: o.payMethod,
    subtotal: money(o.subtotal),
    discount: money(o.discount),
    total: money(o.total),
    placedAt: o.placedAt,
    items: o.items.map((i) => ({
      id: i.id,
      productId: i.productId,
      name: i.name,
      sku: i.sku,
      unitPrice: money(i.unitPrice),
      quantity: i.quantity,
      lineTotal: money(i.lineTotal),
    })),
    tenders: o.posPayments.map((p) => ({ id: p.id, method: p.method, amount: money(p.amount), reference: p.reference })),
  };
}

/** Z-report: everything an accountant needs to sign off one till session. */
export async function sessionReport(sessionId: number) {
  const session = await prisma.posSession.findUnique({
    where: { id: sessionId },
    include: {
      orders: { include: { items: true } },
      payments: true,
      cashMoves: { orderBy: { createdAt: 'asc' } },
    },
  });
  if (!session) throw new HttpError(404, 'Session not found');

  const sales = session.orders.filter((o) => o.payStatus !== 'REFUNDED');
  const refunds = session.orders.filter((o) => o.payStatus === 'REFUNDED');

  const byTender = TENDERS.map((method) => ({
    method,
    amount: money(session.payments.filter((p) => p.method === method).reduce((s, p) => s + money(p.amount), 0)),
    count: session.payments.filter((p) => p.method === method).length,
  })).filter((t) => t.count > 0);

  const gross = money(session.orders.reduce((s, o) => s + money(o.subtotal), 0));
  const discounts = money(session.orders.reduce((s, o) => s + money(o.discount), 0));
  const net = money(session.payments.reduce((s, p) => s + money(p.amount), 0));
  const cogs = money(
    sales.reduce((s, o) => s + o.items.reduce((t, i) => t + money(i.unitCost) * i.quantity, 0), 0)
  );
  const expected = session.status === 'OPEN' ? await expectedCashFor(sessionId) : money(session.expectedCash);

  return {
    id: session.id,
    sessionNumber: session.sessionNumber,
    registerName: session.registerName,
    status: session.status,
    openedAt: session.openedAt,
    closedAt: session.closedAt,
    openedByEmail: session.openedByEmail,
    closedByEmail: session.closedByEmail,
    openingFloat: money(session.openingFloat),
    expectedCash: expected,
    closingCounted: session.closingCounted != null ? money(session.closingCounted) : null,
    variance: session.variance != null ? money(session.variance) : null,
    orderCount: sales.length,
    refundCount: refunds.length,
    gross,
    discounts,
    net,
    cogs,
    grossProfit: money(net - cogs),
    byTender,
    cashMoves: session.cashMoves.map((m) => ({
      id: m.id, type: m.type, amount: money(m.amount), reason: m.reason, actorEmail: m.actorEmail, createdAt: m.createdAt,
    })),
    orders: session.orders
      .sort((a, b) => b.placedAt.getTime() - a.placedAt.getTime())
      .map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        contactName: o.contactName,
        total: money(o.total),
        payMethod: o.payMethod,
        payStatus: o.payStatus,
        placedAt: o.placedAt,
        itemCount: o.items.reduce((s, i) => s + i.quantity, 0),
      })),
  };
}
