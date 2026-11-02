'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Loader2, Search, Trash2, Plus, Minus, X, Receipt, Banknote,
  ArrowLeftRight, LogOut, LayoutDashboard, Lock, ShoppingCart,
} from 'lucide-react';
import { adminApi, adminToken, TillProduct, PosCurrentSession, PosOrder, Tender } from '@/lib/adminApi';
import { formatKD } from '@/lib/money';
import { printReceipt } from '@/lib/receipt';
import ThemeToggle from '@/components/odoo/ThemeToggle';
import OpenRegisterFlow from '@/components/pos/OpenRegisterFlow';

type CartLine = { product: TillProduct; quantity: number };

/**
 * Which register this device is standing at. Held per browser so a shop tablet
 * comes back to its own till after a reload, and so two tablets in one shop can
 * run different registers.
 */
const REGISTER_KEY = 'da-pos-register';

function rememberedRegister(): number | null {
  try {
    const v = localStorage.getItem(REGISTER_KEY);
    return v ? Number(v) : null;
  } catch { return null; }
}

export default function PosPage() {
  const router = useRouter();
  const [session, setSession] = useState<PosCurrentSession | null | undefined>(undefined);
  const [registerId, setRegisterId] = useState<number | null>(null);

  const loadSession = useCallback((id?: number | null) => {
    const target = id ?? rememberedRegister();
    // No remembered register means this device has not chosen a till yet, so it
    // belongs on the dashboard. Asking the server for "any open session" would
    // drop a fresh tablet straight into whichever till somebody else opened.
    if (!target) {
      setSession(null);
      setRegisterId(null);
      return Promise.resolve();
    }
    return adminApi
      .posCurrentSession(target)
      .then((s) => {
        setSession(s);
        setRegisterId(s?.registerId ?? null);
        // A register closed from somewhere else must send this device back to
        // the dashboard rather than strand it on a dead till.
        if (!s) { try { localStorage.removeItem(REGISTER_KEY); } catch { /* no-op */ } }
      })
      .catch(() => setSession(null));
  }, []);

  useEffect(() => {
    if (!adminToken.get()) {
      router.replace('/admin/login');
      return;
    }
    loadSession();
  }, [router, loadSession]);

  if (session === undefined) {
    return (
      <div className="grid min-h-screen place-items-center bg-odoo-ground text-odoo-faint">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  if (session === null) {
    return (
      <OpenRegisterFlow
        onOpened={(id) => {
          try { localStorage.setItem(REGISTER_KEY, String(id)); } catch { /* no-op */ }
          setSession(undefined);
          void loadSession(id);
        }}
      />
    );
  }

  return <Till session={session} onSessionChanged={() => loadSession(registerId)} />;
}

// ---------- The till ----------

function Till({ session, onSessionChanged }: { session: PosCurrentSession; onSessionChanged: () => void }) {
  const [products, setProducts] = useState<TillProduct[]>([]);
  const [q, setQ] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [discount, setDiscount] = useState(0);
  const [paying, setPaying] = useState(false);
  const [closing, setClosing] = useState(false);
  const [cashMove, setCashMove] = useState(false);
  const [lastSale, setLastSale] = useState<{ order: PosOrder; change: number } | null>(null);
  const [error, setError] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const subtotal = cart.reduce((s, l) => s + l.product.sellingPrice * l.quantity, 0);
  const total = Math.max(0, subtotal - discount);

  const addToCart = useCallback((p: TillProduct) => {
    setCart((c) => {
      const found = c.find((l) => l.product.id === p.id);
      if (found) {
        if (found.quantity >= p.stockQty) return c; // never oversell at the till
        return c.map((l) => (l.product.id === p.id ? { ...l, quantity: l.quantity + 1 } : l));
      }
      if (p.stockQty < 1) return c;
      return [...c, { product: p, quantity: 1 }];
    });
  }, []);

  // Search / barcode. A scanner types fast and hits Enter — an exact barcode
  // match comes back as a single row, which we add straight to the ticket.
  useEffect(() => {
    const t = setTimeout(() => {
      adminApi.posTillProducts(q).then((rows) => {
        setProducts(rows);
        if (rows.length === 1 && rows[0].exactMatch && q.length >= 6) {
          addToCart(rows[0]);
          setQ('');
        }
      }).catch(() => setProducts([]));
    }, 200);
    return () => clearTimeout(t);
  }, [q, addToCart]);

  const setQty = (id: number, qty: number) =>
    setCart((c) =>
      c.flatMap((l) => {
        if (l.product.id !== id) return [l];
        const next = Math.min(Math.max(0, qty), l.product.stockQty);
        return next === 0 ? [] : [{ ...l, quantity: next }];
      })
    );

  const clear = () => { setCart([]); setDiscount(0); };

  const complete = async (tenders: { method: Tender; amount: number }[]) => {
    const res = await adminApi.posSale({
      lines: cart.map((l) => ({ productId: l.product.id, quantity: l.quantity })),
      tenders,
      discount: discount || undefined,
    });
    setLastSale(res);
    setPaying(false);
    clear();
    onSessionChanged();
    adminApi.posTillProducts(q).then(setProducts).catch(() => {});
    searchRef.current?.focus();
    return res;
  };

  return (
    <div className="flex h-screen flex-col">
      {/* Top bar */}
      <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-600 text-white"><ShoppingCart size={17} /></span>
        <div className="min-w-0">
          <div className="truncate text-sm font-extrabold">
            {session.registerName}
            {session.cashierName && <span className="ml-2 font-medium text-odoo-dim">· {session.cashierName}</span>}
          </div>
          <div className="text-xs text-slate-500">
            {session.sessionNumber}
            {session.warehouseName && <> · <span className="font-semibold text-odoo-lift">{session.warehouseName}</span></>}
            {' '}· open since {new Date(session.openedAt).toLocaleTimeString()}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="hidden rounded-lg bg-slate-100 px-3 py-1.5 text-right sm:block">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Cash in drawer</div>
            <div className="text-sm font-bold">{formatKD(session.expectedCash)}</div>
          </div>
          <ThemeToggle compact />
          <button onClick={() => setCashMove(true)} className="btn-ghost" title="Cash in / out"><ArrowLeftRight size={16} /><span className="hidden sm:inline">Cash</span></button>
          <button onClick={() => setClosing(true)} className="btn-ghost" title="Close the till"><Lock size={16} /><span className="hidden sm:inline">Close</span></button>
          <a href="/admin" className="btn-ghost" title="Back to admin"><LogOut size={16} /></a>
        </div>
      </header>

      {error && <p className="bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</p>}

      <div className="grid min-h-0 flex-1 lg:grid-cols-[1fr_380px]">
        {/* Products */}
        <div className="flex min-h-0 flex-col p-4">
          <div className="mb-3 flex items-center gap-2 rounded-xl bg-white px-3 py-2 shadow-sm">
            <Search size={18} className="text-slate-400" />
            <input
              ref={searchRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              autoFocus
              placeholder="Scan a barcode or search by name / SKU…"
              className="w-full bg-transparent py-1.5 outline-none"
            />
            {q && <button onClick={() => setQ('')} className="text-slate-400 hover:text-slate-700"><X size={16} /></button>}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {products.map((p) => (
                <button
                  key={p.id}
                  onClick={() => addToCart(p)}
                  disabled={p.stockQty < 1}
                  className="flex flex-col rounded-xl bg-white p-3 text-left shadow-sm transition hover:shadow-md disabled:opacity-40"
                >
                  <span className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold">{p.name}</span>
                  <span className="mt-1 text-xs text-slate-400">{p.sku}</span>
                  <span className="mt-2 flex items-baseline justify-between">
                    <span className="font-extrabold text-brand-700">{formatKD(p.sellingPrice)}</span>
                    <span className={`text-xs ${p.stockQty < 1 ? 'text-rose-500' : 'text-slate-400'}`}>
                      {p.stockQty < 1 ? 'Out' : `${p.stockQty} left`}
                    </span>
                  </span>
                </button>
              ))}
              {products.length === 0 && (
                <p className="col-span-full py-16 text-center text-slate-400">No products match “{q}”.</p>
              )}
            </div>
          </div>
        </div>

        {/* Ticket */}
        <aside className="flex min-h-0 flex-col border-t border-slate-200 bg-white lg:border-l lg:border-t-0">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 className="font-extrabold">Ticket</h2>
            {cart.length > 0 && (
              <button onClick={clear} className="text-sm text-slate-500 hover:text-rose-600">Clear</button>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4">
            {cart.length === 0 ? (
              <p className="py-16 text-center text-sm text-slate-400">Scan or tap a product to start.</p>
            ) : (
              cart.map((l) => (
                <div key={l.product.id} className="flex items-start gap-2 border-b border-slate-100 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{l.product.name}</div>
                    <div className="text-xs text-slate-400">{formatKD(l.product.sellingPrice)} each</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setQty(l.product.id, l.quantity - 1)} className="grid h-7 w-7 place-items-center rounded-lg bg-slate-100 hover:bg-slate-200"><Minus size={13} /></button>
                    <span className="w-7 text-center text-sm font-bold">{l.quantity}</span>
                    <button onClick={() => setQty(l.product.id, l.quantity + 1)} disabled={l.quantity >= l.product.stockQty} className="grid h-7 w-7 place-items-center rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-40"><Plus size={13} /></button>
                  </div>
                  <div className="w-20 text-right text-sm font-bold">{formatKD(l.product.sellingPrice * l.quantity)}</div>
                  <button onClick={() => setQty(l.product.id, 0)} className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={13} /></button>
                </div>
              ))
            )}
          </div>

          <div className="border-t border-slate-200 p-4">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="text-slate-500">Subtotal</span>
              <span className="font-semibold">{formatKD(subtotal)}</span>
            </div>
            <div className="mb-2 flex items-center justify-between gap-2 text-sm">
              <span className="text-slate-500">Discount</span>
              <input
                type="number" min={0} max={subtotal} step="0.001" value={discount}
                onChange={(e) => setDiscount(Math.min(Number(e.target.value), subtotal))}
                className="input w-28 py-1 text-right"
              />
            </div>
            <div className="mb-3 flex items-center justify-between border-t border-slate-200 pt-3 text-lg font-extrabold">
              <span>Total</span><span>{formatKD(total)}</span>
            </div>
            <button
              onClick={() => { setError(''); setPaying(true); }}
              disabled={cart.length === 0}
              className="btn-primary w-full justify-center py-3 text-base disabled:opacity-40"
            >
              <Banknote size={18} /> Take Payment
            </button>
          </div>
        </aside>
      </div>

      {paying && <PaymentModal total={total} onClose={() => setPaying(false)} onComplete={complete} onError={setError} />}
      {lastSale && <SaleDoneModal sale={lastSale} onClose={() => setLastSale(null)} />}
      {cashMove && <CashMoveModal sessionId={session.id} onClose={() => setCashMove(false)} onSaved={() => { setCashMove(false); onSessionChanged(); }} />}
      {closing && <CloseSessionModal session={session} onClose={() => setClosing(false)} onClosed={onSessionChanged} />}
    </div>
  );
}

// ---------- Payment ----------

const TENDERS: Tender[] = ['CASH', 'KNET', 'CARD'];

function PaymentModal({
  total, onClose, onComplete, onError,
}: {
  total: number;
  onClose: () => void;
  onComplete: (tenders: { method: Tender; amount: number }[]) => Promise<unknown>;
  onError: (s: string) => void;
}) {
  const [rows, setRows] = useState<{ method: Tender; amount: number }[]>([{ method: 'CASH', amount: total }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const tendered = rows.reduce((s, r) => s + (r.amount || 0), 0);
  const remaining = Math.round((total - tendered) * 1000) / 1000;
  const change = Math.round((tendered - total) * 1000) / 1000;
  const hasCash = rows.some((r) => r.method === 'CASH');
  // Change can only be given from the cash drawer.
  const blocked = remaining > 0 || (change > 0 && !hasCash);

  const setRow = (i: number, patch: Partial<{ method: Tender; amount: number }>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const quickCash = useMemo(() => {
    const notes = [1, 5, 10, 20];
    const rounded = Math.ceil(total);
    return [...new Set([total, rounded, ...notes.filter((n) => n > total)])].slice(0, 5);
  }, [total]);

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await onComplete(rows.filter((r) => r.amount > 0));
    } catch (e: any) {
      setError(e.message || 'Could not complete the sale');
      onError('');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-extrabold">Payment</h2>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-slate-100"><X size={18} /></button>
        </div>

        <div className="mb-4 rounded-xl bg-slate-900 px-4 py-3 text-white">
          <div className="text-xs uppercase tracking-wide text-slate-400">Amount due</div>
          <div className="text-3xl font-extrabold">{formatKD(total)}</div>
        </div>

        {error && <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}

        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <select value={r.method} onChange={(e) => setRow(i, { method: e.target.value as Tender })} className="input w-32">
                {TENDERS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <input
                type="number" min={0} step="0.001" value={r.amount}
                onChange={(e) => setRow(i, { amount: Number(e.target.value) })}
                className="input flex-1 text-right font-bold"
              />
              {rows.length > 1 && (
                <button onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))} className="grid h-9 w-9 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={15} /></button>
              )}
            </div>
          ))}
          {rows.length < 3 && (
            <button
              onClick={() => setRows((rs) => [...rs, { method: 'KNET', amount: Math.max(0, remaining) }])}
              className="btn-ghost w-full justify-center text-sm"
            >
              <Plus size={15} /> Split payment
            </button>
          )}
        </div>

        {rows.length === 1 && rows[0].method === 'CASH' && (
          <div className="mt-3 flex flex-wrap gap-2">
            {quickCash.map((v) => (
              <button key={v} onClick={() => setRow(0, { amount: v })} className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold hover:bg-slate-200">
                {formatKD(v)}
              </button>
            ))}
          </div>
        )}

        <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm">
          {remaining > 0 ? (
            <div className="flex justify-between font-bold text-rose-600"><span>Still due</span><span>{formatKD(remaining)}</span></div>
          ) : (
            <div className="flex justify-between font-bold text-emerald-600"><span>Change</span><span>{formatKD(change)}</span></div>
          )}
          {change > 0 && !hasCash && (
            <p className="mt-1 text-xs text-rose-600">Overpayment needs a cash tender — change can only come from the drawer.</p>
          )}
        </div>

        <button onClick={submit} disabled={busy || blocked} className="btn-primary mt-4 w-full justify-center py-3 text-base disabled:opacity-40">
          {busy ? <Loader2 size={16} className="animate-spin" /> : 'Complete Sale'}
        </button>
      </div>
    </div>
  );
}

function SaleDoneModal({ sale, onClose }: { sale: { order: PosOrder; change: number }; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl">
        <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-emerald-100 text-emerald-600"><Receipt size={26} /></div>
        <h2 className="text-lg font-extrabold">Sale complete</h2>
        <p className="text-sm text-slate-500">{sale.order.orderNumber}</p>
        <div className="my-4 rounded-xl bg-slate-50 p-4">
          <div className="flex justify-between py-0.5 text-sm"><span className="text-slate-500">Total</span><span className="font-bold">{formatKD(sale.order.total)}</span></div>
          {sale.change > 0 && (
            <div className="flex justify-between py-0.5 text-lg font-extrabold text-emerald-600"><span>Change</span><span>{formatKD(sale.change)}</span></div>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={() => printReceipt(sale.order, sale.change)} className="btn-ghost flex-1 justify-center"><Receipt size={16} /> Receipt</button>
          <button onClick={onClose} className="btn-primary flex-1 justify-center">New Sale</button>
        </div>
      </div>
    </div>
  );
}

// ---------- Cash in / out ----------

function CashMoveModal({ sessionId, onClose, onSaved }: { sessionId: number; onClose: () => void; onSaved: () => void }) {
  const [type, setType] = useState<'IN' | 'OUT'>('OUT');
  const [amount, setAmount] = useState(0);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await adminApi.posCashMove(sessionId, type, amount, reason);
      onSaved();
    } catch (err: any) {
      setError(err.message || 'Could not record the cash movement');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-extrabold">Cash In / Out</h2>
        {error && <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}

        <div className="mb-4 flex gap-2">
          <button type="button" onClick={() => setType('IN')} className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium ${type === 'IN' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}`}>Paid in</button>
          <button type="button" onClick={() => setType('OUT')} className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium ${type === 'OUT' ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-600'}`}>Paid out</button>
        </div>

        <label className="mb-4 block"><span className="label">Amount (KD)</span>
          <input type="number" min={0} step="0.001" value={amount} onChange={(e) => setAmount(Number(e.target.value))} autoFocus required className="input text-lg font-bold" /></label>
        <label className="mb-4 block"><span className="label">Reason</span>
          <input value={reason} onChange={(e) => setReason(e.target.value)} required minLength={2} placeholder="Paid the delivery driver…" className="input" /></label>

        <div className="flex gap-3">
          <button disabled={busy || amount <= 0} className="btn-primary disabled:opacity-40">{busy ? <Loader2 size={16} className="animate-spin" /> : 'Record'}</button>
          <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
        </div>
      </form>
    </div>
  );
}

// ---------- Close the till ----------

function CloseSessionModal({ session, onClose, onClosed }: { session: PosCurrentSession; onClose: () => void; onClosed: () => void }) {
  const [counted, setCounted] = useState(session.expectedCash);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const variance = Math.round((counted - session.expectedCash) * 1000) / 1000;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await adminApi.posCloseSession(session.id, counted, note || undefined);
      onClosed();
    } catch (err: any) {
      setError(err.message || 'Could not close the session');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-1 text-lg font-extrabold">Close {session.sessionNumber}</h2>
        <p className="mb-4 text-sm text-slate-500">Count the drawer and enter what is actually there.</p>
        {error && <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}

        <div className="mb-4 rounded-xl bg-slate-50 p-4 text-sm">
          <div className="flex justify-between py-0.5"><span className="text-slate-500">Opening float</span><span>{formatKD(session.openingFloat)}</span></div>
          <div className="flex justify-between py-0.5 font-semibold"><span className="text-slate-500">Expected in drawer</span><span>{formatKD(session.expectedCash)}</span></div>
        </div>

        <label className="mb-4 block"><span className="label">Counted cash (KD)</span>
          <input type="number" min={0} step="0.001" value={counted} onChange={(e) => setCounted(Number(e.target.value))} autoFocus className="input text-lg font-bold" /></label>

        <div className={`mb-4 rounded-xl px-4 py-3 text-sm font-bold ${variance === 0 ? 'bg-emerald-50 text-emerald-700' : variance > 0 ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'}`}>
          {variance === 0 ? 'Balanced' : variance > 0 ? `Over by ${formatKD(variance)}` : `Short by ${formatKD(Math.abs(variance))}`}
        </div>

        <label className="mb-4 block"><span className="label">Note (optional)</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="input" placeholder="Explain any variance…" /></label>

        <div className="flex gap-3">
          <button disabled={busy} className="btn-primary">{busy ? <Loader2 size={16} className="animate-spin" /> : 'Close Session'}</button>
          <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
        </div>
      </form>
    </div>
  );
}
