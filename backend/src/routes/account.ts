import { Router } from 'express';
import { z } from 'zod';
import { prisma, money } from '../lib/prisma';
import { hashPassword, verifyPassword, signToken } from '../lib/auth';
import { requireAuth } from '../middleware/auth';
import { serializeOrder } from '../services/order.service';
import { issueCode, consumeCode } from '../services/verification.service';
import { authLimiter } from '../middleware/rateLimit';
import { env } from '../lib/env';
import { HttpError } from '../middleware/error';

export const account = Router();

function publicCustomer(c: { id: number; name: string; email: string; phone: string | null; loyaltyPoints?: number }) {
  return { id: c.id, name: c.name, email: c.email, phone: c.phone, loyaltyPoints: c.loyaltyPoints ?? 0 };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function wishProduct(p: any) {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    price: money(p.sellingPrice),
    compareAtPrice: p.compareAtPrice != null ? money(p.compareAtPrice) : null,
    inStock: p.stockQty > 0,
    stockQty: p.stockQty,
    image: p.images?.[0]?.url ?? null,
    category: p.category ? { id: p.category.id, name: p.category.name, slug: p.category.slug } : null,
    isBestSeller: p.isBestSeller,
    ratingAvg: p.ratingAvg,
    ratingCount: p.ratingCount,
  };
}

// ---------------- Auth ----------------
// Responses use a `status` discriminator so the frontend can branch cleanly:
//   { status: 'OK', token, customer }            → signed in
//   { status: 'VERIFY', email, devCode? }        → must enter an email code first

function session(customer: { id: number; name: string; email: string; phone: string | null }) {
  const token = signToken({ sub: customer.id, kind: 'customer', email: customer.email });
  return { status: 'OK' as const, token, customer: publicCustomer(customer) };
}

account.post('/auth/register', authLimiter, async (req, res) => {
  const { name, email, phone, password } = z
    .object({
      name: z.string().min(2),
      email: z.string().email(),
      phone: z.string().min(6).optional(),
      password: z.string().min(6),
    })
    .parse(req.body);

  const lower = email.toLowerCase();
  const exists = await prisma.customer.findUnique({ where: { email: lower } });
  if (exists) {
    if (exists.emailVerified) throw new HttpError(409, 'An account with this email already exists');
    // Unverified account re-registering — update details and re-send a code.
    await prisma.customer.update({
      where: { id: exists.id },
      data: { name, phone, passwordHash: await hashPassword(password) },
    });
    const { devCode } = await issueCode(lower);
    return res.status(200).json({ status: 'VERIFY', email: lower, devCode });
  }

  const customer = await prisma.customer.create({
    data: { name, email: lower, phone, passwordHash: await hashPassword(password) },
  });

  if (!env.email.requireVerification) {
    return res.status(201).json(session(customer));
  }
  const { devCode } = await issueCode(lower);
  res.status(201).json({ status: 'VERIFY', email: lower, devCode });
});

account.post('/auth/login', authLimiter, async (req, res) => {
  const { email, password } = z
    .object({ email: z.string().email(), password: z.string().min(1) })
    .parse(req.body);

  const customer = await prisma.customer.findUnique({ where: { email: email.toLowerCase() } });
  if (!customer || !customer.isActive || !(await verifyPassword(password, customer.passwordHash))) {
    throw new HttpError(401, 'Invalid email or password');
  }

  if (env.email.requireVerification && !customer.emailVerified) {
    // (Re)send a code, but tolerate the resend cooldown — a recent code may
    // still be valid, so we shouldn't block the user from verifying.
    let devCode: string | undefined;
    try {
      ({ devCode } = await issueCode(customer.email));
    } catch {
      /* cooldown / already sent — existing code remains valid */
    }
    return res.json({ status: 'VERIFY', email: customer.email, devCode });
  }
  res.json(session(customer));
});

// Verify an emailed code → marks the account verified and signs in.
account.post('/auth/verify-email', authLimiter, async (req, res) => {
  const { email, code } = z
    .object({ email: z.string().email(), code: z.string().min(4).max(8) })
    .parse(req.body);

  await consumeCode(email, code);
  const customer = await prisma.customer.update({
    where: { email: email.toLowerCase() },
    data: { emailVerified: true },
  });
  res.json(session(customer));
});

// Forgot password — emails a reset code (never reveals whether the email exists).
account.post('/auth/forgot', authLimiter, async (req, res) => {
  const { email } = z.object({ email: z.string().email() }).parse(req.body);
  const customer = await prisma.customer.findUnique({ where: { email: email.toLowerCase() } });
  let devCode: string | undefined;
  if (customer && customer.isActive) {
    try {
      ({ devCode } = await issueCode(customer.email, 'PASSWORD_RESET'));
    } catch {
      /* cooldown — a code was already sent */
    }
  }
  res.json({ ok: true, devCode });
});

// Reset password using the emailed code → signs the customer in.
account.post('/auth/reset', authLimiter, async (req, res) => {
  const { email, code, newPassword } = z
    .object({ email: z.string().email(), code: z.string().min(4).max(8), newPassword: z.string().min(6) })
    .parse(req.body);

  await consumeCode(email, code, 'PASSWORD_RESET');
  const customer = await prisma.customer.update({
    where: { email: email.toLowerCase() },
    data: { passwordHash: await hashPassword(newPassword), emailVerified: true },
  });
  res.json(session(customer));
});

// Resend a verification code.
account.post('/auth/resend', authLimiter, async (req, res) => {
  const { email } = z.object({ email: z.string().email() }).parse(req.body);
  const customer = await prisma.customer.findUnique({ where: { email: email.toLowerCase() } });
  // Always respond OK shape (don't leak which emails exist), but only send if unverified.
  let devCode: string | undefined;
  if (customer && !customer.emailVerified) {
    ({ devCode } = await issueCode(customer.email));
  }
  res.json({ ok: true, devCode });
});

// Everything below requires a customer token
account.use(requireAuth('customer'));

account.get('/auth/me', async (req, res) => {
  const c = await prisma.customer.findUnique({ where: { id: req.auth!.sub } });
  if (!c) throw new HttpError(404, 'Not found');
  res.json(publicCustomer(c));
});

account.put('/profile', async (req, res) => {
  const { name, phone } = z
    .object({ name: z.string().min(2), phone: z.string().optional().nullable() })
    .parse(req.body);
  const c = await prisma.customer.update({
    where: { id: req.auth!.sub },
    data: { name, phone: phone || null },
  });
  res.json(publicCustomer(c));
});

// ---------------- Addresses ----------------

const addressSchema = z.object({
  label: z.string().optional().nullable(),
  fullName: z.string().min(2),
  phone: z.string().min(6),
  area: z.string().min(2),
  block: z.string().optional().nullable(),
  street: z.string().optional().nullable(),
  building: z.string().optional().nullable(),
  floor: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  isDefault: z.boolean().optional(),
});

account.get('/addresses', async (req, res) => {
  const rows = await prisma.address.findMany({
    where: { customerId: req.auth!.sub },
    orderBy: [{ isDefault: 'desc' }, { id: 'desc' }],
  });
  res.json(rows);
});

account.post('/addresses', async (req, res) => {
  const data = addressSchema.parse(req.body);
  const customerId = req.auth!.sub;
  const count = await prisma.address.count({ where: { customerId } });
  const makeDefault = data.isDefault || count === 0;

  const created = await prisma.$transaction(async (tx) => {
    if (makeDefault) await tx.address.updateMany({ where: { customerId }, data: { isDefault: false } });
    return tx.address.create({ data: { ...data, isDefault: makeDefault, customerId } });
  });
  res.status(201).json(created);
});

account.put('/addresses/:id', async (req, res) => {
  const id = Number(req.params.id);
  const customerId = req.auth!.sub;
  const existing = await prisma.address.findFirst({ where: { id, customerId } });
  if (!existing) throw new HttpError(404, 'Address not found');
  const data = addressSchema.parse(req.body);

  const updated = await prisma.$transaction(async (tx) => {
    if (data.isDefault) await tx.address.updateMany({ where: { customerId }, data: { isDefault: false } });
    return tx.address.update({ where: { id }, data });
  });
  res.json(updated);
});

account.delete('/addresses/:id', async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.address.findFirst({ where: { id, customerId: req.auth!.sub } });
  if (!existing) throw new HttpError(404, 'Address not found');
  await prisma.address.delete({ where: { id } });
  res.json({ ok: true });
});

// ---------------- Wishlist ----------------

account.get('/wishlist', async (req, res) => {
  const rows = await prisma.wishlistItem.findMany({
    where: { customerId: req.auth!.sub },
    orderBy: { createdAt: 'desc' },
  });
  const ids = rows.map((r) => r.productId);
  const products = ids.length
    ? await prisma.product.findMany({
        where: { id: { in: ids } },
        include: { images: { orderBy: { sortOrder: 'asc' }, take: 1 }, category: true },
      })
    : [];
  const byId = new Map(products.map((p) => [p.id, p]));
  res.json({
    ids,
    items: ids.map((id) => byId.get(id)).filter(Boolean).map(wishProduct),
  });
});

account.post('/wishlist/:productId', async (req, res) => {
  const productId = Number(req.params.productId);
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw new HttpError(404, 'Product not found');
  await prisma.wishlistItem.upsert({
    where: { customerId_productId: { customerId: req.auth!.sub, productId } },
    update: {},
    create: { customerId: req.auth!.sub, productId },
  });
  res.status(201).json({ ok: true });
});

account.delete('/wishlist/:productId', async (req, res) => {
  const productId = Number(req.params.productId);
  await prisma.wishlistItem.deleteMany({ where: { customerId: req.auth!.sub, productId } });
  res.json({ ok: true });
});

// ---------------- Orders ----------------

account.get('/orders', async (req, res) => {
  const rows = await prisma.order.findMany({
    where: { customerId: req.auth!.sub },
    orderBy: { placedAt: 'desc' },
    include: { items: true },
  });
  res.json(rows.map((o) => serializeOrder(o)));
});

// ---------------- Loyalty ----------------

account.get('/loyalty', async (req, res) => {
  const [customer, txns] = await Promise.all([
    prisma.customer.findUnique({ where: { id: req.auth!.sub } }),
    prisma.loyaltyTransaction.findMany({ where: { customerId: req.auth!.sub }, orderBy: { createdAt: 'desc' }, take: 50 }),
  ]);
  res.json({
    points: customer?.loyaltyPoints ?? 0,
    earnRate: env.loyalty.earnRate,
    redeemRate: env.loyalty.redeemRate,
    enabled: env.loyalty.enabled,
    valueKD: Math.round(((customer?.loyaltyPoints ?? 0) / env.loyalty.redeemRate) * 1000) / 1000,
    transactions: txns.map((t) => ({ id: t.id, points: t.points, type: t.type, note: t.note, createdAt: t.createdAt })),
  });
});

// ---------------- Reviews ----------------

account.post('/reviews', async (req, res) => {
  const { productId, rating, title, body } = z
    .object({
      productId: z.number().int().positive(),
      rating: z.number().int().min(1).max(5),
      title: z.string().max(120).optional(),
      body: z.string().max(2000).optional(),
    })
    .parse(req.body);

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw new HttpError(404, 'Product not found');

  const review = await prisma.$transaction(async (tx) => {
    const r = await tx.review.upsert({
      where: { productId_customerId: { productId, customerId: req.auth!.sub } },
      update: { rating, title: title || null, body: body || null },
      create: { productId, customerId: req.auth!.sub, rating, title: title || null, body: body || null },
    });
    const agg = await tx.review.aggregate({ where: { productId }, _avg: { rating: true }, _count: { _all: true } });
    await tx.product.update({
      where: { id: productId },
      data: { ratingAvg: agg._avg.rating || 0, ratingCount: agg._count._all },
    });
    return r;
  });
  res.status(201).json(review);
});

// My existing review for a product (to prefill the form)
account.get('/reviews/:productId', async (req, res) => {
  const r = await prisma.review.findUnique({
    where: { productId_customerId: { productId: Number(req.params.productId), customerId: req.auth!.sub } },
  });
  res.json(r || null);
});

account.get('/orders/:orderNumber', async (req, res) => {
  const o = await prisma.order.findFirst({
    where: { orderNumber: req.params.orderNumber, customerId: req.auth!.sub },
    include: { items: true, events: { orderBy: { createdAt: 'asc' } }, payment: true },
  });
  if (!o) throw new HttpError(404, 'Order not found');
  res.json(serializeOrder(o));
});
