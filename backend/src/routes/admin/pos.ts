import { Router } from 'express';
import { z } from 'zod';
import { prisma, money } from '../../lib/prisma';
import { HttpError } from '../../middleware/error';
import {
  openSession,
  closeSession,
  getOpenSession,
  addCashMove,
  posSale,
  posRefund,
  sessionReport,
  expectedCashFor,
  getPosOrder,
  TENDERS,
} from '../../services/pos.service';

export const adminPos = Router();

// ==========================================================================
// Registers — the POS dashboard
//
// The reference opens on a grid of registers grouped by branch; you pick one,
// pick your name from the cashiers on it, type your PIN, count the drawer, and
// only then does the till appear. Every step below exists to support that.
// ==========================================================================

adminPos.get('/registers', async (_req, res) => {
  const registers = await prisma.posRegister.findMany({
    where: { active: true },
    orderBy: [{ sequence: 'asc' }, { name: 'asc' }],
    include: {
      warehouse: true,
      sessions: {
        where: { status: 'OPEN' },
        include: { cashier: { select: { id: true, name: true, imageUrl: true } } },
        take: 1,
      },
    },
  });

  // "Last closing" is what the reference shows on a closed register's card, so
  // the next cashier knows what should already be in the drawer.
  const lastClosed = await prisma.posSession.findMany({
    where: { status: 'CLOSED', registerId: { in: registers.map((r) => r.id) } },
    orderBy: { closedAt: 'desc' },
    select: { registerId: true, closedAt: true, closingCounted: true },
  });
  const lastByRegister = new Map<number, (typeof lastClosed)[number]>();
  for (const s of lastClosed) {
    if (s.registerId != null && !lastByRegister.has(s.registerId)) lastByRegister.set(s.registerId, s);
  }

  res.json(registers.map((r) => {
    const open = r.sessions[0];
    const last = lastByRegister.get(r.id);
    return {
      id: r.id,
      name: r.name,
      branch: r.branch,
      warehouseId: r.warehouseId,
      warehouseName: r.warehouse?.name ?? null,
      cashControl: r.cashControl,
      status: open ? 'OPEN' : 'CLOSED',
      openSessionId: open?.id ?? null,
      openSessionNumber: open?.sessionNumber ?? null,
      openedAt: open?.openedAt ?? null,
      cashierId: open?.cashier?.id ?? null,
      cashierName: open?.cashier?.name ?? null,
      cashierImageUrl: open?.cashier?.imageUrl ?? null,
      lastClosedAt: last?.closedAt ?? null,
      lastClosingCash: last?.closingCounted != null ? money(last.closingCounted) : null,
    };
  }));
});

const registerInput = z.object({
  name: z.string().min(1, 'Give the register a name'),
  /** Free text. Registers sharing a branch are grouped together on the dashboard. */
  branch: z.string().optional().nullable(),
  warehouseId: z.number().int().positive().optional().nullable(),
  cashControl: z.boolean().optional(),
  sequence: z.number().int().optional(),
});

adminPos.post('/registers', async (req, res) => {
  const b = registerInput.parse(req.body);

  const clash = await prisma.posRegister.findUnique({ where: { name: b.name.trim() } });
  if (clash) throw new HttpError(400, `A register called "${b.name.trim()}" already exists.`);

  if (b.warehouseId) {
    const wh = await prisma.warehouse.findUnique({ where: { id: b.warehouseId } });
    if (!wh || !wh.isActive) throw new HttpError(400, 'That warehouse is not available');
  }

  // New registers go to the end of the list rather than jumping to the top.
  const last = await prisma.posRegister.findFirst({ orderBy: { sequence: 'desc' } });

  const row = await prisma.posRegister.create({
    data: {
      name: b.name.trim(),
      branch: b.branch?.trim() || null,
      warehouseId: b.warehouseId ?? null,
      cashControl: b.cashControl ?? true,
      sequence: b.sequence ?? (last ? last.sequence + 10 : 10),
    },
  });
  res.status(201).json(row);
});

adminPos.patch('/registers/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid register id');

  const b = registerInput.partial().parse(req.body);

  if (b.name) {
    const clash = await prisma.posRegister.findUnique({ where: { name: b.name.trim() } });
    if (clash && clash.id !== id) throw new HttpError(400, `A register called "${b.name.trim()}" already exists.`);
  }

  // Moving a register to a different shop mid-shift would make the open
  // session sell one shop's stock while reporting another's.
  if (b.warehouseId !== undefined) {
    const open = await prisma.posSession.findFirst({ where: { registerId: id, status: 'OPEN' } });
    if (open) throw new HttpError(400, `Close ${open.sessionNumber} before changing which shop this register sells from.`);
  }

  const row = await prisma.posRegister.update({
    where: { id },
    data: {
      ...(b.name !== undefined ? { name: b.name.trim() } : {}),
      ...(b.branch !== undefined ? { branch: b.branch?.trim() || null } : {}),
      ...(b.warehouseId !== undefined ? { warehouseId: b.warehouseId ?? null } : {}),
      ...(b.cashControl !== undefined ? { cashControl: b.cashControl } : {}),
      ...(b.sequence !== undefined ? { sequence: b.sequence } : {}),
    },
  });
  res.json(row);
});

/**
 * Delete a register — but only while it has no history. Once a shift has run on
 * it, the register is part of the audit trail and gets archived instead, so
 * "which till took this money" stays answerable.
 */
adminPos.delete('/registers/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid register id');

  const open = await prisma.posSession.findFirst({ where: { registerId: id, status: 'OPEN' } });
  if (open) throw new HttpError(400, `${open.sessionNumber} is still open on this register. Close it first.`);

  const history = await prisma.posSession.count({ where: { registerId: id } });
  if (history > 0) {
    await prisma.posRegister.update({ where: { id }, data: { active: false } });
    return res.json({ ok: true, archived: true, sessions: history });
  }

  await prisma.posRegister.delete({ where: { id } });
  res.json({ ok: true, archived: false });
});

/**
 * Cashiers available at a register: active employees who have a PIN set.
 *
 * The PIN is NEVER returned — only whether one exists. The list is a directory,
 * and a directory that leaks the credential is not a directory.
 */
adminPos.get('/registers/:id/cashiers', async (req, res) => {
  const register = await prisma.posRegister.findUnique({ where: { id: Number(req.params.id) } });
  if (!register) throw new HttpError(404, 'Register not found');

  const search = String(req.query.q || '').trim();
  const rows = await prisma.employee.findMany({
    where: {
      active: true,
      pin: { not: null },
      ...(search ? { OR: [{ name: { contains: search } }, { ref: { contains: search } }] } : {}),
    },
    select: {
      id: true, name: true, ref: true, jobTitle: true, imageUrl: true,
      department: { select: { name: true } },
    },
    orderBy: { name: 'asc' },
    take: 200,
  });

  res.json(rows.map((e) => ({
    id: e.id,
    name: e.name,
    ref: e.ref,
    jobTitle: e.jobTitle,
    imageUrl: e.imageUrl,
    departmentName: e.department?.name ?? null,
  })));
});

/**
 * Check a cashier's PIN. Returns only ok/not-ok — never which half was wrong,
 * and never the PIN itself.
 */
adminPos.post('/registers/:id/verify-cashier', async (req, res) => {
  const b = z.object({ employeeId: z.number().int(), pin: z.string().min(1) }).parse(req.body);

  const employee = await prisma.employee.findUnique({
    where: { id: b.employeeId },
    select: { id: true, name: true, active: true, pin: true, imageUrl: true },
  });

  // 403, NOT 401. The admin session making this call is perfectly valid — it is
  // the cashier's PIN that is wrong. The API client treats every 401 as "your
  // session expired", so a 401 here signed the whole tablet out of the admin
  // the moment a cashier fat-fingered their PIN.
  if (!employee || !employee.active || !employee.pin || employee.pin !== b.pin.trim()) {
    throw new HttpError(403, 'Wrong PIN.');
  }
  res.json({ ok: true, employee: { id: employee.id, name: employee.name, imageUrl: employee.imageUrl } });
});

// ---- Sessions ----
adminPos.get('/sessions', async (_req, res) => {
  const rows = await prisma.posSession.findMany({
    orderBy: { openedAt: 'desc' },
    take: 100,
    include: { _count: { select: { orders: true } } },
  });
  res.json(
    rows.map((s) => ({
      id: s.id,
      sessionNumber: s.sessionNumber,
      registerName: s.registerName,
      status: s.status,
      openedAt: s.openedAt,
      closedAt: s.closedAt,
      openedByEmail: s.openedByEmail,
      openingFloat: money(s.openingFloat),
      closingCounted: s.closingCounted != null ? money(s.closingCounted) : null,
      variance: s.variance != null ? money(s.variance) : null,
      orderCount: s._count.orders,
    }))
  );
});

/** The till's home call: the open session plus its live cash position. */
adminPos.get('/sessions/current', async (req, res) => {
  const registerId = req.query.registerId ? Number(req.query.registerId) : undefined;
  const session = await getOpenSession(registerId);
  if (!session) return res.json(null);
  const cashier = session.cashierId
    ? await prisma.employee.findUnique({
      where: { id: session.cashierId }, select: { id: true, name: true, imageUrl: true },
    })
    : null;
  res.json({
    id: session.id,
    sessionNumber: session.sessionNumber,
    registerId: session.registerId,
    registerName: session.registerName,
    cashierId: cashier?.id ?? null,
    cashierName: cashier?.name ?? null,
    cashierImageUrl: cashier?.imageUrl ?? null,
    openingNote: session.openingNote,
    warehouseId: session.warehouseId,
    warehouseName: session.warehouseId
      ? (await prisma.warehouse.findUnique({ where: { id: session.warehouseId } }))?.name ?? null
      : null,
    status: session.status,
    openedAt: session.openedAt,
    openedByEmail: session.openedByEmail,
    openingFloat: money(session.openingFloat),
    expectedCash: await expectedCashFor(session.id),
  });
});

adminPos.get('/sessions/:id', async (req, res) => {
  res.json(await sessionReport(Number(req.params.id)));
});

adminPos.post('/sessions', async (req, res) => {
  const data = z
    .object({
      registerId: z.number().int().positive().optional(),
      registerName: z.string().optional(),
      cashierId: z.number().int().positive().optional(),
      /** Re-checked here: the earlier verify call proves nothing on its own. */
      pin: z.string().optional(),
      openingFloat: z.number().min(0).default(0),
      openingNote: z.string().optional(),
      warehouseId: z.number().int().positive().optional(),
    })
    .parse(req.body);

  // Verifying the PIN on the cashier screen and then trusting the client to
  // say who it was would let anyone open a till as anyone. The PIN travels
  // with the open request and is checked again here.
  if (data.cashierId) {
    const cashier = await prisma.employee.findUnique({
      where: { id: data.cashierId },
      select: { pin: true, active: true },
    });
    // 403 for the same reason as the verify route: the admin session is fine.
    if (!cashier?.active || !cashier.pin || cashier.pin !== (data.pin ?? '').trim()) {
      throw new HttpError(403, 'Wrong PIN.');
    }
  }

  const session = await openSession({ ...data, actorEmail: req.auth?.email });
  res.status(201).json({ ...session, openingFloat: money(session.openingFloat) });
});

adminPos.post('/sessions/:id/close', async (req, res) => {
  // A non-numeric id reached Prisma as NaN and came back as a 500 with a stack
  // trace. It is a bad request, and it should say so.
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid session id');

  const { countedCash, note } = z
    .object({ countedCash: z.number().min(0), note: z.string().optional() })
    .parse(req.body);
  await closeSession(id, countedCash, req.auth?.email, note);
  res.json(await sessionReport(id));
});

// ---- Petty cash ----
adminPos.post('/cash-moves', async (req, res) => {
  const data = z
    .object({
      sessionId: z.number().int().positive(),
      type: z.enum(['IN', 'OUT']),
      amount: z.number().positive(),
      reason: z.string().min(2, 'A reason is required'),
    })
    .parse(req.body);
  const move = await addCashMove({ ...data, actorEmail: req.auth?.email });
  res.status(201).json({ ...move, amount: money(move.amount) });
});

// ---- Counter sale ----
const saleSchema = z.object({
  lines: z
    .array(
      z.object({
        productId: z.number().int().positive(),
        quantity: z.number().int().positive(),
        unitPrice: z.number().min(0).optional(),
      })
    )
    .min(1),
  tenders: z
    .array(
      z.object({
        method: z.enum(TENDERS),
        amount: z.number().positive(),
        reference: z.string().optional(),
      })
    )
    .min(1),
  customerId: z.number().int().positive().optional(),
  customerName: z.string().optional(),
  discount: z.number().min(0).optional(),
  note: z.string().optional(),
});

adminPos.post('/orders', async (req, res) => {
  const data = saleSchema.parse(req.body);
  const result = await posSale({ ...data, actorEmail: req.auth?.email });
  res.status(201).json(result);
});

adminPos.get('/orders/:id', async (req, res) => {
  const order = await getPosOrder(Number(req.params.id));
  if (!order) throw new HttpError(404, 'Sale not found');
  res.json(order);
});

adminPos.post('/orders/:id/refund', async (req, res) => {
  const { reason } = z.object({ reason: z.string().optional() }).parse(req.body || {});
  res.json(await posRefund(Number(req.params.id), reason, req.auth?.email));
});

// ---- Fast product lookup for the till ----
// An exact barcode or SKU hit wins, so scanning always resolves to one product.
adminPos.get('/products', async (req, res) => {
  const q = ((req.query.q as string) || '').trim();
  // Quantities shown at the till are this shop's stock, not company-wide.
  const session = await getOpenSession();
  const warehouseId = session?.warehouseId ?? null;

  const withStock = async (rows: any[], exact: boolean) => {
    if (!warehouseId || !rows.length) return rows.map((p) => serializeTillProduct(p, exact, p.stockQty));
    const held = await prisma.warehouseStock.findMany({
      where: { warehouseId, productId: { in: rows.map((r) => r.id) } },
    });
    const byProduct = new Map(held.map((h) => [h.productId, h.quantity]));
    return rows.map((p) => serializeTillProduct(p, exact, byProduct.get(p.id) ?? 0));
  };

  if (q) {
    const exact = await prisma.product.findFirst({
      where: { isActive: true, OR: [{ barcode: q }, { sku: q }] },
      include: { images: { orderBy: { sortOrder: 'asc' }, take: 1 } },
    });
    if (exact) return res.json(await withStock([exact], true));
  }

  const rows = await prisma.product.findMany({
    where: {
      isActive: true,
      ...(q ? { OR: [{ name: { contains: q } }, { nameAr: { contains: q } }, { sku: { contains: q } }] } : {}),
    },
    orderBy: [{ soldCount: 'desc' }, { name: 'asc' }],
    take: 60,
    include: { images: { orderBy: { sortOrder: 'asc' }, take: 1 } },
  });
  res.json(await withStock(rows, false));
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeTillProduct(p: any, exact: boolean, stockQty: number) {
  return {
    id: p.id,
    name: p.name,
    nameAr: p.nameAr,
    sku: p.sku,
    barcode: p.barcode,
    sellingPrice: money(p.sellingPrice),
    stockQty,
    unit: p.unit,
    image: p.images?.[0]?.url ?? null,
    exactMatch: exact,
  };
}
