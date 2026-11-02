import { Router } from 'express';
import { z } from 'zod';
import { prisma, money } from '../../lib/prisma';
import { HttpError } from '../../middleware/error';
import { applyMovement, currentUnitCost } from '../../services/inventory.service';
import { postSoCogs, postSoInvoice, postSoPayment, postSoReversal } from '../../services/accounting.service';
import { env } from '../../lib/env';

export const adminSalesOrders = Router();

/**
 * B2B sales, following Odoo's sale.order lifecycle:
 *   quotation (DRAFT) -> confirmed (SALE) -> delivered -> invoiced -> paid
 * Confirming reserves nothing; stock only moves on delivery, and the books are
 * only hit on invoice. That keeps warehouse and finance independent.
 */

const EDITABLE = ['DRAFT', 'SENT'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serialize(o: any) {
  const amountDue = money(money(o.amountInvoiced) - money(o.amountPaid));
  return {
    id: o.id,
    name: o.name,
    partnerId: o.partnerId,
    partnerName: o.partner?.name ?? null,
    state: o.state,
    dateOrder: o.dateOrder,
    validityDate: o.validityDate,
    confirmedAt: o.confirmedAt,
    customerRef: o.customerRef,
    paymentTerms: o.paymentTerms,
    salespersonEmail: o.salespersonEmail,
    note: o.note,
    amountUntaxed: money(o.amountUntaxed),
    amountTax: money(o.amountTax),
    amountTotal: money(o.amountTotal),
    amountInvoiced: money(o.amountInvoiced),
    amountPaid: money(o.amountPaid),
    amountDue,
    invoiceStatus: o.invoiceStatus,
    deliveryStatus: o.deliveryStatus,
    lines: (o.lines || []).map((l: any) => ({
      id: l.id,
      productId: l.productId,
      name: l.name,
      sku: l.sku,
      quantity: l.quantity,
      deliveredQty: l.deliveredQty,
      unitPrice: money(l.unitPrice),
      discount: money(l.discount),
      lineTotal: money(l.lineTotal),
    })),
  };
}

async function nextName(): Promise<string> {
  const last = await prisma.salesOrder.findFirst({ orderBy: { id: 'desc' }, select: { id: true } });
  let seq = (last?.id ?? 0) + 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const n = `SO-${String(seq).padStart(6, '0')}`;
    if (!(await prisma.salesOrder.findUnique({ where: { name: n } }))) return n;
    seq++;
  }
}

/** Price a set of lines and total the order (tax is a flat store-level rate). */
async function priceLines(items: { productId: number; quantity: number; unitPrice?: number; discount?: number }[]) {
  const products = await prisma.product.findMany({ where: { id: { in: items.map((i) => i.productId) } } });
  const byId = new Map(products.map((p) => [p.id, p]));

  const lines = items.map((i, idx) => {
    const p = byId.get(i.productId);
    if (!p) throw new HttpError(400, `Product ${i.productId} not found`);
    const unitPrice = i.unitPrice != null ? money(i.unitPrice) : money(p.sellingPrice);
    const discount = money(i.discount ?? 0);
    if (discount < 0 || discount > 100) throw new HttpError(400, 'Discount must be between 0 and 100%');
    const gross = unitPrice * i.quantity;
    return {
      productId: p.id,
      name: p.name,
      sku: p.sku,
      quantity: i.quantity,
      unitPrice,
      discount,
      lineTotal: money(gross - (gross * discount) / 100),
      sequence: idx,
    };
  });

  const amountUntaxed = money(lines.reduce((s, l) => s + l.lineTotal, 0));
  const amountTax = money((amountUntaxed * env.store.taxPct) / 100);
  return { lines, amountUntaxed, amountTax, amountTotal: money(amountUntaxed + amountTax) };
}

// ---- List (ViewShell contract) ----
adminSalesOrders.get('/', async (req, res) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};
  const filters = String(req.query.filters || '').split(',').filter(Boolean);
  if (filters.includes('quotations')) where.state = { in: ['DRAFT', 'SENT'] };
  if (filters.includes('orders')) where.state = { in: ['SALE', 'DONE'] };
  if (filters.includes('toInvoice')) where.invoiceStatus = 'TO_INVOICE';
  if (filters.includes('toDeliver')) where.deliveryStatus = { in: ['PENDING', 'PARTIAL'] };
  if (filters.includes('cancelled')) where.state = 'CANCELLED';
  else if (!filters.includes('quotations') && !filters.includes('orders') && !filters.includes('cancelled')) {
    where.state = { not: 'CANCELLED' };
  }
  if (req.query.partnerId) where.partnerId = Number(req.query.partnerId);

  const q = String(req.query.q || '').trim();
  if (q) {
    where.OR = [
      { name: { contains: q } },
      { customerRef: { contains: q } },
      { partner: { name: { contains: q } } },
    ];
  }

  const take = Math.min(Number(req.query.limit) || 40, 200);
  const skip = Number(req.query.skip) || 0;
  const [rows, total] = await Promise.all([
    prisma.salesOrder.findMany({
      where,
      orderBy: { dateOrder: 'desc' },
      take,
      skip,
      include: { partner: true, lines: true },
    }),
    prisma.salesOrder.count({ where }),
  ]);

  let groups;
  if (req.query.groupBy === 'state') {
    const g = await prisma.salesOrder.groupBy({ by: ['state'], where, _count: { _all: true } });
    groups = g.map((x) => ({ key: x.state, label: x.state, count: x._count._all }));
  } else if (req.query.groupBy === 'partner') {
    const g = await prisma.salesOrder.groupBy({ by: ['partnerId'], where, _count: { _all: true } });
    const partners = await prisma.partner.findMany({ where: { id: { in: g.map((x) => x.partnerId) } } });
    const names = new Map(partners.map((p) => [p.id, p.name]));
    groups = g.map((x) => ({ key: String(x.partnerId), label: names.get(x.partnerId) || '—', count: x._count._all }));
  }

  res.json({ rows: rows.map(serialize), total, skip, take, groups });
});

adminSalesOrders.get('/:id', async (req, res) => {
  const o = await prisma.salesOrder.findUnique({
    where: { id: Number(req.params.id) },
    include: { partner: true, lines: { orderBy: { sequence: 'asc' } } },
  });
  if (!o) throw new HttpError(404, 'Sales order not found');
  res.json(serialize(o));
});

const soSchema = z.object({
  partnerId: z.number().int().positive(),
  customerRef: z.string().optional().nullable(),
  paymentTerms: z.string().default('CASH'),
  validityDate: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
  lines: z
    .array(
      z.object({
        productId: z.number().int().positive(),
        quantity: z.number().int().positive(),
        unitPrice: z.number().min(0).optional(),
        discount: z.number().min(0).max(100).optional(),
      })
    )
    .min(1, 'Add at least one product'),
});

adminSalesOrders.post('/', async (req, res) => {
  const data = soSchema.parse(req.body);
  if (!(await prisma.partner.findUnique({ where: { id: data.partnerId } }))) {
    throw new HttpError(400, 'Customer not found');
  }
  const priced = await priceLines(data.lines);
  const name = await nextName();

  const created = await prisma.$transaction(async (tx) => {
    const so = await tx.salesOrder.create({
      data: {
        name,
        partnerId: data.partnerId,
        customerRef: data.customerRef || null,
        paymentTerms: data.paymentTerms,
        validityDate: data.validityDate ? new Date(data.validityDate) : null,
        note: data.note || null,
        salespersonEmail: req.auth?.email ?? null,
        amountUntaxed: priced.amountUntaxed,
        amountTax: priced.amountTax,
        amountTotal: priced.amountTotal,
        lines: { create: priced.lines },
      },
      include: { partner: true, lines: { orderBy: { sequence: 'asc' } } },
    });
    // Mark the contact as a customer, the way Odoo bumps customer_rank.
    await tx.partner.update({
      where: { id: data.partnerId },
      data: { customerRank: { increment: 1 } },
    });
    await tx.mailMessage.create({
      data: { resModel: 'sales.order', resId: so.id, type: 'LOG', body: 'Quotation created', authorEmail: req.auth?.email },
    });
    return so;
  });
  res.status(201).json(serialize(created));
});

adminSalesOrders.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.salesOrder.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, 'Sales order not found');
  if (!EDITABLE.includes(existing.state)) {
    throw new HttpError(400, 'Only a quotation can be edited — cancel it to make changes');
  }
  const data = soSchema.parse(req.body);
  const priced = await priceLines(data.lines);

  const updated = await prisma.$transaction(async (tx) => {
    await tx.salesOrderLine.deleteMany({ where: { orderId: id } });
    return tx.salesOrder.update({
      where: { id },
      data: {
        partnerId: data.partnerId,
        customerRef: data.customerRef || null,
        paymentTerms: data.paymentTerms,
        validityDate: data.validityDate ? new Date(data.validityDate) : null,
        note: data.note || null,
        amountUntaxed: priced.amountUntaxed,
        amountTax: priced.amountTax,
        amountTotal: priced.amountTotal,
        lines: { create: priced.lines },
      },
      include: { partner: true, lines: { orderBy: { sequence: 'asc' } } },
    });
  });
  res.json(serialize(updated));
});

// ---- Workflow ----
adminSalesOrders.post('/:id/confirm', async (req, res) => {
  const id = Number(req.params.id);
  const so = await prisma.salesOrder.findUnique({ where: { id }, include: { lines: true } });
  if (!so) throw new HttpError(404, 'Sales order not found');
  if (!EDITABLE.includes(so.state)) throw new HttpError(400, 'This quotation has already been confirmed');

  const updated = await prisma.$transaction(async (tx) => {
    const o = await tx.salesOrder.update({
      where: { id },
      data: { state: 'SALE', confirmedAt: new Date(), invoiceStatus: 'TO_INVOICE' },
      include: { partner: true, lines: { orderBy: { sequence: 'asc' } } },
    });
    await tx.mailMessage.create({
      data: { resModel: 'sales.order', resId: id, type: 'LOG', body: 'Quotation confirmed — now a sales order', authorEmail: req.auth?.email },
    });
    return o;
  });
  res.json(serialize(updated));
});

adminSalesOrders.post('/:id/cancel', async (req, res) => {
  const id = Number(req.params.id);
  const { reason } = z.object({ reason: z.string().optional() }).parse(req.body || {});
  const so = await prisma.salesOrder.findUnique({ where: { id }, include: { lines: true } });
  if (!so) throw new HttpError(404, 'Sales order not found');
  if (so.state === 'CANCELLED') throw new HttpError(400, 'This order is already cancelled');
  if (so.lines.some((l) => l.deliveredQty > 0)) {
    throw new HttpError(400, 'Goods have already been delivered — return them before cancelling');
  }

  const updated = await prisma.$transaction(async (tx) => {
    await postSoReversal(tx, id, so.name, reason, req.auth?.email);
    const o = await tx.salesOrder.update({
      where: { id },
      data: { state: 'CANCELLED', invoiceStatus: 'NO' },
      include: { partner: true, lines: { orderBy: { sequence: 'asc' } } },
    });
    await tx.mailMessage.create({
      data: { resModel: 'sales.order', resId: id, type: 'LOG', body: reason ? `Cancelled: ${reason}` : 'Order cancelled', authorEmail: req.auth?.email },
    });
    return o;
  });
  res.json(serialize(updated));
});

/** Deliver goods — stock leaves here, and only here. */
adminSalesOrders.post('/:id/deliver', async (req, res) => {
  const id = Number(req.params.id);
  const body = z
    .object({ lines: z.array(z.object({ lineId: z.number().int(), qty: z.number().int().positive() })).min(1) })
    .parse(req.body);

  const so = await prisma.salesOrder.findUnique({ where: { id }, include: { lines: true } });
  if (!so) throw new HttpError(404, 'Sales order not found');
  if (so.state !== 'SALE') throw new HttpError(400, 'Confirm the quotation before delivering');

  for (const l of body.lines) {
    const line = so.lines.find((x) => x.id === l.lineId);
    if (!line) throw new HttpError(400, `Line ${l.lineId} is not on this order`);
    const remaining = line.quantity - line.deliveredQty;
    if (l.qty > remaining) throw new HttpError(400, `Only ${remaining} of ${line.name} still to deliver`);
  }

  const deliveryKey = `${Date.now()}`;
  const updated = await prisma.$transaction(async (tx) => {
    let cogs = 0;
    for (const l of body.lines) {
      const line = so.lines.find((x) => x.id === l.lineId)!;
      const product = await tx.product.findUniqueOrThrow({ where: { id: line.productId } });
      const unitCost = currentUnitCost(product);
      cogs += unitCost * l.qty;

      await applyMovement(tx, {
        productId: line.productId,
        qty: -l.qty,
        type: 'SALE',
        unitCost,
        refType: 'SO',
        refId: so.id,
        refLabel: so.name,
        reason: `Delivered on ${so.name}`,
        actorEmail: req.auth?.email,
      });
      await tx.product.update({ where: { id: line.productId }, data: { soldCount: { increment: l.qty } } });
      await tx.salesOrderLine.update({
        where: { id: line.id },
        data: { deliveredQty: { increment: l.qty }, unitCost },
      });
    }

    await postSoCogs(tx, so, money(cogs), deliveryKey, req.auth?.email);

    const fresh = await tx.salesOrderLine.findMany({ where: { orderId: id } });
    const complete = fresh.every((l) => l.deliveredQty >= l.quantity);
    const started = fresh.some((l) => l.deliveredQty > 0);

    const o = await tx.salesOrder.update({
      where: { id },
      data: { deliveryStatus: complete ? 'DONE' : started ? 'PARTIAL' : 'PENDING' },
      include: { partner: true, lines: { orderBy: { sequence: 'asc' } } },
    });
    await tx.mailMessage.create({
      data: { resModel: 'sales.order', resId: id, type: 'LOG', body: complete ? 'All goods delivered' : 'Partial delivery recorded', authorEmail: req.auth?.email },
    });
    return o;
  });
  res.json(serialize(updated));
});

/** Invoice the order — creates the receivable and books the revenue. */
adminSalesOrders.post('/:id/invoice', async (req, res) => {
  const id = Number(req.params.id);
  const so = await prisma.salesOrder.findUnique({ where: { id } });
  if (!so) throw new HttpError(404, 'Sales order not found');
  if (so.state !== 'SALE') throw new HttpError(400, 'Confirm the order before invoicing');
  if (so.invoiceStatus === 'INVOICED') throw new HttpError(400, 'This order is already invoiced');

  const updated = await prisma.$transaction(async (tx) => {
    await postSoInvoice(tx, so, req.auth?.email);
    const o = await tx.salesOrder.update({
      where: { id },
      data: { invoiceStatus: 'INVOICED', amountInvoiced: money(so.amountTotal) },
      include: { partner: true, lines: { orderBy: { sequence: 'asc' } } },
    });
    await tx.mailMessage.create({
      data: { resModel: 'sales.order', resId: id, type: 'LOG', body: `Invoiced ${money(so.amountTotal).toFixed(3)} KD`, authorEmail: req.auth?.email },
    });
    return o;
  });
  res.json(serialize(updated));
});

/** Register a customer payment against the invoice. */
adminSalesOrders.post('/:id/payments', async (req, res) => {
  const id = Number(req.params.id);
  const { amount, method } = z
    .object({ amount: z.number().positive(), method: z.enum(['CASH', 'BANK']).default('BANK') })
    .parse(req.body);

  const so = await prisma.salesOrder.findUnique({ where: { id } });
  if (!so) throw new HttpError(404, 'Sales order not found');
  if (so.invoiceStatus !== 'INVOICED') throw new HttpError(400, 'Invoice the order before registering a payment');

  const due = money(money(so.amountInvoiced) - money(so.amountPaid));
  if (money(amount) > due + 0.0005) throw new HttpError(400, `Only ${due.toFixed(3)} is outstanding`);

  const updated = await prisma.$transaction(async (tx) => {
    await postSoPayment(tx, so, money(amount), method, `${Date.now()}`, req.auth?.email);
    const paid = money(money(so.amountPaid) + money(amount));
    const o = await tx.salesOrder.update({
      where: { id },
      data: { amountPaid: paid, state: paid >= money(so.amountInvoiced) ? 'DONE' : so.state },
      include: { partner: true, lines: { orderBy: { sequence: 'asc' } } },
    });
    await tx.mailMessage.create({
      data: { resModel: 'sales.order', resId: id, type: 'LOG', body: `Payment of ${money(amount).toFixed(3)} KD received (${method})`, authorEmail: req.auth?.email },
    });
    return o;
  });
  res.json(serialize(updated));
});

adminSalesOrders.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const so = await prisma.salesOrder.findUnique({ where: { id } });
  if (!so) throw new HttpError(404, 'Sales order not found');
  if (!EDITABLE.includes(so.state)) throw new HttpError(400, 'Only a quotation can be deleted — cancel the order instead');
  await prisma.salesOrder.delete({ where: { id } });
  res.json({ ok: true });
});

// ---- Chatter ----
adminSalesOrders.get('/:id/messages', async (req, res) => {
  res.json(
    await prisma.mailMessage.findMany({
      where: { resModel: 'sales.order', resId: Number(req.params.id) },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
  );
});

adminSalesOrders.post('/:id/messages', async (req, res) => {
  const { body } = z.object({ body: z.string().min(1) }).parse(req.body);
  const msg = await prisma.mailMessage.create({
    data: {
      resModel: 'sales.order',
      resId: Number(req.params.id),
      type: 'COMMENT',
      body,
      authorEmail: req.auth?.email,
      authorName: req.auth?.email?.split('@')[0],
    },
  });
  res.status(201).json(msg);
});
