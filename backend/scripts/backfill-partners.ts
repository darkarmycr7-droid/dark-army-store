// One-time backfill after introducing Contacts (Partner).
//
//   npm run backfill:partners
//
// Creates one Partner per existing Customer and Supplier and links them.
// Idempotent: rows that already have a partnerId are skipped, and a contact
// that is both a customer and a supplier is merged into a single record
// (matched on email, then name) with both ranks set — the Odoo behaviour.

import { prisma } from '../src/lib/prisma';

async function findExisting(email: string | null, name: string) {
  if (email) {
    const byEmail = await prisma.partner.findFirst({ where: { email } });
    if (byEmail) return byEmail;
  }
  return prisma.partner.findFirst({ where: { name } });
}

async function main() {
  let created = 0;
  let merged = 0;

  const customers = await prisma.customer.findMany({ where: { partnerId: null } });
  for (const c of customers) {
    const existing = await findExisting(c.email, c.name);
    const partner = existing
      ? await prisma.partner.update({
          where: { id: existing.id },
          data: { customerRank: Math.max(existing.customerRank, 1), phone: existing.phone || c.phone },
        })
      : await prisma.partner.create({
          data: { name: c.name, email: c.email, phone: c.phone, customerRank: 1, country: 'Kuwait' },
        });
    existing ? merged++ : created++;
    await prisma.customer.update({ where: { id: c.id }, data: { partnerId: partner.id } });
  }

  const suppliers = await prisma.supplier.findMany({ where: { partnerId: null } });
  for (const s of suppliers) {
    const existing = await findExisting(s.email, s.name);
    const partner = existing
      ? await prisma.partner.update({
          where: { id: existing.id },
          data: { supplierRank: Math.max(existing.supplierRank, 1) },
        })
      : await prisma.partner.create({
          data: {
            name: s.name,
            nameAr: s.nameAr,
            email: s.email,
            phone: s.phone,
            street: s.address,
            comment: s.notes,
            paymentTerms: s.paymentTerms,
            supplierRank: 1,
            isCompany: true,
            country: 'Kuwait',
          },
        });
    existing ? merged++ : created++;
    await prisma.supplier.update({ where: { id: s.id }, data: { partnerId: partner.id } });
  }

  // A couple of starter tags so the tag UI is not empty on first use.
  for (const [name, color] of [['VIP', 'amber'], ['Wholesale', 'sky'], ['Retail', 'emerald']] as const) {
    const found = await prisma.partnerTag.findUnique({ where: { name } });
    if (!found) await prisma.partnerTag.create({ data: { name, color } });
  }

  const total = await prisma.partner.count();
  console.log(`[backfill] contacts created=${created} merged=${merged}; ${total} contacts total`);
}

main()
  .catch((e) => {
    console.error('[backfill] failed:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
