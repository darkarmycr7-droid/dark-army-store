// Kuwaiti Dinar uses 3 decimal places (1 KD = 1000 fils).
export function formatKD(amount: number): string {
  return `KD ${Number(amount || 0).toFixed(3)}`;
}

export function discountPct(price: number, was?: number | null): number | null {
  if (!was || was <= price) return null;
  return Math.round(((was - price) / was) * 100);
}
