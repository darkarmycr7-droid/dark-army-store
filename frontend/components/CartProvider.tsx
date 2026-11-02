'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';

export interface CartLine {
  productId: number;
  name: string;
  slug: string;
  price: number;
  image: string | null;
  quantity: number;
  stockQty: number;
}

interface CartCtx {
  lines: CartLine[];
  count: number;
  subtotal: number;
  add: (line: Omit<CartLine, 'quantity'>, qty?: number) => void;
  setQty: (productId: number, qty: number) => void;
  remove: (productId: number) => void;
  clear: () => void;
}

const Ctx = createContext<CartCtx | null>(null);
const KEY = 'da-cart-v1';

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setLines(JSON.parse(raw));
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) localStorage.setItem(KEY, JSON.stringify(lines));
  }, [lines, ready]);

  const add: CartCtx['add'] = (line, qty = 1) => {
    setLines((prev) => {
      const existing = prev.find((l) => l.productId === line.productId);
      if (existing) {
        return prev.map((l) =>
          l.productId === line.productId
            ? { ...l, quantity: Math.min(l.quantity + qty, line.stockQty) }
            : l
        );
      }
      return [...prev, { ...line, quantity: Math.min(qty, line.stockQty) }];
    });
  };

  const setQty: CartCtx['setQty'] = (productId, qty) =>
    setLines((prev) =>
      prev
        .map((l) =>
          l.productId === productId
            ? { ...l, quantity: Math.max(0, Math.min(qty, l.stockQty)) }
            : l
        )
        .filter((l) => l.quantity > 0)
    );

  const remove: CartCtx['remove'] = (productId) =>
    setLines((prev) => prev.filter((l) => l.productId !== productId));

  const clear = () => setLines([]);

  const value = useMemo<CartCtx>(() => {
    const count = lines.reduce((s, l) => s + l.quantity, 0);
    const subtotal = Math.round(lines.reduce((s, l) => s + l.price * l.quantity, 0) * 1000) / 1000;
    return { lines, count, subtotal, add, setQty, remove, clear };
  }, [lines]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCart() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
