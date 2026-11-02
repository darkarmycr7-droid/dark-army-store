// Create the default journals and file every existing entry into one.
//
//   npm run backfill:journals
//
// Idempotent: journals are matched on code, and entries already carrying a
// journal are left alone. Safe to re-run after adding a journal by hand.
//
// Nothing about an entry's amounts, accounts or dates is touched — this only
// answers "which book was this written in", which nothing recorded before now.

import { prisma } from '../src/lib/prisma';
import { JOURNALS, seedJournals } from '../src/services/accounting.service';

/** Same mapping the posting rules use, kept here so the backfill agrees with them. */
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

async function main() {
  // 1. Journals — created, and joined up to the chart if it exists by now.
  const { created, linked } = await seedJournals(prisma);
  console.log(`Journals created: ${created}, linked to a default account: ${linked}`);

  const accountCount = await prisma.account.count();
  if (accountCount === 0) {
    console.log('NOTE: the chart of accounts is empty, so journals have no default account yet.');
    console.log('      Open the books (Accounting → Go live), then re-run this to join them up.');
  }

  const journals = await prisma.journal.findMany();
  const journalByCode = new Map(journals.map((j) => [j.code, j.id]));

  // 2. File existing entries. A reversal follows the entry it reverses rather
  //    than the source map, so the pair nets to zero inside one book.
  const orphans = await prisma.journalEntry.findMany({
    where: { journalId: null },
    select: { id: true, source: true, reversesId: true },
  });
  console.log(`Entries without a journal: ${orphans.length}`);

  const counts = new Map<string, number>();
  for (const e of orphans) {
    let journalId: number | null = null;

    if (e.reversesId) {
      const original = await prisma.journalEntry.findUnique({
        where: { id: e.reversesId }, select: { journalId: true, source: true },
      });
      journalId = original?.journalId
        ?? journalByCode.get(JOURNAL_BY_SOURCE[original?.source ?? 'MANUAL'] ?? JOURNALS.MISC)
        ?? null;
    } else {
      journalId = journalByCode.get(JOURNAL_BY_SOURCE[e.source] ?? JOURNALS.MISC) ?? null;
    }

    if (!journalId) continue;
    await prisma.journalEntry.update({ where: { id: e.id }, data: { journalId } });
    const code = journals.find((j) => j.id === journalId)!.code;
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }

  if (counts.size) {
    console.log('\nFiled into:');
    for (const [code, n] of [...counts].sort((a, b) => b[1] - a[1])) console.log(`  ${code}  ${n}`);
  }

  const left = await prisma.journalEntry.count({ where: { journalId: null } });
  console.log(`\nEntries still without a journal: ${left}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
