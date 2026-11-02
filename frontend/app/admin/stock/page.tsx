'use client';

import { useEffect, useState } from 'react';
import { Loader2, SlidersHorizontal, ArrowDownRight, ArrowUpRight, Boxes } from 'lucide-react';
import { adminApi, StockMovement, MovementType, AdminProduct } from '@/lib/adminApi';
import { formatKD } from '@/lib/money';

const TYPES: MovementType[] = ['PURCHASE', 'SALE', 'RETURN', 'REFUND_RESTOCK', 'ADJUSTMENT', 'INITIAL'];
const TYPE_LABEL: Record<MovementType, string> = {
  PURCHASE: 'Purchase',
  SALE: 'Sale',
  RETURN: 'Return',
  REFUND_RESTOCK: 'Refund restock',
  ADJUSTMENT: 'Adjustment',
  INITIAL: 'Opening',
};
const TYPE_STYLE: Record<MovementType, string> = {
  PURCHASE: 'bg-emerald-100 text-emerald-700',
  SALE: 'bg-blue-100 text-blue-700',
  RETURN: 'bg-amber-100 text-amber-700',
  REFUND_RESTOCK: 'bg-amber-100 text-amber-700',
  ADJUSTMENT: 'bg-violet-100 text-violet-700',
  INITIAL: 'bg-slate-100 text-slate-600',
};

const PAGE = 100;

export default function AdminStockPage() {
  const [data, setData] = useState<{ rows: StockMovement[]; total: number } | null>(null);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [productId, setProductId] = useState<number | ''>('');
  const [type, setType] = useState<'' | MovementType>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [skip, setSkip] = useState(0);
  const [adjusting, setAdjusting] = useState(false);

  const load = () =>
    adminApi
      .stockMovements({
        productId: productId || undefined,
        type: type || undefined,
        from: from || undefined,
        to: to || undefined,
        skip,
        limit: PAGE,
      })
      .then(setData)
      .catch(() => setData({ rows: [], total: 0 }));

  useEffect(() => { adminApi.products().then(setProducts).catch(() => setProducts([])); }, []);
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [productId, type, from, to, skip]);
  // Any filter change goes back to the first page.
  useEffect(() => { setSkip(0); }, [productId, type, from, to]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold">Stock Ledger</h1>
          <p className="text-slate-500">{data?.total ?? 0} movements — every change to stock, with its cost</p>
        </div>
        <button onClick={() => setAdjusting(true)} className="btn-primary"><SlidersHorizontal size={18} /> Stock Adjustment</button>
      </div>

      <div className="card grid gap-3 p-4 sm:grid-cols-4">
        <label className="block"><span className="label">Product</span>
          <select value={productId} onChange={(e) => setProductId(e.target.value ? Number(e.target.value) : '')} className="input">
            <option value="">All products</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select></label>
        <label className="block"><span className="label">Type</span>
          <select value={type} onChange={(e) => setType(e.target.value as any)} className="input">
            <option value="">All types</option>
            {TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
          </select></label>
        <label className="block"><span className="label">From</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input" /></label>
        <label className="block"><span className="label">To</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input" /></label>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3 text-right">Qty</th>
                <th className="px-4 py-3 text-right">Unit cost</th>
                <th className="px-4 py-3 text-right">Value</th>
                <th className="px-4 py-3 text-right">Balance</th>
                <th className="px-4 py-3">Reference</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {!data ? (
                <tr><td colSpan={8} className="py-16 text-center text-slate-400"><Loader2 className="mx-auto animate-spin" /></td></tr>
              ) : data.rows.length === 0 ? (
                <tr><td colSpan={8} className="py-16 text-center text-slate-400">No movements match these filters.</td></tr>
              ) : (
                data.rows.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-500">{new Date(m.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{m.product?.name ?? '—'}</div>
                      <div className="text-xs text-slate-400">{m.product?.sku}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${TYPE_STYLE[m.type]}`}>{TYPE_LABEL[m.type]}</span>
                    </td>
                    <td className={`px-4 py-3 text-right font-bold ${m.qty > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      <span className="inline-flex items-center gap-1">
                        {m.qty > 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                        {m.qty > 0 ? `+${m.qty}` : m.qty}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-500">{formatKD(m.unitCost)}</td>
                    <td className="px-4 py-3 text-right">{formatKD(m.value)}</td>
                    <td className="px-4 py-3 text-right font-semibold">{m.balanceAfter}</td>
                    <td className="px-4 py-3 text-slate-500">
                      <div>{m.refLabel || '—'}</div>
                      {m.reason && <div className="text-xs text-slate-400">{m.reason}</div>}
                      {m.actorEmail && <div className="text-xs text-slate-400">{m.actorEmail}</div>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {data && data.total > PAGE && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">Showing {skip + 1}–{Math.min(skip + PAGE, data.total)} of {data.total}</span>
          <div className="flex gap-2">
            <button disabled={skip === 0} onClick={() => setSkip((s) => Math.max(0, s - PAGE))} className="btn-ghost disabled:opacity-40">Previous</button>
            <button disabled={skip + PAGE >= data.total} onClick={() => setSkip((s) => s + PAGE)} className="btn-ghost disabled:opacity-40">Next</button>
          </div>
        </div>
      )}

      {adjusting && (
        <AdjustModal
          products={products}
          onClose={() => setAdjusting(false)}
          onSaved={() => {
            setAdjusting(false);
            adminApi.products().then(setProducts).catch(() => {});
            load();
          }}
        />
      )}
    </div>
  );
}

function AdjustModal({ products, onClose, onSaved }: { products: AdminProduct[]; onClose: () => void; onSaved: () => void }) {
  const [productId, setProductId] = useState<number>(products[0]?.id ?? 0);
  const [mode, setMode] = useState<'count' | 'delta'>('count');
  const [countedQty, setCountedQty] = useState(0);
  const [qty, setQty] = useState(0);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const product = products.find((p) => p.id === productId);
  useEffect(() => { if (product) setCountedQty(product.stockQty); }, [product]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await adminApi.adjustStock({
        productId,
        ...(mode === 'count' ? { countedQty } : { qty }),
        reason,
      });
      onSaved();
    } catch (err: any) {
      setError(err.message || 'Could not adjust stock');
      setSaving(false);
    }
  };

  const delta = mode === 'count' ? countedQty - (product?.stockQty ?? 0) : qty;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-extrabold">Stock Adjustment</h2>
        {error && <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}

        <div className="space-y-4">
          <label className="block"><span className="label">Product</span>
            <select value={productId} onChange={(e) => setProductId(Number(e.target.value))} className="input">
              {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
            </select></label>

          {product && (
            <div className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3 text-sm">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-white text-brand-600"><Boxes size={16} /></span>
              <div>
                <div className="font-semibold">System quantity: {product.stockQty}</div>
                <div className="text-xs text-slate-500">Average cost {formatKD(product.avgCost || product.costPrice)}</div>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button type="button" onClick={() => setMode('count')} className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium ${mode === 'count' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600'}`}>Physical count</button>
            <button type="button" onClick={() => setMode('delta')} className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium ${mode === 'delta' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600'}`}>Add / remove</button>
          </div>

          {mode === 'count' ? (
            <label className="block"><span className="label">Counted quantity</span>
              <input type="number" min={0} step={1} value={countedQty} onChange={(e) => setCountedQty(Number(e.target.value))} className="input" /></label>
          ) : (
            <label className="block"><span className="label">Quantity (negative to remove)</span>
              <input type="number" step={1} value={qty} onChange={(e) => setQty(Number(e.target.value))} className="input" /></label>
          )}

          <p className="text-sm">
            Adjustment:{' '}
            <span className={`font-bold ${delta > 0 ? 'text-emerald-600' : delta < 0 ? 'text-rose-600' : 'text-slate-400'}`}>
              {delta > 0 ? `+${delta}` : delta}
            </span>
            {product && delta !== 0 && <span className="text-slate-500"> → new balance {product.stockQty + delta}</span>}
          </p>

          <label className="block"><span className="label">Reason</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} required minLength={2} placeholder="Stock count, damaged, expired…" className="input" /></label>
          <p className="text-xs text-slate-500">
            Removing stock is valued at the current average cost; adding stock at that same cost. Use a purchase order when you are buying goods in.
          </p>
        </div>

        <div className="mt-5 flex gap-3">
          <button disabled={saving || delta === 0} className="btn-primary disabled:opacity-50">
            {saving ? <Loader2 size={16} className="animate-spin" /> : 'Post Adjustment'}
          </button>
          <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
        </div>
      </form>
    </div>
  );
}
