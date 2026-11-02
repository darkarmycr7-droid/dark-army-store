import { Router } from 'express';
import { z } from 'zod';
import { prisma, money } from '../../lib/prisma';
import { HttpError } from '../../middleware/error';
import {
  postEntry,
  reverseEntry,
  seedJournals,
  DEFAULT_ACCOUNTS,
  ACCOUNTS,
} from '../../services/accounting.service';

export const adminAccounting = Router();

type Col = { key: string; label: string; money?: boolean };

const TYPES = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'] as const;
/** Accounts whose balance normally sits on the debit side. */
const DEBIT_TYPES = ['ASSET', 'EXPENSE'];

/** Signed balance in the account's own normal direction (contra accounts flip). */
function normalBalance(type: string, isContra: boolean, debit: number, credit: number) {
  const debitNormal = DEBIT_TYPES.includes(type) !== isContra;
  return money(debitNormal ? debit - credit : credit - debit);
}

function dateRange(q: Record<string, unknown>) {
  const to = q.to ? new Date(`${q.to}T23:59:59.999`) : new Date();
  const from = q.from ? new Date(`${q.from}T00:00:00.000`) : new Date(0);
  return { from, to };
}

/** Debit/credit totals per account for a period. */
async function balances(from: Date, to: Date) {
  const [accounts, grouped] = await Promise.all([
    prisma.account.findMany({ orderBy: { code: 'asc' } }),
    prisma.journalLine.groupBy({
      by: ['accountId'],
      where: { entry: { date: { gte: from, lte: to } } },
      _sum: { debit: true, credit: true },
    }),
  ]);
  const byAccount = new Map(grouped.map((g) => [g.accountId, g]));

  return accounts.map((a) => {
    const g = byAccount.get(a.id);
    const debit = money(g?._sum.debit ?? 0);
    const credit = money(g?._sum.credit ?? 0);
    return { account: a, debit, credit, balance: normalBalance(a.type, a.isContra, debit, credit) };
  });
}

// ---- Status / go-live ----
adminAccounting.get('/status', async (_req, res) => {
  const [accounts, entries, opening] = await Promise.all([
    prisma.account.count(),
    prisma.journalEntry.count(),
    prisma.journalEntry.findFirst({ where: { source: 'OPENING' } }),
  ]);
  res.json({
    accounts,
    entries,
    isLive: !!opening,
    openedAt: opening?.date ?? null,
  });
});

/**
 * Open the books. Seeds the chart of accounts if needed, then posts one
 * opening entry bringing the current inventory on to the balance sheet
 * against Opening Balance Equity. Everything from this point posts
 * automatically — historical orders are deliberately not back-posted, which
 * is how a real go-live cutover works.
 */
adminAccounting.post('/open-books', async (req, res) => {
  if (await prisma.journalEntry.findFirst({ where: { source: 'OPENING' } })) {
    throw new HttpError(400, 'The books are already open');
  }
  const { openingCash = 0, openingBank = 0 } = z
    .object({ openingCash: z.number().min(0).optional(), openingBank: z.number().min(0).optional() })
    .parse(req.body || {});

  for (const a of DEFAULT_ACCOUNTS) {
    const existing = await prisma.account.findUnique({ where: { code: a.code } });
    if (!existing) await prisma.account.create({ data: { ...a, isSystem: true } });
  }

  // Journals need the chart to exist before they can point at it, so they are
  // seeded (or joined up) here rather than earlier.
  await seedJournals(prisma);

  const products = await prisma.product.findMany({ select: { stockQty: true, avgCost: true, costPrice: true } });
  const inventory = money(
    products.reduce((s, p) => s + p.stockQty * (money(p.avgCost) || money(p.costPrice)), 0)
  );
  const equity = money(inventory + money(openingCash) + money(openingBank));
  if (equity <= 0) throw new HttpError(400, 'Nothing to open with — add stock or an opening cash balance first');

  const entry = await prisma.$transaction((tx) =>
    postEntry(tx, {
      source: 'OPENING',
      memo: 'Opening balances at go-live',
      dedupeKey: 'OPENING',
      createdByEmail: req.auth?.email,
      lines: [
        { account: ACCOUNTS.INVENTORY, debit: inventory, memo: 'Stock on hand at cost' },
        { account: ACCOUNTS.CASH, debit: money(openingCash) },
        { account: ACCOUNTS.BANK, debit: money(openingBank) },
        { account: ACCOUNTS.OPENING_EQUITY, credit: equity },
      ],
    })
  );
  res.status(201).json({ ok: true, entryNumber: entry.entryNumber, inventory, equity });
});

// ---- Chart of accounts ----
adminAccounting.get('/accounts', async (req, res) => {
  const withBalances = req.query.balances === 'true';
  if (!withBalances) {
    const rows = await prisma.account.findMany({ orderBy: { code: 'asc' } });
    return res.json(rows.map((a) => ({ ...a })));
  }
  const { from, to } = dateRange(req.query);
  const rows = await balances(from, to);
  res.json(
    rows.map((r) => ({
      ...r.account,
      debit: r.debit,
      credit: r.credit,
      balance: r.balance,
    }))
  );
});

const accountSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(2),
  nameAr: z.string().optional().nullable(),
  type: z.enum(TYPES),
  isContra: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

adminAccounting.post('/accounts', async (req, res) => {
  const data = accountSchema.parse(req.body);
  if (await prisma.account.findUnique({ where: { code: data.code } })) {
    throw new HttpError(409, `Account ${data.code} already exists`);
  }
  const created = await prisma.account.create({ data: { ...data, nameAr: data.nameAr || null } });
  res.status(201).json(created);
});

adminAccounting.put('/accounts/:id', async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.account.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, 'Account not found');
  const data = accountSchema.parse(req.body);
  // System accounts are wired into the posting rules — the code and type must hold.
  if (existing.isSystem && (data.code !== existing.code || data.type !== existing.type)) {
    throw new HttpError(400, 'The code and type of a system account cannot be changed');
  }
  const updated = await prisma.account.update({
    where: { id },
    data: { ...data, nameAr: data.nameAr || null },
  });
  res.json(updated);
});

adminAccounting.delete('/accounts/:id', async (req, res) => {
  const id = Number(req.params.id);
  const account = await prisma.account.findUnique({ where: { id } });
  if (!account) throw new HttpError(404, 'Account not found');
  if (account.isSystem) throw new HttpError(400, 'System accounts cannot be deleted — deactivate it instead');
  if (await prisma.journalLine.count({ where: { accountId: id } })) {
    await prisma.account.update({ where: { id }, data: { isActive: false } });
    return res.json({ ok: true, softDeleted: true });
  }
  await prisma.account.delete({ where: { id } });
  res.json({ ok: true });
});

// ---- Journal ----
// ==========================================================================
// Journals — the books entries are written in, and the unit the accounting
// dashboard is built from (the reference runs 45 of them).
// ==========================================================================

/**
 * Dashboard cards: one per journal, with its entry count and — for the books
 * that hold money — the balance of the account it moves money through.
 */
adminAccounting.get('/journals', async (_req, res) => {
  const journals = await prisma.journal.findMany({
    where: { isActive: true },
    orderBy: [{ sequence: 'asc' }, { code: 'asc' }],
    include: {
      defaultAccount: true,
      posRegister: { select: { id: true, name: true } },
      _count: { select: { entries: true } },
    },
  });

  // One grouped query for every journal's default account, rather than a
  // balance query per card.
  const accountIds = journals.map((j) => j.defaultAccountId).filter((v): v is number => v != null);
  const sums = accountIds.length
    ? await prisma.journalLine.groupBy({
      by: ['accountId'],
      where: { accountId: { in: accountIds }, entry: { status: 'POSTED' } },
      _sum: { debit: true, credit: true },
    })
    : [];
  const balanceByAccount = new Map(
    sums.map((s) => [s.accountId, money(Number(s._sum.debit ?? 0) - Number(s._sum.credit ?? 0))]),
  );

  const lastEntries = await prisma.journalEntry.groupBy({
    by: ['journalId'],
    where: { journalId: { in: journals.map((j) => j.id) } },
    _max: { date: true },
  });
  const lastByJournal = new Map(lastEntries.map((e) => [e.journalId, e._max.date]));

  res.json(journals.map((j) => ({
    id: j.id,
    code: j.code,
    name: j.name,
    nameAr: j.nameAr,
    type: j.type,
    sequence: j.sequence,
    isSystem: j.isSystem,
    defaultAccountId: j.defaultAccountId,
    defaultAccountCode: j.defaultAccount?.code ?? null,
    defaultAccountName: j.defaultAccount?.name ?? null,
    posRegisterId: j.posRegisterId,
    posRegisterName: j.posRegister?.name ?? null,
    entryCount: j._count.entries,
    lastEntryAt: lastByJournal.get(j.id) ?? null,
    // Only meaningful for the books that actually hold money.
    balance: j.defaultAccountId != null && (j.type === 'CASH' || j.type === 'BANK')
      ? balanceByAccount.get(j.defaultAccountId) ?? 0
      : null,
  })));
});

const journalInput = z.object({
  code: z.string().min(1).max(12),
  name: z.string().min(1),
  nameAr: z.string().optional().nullable(),
  type: z.enum(['SALE', 'PURCHASE', 'CASH', 'BANK', 'GENERAL']),
  defaultAccountId: z.number().int().positive().optional().nullable(),
  posRegisterId: z.number().int().positive().optional().nullable(),
  sequence: z.number().int().optional(),
});

adminAccounting.post('/journals', async (req, res) => {
  const b = journalInput.parse(req.body);
  const code = b.code.trim().toUpperCase();

  if (await prisma.journal.findUnique({ where: { code } })) {
    throw new HttpError(400, `A journal with code ${code} already exists.`);
  }
  if (b.posRegisterId) {
    const taken = await prisma.journal.findUnique({ where: { posRegisterId: b.posRegisterId } });
    if (taken) throw new HttpError(400, `That register already posts to journal ${taken.code}.`);
  }

  const last = await prisma.journal.findFirst({ orderBy: { sequence: 'desc' } });
  const row = await prisma.journal.create({
    data: {
      code,
      name: b.name.trim(),
      nameAr: b.nameAr?.trim() || null,
      type: b.type,
      defaultAccountId: b.defaultAccountId ?? null,
      posRegisterId: b.posRegisterId ?? null,
      sequence: b.sequence ?? (last ? last.sequence + 10 : 10),
    },
  });
  res.status(201).json(row);
});

adminAccounting.patch('/journals/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid journal id');

  const b = journalInput.partial().parse(req.body);
  const existing = await prisma.journal.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, 'Journal not found');

  // The posting rules look system journals up by code, so renaming one would
  // silently send every future sale to a journal that no longer answers.
  if (b.code && b.code.trim().toUpperCase() !== existing.code && existing.isSystem) {
    throw new HttpError(400, `${existing.code} is a system journal — its code is referenced by the posting rules and cannot change.`);
  }
  if (b.code) {
    const clash = await prisma.journal.findUnique({ where: { code: b.code.trim().toUpperCase() } });
    if (clash && clash.id !== id) throw new HttpError(400, `A journal with code ${b.code.trim().toUpperCase()} already exists.`);
  }
  if (b.posRegisterId) {
    const taken = await prisma.journal.findUnique({ where: { posRegisterId: b.posRegisterId } });
    if (taken && taken.id !== id) throw new HttpError(400, `That register already posts to journal ${taken.code}.`);
  }

  const row = await prisma.journal.update({
    where: { id },
    data: {
      ...(b.code !== undefined ? { code: b.code.trim().toUpperCase() } : {}),
      ...(b.name !== undefined ? { name: b.name.trim() } : {}),
      ...(b.nameAr !== undefined ? { nameAr: b.nameAr?.trim() || null } : {}),
      ...(b.type !== undefined ? { type: b.type } : {}),
      ...(b.defaultAccountId !== undefined ? { defaultAccountId: b.defaultAccountId ?? null } : {}),
      ...(b.posRegisterId !== undefined ? { posRegisterId: b.posRegisterId ?? null } : {}),
      ...(b.sequence !== undefined ? { sequence: b.sequence } : {}),
    },
  });
  res.json(row);
});

/**
 * Journals are never deleted once they hold entries — a posted entry must keep
 * pointing at the book it was written in. They archive instead.
 */
adminAccounting.delete('/journals/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid journal id');

  const j = await prisma.journal.findUnique({ where: { id } });
  if (!j) throw new HttpError(404, 'Journal not found');
  if (j.isSystem) throw new HttpError(400, `${j.code} is a system journal and cannot be removed — the posting rules use it.`);

  const entries = await prisma.journalEntry.count({ where: { journalId: id } });
  if (entries > 0) {
    await prisma.journal.update({ where: { id }, data: { isActive: false } });
    return res.json({ ok: true, archived: true, entries });
  }
  await prisma.journal.delete({ where: { id } });
  res.json({ ok: true, archived: false });
});

adminAccounting.get('/journal', async (req, res) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};
  if (req.query.source) where.source = req.query.source;
  if (req.query.journalId) where.journalId = Number(req.query.journalId);
  if (req.query.from || req.query.to) {
    const { from, to } = dateRange(req.query);
    where.date = { gte: from, lte: to };
  }
  if (req.query.q) {
    const q = String(req.query.q);
    where.OR = [{ entryNumber: { contains: q } }, { memo: { contains: q } }, { refLabel: { contains: q } }];
  }

  const take = Math.min(Number(req.query.limit) || 50, 200);
  const skip = Number(req.query.skip) || 0;
  const [rows, total] = await Promise.all([
    prisma.journalEntry.findMany({
      where,
      orderBy: { date: 'desc' },
      take,
      skip,
      include: { lines: { include: { account: true, partner: true } }, journal: true },
    }),
    prisma.journalEntry.count({ where }),
  ]);

  res.json({ rows: rows.map(serializeEntry), total, skip, take });
});

adminAccounting.get('/journal/:id', async (req, res) => {
  const entry = await prisma.journalEntry.findUnique({
    where: { id: Number(req.params.id) },
    include: { lines: { include: { account: true, partner: true } }, journal: true },
  });
  if (!entry) throw new HttpError(404, 'Journal entry not found');
  res.json(serializeEntry(entry));
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeEntry(e: any) {
  return {
    id: e.id,
    entryNumber: e.entryNumber,
    date: e.date,
    memo: e.memo,
    source: e.source,
    refType: e.refType,
    refId: e.refId,
    refLabel: e.refLabel,
    status: e.status,
    createdByEmail: e.createdByEmail,
    journalId: e.journalId,
    journalCode: e.journal?.code ?? null,
    journalName: e.journal?.name ?? null,
    debit: money(e.lines.reduce((s: number, l: any) => s + money(l.debit), 0)),
    credit: money(e.lines.reduce((s: number, l: any) => s + money(l.credit), 0)),
    lines: e.lines.map((l: any) => ({
      id: l.id,
      accountId: l.accountId,
      accountCode: l.account.code,
      accountName: l.account.name,
      debit: money(l.debit),
      credit: money(l.credit),
      memo: l.memo,
    })),
  };
}

// Manual entry — the escape hatch for anything the posting rules don't cover.
adminAccounting.post('/journal', async (req, res) => {
  const data = z
    .object({
      date: z.string().optional(),
      memo: z.string().min(2, 'A description is required'),
      lines: z
        .array(
          z.object({
            account: z.string().min(1),
            debit: z.number().min(0).optional(),
            credit: z.number().min(0).optional(),
            memo: z.string().optional(),
          })
        )
        .min(2),
    })
    .parse(req.body);

  const entry = await prisma.$transaction((tx) =>
    postEntry(tx, {
      date: data.date ? new Date(data.date) : undefined,
      memo: data.memo,
      source: 'MANUAL',
      createdByEmail: req.auth?.email,
      lines: data.lines,
    })
  );
  const full = await prisma.journalEntry.findUnique({
    where: { id: entry.id },
    include: { lines: { include: { account: true, partner: true } }, journal: true },
  });
  res.status(201).json(serializeEntry(full));
});

adminAccounting.post('/journal/:id/reverse', async (req, res) => {
  const { reason } = z.object({ reason: z.string().optional() }).parse(req.body || {});
  const reversal = await reverseEntry(Number(req.params.id), reason, req.auth?.email);
  const full = await prisma.journalEntry.findUnique({
    where: { id: reversal.id },
    include: { lines: { include: { account: true, partner: true } }, journal: true },
  });
  res.json(serializeEntry(full));
});

// ---- Financial statements (generic report shape, so the UI can export them) ----

adminAccounting.get('/reports/trial-balance', async (req, res) => {
  const { from, to } = dateRange(req.query);
  const rows = (await balances(from, to))
    .filter((r) => r.debit !== 0 || r.credit !== 0)
    .map((r) => ({
      code: r.account.code,
      account: r.account.name,
      type: r.account.type,
      debit: r.debit,
      credit: r.credit,
    }));

  const totalDebit = money(rows.reduce((s, r) => s + r.debit, 0));
  const totalCredit = money(rows.reduce((s, r) => s + r.credit, 0));

  res.json({
    title: 'Trial Balance',
    columns: [
      { key: 'code', label: 'Code' },
      { key: 'account', label: 'Account' },
      { key: 'type', label: 'Type' },
      { key: 'debit', label: 'Debit', money: true },
      { key: 'credit', label: 'Credit', money: true },
    ] as Col[],
    rows,
    summary: [
      { label: 'Total Debits', value: totalDebit, money: true },
      { label: 'Total Credits', value: totalCredit, money: true },
      { label: 'In Balance', value: totalDebit === totalCredit ? 'Yes' : 'NO — investigate' },
    ],
  });
});

adminAccounting.get('/reports/income-statement', async (req, res) => {
  const { from, to } = dateRange(req.query);
  const all = await balances(from, to);

  const revenue = all.filter((r) => r.account.type === 'REVENUE');
  const expense = all.filter((r) => r.account.type === 'EXPENSE');
  const totalRevenue = money(revenue.reduce((s, r) => s + r.balance, 0));
  const totalExpense = money(expense.reduce((s, r) => s + r.balance, 0));
  const net = money(totalRevenue - totalExpense);

  const rows = [
    { item: 'REVENUE', amount: 0, group: true },
    ...revenue.filter((r) => r.balance !== 0).map((r) => ({ item: `  ${r.account.code} ${r.account.name}`, amount: r.balance, group: false })),
    { item: 'Total Revenue', amount: totalRevenue, group: true },
    { item: 'EXPENSES', amount: 0, group: true },
    ...expense.filter((r) => r.balance !== 0).map((r) => ({ item: `  ${r.account.code} ${r.account.name}`, amount: r.balance, group: false })),
    { item: 'Total Expenses', amount: totalExpense, group: true },
    { item: net >= 0 ? 'NET PROFIT' : 'NET LOSS', amount: net, group: true },
  ];

  const grossMargin = totalRevenue ? Math.round((net / totalRevenue) * 1000) / 10 : 0;

  res.json({
    title: 'Income Statement',
    columns: [
      { key: 'item', label: 'Line Item' },
      { key: 'amount', label: 'Amount', money: true },
    ] as Col[],
    rows,
    summary: [
      { label: 'Revenue', value: totalRevenue, money: true },
      { label: 'Expenses', value: totalExpense, money: true },
      { label: net >= 0 ? 'Net Profit' : 'Net Loss', value: net, money: true },
      { label: 'Net Margin', value: `${grossMargin}%` },
    ],
  });
});

adminAccounting.get('/reports/balance-sheet', async (req, res) => {
  // A balance sheet is cumulative — always from the beginning of the books.
  const to = req.query.to ? new Date(`${req.query.to}T23:59:59.999`) : new Date();
  const all = await balances(new Date(0), to);

  const assets = all.filter((r) => r.account.type === 'ASSET' && r.balance !== 0);
  const liabilities = all.filter((r) => r.account.type === 'LIABILITY' && r.balance !== 0);
  const equity = all.filter((r) => r.account.type === 'EQUITY' && r.balance !== 0);

  const totalAssets = money(assets.reduce((s, r) => s + r.balance, 0));
  const totalLiabilities = money(liabilities.reduce((s, r) => s + r.balance, 0));
  const postedEquity = money(equity.reduce((s, r) => s + r.balance, 0));

  // No year-end close, so profit to date is carried as retained earnings.
  const revenue = money(all.filter((r) => r.account.type === 'REVENUE').reduce((s, r) => s + r.balance, 0));
  const expense = money(all.filter((r) => r.account.type === 'EXPENSE').reduce((s, r) => s + r.balance, 0));
  const retained = money(revenue - expense);
  const totalEquity = money(postedEquity + retained);

  const rows = [
    { item: 'ASSETS', amount: 0 },
    ...assets.map((r) => ({ item: `  ${r.account.code} ${r.account.name}`, amount: r.balance })),
    { item: 'Total Assets', amount: totalAssets },
    { item: 'LIABILITIES', amount: 0 },
    ...liabilities.map((r) => ({ item: `  ${r.account.code} ${r.account.name}`, amount: r.balance })),
    { item: 'Total Liabilities', amount: totalLiabilities },
    { item: 'EQUITY', amount: 0 },
    ...equity.map((r) => ({ item: `  ${r.account.code} ${r.account.name}`, amount: r.balance })),
    { item: '  Retained Earnings (profit to date)', amount: retained },
    { item: 'Total Equity', amount: totalEquity },
    { item: 'Total Liabilities + Equity', amount: money(totalLiabilities + totalEquity) },
  ];

  const diff = money(totalAssets - (totalLiabilities + totalEquity));

  res.json({
    title: 'Balance Sheet',
    columns: [
      { key: 'item', label: 'Line Item' },
      { key: 'amount', label: 'Amount', money: true },
    ] as Col[],
    rows,
    summary: [
      { label: 'Total Assets', value: totalAssets, money: true },
      { label: 'Liabilities + Equity', value: money(totalLiabilities + totalEquity), money: true },
      { label: 'Balanced', value: diff === 0 ? 'Yes' : `NO — off by ${diff.toFixed(3)}` },
    ],
  });
});

/** General ledger — every line hitting one account, with a running balance. */
adminAccounting.get('/reports/ledger', async (req, res) => {
  const { from, to } = dateRange(req.query);
  const accountId = Number(req.query.accountId);
  const account = accountId
    ? await prisma.account.findUnique({ where: { id: accountId } })
    : await prisma.account.findFirst({ orderBy: { code: 'asc' } });
  if (!account) throw new HttpError(400, 'No account selected');

  const lines = await prisma.journalLine.findMany({
    where: { accountId: account.id, entry: { date: { gte: from, lte: to } } },
    orderBy: [{ entry: { date: 'asc' } }, { id: 'asc' }],
    include: { entry: true },
  });

  let running = 0;
  const rows = lines.map((l) => {
    const debit = money(l.debit);
    const credit = money(l.credit);
    running = money(running + normalBalance(account.type, account.isContra, debit, credit));
    return {
      date: l.entry.date.toISOString().slice(0, 10),
      entry: l.entry.entryNumber,
      source: l.entry.source,
      memo: l.memo || l.entry.memo || '—',
      reference: l.entry.refLabel || '—',
      debit,
      credit,
      balance: running,
    };
  });

  res.json({
    title: `Ledger — ${account.code} ${account.name}`,
    columns: [
      { key: 'date', label: 'Date' },
      { key: 'entry', label: 'Entry' },
      { key: 'source', label: 'Source' },
      { key: 'memo', label: 'Description' },
      { key: 'reference', label: 'Reference' },
      { key: 'debit', label: 'Debit', money: true },
      { key: 'credit', label: 'Credit', money: true },
      { key: 'balance', label: 'Balance', money: true },
    ] as Col[],
    rows,
    summary: [
      { label: 'Entries', value: rows.length },
      { label: 'Debits', value: money(rows.reduce((s, r) => s + r.debit, 0)), money: true },
      { label: 'Credits', value: money(rows.reduce((s, r) => s + r.credit, 0)), money: true },
      { label: 'Closing Balance', value: running, money: true },
    ],
  });
});

/**
 * Partner Ledger — every posted movement on a partner's receivable or payable
 * account, in date order, with a running balance.
 *
 * This reads the LEDGER, not the sales and purchase documents. A partner ledger
 * assembled from invoices would disagree with the balance sheet the moment
 * anything was posted by hand.
 */
adminAccounting.get('/reports/partner-ledger', async (req, res) => {
  const { from, to } = dateRange(req.query);
  const partnerId = req.query.partnerId ? Number(req.query.partnerId) : null;

  const control = await prisma.account.findMany({
    where: { code: { in: [ACCOUNTS.RECEIVABLE, ACCOUNTS.PAYABLE] } },
  });

  const lines = await prisma.journalLine.findMany({
    where: {
      accountId: { in: control.map((a) => a.id) },
      partnerId: partnerId ?? { not: null },
      entry: { status: 'POSTED', date: { gte: from, lte: to } },
    },
    include: {
      account: true,
      partner: true,
      entry: {
        select: {
          entryNumber: true, date: true, memo: true, refLabel: true,
          journal: { select: { code: true } },
        },
      },
    },
    orderBy: [{ partnerId: 'asc' }, { entry: { date: 'asc' } }, { id: 'asc' }],
    take: 5000,
  });

  const groups = new Map<number, {
    partnerId: number; partnerName: string;
    rows: Record<string, unknown>[]; debit: number; credit: number; balance: number;
  }>();

  for (const l of lines) {
    const pid = l.partnerId as number;
    if (!groups.has(pid)) {
      groups.set(pid, {
        partnerId: pid, partnerName: l.partner?.name ?? `#${pid}`,
        rows: [], debit: 0, credit: 0, balance: 0,
      });
    }
    const g = groups.get(pid)!;
    const debit = money(l.debit);
    const credit = money(l.credit);
    g.debit = money(g.debit + debit);
    g.credit = money(g.credit + credit);
    g.balance = money(g.balance + debit - credit);
    g.rows.push({
      date: l.entry.date.toISOString().slice(0, 10),
      entry: l.entry.entryNumber,
      journal: l.entry.journal?.code ?? '-',
      account: `${l.account.code} ${l.account.name}`,
      reference: l.entry.refLabel || l.memo || l.entry.memo || '-',
      dueDate: l.dueDate ? l.dueDate.toISOString().slice(0, 10) : '-',
      debit,
      credit,
      balance: g.balance,
    });
  }

  const partners = [...groups.values()].sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
  res.json({
    title: 'Partner Ledger',
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    partners,
    summary: [
      { label: 'Partners', value: partners.length },
      { label: 'Debits', value: money(partners.reduce((s, p) => s + p.debit, 0)), money: true },
      { label: 'Credits', value: money(partners.reduce((s, p) => s + p.credit, 0)), money: true },
      { label: 'Net Balance', value: money(partners.reduce((s, p) => s + p.balance, 0)), money: true },
    ],
  });
});

/**
 * Aged balances, receivable or payable, read off the ledger.
 *
 * Bucketed by how overdue each line is against its own due date. A line with no
 * due date is aged from its posting date - the conservative reading, so nothing
 * hides in "not due" merely because no terms were recorded.
 */
adminAccounting.get('/reports/aged', async (req, res) => {
  const kind = String(req.query.kind || 'receivable').toLowerCase();
  if (kind !== 'receivable' && kind !== 'payable') {
    throw new HttpError(400, 'kind must be "receivable" or "payable"');
  }
  const asOf = req.query.asOf ? new Date(`${req.query.asOf}T23:59:59.999`) : new Date();
  const code = kind === 'receivable' ? ACCOUNTS.RECEIVABLE : ACCOUNTS.PAYABLE;

  const account = await prisma.account.findUnique({ where: { code } });
  if (!account) throw new HttpError(400, 'The chart of accounts has not been set up yet');

  const lines = await prisma.journalLine.findMany({
    where: {
      accountId: account.id,
      partnerId: { not: null },
      entry: { status: 'POSTED', date: { lte: asOf } },
    },
    include: { partner: true, entry: { select: { date: true } } },
    take: 20000,
  });

  const BUCKETS = ['Not due', '1-30', '31-60', '61-90', '90+'];
  const bucketOf = (due: Date) => {
    const days = Math.floor((asOf.getTime() - due.getTime()) / 86_400_000);
    if (days <= 0) return 'Not due';
    if (days <= 30) return '1-30';
    if (days <= 60) return '31-60';
    if (days <= 90) return '61-90';
    return '90+';
  };

  const byPartner = new Map<number, Record<string, number | string>>();
  for (const l of lines) {
    const pid = l.partnerId as number;
    if (!byPartner.has(pid)) {
      const blank: Record<string, number | string> = {
        partnerId: pid, partnerName: l.partner?.name ?? `#${pid}`, total: 0,
      };
      BUCKETS.forEach((b) => { blank[b] = 0; });
      byPartner.set(pid, blank);
    }
    const row = byPartner.get(pid)!;
    // Receivables are debit-normal; payables credit-normal.
    const amount = kind === 'receivable'
      ? money(money(l.debit) - money(l.credit))
      : money(money(l.credit) - money(l.debit));
    const bucket = bucketOf(l.dueDate ?? l.entry.date);
    row[bucket] = money((row[bucket] as number) + amount);
    row.total = money((row.total as number) + amount);
  }

  const rows = [...byPartner.values()]
    .filter((r) => (r.total as number) !== 0)
    .sort((a, b) => (b.total as number) - (a.total as number));

  res.json({
    title: kind === 'receivable' ? 'Aged Receivable' : 'Aged Payable',
    asOf: asOf.toISOString().slice(0, 10),
    buckets: BUCKETS,
    rows,
    totals: Object.fromEntries(
      [...BUCKETS, 'total'].map((b) => [b, money(rows.reduce((s, r) => s + ((r[b] as number) ?? 0), 0))]),
    ),
  });
});

/** Supplier balances — what is still owed on received purchase orders. */
adminAccounting.get('/reports/payables', async (_req, res) => {
  const pos = await prisma.purchaseOrder.findMany({
    where: { status: { in: ['PARTIAL', 'RECEIVED'] } },
    include: { supplier: true, items: true },
  });

  const rows = pos
    .map((p) => {
      // Only received goods create a payable, and only the goods themselves
      // are owed to the supplier — freight and customs are owed elsewhere.
      const rate = money(p.exchangeRate) || 1;
      const billed = money(p.items.reduce((s, i) => s + money(i.unitCost) * rate * i.receivedQty, 0));
      const paid = money(p.amountPaid);
      return {
        po: p.poNumber,
        supplier: p.supplier.name,
        date: p.createdAt.toISOString().slice(0, 10),
        currency: p.currency,
        reference: p.reference || '—',
        billed,
        paid,
        outstanding: money(billed - paid),
        status: p.status,
      };
    })
    .filter((r) => r.outstanding !== 0)
    .sort((a, b) => b.outstanding - a.outstanding);

  res.json({
    title: 'Supplier Balances',
    columns: [
      { key: 'po', label: 'PO #' },
      { key: 'supplier', label: 'Supplier' },
      { key: 'date', label: 'Date' },
      { key: 'reference', label: 'Invoice Ref' },
      { key: 'billed', label: 'Received Value', money: true },
      { key: 'paid', label: 'Paid', money: true },
      { key: 'outstanding', label: 'Outstanding', money: true },
      { key: 'status', label: 'PO Status' },
    ] as Col[],
    rows,
    summary: [
      { label: 'Suppliers Owed', value: new Set(rows.map((r) => r.supplier)).size },
      { label: 'Total Outstanding', value: money(rows.reduce((s, r) => s + r.outstanding, 0)), money: true },
    ],
  });
});
