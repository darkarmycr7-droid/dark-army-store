// Double-entry accounting core.
//
// Every business event posts a balanced JournalEntry through postEntry(). The
// financial statements are derived from JournalLine rows — never recomputed
// from orders — which is the difference between reports and accounts.
//
// Entries are immutable once posted. A mistake is corrected by posting a
// reversal, so the audit trail never loses what actually happened.
//
// Costing note: inventory is perpetual, matching the stock ledger. COGS is
// posted at the unitCost snapshotted on each OrderItem at sale time.

import { prisma, money } from '../lib/prisma';
import { HttpError } from '../middleware/error';
import { Tx } from './inventory.service';

export const ACCOUNTS = {
  CASH: '1000',
  BANK: '1010',
  RECEIVABLE: '1100',
  INVENTORY: '1200',
  PAYABLE: '2000',
  LANDED_PAYABLE: '2050',
  TAX_PAYABLE: '2100',
  OPENING_EQUITY: '3000',
  REVENUE: '4000',
  DELIVERY_INCOME: '4100',
  SALES_DISCOUNT: '4900',
  COGS: '5000',
  INVENTORY_ADJUSTMENT: '5100',
  OPERATING_EXPENSE: '6000',
  CASH_OVER_SHORT: '7000',
} as const;

/** Seeded chart of accounts. Kuwait has no VAT today, but the tax account is
 *  here because Order.tax already exists and would otherwise have nowhere to go. */
export const DEFAULT_ACCOUNTS: {
  code: string; name: string; nameAr: string; type: string; isContra?: boolean;
}[] = [
  { code: '1000', name: 'Cash on Hand', nameAr: 'النقد في الصندوق', type: 'ASSET' },
  { code: '1010', name: 'Bank', nameAr: 'البنك', type: 'ASSET' },
  { code: '1100', name: 'Accounts Receivable', nameAr: 'الذمم المدينة', type: 'ASSET' },
  { code: '1200', name: 'Inventory', nameAr: 'المخزون', type: 'ASSET' },
  { code: '2000', name: 'Accounts Payable', nameAr: 'الذمم الدائنة', type: 'LIABILITY' },
  { code: '2050', name: 'Accrued Landed Costs', nameAr: 'تكاليف الاستيراد المستحقة', type: 'LIABILITY' },
  { code: '2100', name: 'Tax Payable', nameAr: 'الضرائب المستحقة', type: 'LIABILITY' },
  { code: '3000', name: 'Opening Balance Equity', nameAr: 'رأس المال الافتتاحي', type: 'EQUITY' },
  { code: '4000', name: 'Sales Revenue', nameAr: 'إيرادات المبيعات', type: 'REVENUE' },
  { code: '4100', name: 'Delivery Income', nameAr: 'إيرادات التوصيل', type: 'REVENUE' },
  { code: '4900', name: 'Sales Discounts', nameAr: 'خصومات المبيعات', type: 'REVENUE', isContra: true },
  { code: '5000', name: 'Cost of Goods Sold', nameAr: 'تكلفة البضاعة المباعة', type: 'EXPENSE' },
  { code: '5100', name: 'Inventory Adjustments', nameAr: 'تسويات المخزون', type: 'EXPENSE' },
  { code: '6000', name: 'Operating Expenses', nameAr: 'المصروفات التشغيلية', type: 'EXPENSE' },
  { code: '7000', name: 'Cash Over / Short', nameAr: 'زيادة / عجز النقدية', type: 'EXPENSE' },
];

/**
 * Journals — the books entries are written in, and what the reference's
 * accounting dashboard is made of.
 *
 * The reference runs 45 of them: one sale, one purchase, several bank (KNET,
 * Tabby, MyFatoorah, two CBK accounts, KFH), a cash journal per branch till,
 * and general journals for payroll, inventory valuation and corrections. This
 * is the minimum equivalent set; more are added by hand in Configuration.
 */
export const JOURNALS = {
  SALES: 'INV',
  PURCHASE: 'BILL',
  POS: 'POS',
  CASH: 'CASH',
  BANK: 'BANK',
  STOCK: 'STJ',
  MISC: 'MISC',
} as const;

export const DEFAULT_JOURNALS: {
  code: string; name: string; nameAr: string; type: string; defaultAccount?: string; sequence: number;
}[] = [
  { code: 'INV', name: 'Customer Invoices', nameAr: 'فواتير العملاء', type: 'SALE', defaultAccount: '1100', sequence: 10 },
  { code: 'BILL', name: 'Vendor Bills', nameAr: 'فواتير الموردين', type: 'PURCHASE', defaultAccount: '2000', sequence: 20 },
  { code: 'POS', name: 'Point of Sale', nameAr: 'نقطة البيع', type: 'SALE', defaultAccount: '1000', sequence: 30 },
  { code: 'CASH', name: 'Cash', nameAr: 'النقدية', type: 'CASH', defaultAccount: '1000', sequence: 40 },
  { code: 'BANK', name: 'Bank', nameAr: 'البنك', type: 'BANK', defaultAccount: '1010', sequence: 50 },
  { code: 'STJ', name: 'Inventory Valuation', nameAr: 'تقييم المخزون', type: 'GENERAL', defaultAccount: '1200', sequence: 60 },
  { code: 'MISC', name: 'Miscellaneous Operations', nameAr: 'عمليات متنوعة', type: 'GENERAL', sequence: 70 },
];

/**
 * Which book each kind of posting belongs in. A posting rule may override this
 * by passing `journalCode` — a customer payment knows whether it landed in cash
 * or in the bank, and this table cannot.
 */
const JOURNAL_BY_SOURCE: Record<string, string> = {
  SALE: JOURNALS.SALES,
  POS_SALE: JOURNALS.POS,
  REFUND: JOURNALS.SALES,
  ORDER_PAYMENT: JOURNALS.CASH,
  RECEIPT: JOURNALS.BANK,
  SUPPLIER_PAYMENT: JOURNALS.BANK,
  STOCK_ADJUSTMENT: JOURNALS.STOCK,
  CASH_MOVE: JOURNALS.CASH,
  CASH_VARIANCE: JOURNALS.CASH,
  OPENING: JOURNALS.MISC,
  MANUAL: JOURNALS.MISC,
  REVERSAL: JOURNALS.MISC,
};

/**
 * Create the default journals, and link any that are missing their default
 * account now that the chart of accounts exists.
 *
 * Both halves are needed because journals and accounts can be created in either
 * order: the journals seed on their own, then "open the books" seeds the chart,
 * and this is what joins the two up. Idempotent — it only ever fills in blanks.
 */
export async function seedJournals(tx: Tx) {
  const accounts = await tx.account.findMany();
  const accountByCode = new Map(accounts.map((a) => [a.code, a.id]));
  let created = 0;
  let linked = 0;

  for (const j of DEFAULT_JOURNALS) {
    const wanted = j.defaultAccount ? accountByCode.get(j.defaultAccount) ?? null : null;
    const existing = await tx.journal.findUnique({ where: { code: j.code } });

    if (!existing) {
      await tx.journal.create({
        data: {
          code: j.code,
          name: j.name,
          nameAr: j.nameAr,
          type: j.type,
          sequence: j.sequence,
          isSystem: true,
          defaultAccountId: wanted,
        },
      });
      created += 1;
      continue;
    }

    // Never overwrite a default account somebody chose by hand.
    if (existing.defaultAccountId == null && wanted != null) {
      await tx.journal.update({ where: { id: existing.id }, data: { defaultAccountId: wanted } });
      linked += 1;
    }
  }
  return { created, linked };
}

/** Resolve the journal for a posting; returns null if none is configured yet. */
export async function resolveJournalId(tx: Tx, source: string, journalCode?: string): Promise<number | null> {
  const code = journalCode ?? JOURNAL_BY_SOURCE[source] ?? JOURNALS.MISC;
  const j = await tx.journal.findUnique({ where: { code } });
  if (j?.isActive) return j.id;
  // Fall back to the catch-all so a missing or archived journal can never stop
  // a sale being recorded. The entry is still complete and still balances.
  const misc = await tx.journal.findUnique({ where: { code: JOURNALS.MISC } });
  return misc?.id ?? null;
}

export interface PostLine {
  account: string; // account code
  debit?: number;
  credit?: number;
  memo?: string;
  /** Who the line is with — drives the Partner Ledger and aged balances. */
  partnerId?: number;
  /** When a receivable/payable line falls due, for the aged reports. */
  dueDate?: Date;
}

export interface PostInput {
  date?: Date;
  memo?: string;
  source: string;
  refType?: string;
  refId?: number;
  refLabel?: string;
  /** Set for event-driven postings so the same event can never post twice. */
  dedupeKey?: string;
  createdByEmail?: string;
  /** Override the book this entry lands in; otherwise picked from `source`. */
  journalCode?: string;
  /** Used by the reversal path to keep a reversal in its original's journal. */
  journalId?: number;
  lines: PostLine[];
}

async function nextEntryNumber(tx: Tx): Promise<string> {
  const last = await tx.journalEntry.findFirst({ orderBy: { id: 'desc' }, select: { id: true } });
  let seq = (last?.id ?? 0) + 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const n = `JE-${String(seq).padStart(6, '0')}`;
    if (!(await tx.journalEntry.findUnique({ where: { entryNumber: n } }))) return n;
    seq++;
  }
}

/**
 * Post one balanced journal entry. Lines with a zero amount are dropped, so
 * callers can pass optional legs (tax, discount, delivery) unconditionally.
 * Throws if debits and credits do not agree to the fils.
 */
export async function postEntry(tx: Tx, input: PostInput) {
  if (input.dedupeKey) {
    const existing = await tx.journalEntry.findUnique({ where: { dedupeKey: input.dedupeKey } });
    if (existing) return existing; // already posted — nothing to do
  }

  const lines = input.lines
    .map((l) => ({ ...l, debit: money(l.debit ?? 0), credit: money(l.credit ?? 0) }))
    .filter((l) => l.debit !== 0 || l.credit !== 0);

  if (lines.length < 2) throw new HttpError(400, 'A journal entry needs at least two lines');
  if (lines.some((l) => l.debit !== 0 && l.credit !== 0)) {
    throw new HttpError(400, 'A line cannot be both a debit and a credit');
  }
  if (lines.some((l) => l.debit < 0 || l.credit < 0)) {
    throw new HttpError(400, 'Amounts must be positive — use the other side instead');
  }

  const debits = money(lines.reduce((s, l) => s + l.debit, 0));
  const credits = money(lines.reduce((s, l) => s + l.credit, 0));
  if (debits !== credits) {
    throw new HttpError(400, `Entry is out of balance: debits ${debits.toFixed(3)} vs credits ${credits.toFixed(3)}`);
  }

  const codes = [...new Set(lines.map((l) => l.account))];
  const accounts = await tx.account.findMany({ where: { code: { in: codes } } });
  const byCode = new Map(accounts.map((a) => [a.code, a]));
  for (const code of codes) {
    if (!byCode.has(code)) throw new HttpError(400, `Account ${code} does not exist`);
  }

  return tx.journalEntry.create({
    data: {
      entryNumber: await nextEntryNumber(tx),
      date: input.date ?? new Date(),
      memo: input.memo ?? null,
      source: input.source,
      refType: input.refType ?? null,
      refId: input.refId ?? null,
      refLabel: input.refLabel ?? null,
      dedupeKey: input.dedupeKey ?? null,
      createdByEmail: input.createdByEmail ?? null,
      journalId: input.journalId ?? (await resolveJournalId(tx, input.source, input.journalCode)),
      lines: {
        create: lines.map((l) => ({
          accountId: byCode.get(l.account)!.id,
          debit: l.debit,
          credit: l.credit,
          memo: l.memo ?? null,
          partnerId: l.partnerId ?? null,
          dueDate: l.dueDate ?? null,
        })),
      },
    },
    include: { lines: true },
  });
}

/** Post a mirror image of an entry. The original is kept and marked REVERSED. */
export async function reverseEntry(entryId: number, reason?: string, actorEmail?: string) {
  return prisma.$transaction(async (tx) => {
    const original = await tx.journalEntry.findUnique({
      where: { id: entryId },
      include: { lines: { include: { account: true } } },
    });
    if (!original) throw new HttpError(404, 'Journal entry not found');
    if (original.status === 'REVERSED') throw new HttpError(400, 'This entry is already reversed');

    const reversal = await postEntry(tx, {
      source: 'REVERSAL',
      memo: reason ? `Reversal of ${original.entryNumber}: ${reason}` : `Reversal of ${original.entryNumber}`,
      refType: original.refType ?? undefined,
      refId: original.refId ?? undefined,
      refLabel: original.refLabel ?? undefined,
      createdByEmail: actorEmail,
      // A reversal belongs in the same book as what it reverses, so the journal
      // nets to zero for the pair instead of leaving a hole in one book and a
      // bump in another.
      journalId: original.journalId ?? undefined,
      // Swap the sides.
      lines: original.lines.map((l) => ({
        account: l.account.code,
        debit: money(l.credit),
        credit: money(l.debit),
        memo: l.memo ?? undefined,
        partnerId: l.partnerId ?? undefined,
      })),
    });

    await tx.journalEntry.update({ where: { id: entryId }, data: { status: 'REVERSED' } });
    await tx.journalEntry.update({ where: { id: reversal.id }, data: { reversesId: entryId } });
    return reversal;
  });
}

// ---------------------------------------------------------------------------
// Posting rules — one function per business event.
//
// All of them are inert until the books are opened (see POST /open-books), so
// the store runs perfectly well with accounting switched off, and trading that
// happened before go-live is never half-posted.
// ---------------------------------------------------------------------------

async function booksOpen(tx: Tx): Promise<boolean> {
  return (await tx.journalEntry.count({ where: { source: 'OPENING' } })) > 0;
}

interface SaleOrderLike {
  id: number;
  orderNumber: string;
  channel: string;
  subtotal: unknown;
  discount: unknown;
  shipping: unknown;
  tax: unknown;
  total: unknown;
  placedAt?: Date;
}

/**
 * Storefront sale. Goods are invoiced now and collected later (COD), so the
 * debit is Accounts Receivable; the cash leg is posted when the order is paid.
 */
export async function postOnlineSale(
  tx: Tx,
  order: SaleOrderLike,
  cogs: number,
  actorEmail?: string
) {
  if (!(await booksOpen(tx))) return;
  const subtotal = money(order.subtotal);
  const discount = money(order.discount);
  const shipping = money(order.shipping);
  const tax = money(order.tax);
  const total = money(order.total);

  await postEntry(tx, {
    date: order.placedAt,
    source: 'SALE',
    memo: `Online sale ${order.orderNumber}`,
    refType: 'ORDER',
    refId: order.id,
    refLabel: order.orderNumber,
    dedupeKey: `SALE:${order.id}`,
    createdByEmail: actorEmail,
    lines: [
      { account: ACCOUNTS.RECEIVABLE, debit: total },
      { account: ACCOUNTS.SALES_DISCOUNT, debit: discount },
      { account: ACCOUNTS.REVENUE, credit: subtotal },
      { account: ACCOUNTS.DELIVERY_INCOME, credit: shipping },
      { account: ACCOUNTS.TAX_PAYABLE, credit: tax },
    ],
  });

  await postCogs(tx, order, cogs, actorEmail);
}

/** POS sale — settled at the till, so the debit is cash / bank per tender. */
export async function postPosSale(
  tx: Tx,
  order: SaleOrderLike,
  tenders: { method: string; amount: number }[],
  cogs: number,
  actorEmail?: string
) {
  if (!(await booksOpen(tx))) return;
  const subtotal = money(order.subtotal);
  const discount = money(order.discount);
  const cash = money(tenders.filter((t) => t.method === 'CASH').reduce((s, t) => s + money(t.amount), 0));
  const card = money(tenders.filter((t) => t.method !== 'CASH').reduce((s, t) => s + money(t.amount), 0));

  await postEntry(tx, {
    date: order.placedAt,
    source: 'POS_SALE',
    memo: `Counter sale ${order.orderNumber}`,
    refType: 'ORDER',
    refId: order.id,
    refLabel: order.orderNumber,
    dedupeKey: `POS_SALE:${order.id}`,
    createdByEmail: actorEmail,
    lines: [
      { account: ACCOUNTS.CASH, debit: cash },
      { account: ACCOUNTS.BANK, debit: card, memo: 'KNET / card' },
      { account: ACCOUNTS.SALES_DISCOUNT, debit: discount },
      { account: ACCOUNTS.REVENUE, credit: subtotal },
    ],
  });

  await postCogs(tx, order, cogs, actorEmail);
}

/** Cost of goods sold — inventory leaves the balance sheet and hits the P&L. */
async function postCogs(tx: Tx, order: SaleOrderLike, cogs: number, actorEmail?: string) {
  const amount = money(cogs);
  if (amount <= 0) return;
  await postEntry(tx, {
    date: order.placedAt,
    source: 'SALE',
    memo: `Cost of goods sold — ${order.orderNumber}`,
    refType: 'ORDER',
    refId: order.id,
    refLabel: order.orderNumber,
    dedupeKey: `COGS:${order.id}`,
    createdByEmail: actorEmail,
    lines: [
      { account: ACCOUNTS.COGS, debit: amount },
      { account: ACCOUNTS.INVENTORY, credit: amount },
    ],
  });
}

/** Cash collected against an invoiced order (COD delivered, or a card capture). */
export async function postOrderPayment(
  tx: Tx,
  order: { id: number; orderNumber: string; total: unknown; payMethod: string },
  actorEmail?: string
) {
  if (!(await booksOpen(tx))) return;
  const amount = money(order.total);
  if (amount <= 0) return;
  const account = order.payMethod === 'COD' ? ACCOUNTS.CASH : ACCOUNTS.BANK;
  await postEntry(tx, {
    source: 'ORDER_PAYMENT',
    memo: `Payment received — ${order.orderNumber}`,
    refType: 'ORDER',
    refId: order.id,
    refLabel: order.orderNumber,
    dedupeKey: `ORDER_PAYMENT:${order.id}`,
    createdByEmail: actorEmail,
    lines: [
      { account, debit: amount },
      { account: ACCOUNTS.RECEIVABLE, credit: amount },
    ],
  });
}

/**
 * Refund. Rather than inventing new rules, this mirrors whatever was posted
 * for the sale — so the reversal is always exactly right, including COGS.
 */
export async function postSaleReversal(
  tx: Tx,
  orderId: number,
  orderNumber: string,
  reason?: string,
  actorEmail?: string
) {
  if (!(await booksOpen(tx))) return;
  const originals = await tx.journalEntry.findMany({
    where: { refType: 'ORDER', refId: orderId, status: 'POSTED', source: { in: ['SALE', 'POS_SALE', 'ORDER_PAYMENT'] } },
    include: { lines: { include: { account: true } } },
  });

  for (const entry of originals) {
    await postEntry(tx, {
      source: 'REFUND',
      memo: reason ? `Refund of ${orderNumber}: ${reason}` : `Refund of ${orderNumber}`,
      refType: 'ORDER',
      refId: orderId,
      refLabel: orderNumber,
      dedupeKey: `REFUND:${entry.id}`,
      createdByEmail: actorEmail,
      lines: entry.lines.map((l) => ({
        account: l.account.code,
        debit: money(l.credit),
        credit: money(l.debit),
        memo: l.memo ?? undefined,
      })),
    });
  }
}

// ---- B2B sales cycle -------------------------------------------------------
// Odoo's split: delivering goods moves cost, invoicing creates the receivable,
// and payment clears it. Each step posts on its own so a delivered-but-not-yet
// -invoiced order shows correctly on both the P&L and the balance sheet.

/** Goods leaving on a sales-order delivery — cost only, no revenue yet. */
export async function postSoCogs(
  tx: Tx,
  so: { id: number; name: string },
  cogs: number,
  deliveryKey: string,
  actorEmail?: string
) {
  if (!(await booksOpen(tx))) return;
  const amount = money(cogs);
  if (amount <= 0) return;
  await postEntry(tx, {
    source: 'SALE',
    memo: `Cost of goods delivered — ${so.name}`,
    refType: 'SO',
    refId: so.id,
    refLabel: so.name,
    dedupeKey: `SO_COGS:${so.id}:${deliveryKey}`,
    createdByEmail: actorEmail,
    lines: [
      { account: ACCOUNTS.COGS, debit: amount },
      { account: ACCOUNTS.INVENTORY, credit: amount },
    ],
  });
}

/** Invoicing a sales order — the receivable and the revenue. */
export async function postSoInvoice(
  tx: Tx,
  so: { id: number; name: string; amountUntaxed: unknown; amountTax: unknown; amountTotal: unknown },
  actorEmail?: string
) {
  if (!(await booksOpen(tx))) return;
  const untaxed = money(so.amountUntaxed);
  const tax = money(so.amountTax);
  const total = money(so.amountTotal);
  if (total <= 0) return;
  await postEntry(tx, {
    source: 'SALE',
    memo: `Invoice — ${so.name}`,
    refType: 'SO',
    refId: so.id,
    refLabel: so.name,
    dedupeKey: `SO_INVOICE:${so.id}`,
    createdByEmail: actorEmail,
    lines: [
      { account: ACCOUNTS.RECEIVABLE, debit: total },
      { account: ACCOUNTS.REVENUE, credit: untaxed },
      { account: ACCOUNTS.TAX_PAYABLE, credit: tax },
    ],
  });
}

/** Customer payment against a sales invoice. */
export async function postSoPayment(
  tx: Tx,
  so: { id: number; name: string },
  amount: number,
  method: 'CASH' | 'BANK',
  paymentKey: string,
  actorEmail?: string
) {
  if (!(await booksOpen(tx))) return;
  const value = money(amount);
  if (value <= 0) throw new HttpError(400, 'Payment must be greater than zero');
  await postEntry(tx, {
    source: 'ORDER_PAYMENT',
    memo: `Payment received — ${so.name}`,
    refType: 'SO',
    refId: so.id,
    refLabel: so.name,
    dedupeKey: `SO_PAYMENT:${so.id}:${paymentKey}`,
    createdByEmail: actorEmail,
    lines: [
      { account: method === 'CASH' ? ACCOUNTS.CASH : ACCOUNTS.BANK, debit: value },
      { account: ACCOUNTS.RECEIVABLE, credit: value },
    ],
  });
}

/** Reverse everything posted for a sales order (cancellation after invoicing). */
export async function postSoReversal(tx: Tx, soId: number, soName: string, reason?: string, actorEmail?: string) {
  if (!(await booksOpen(tx))) return;
  const originals = await tx.journalEntry.findMany({
    where: { refType: 'SO', refId: soId, status: 'POSTED' },
    include: { lines: { include: { account: true } } },
  });
  for (const entry of originals) {
    await postEntry(tx, {
      source: 'REFUND',
      memo: reason ? `Cancellation of ${soName}: ${reason}` : `Cancellation of ${soName}`,
      refType: 'SO',
      refId: soId,
      refLabel: soName,
      dedupeKey: `SO_REVERSAL:${entry.id}`,
      createdByEmail: actorEmail,
      lines: entry.lines.map((l) => ({
        account: l.account.code,
        debit: money(l.credit),
        credit: money(l.debit),
        memo: l.memo ?? undefined,
      })),
    });
  }
}

/**
 * Goods received against a purchase order.
 *
 * Inventory is debited with the full landed value, but the credit is split:
 * only the goods are owed to the supplier, while freight, customs, clearance
 * and insurance are owed to third parties. Lumping them together would
 * overstate what the supplier is due — which matters on imports, where those
 * costs are paid locally in KWD.
 */
export async function postGoodsReceipt(
  tx: Tx,
  po: { id: number; poNumber: string },
  goodsValue: number,
  landedValue: number,
  receiptKey: string,
  actorEmail?: string
) {
  if (!(await booksOpen(tx))) return;
  const goods = money(goodsValue);
  const landed = money(landedValue);
  const total = money(goods + landed);
  if (total <= 0) return;
  await postEntry(tx, {
    source: 'RECEIPT',
    memo: `Goods received — ${po.poNumber}`,
    refType: 'PO',
    refId: po.id,
    refLabel: po.poNumber,
    dedupeKey: `RECEIPT:${po.id}:${receiptKey}`,
    createdByEmail: actorEmail,
    lines: [
      { account: ACCOUNTS.INVENTORY, debit: total, memo: 'At landed cost' },
      { account: ACCOUNTS.PAYABLE, credit: goods, memo: 'Owed to supplier' },
      { account: ACCOUNTS.LANDED_PAYABLE, credit: landed, memo: 'Freight, customs & clearance' },
    ],
  });
}

/** Settling freight / customs / clearance with the third parties who charged them. */
export async function postLandedCostPayment(
  tx: Tx,
  po: { id: number; poNumber: string },
  amount: number,
  method: 'CASH' | 'BANK',
  paymentKey: string,
  actorEmail?: string
) {
  if (!(await booksOpen(tx))) return;
  const value = money(amount);
  if (value <= 0) throw new HttpError(400, 'Payment must be greater than zero');
  await postEntry(tx, {
    source: 'SUPPLIER_PAYMENT',
    memo: `Landed costs paid — ${po.poNumber}`,
    refType: 'PO',
    refId: po.id,
    refLabel: po.poNumber,
    dedupeKey: `LANDED_PAYMENT:${po.id}:${paymentKey}`,
    createdByEmail: actorEmail,
    lines: [
      { account: ACCOUNTS.LANDED_PAYABLE, debit: value },
      { account: method === 'CASH' ? ACCOUNTS.CASH : ACCOUNTS.BANK, credit: value },
    ],
  });
}

/** Paying a supplier — settles the payable. */
export async function postSupplierPayment(
  tx: Tx,
  po: { id: number; poNumber: string },
  amount: number,
  method: 'CASH' | 'BANK',
  paymentKey: string,
  actorEmail?: string
) {
  if (!(await booksOpen(tx))) return;
  const value = money(amount);
  if (value <= 0) throw new HttpError(400, 'Payment must be greater than zero');
  await postEntry(tx, {
    source: 'SUPPLIER_PAYMENT',
    memo: `Payment to supplier — ${po.poNumber}`,
    refType: 'PO',
    refId: po.id,
    refLabel: po.poNumber,
    dedupeKey: `SUPPLIER_PAYMENT:${po.id}:${paymentKey}`,
    createdByEmail: actorEmail,
    lines: [
      { account: ACCOUNTS.PAYABLE, debit: value },
      { account: method === 'CASH' ? ACCOUNTS.CASH : ACCOUNTS.BANK, credit: value },
    ],
  });
}

/** Stock adjustment — shrinkage, damage or a count correction. */
export async function postStockAdjustment(
  tx: Tx,
  movementId: number,
  productName: string,
  value: number,
  reason: string,
  actorEmail?: string
) {
  if (!(await booksOpen(tx))) return;
  const amount = money(Math.abs(value));
  if (amount === 0) return;
  const increase = value > 0;
  await postEntry(tx, {
    source: 'STOCK_ADJUSTMENT',
    memo: `Stock adjustment — ${productName}: ${reason}`,
    refType: 'PRODUCT',
    refId: movementId,
    dedupeKey: `STOCK_ADJUSTMENT:${movementId}`,
    createdByEmail: actorEmail,
    lines: increase
      ? [
          { account: ACCOUNTS.INVENTORY, debit: amount },
          { account: ACCOUNTS.INVENTORY_ADJUSTMENT, credit: amount },
        ]
      : [
          { account: ACCOUNTS.INVENTORY_ADJUSTMENT, debit: amount },
          { account: ACCOUNTS.INVENTORY, credit: amount },
        ],
  });
}

/**
 * Petty cash at the till. Money paid out is treated as an operating expense;
 * money paid in is treated as a float top-up from the bank. Both are the
 * common case — post a manual entry for anything unusual.
 */
export async function postCashMove(
  tx: Tx,
  moveId: number,
  type: 'IN' | 'OUT',
  amount: number,
  reason: string,
  sessionNumber: string,
  actorEmail?: string
) {
  if (!(await booksOpen(tx))) return;
  const value = money(amount);
  if (value <= 0) return;
  await postEntry(tx, {
    source: 'CASH_MOVE',
    memo: `Till ${type === 'IN' ? 'paid in' : 'paid out'} (${sessionNumber}): ${reason}`,
    refType: 'SESSION',
    refId: moveId,
    refLabel: sessionNumber,
    dedupeKey: `CASH_MOVE:${moveId}`,
    createdByEmail: actorEmail,
    lines: type === 'IN'
      ? [
          { account: ACCOUNTS.CASH, debit: value },
          { account: ACCOUNTS.BANK, credit: value },
        ]
      : [
          { account: ACCOUNTS.OPERATING_EXPENSE, debit: value },
          { account: ACCOUNTS.CASH, credit: value },
        ],
  });
}

/** Till variance at close — the drawer is the truth, the difference is a P&L hit. */
export async function postCashVariance(
  tx: Tx,
  sessionId: number,
  sessionNumber: string,
  variance: number,
  actorEmail?: string
) {
  if (!(await booksOpen(tx))) return;
  const value = money(variance);
  if (value === 0) return;
  const short = value < 0;
  const amount = money(Math.abs(value));
  await postEntry(tx, {
    source: 'CASH_VARIANCE',
    memo: `Till ${short ? 'shortage' : 'overage'} — ${sessionNumber}`,
    refType: 'SESSION',
    refId: sessionId,
    refLabel: sessionNumber,
    dedupeKey: `CASH_VARIANCE:${sessionId}`,
    createdByEmail: actorEmail,
    lines: short
      ? [
          { account: ACCOUNTS.CASH_OVER_SHORT, debit: amount },
          { account: ACCOUNTS.CASH, credit: amount },
        ]
      : [
          { account: ACCOUNTS.CASH, debit: amount },
          { account: ACCOUNTS.CASH_OVER_SHORT, credit: amount },
        ],
  });
}

/** True when the books have been opened — i.e. the go-live entry exists. */
export async function isLive(): Promise<boolean> {
  return (await prisma.journalEntry.count({ where: { source: 'OPENING' } })) > 0;
}
