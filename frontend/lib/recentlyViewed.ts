const KEY = 'da-recently-viewed';
const MAX = 12;

export function getRecentlyViewed(): number[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((n) => Number.isInteger(n)) : [];
  } catch {
    return [];
  }
}

export function recordView(productId: number) {
  if (typeof window === 'undefined' || !Number.isInteger(productId)) return;
  const next = [productId, ...getRecentlyViewed().filter((id) => id !== productId)].slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore quota / disabled storage */
  }
}
