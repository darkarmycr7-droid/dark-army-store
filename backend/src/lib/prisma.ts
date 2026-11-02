import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

// Prisma returns Decimal objects; the storefront wants plain numbers.
// Round to 3 dp (Kuwaiti Dinar = 1000 fils).
export function money(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === 'object' && 'toNumber' in (v as any) ? (v as any).toNumber() : Number(v);
  return Math.round(n * 1000) / 1000;
}
