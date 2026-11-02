import { customAlphabet } from 'nanoid';
import { prisma, money } from '../lib/prisma';
import { env } from '../lib/env';
import { HttpError } from '../middleware/error';
import { getGateway } from './payment.service';
import { emailSender, orderStatusEmail } from './email.service';
import { applyMovement, currentUnitCost } from './inventory.service';
import { postOnlineSale } from './accounting.service';

/** Send an order email without blocking / failing the request.
 *  A POS walk-in sale has no email address, so there is nothing to notify. */
export function notifyOrderStatus(
  status: string,
  o: { contactEmail: string | null; contactName: string; orderNumber: string; trackingNumber: string; total: number; items: { name: string; quantity: number; lineTotal: number }[] }
) {
  if (!o.contactEmail) return;
  const tpl = orderStatusEmail(status, {
    to: o.contactEmail,
    customerName: o.contactName,
    orderNumber: o.orderNumber,
    trackingNumber: o.trackingNumber,
    total: o.total,
    currency: env.store.currency,
    items: o.items,
  });
  emailSender.send({ to: o.contactEmail, ...tpl }).catch((e) => console.error('[email] order notify failed:', e?.message));
}

const orderNo = customAlphabet('0123456789', 8);
const trackNo = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 10);

export interface CheckoutLine {
  productId: number;
  quantity: number;
}

export interface CheckoutInput {
  items: CheckoutLine[];
  contact: { name: string; email: string; phone: string };
  shipping: { area: string; block?: string; street?: string; building?: string; notes?: string };
  deliveryMethod?: string;
  payMethod: string;
  couponCode?: string;
  redeemPoints?: number;
  card?: { number?: string; name?: string };
  customerId?: number;
}

/** Validate cart, price it, charge, persist the order, decrement stock. */
export async function placeOrder(input: CheckoutInput) {
  if (!input.items?.length) throw new HttpError(400, 'Cart is empty');

  const ids = input.items.map((i) => i.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: ids }, isActive: true },
    include: { images: { orderBy: { sortOrder: 'asc' }, take: 1 } },
  });
  const byId = new Map(products.map((p) => [p.id, p]));

  // Build priced lines + validate stock
  const lines = input.items.map((line) => {
    const p = byId.get(line.productId);
    if (!p) throw new HttpError(400, `Product ${line.productId} is unavailable`);
    const qty = Math.floor(line.quantity);
    if (qty < 1) throw new HttpError(400, `Invalid quantity for ${p.name}`);
    if (p.stockQty < qty) throw new HttpError(409, `Only ${p.stockQty} left of ${p.name}`);
    const unit = money(p.sellingPrice);
    return {
      product: p,
      name: p.name,
      sku: p.sku,
      imageUrl: p.images[0]?.url ?? null,
      unitPrice: unit,
      // Snapshot the cost now so historical COGS never moves when the
      // product's cost changes later.
      unitCost: currentUnitCost(p),
      quantity: qty,
      lineTotal: money(unit * qty),
    };
  });

  const subtotal = money(lines.reduce((s, l) => s + l.lineTotal, 0));

  // Coupon
  let discount = 0;
  let couponCode: string | undefined;
  if (input.couponCode) {
    const c = await prisma.coupon.findUnique({ where: { code: input.couponCode.toUpperCase() } });
    const valid =
      c &&
      c.isActive &&
      (!c.expiresAt || c.expiresAt > new Date()) &&
      (c.maxUses == null || c.usedCount < c.maxUses) &&
      subtotal >= money(c.minSubtotal);
    if (!valid) throw new HttpError(400, 'Coupon is invalid or expired');
    discount =
      c!.type === 'PERCENT' ? money((subtotal * money(c!.value)) / 100) : money(c!.value);
    discount = Math.min(discount, subtotal);
    couponCode = c!.code;
  }

  // Loyalty points redemption (logged-in customers only)
  let pointsRedeemed = 0;
  let pointsDiscount = 0;
  if (env.loyalty.enabled && input.redeemPoints && input.redeemPoints > 0) {
    if (!input.customerId) throw new HttpError(401, 'Sign in to redeem points');
    const customer = await prisma.customer.findUnique({ where: { id: input.customerId } });
    if (!customer) throw new HttpError(401, 'Sign in to redeem points');
    // Can't redeem more than they have, nor more than the order value (after coupon)
    const maxByBalance = customer.loyaltyPoints;
    const maxByValue = Math.floor(Math.max(0, subtotal - discount) * env.loyalty.redeemRate);
    pointsRedeemed = Math.min(Math.floor(input.redeemPoints), maxByBalance, maxByValue);
    if (pointsRedeemed < 0) pointsRedeemed = 0;
    pointsDiscount = money(pointsRedeemed / env.loyalty.redeemRate);
  }

  const totalDiscount = money(discount + pointsDiscount);
  const taxable = Math.max(0, subtotal - totalDiscount);
  const tax = money((taxable * env.store.taxPct) / 100);
  const shipping =
    subtotal >= env.store.freeShippingOver ? 0 : money(env.store.defaultShipping);
  const total = money(taxable + tax + shipping);

  // Points earned on the amount actually paid
  const pointsEarned = env.loyalty.enabled ? Math.floor(total * env.loyalty.earnRate) : 0;

  const gateway = getGateway(input.payMethod);
  const orderNumber = `DA-${orderNo()}`;
  const trackingNumber = trackNo();

  // Charge before persisting so a hard failure aborts cleanly.
  const charge = await gateway.charge({ orderNumber, amount: total, card: input.card });
  if (charge.status === 'FAILED') {
    throw new HttpError(402, 'Payment was declined. Please try another method.');
  }
  const payStatus = charge.status === 'PAID' ? 'PAID' : 'UNPAID';

  const order = await prisma.$transaction(async (tx) => {
    // Re-check + decrement stock atomically
    for (const l of lines) {
      const fresh = await tx.product.findUnique({ where: { id: l.product.id } });
      if (!fresh || fresh.stockQty < l.quantity) {
        throw new HttpError(409, `Stock changed for ${l.name}, please review your cart`);
      }
    }
    const created = await tx.order.create({
      data: {
        orderNumber,
        trackingNumber,
        customerId: input.customerId ?? null,
        contactName: input.contact.name,
        contactEmail: input.contact.email,
        contactPhone: input.contact.phone,
        shipArea: input.shipping.area,
        shipBlock: input.shipping.block,
        shipStreet: input.shipping.street,
        shipBuilding: input.shipping.building,
        shipNotes: input.shipping.notes,
        status: 'PENDING',
        payStatus,
        payMethod: gateway.method,
        deliveryMethod: input.deliveryMethod || 'STANDARD',
        subtotal,
        discount: totalDiscount,
        shipping,
        tax,
        total,
        couponCode,
        pointsEarned,
        pointsRedeemed,
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
        events: { create: { status: 'PENDING', note: 'Order placed' } },
        payment: {
          create: {
            method: gateway.method,
            status: charge.status,
            amount: total,
            transactionId: charge.transactionId,
            rawResponse: JSON.stringify(charge.raw),
          },
        },
      },
    });

    for (const l of lines) {
      // Stock leaves through the ledger so every change is explainable.
      await applyMovement(tx, {
        productId: l.product.id,
        qty: -l.quantity,
        type: 'SALE',
        unitCost: l.unitCost,
        refType: 'ORDER',
        refId: created.id,
        refLabel: orderNumber,
        reason: 'Sold on the storefront',
      });
      await tx.product.update({
        where: { id: l.product.id },
        data: { soldCount: { increment: l.quantity } },
      });
    }

    // Post the sale to the books. No-op until the books are opened.
    await postOnlineSale(
      tx,
      { ...created, channel: 'ONLINE' },
      money(lines.reduce((s, l) => s + l.unitCost * l.quantity, 0))
    );
    if (couponCode) {
      await tx.coupon.update({
        where: { code: couponCode },
        data: { usedCount: { increment: 1 } },
      });
    }

    // Loyalty: deduct redeemed + credit earned, with a ledger entry for each
    if (input.customerId && (pointsRedeemed > 0 || pointsEarned > 0)) {
      const net = pointsEarned - pointsRedeemed;
      await tx.customer.update({
        where: { id: input.customerId },
        data: { loyaltyPoints: { increment: net } },
      });
      if (pointsRedeemed > 0) {
        await tx.loyaltyTransaction.create({
          data: { customerId: input.customerId, orderId: created.id, points: -pointsRedeemed, type: 'REDEEM', note: `Redeemed on ${orderNumber}` },
        });
      }
      if (pointsEarned > 0) {
        await tx.loyaltyTransaction.create({
          data: { customerId: input.customerId, orderId: created.id, points: pointsEarned, type: 'EARN', note: `Earned on ${orderNumber}` },
        });
      }
    }
    return created;
  });

  // Order-confirmation email (non-blocking)
  notifyOrderStatus('PLACED', {
    contactEmail: input.contact.email,
    contactName: input.contact.name,
    orderNumber,
    trackingNumber,
    total,
    items: lines.map((l) => ({ name: l.name, quantity: l.quantity, lineTotal: l.lineTotal })),
  });

  return getOrderByTracking(trackingNumber) ?? order;
}

export async function getOrderByTracking(trackingNumber: string) {
  const order = await prisma.order.findUnique({
    where: { trackingNumber },
    include: { items: true, events: { orderBy: { createdAt: 'asc' } }, payment: true },
  });
  if (!order) return null;
  return serializeOrder(order);
}

export async function getOrderByNumber(orderNumber: string) {
  const order = await prisma.order.findUnique({
    where: { orderNumber },
    include: { items: true, events: { orderBy: { createdAt: 'asc' } }, payment: true },
  });
  if (!order) return null;
  return serializeOrder(order);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function serializeOrder(o: any) {
  return {
    ...o,
    subtotal: money(o.subtotal),
    discount: money(o.discount),
    shipping: money(o.shipping),
    tax: money(o.tax),
    total: money(o.total),
    items: o.items?.map((i: any) => ({
      ...i,
      unitPrice: money(i.unitPrice),
      unitCost: money(i.unitCost),
      lineTotal: money(i.lineTotal),
    })),
    payment: o.payment ? { ...o.payment, amount: money(o.payment.amount) } : null,
  };
}
