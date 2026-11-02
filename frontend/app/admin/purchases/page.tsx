'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, Loader2, Trash2, Search, X, PackageCheck, Send, Ban, ClipboardList, Wallet } from 'lucide-react';
import { adminApi, PurchaseOrder, PurchaseOrderInput, PoStatus, Supplier, AdminProduct } from '@/lib/adminApi';
import { formatKD } from '@/lib/money';

const STATUSES: PoStatus[] = ['DRAFT', 'ORDERED', 'PARTIAL', 'RECEIVED', 'CANCELLED'];
const STATUS_STYLE: Record<PoStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-600',
  ORDERED: 'bg-blue-100 text-blue-700',
  PARTIAL: 'bg-amber-100 text-amber-700',
  RECEIVED: 'bg-emerald-100 text-emerald-700',
  CANCELLED: 'bg-rose-100 text-rose-700',
};

export default function AdminPurchasesPage() {
  const [rows, setRows] = useState<PurchaseOrder[] | null>(null);
  const [status, setStatus] = useState<'' | PoStatus>('');
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [error, setError] = useState('');

  const load = () => adminApi.purchaseOrders(status, q).then(setRows).catch(() => setRows([]));
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, q]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold">Purchase Orders</h1>
          <p className="text-slate-500">{rows?.length ?? 0} orders</p>
        </div>
        <button onClick={() => { setCreating(true); setError(''); }} className="btn-primary"><Plus size={18} /> New PO</button>
      </div>

      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <div className="card flex min-w-[220px] flex-1 items-center gap-2 px-3 py-2">
          <Search size={16} className="text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search PO #, invoice ref or supplier…" className="w-full bg-transparent py-1 text-sm outline-none" />
        </div>
        <div className="flex flex-wrap gap-1">
          <button onClick={() => setStatus('')} className={`rounded-lg px-3 py-2 text-sm font-medium ${!status ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'}`}>All</button>
          {STATUSES.map((s) => (
            <button key={s} onClick={() => setStatus(s)} className={`rounded-lg px-3 py-2 text-sm font-medium ${status === s ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'}`}>
              {s.charAt(0) + s.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">PO #</th>
                <th className="px-4 py-3">Supplier</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Lines</th>
                <th className="px-4 py-3">Received</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {!rows ? (
                <tr><td colSpan={7} className="py-16 text-center text-slate-400"><Loader2 className="mx-auto animate-spin" /></td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={7} className="py-16 text-center text-slate-400">No purchase orders yet.</td></tr>
              ) : (
                rows.map((po) => {
                  const ordered = po.items.reduce((s, i) => s + i.quantity, 0);
                  const received = po.items.reduce((s, i) => s + i.receivedQty, 0);
                  return (
                    <tr key={po.id} onClick={() => setOpenId(po.id)} className="cursor-pointer hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 font-bold"><ClipboardList size={15} className="text-brand-600" /> {po.poNumber}</span>
                        {po.reference && <div className="text-xs text-slate-400">{po.reference}</div>}
                      </td>
                      <td className="px-4 py-3">{po.supplier?.name ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-500">{new Date(po.createdAt).toLocaleDateString()}</td>
                      <td className="px-4 py-3 text-slate-500">{po.items.length}</td>
                      <td className="px-4 py-3 text-slate-500">{received} / {ordered}</td>
                      <td className="px-4 py-3 text-right font-semibold">{formatKD(po.total)}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${STATUS_STYLE[po.status]}`}>{po.status}</span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {creating && <PoForm onClose={() => setCreating(false)} onSaved={() => { setCreating(false); load(); }} />}
      {openId != null && <PoDrawer id={openId} onClose={() => setOpenId(null)} onChanged={load} />}
    </div>
  );
}

// ---------- Create form ----------

type Line = { productId: number; quantity: number; unitCost: number };

function PoForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [form, setForm] = useState<Omit<PurchaseOrderInput, 'items'>>({
    supplierId: 0, status: 'ORDERED', reference: '', notes: '',
    currency: 'KWD', exchangeRate: 1,
    shipping: 0, customsDuty: 0, clearanceFee: 0, insurance: 0, otherCost: 0, expectedAt: null,
  });
  const [lines, setLines] = useState<Line[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    adminApi.suppliers('', true).then((s) => {
      setSuppliers(s);
      // Default the currency to whatever the chosen supplier invoices in.
      if (s[0]) setForm((f) => ({ ...f, supplierId: s[0].id, currency: s[0].currency || 'KWD' }));
    }).catch(() => setSuppliers([]));
    adminApi.products().then(setProducts).catch(() => setProducts([]));
  }, []);

  const set = (k: keyof typeof form, v: any) => setForm((f) => ({ ...f, [k]: v }));
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const addLine = () => {
    const used = new Set(lines.map((l) => l.productId));
    const next = products.find((p) => !used.has(p.id));
    if (!next) return;
    // Default the cost to what this product last cost us.
    setLines((ls) => [...ls, { productId: next.id, quantity: 1, unitCost: next.avgCost || next.costPrice }]);
  };
  const setLine = (i: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const removeLine = (i: number) => setLines((ls) => ls.filter((_, idx) => idx !== i));

  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unitCost, 0);
  const rate = Number(form.exchangeRate) || 1;
  const subtotalKwd = subtotal * rate;
  const landedTotal =
    Number(form.shipping || 0) + Number(form.customsDuty || 0) +
    Number(form.clearanceFee || 0) + Number(form.insurance || 0) + Number(form.otherCost || 0);
  const total = subtotalKwd + landedTotal;
  const foreign = (form.currency || 'KWD') !== 'KWD';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lines.length) return setError('Add at least one product');
    setSaving(true);
    setError('');
    try {
      await adminApi.createPurchaseOrder({
        ...form,
        reference: form.reference || null,
        notes: form.notes || null,
        expectedAt: form.expectedAt || null,
        items: lines,
      });
      onSaved();
    } catch (err: any) {
      setError(err.message || 'Could not create purchase order');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-extrabold">New Purchase Order</h2>
        {error && <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}

        <div className="grid gap-4 sm:grid-cols-4">
          <label className="block sm:col-span-2"><span className="label">Supplier</span>
            <select value={form.supplierId} onChange={(e) => set('supplierId', Number(e.target.value))} required className="input">
              {suppliers.length === 0 && <option value={0}>No active suppliers — add one first</option>}
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select></label>
          <label className="block"><span className="label">Supplier invoice ref</span>
            <input value={form.reference ?? ''} onChange={(e) => set('reference', e.target.value)} placeholder="INV-1234" className="input" /></label>
          <label className="block"><span className="label">Expected date</span>
            <input type="date" value={form.expectedAt ?? ''} onChange={(e) => set('expectedAt', e.target.value || null)} className="input" /></label>
          <label className="block"><span className="label">Supplier currency</span>
            <input value={form.currency} onChange={(e) => set('currency', e.target.value.toUpperCase())} maxLength={4} placeholder="KWD" className="input font-mono uppercase" /></label>
          <label className="block"><span className="label">Exchange rate (KWD per 1 {form.currency || 'KWD'})</span>
            <input type="number" min={0} step="0.000001" value={form.exchangeRate} onChange={(e) => set('exchangeRate', Number(e.target.value))} disabled={!foreign} className="input disabled:opacity-60" />
            {foreign && <span className="mt-1 block text-xs text-slate-500">Locked on this order and used when the goods are received.</span>}</label>
        </div>

        {/* Lines */}
        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <span className="label">Products</span>
            <button type="button" onClick={addLine} className="btn-ghost text-sm"><Plus size={15} /> Add line</button>
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Product</th>
                  <th className="w-28 px-3 py-2">Qty</th>
                  <th className="w-36 px-3 py-2">Unit cost</th>
                  <th className="w-32 px-3 py-2 text-right">Line total</th>
                  <th className="w-10 px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lines.length === 0 ? (
                  <tr><td colSpan={5} className="py-8 text-center text-slate-400">No lines yet — add a product.</td></tr>
                ) : lines.map((l, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2">
                      <select value={l.productId} onChange={(e) => {
                        const p = byId.get(Number(e.target.value));
                        setLine(i, { productId: Number(e.target.value), unitCost: p ? (p.avgCost || p.costPrice) : l.unitCost });
                      }} className="input py-1.5">
                        {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                      </select>
                      <div className="mt-0.5 text-xs text-slate-400">In stock: {byId.get(l.productId)?.stockQty ?? 0}</div>
                    </td>
                    <td className="px-3 py-2">
                      <input type="number" min={1} step={1} value={l.quantity} onChange={(e) => setLine(i, { quantity: Number(e.target.value) })} className="input py-1.5" /></td>
                    <td className="px-3 py-2">
                      <input type="number" min={0} step="0.001" value={l.unitCost} onChange={(e) => setLine(i, { unitCost: Number(e.target.value) })} className="input py-1.5" /></td>
                    <td className="px-3 py-2 text-right font-semibold">{formatKD(l.quantity * l.unitCost)}</td>
                    <td className="px-3 py-2">
                      <button type="button" onClick={() => removeLine(i)} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-rose-50 hover:text-rose-600"><Trash2 size={15} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Costs */}
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="space-y-3">
            <span className="label">Landed costs (always in KD)</span>
            <div className="grid grid-cols-2 gap-3">
              <label className="block"><span className="label">Freight</span>
                <input type="number" min={0} step="0.001" value={form.shipping} onChange={(e) => set('shipping', Number(e.target.value))} className="input" /></label>
              <label className="block"><span className="label">Customs duty</span>
                <input type="number" min={0} step="0.001" value={form.customsDuty} onChange={(e) => set('customsDuty', Number(e.target.value))} className="input" /></label>
              <label className="block"><span className="label">Clearance</span>
                <input type="number" min={0} step="0.001" value={form.clearanceFee} onChange={(e) => set('clearanceFee', Number(e.target.value))} className="input" /></label>
              <label className="block"><span className="label">Insurance</span>
                <input type="number" min={0} step="0.001" value={form.insurance} onChange={(e) => set('insurance', Number(e.target.value))} className="input" /></label>
              <label className="col-span-2 block"><span className="label">Other</span>
                <input type="number" min={0} step="0.001" value={form.otherCost} onChange={(e) => set('otherCost', Number(e.target.value))} className="input" /></label>
            </div>
            <p className="text-xs text-slate-500">
              These are paid locally to freight agents and customs, not to the supplier. They are spread
              across the lines by value, so each unit is stocked at its true landed cost.
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 p-4 text-sm">
            <div className="flex justify-between py-1">
              <span className="text-slate-500">Goods ({form.currency || 'KWD'})</span>
              <span className="font-semibold tabular-nums">{subtotal.toFixed(3)}</span>
            </div>
            {foreign && (
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Goods in KD @ {rate}</span>
                <span className="tabular-nums">{formatKD(subtotalKwd)}</span>
              </div>
            )}
            <div className="mt-1 border-t border-slate-200 pt-1">
              <div className="flex justify-between py-0.5"><span className="text-slate-500">Freight</span><span className="tabular-nums">{formatKD(Number(form.shipping || 0))}</span></div>
              <div className="flex justify-between py-0.5"><span className="text-slate-500">Customs duty</span><span className="tabular-nums">{formatKD(Number(form.customsDuty || 0))}</span></div>
              <div className="flex justify-between py-0.5"><span className="text-slate-500">Clearance</span><span className="tabular-nums">{formatKD(Number(form.clearanceFee || 0))}</span></div>
              <div className="flex justify-between py-0.5"><span className="text-slate-500">Insurance</span><span className="tabular-nums">{formatKD(Number(form.insurance || 0))}</span></div>
              <div className="flex justify-between py-0.5"><span className="text-slate-500">Other</span><span className="tabular-nums">{formatKD(Number(form.otherCost || 0))}</span></div>
              <div className="flex justify-between py-1 font-semibold"><span>Landed costs</span><span className="tabular-nums">{formatKD(landedTotal)}</span></div>
            </div>
            <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-base font-extrabold"><span>Total (KD)</span><span className="tabular-nums">{formatKD(total)}</span></div>
          </div>
        </div>

        <label className="mt-4 block"><span className="label">Notes</span>
          <textarea value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} rows={2} className="input" /></label>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button disabled={saving || !form.supplierId} className="btn-primary">
            {saving ? <Loader2 size={16} className="animate-spin" /> : 'Create Purchase Order'}
          </button>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.status === 'DRAFT'} onChange={(e) => set('status', e.target.checked ? 'DRAFT' : 'ORDERED')} className="h-4 w-4" />
            Save as draft
          </label>
          <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
        </div>
      </form>
    </div>
  );
}

/** Settle what is owed on received goods. Posts Dr Accounts Payable / Cr Cash or Bank. */
function PaySupplier({ po, busy, onPay }: { po: PurchaseOrder; busy: boolean; onPay: (amount: number, method: 'CASH' | 'BANK') => void }) {
  // The supplier is owed the GOODS only, converted to KWD. Freight and customs
  // are owed to other parties and settled in the panel below.
  const billed = Math.round(po.items.reduce((s, i) => s + i.unitCost * po.exchangeRate * i.receivedQty, 0) * 1000) / 1000;
  const outstanding = Math.round((billed - po.amountPaid) * 1000) / 1000;

  const [amount, setAmount] = useState(outstanding);
  const [method, setMethod] = useState<'CASH' | 'BANK'>('BANK');
  useEffect(() => { setAmount(outstanding); }, [outstanding]);

  if (outstanding <= 0) {
    return (
      <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">
        Fully paid — nothing outstanding on this order.
      </div>
    );
  }

  return (
    <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50/50 p-4">
      <h3 className="mb-1 font-bold">Pay supplier</h3>
      <p className="mb-3 text-xs text-slate-500">
        Received value {formatKD(billed)} · paid {formatKD(po.amountPaid)} · <strong>outstanding {formatKD(outstanding)}</strong>
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="block"><span className="label">Amount</span>
          <input type="number" min={0} max={outstanding} step="0.001" value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="input w-36" /></label>
        <label className="block"><span className="label">From</span>
          <select value={method} onChange={(e) => setMethod(e.target.value as 'CASH' | 'BANK')} className="input w-32">
            <option value="BANK">Bank</option>
            <option value="CASH">Cash</option>
          </select></label>
        <button onClick={() => onPay(amount, method)} disabled={busy || amount <= 0 || amount > outstanding} className="btn-primary disabled:opacity-40">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <><Wallet size={16} /> Record Payment</>}
        </button>
      </div>
    </div>
  );
}

/** Settle freight, customs and clearance with the third parties who charged them. */
function PayLanded({ po, busy, onPay }: { po: PurchaseOrder; busy: boolean; onPay: (amount: number, method: 'CASH' | 'BANK') => void }) {
  // Landed costs accrue in proportion to what has actually arrived.
  const orderedValue = po.items.reduce((s, i) => s + i.lineTotal, 0);
  const receivedValue = po.items.reduce((s, i) => s + i.unitCost * i.receivedQty, 0);
  const billed = orderedValue > 0 ? Math.round((po.landedTotal * receivedValue) / orderedValue * 1000) / 1000 : 0;
  const outstanding = Math.round((billed - po.landedPaid) * 1000) / 1000;

  const [amount, setAmount] = useState(outstanding);
  const [method, setMethod] = useState<'CASH' | 'BANK'>('BANK');
  useEffect(() => { setAmount(outstanding); }, [outstanding]);

  if (po.landedTotal <= 0) return null;
  if (outstanding <= 0) {
    return (
      <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">
        Landed costs fully settled.
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50/50 p-4">
      <h3 className="mb-1 font-bold">Pay freight &amp; customs</h3>
      <p className="mb-3 text-xs text-slate-500">
        Owed to freight agents and customs, not to the supplier · accrued {formatKD(billed)} ·
        paid {formatKD(po.landedPaid)} · <strong>outstanding {formatKD(outstanding)}</strong>
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="block"><span className="label">Amount</span>
          <input type="number" min={0} max={outstanding} step="0.001" value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="input w-36" /></label>
        <label className="block"><span className="label">From</span>
          <select value={method} onChange={(e) => setMethod(e.target.value as 'CASH' | 'BANK')} className="input w-32">
            <option value="BANK">Bank</option>
            <option value="CASH">Cash</option>
          </select></label>
        <button onClick={() => onPay(amount, method)} disabled={busy || amount <= 0 || amount > outstanding} className="btn-primary disabled:opacity-40">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <><Wallet size={16} /> Record Payment</>}
        </button>
      </div>
    </div>
  );
}
// ---------- Detail + receive drawer ----------

function PoDrawer({ id, onClose, onChanged }: { id: number; onClose: () => void; onChanged: () => void }) {
  const [po, setPo] = useState<PurchaseOrder | null>(null);
  const [receipt, setReceipt] = useState<Record<number, number>>({});
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = () =>
    adminApi.purchaseOrder(id).then((p) => {
      setPo(p);
      setReference(p.reference ?? '');
      // Default every line to whatever is still outstanding.
      setReceipt(Object.fromEntries(p.items.map((i) => [i.id, i.quantity - i.receivedQty])));
    });
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  const canReceive = po ? ['ORDERED', 'PARTIAL'].includes(po.status) : false;
  const canEditStatus = po ? !['RECEIVED', 'CANCELLED'].includes(po.status) : false;
  const nothingReceived = po ? po.items.every((i) => i.receivedQty === 0) : false;

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      await load();
      onChanged();
    } catch (e: any) {
      setError(e.message || 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  const receive = () => {
    const lines = Object.entries(receipt)
      .map(([itemId, qty]) => ({ itemId: Number(itemId), qty: Number(qty) }))
      .filter((l) => l.qty > 0);
    if (!lines.length) return setError('Enter a quantity to receive');
    return act(() => adminApi.receivePurchaseOrder(id, lines, reference || null));
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="h-full w-full max-w-2xl overflow-y-auto bg-white p-6 shadow-xl">
        {!po ? (
          <div className="grid h-full place-items-center text-slate-400"><Loader2 className="animate-spin" /></div>
        ) : (
          <>
            <div className="mb-5 flex items-start justify-between">
              <div>
                <h2 className="text-xl font-extrabold">{po.poNumber}</h2>
                <p className="text-sm text-slate-500">
                  {po.supplier?.name} · {new Date(po.createdAt).toLocaleDateString()}
                  {po.createdByEmail && ` · by ${po.createdByEmail}`}
                </p>
                <span className={`mt-2 inline-block rounded-md px-2 py-0.5 text-xs font-bold ${STATUS_STYLE[po.status]}`}>{po.status}</span>
              </div>
              <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-slate-100"><X size={18} /></button>
            </div>

            {error && <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Product</th>
                    <th className="px-3 py-2">Ordered</th>
                    <th className="px-3 py-2">Received</th>
                    <th className="px-3 py-2 text-right">Unit cost</th>
                    {canReceive && <th className="w-28 px-3 py-2">Receive now</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {po.items.map((it) => {
                    const remaining = it.quantity - it.receivedQty;
                    return (
                      <tr key={it.id}>
                        <td className="px-3 py-2">
                          <div className="font-medium">{it.name}</div>
                          <div className="text-xs text-slate-400">{it.sku}</div>
                        </td>
                        <td className="px-3 py-2">{it.quantity}</td>
                        <td className="px-3 py-2">
                          <span className={remaining === 0 ? 'font-semibold text-emerald-600' : ''}>{it.receivedQty}</span>
                          {remaining > 0 && <span className="text-xs text-slate-400"> ({remaining} left)</span>}
                        </td>
                        <td className="px-3 py-2 text-right">{formatKD(it.unitCost)}</td>
                        {canReceive && (
                          <td className="px-3 py-2">
                            <input
                              type="number" min={0} max={remaining} step={1}
                              value={receipt[it.id] ?? 0}
                              onChange={(e) => setReceipt((r) => ({ ...r, [it.id]: Math.max(0, Math.min(remaining, Number(e.target.value))) }))}
                              disabled={remaining === 0}
                              className="input py-1.5 disabled:bg-slate-100"
                            />
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm">
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Goods ({po.currency})</span>
                <span className="tabular-nums">{po.subtotal.toFixed(3)}</span>
              </div>
              {po.currency !== 'KWD' && (
                <div className="flex justify-between py-1">
                  <span className="text-slate-500">Goods in KD @ {po.exchangeRate}</span>
                  <span className="tabular-nums">{formatKD(po.subtotalKwd)}</span>
                </div>
              )}
              <div className="mt-1 border-t border-slate-200 pt-1">
                <div className="flex justify-between py-0.5"><span className="text-slate-500">Freight</span><span className="tabular-nums">{formatKD(po.shipping)}</span></div>
                <div className="flex justify-between py-0.5"><span className="text-slate-500">Customs duty</span><span className="tabular-nums">{formatKD(po.customsDuty)}</span></div>
                <div className="flex justify-between py-0.5"><span className="text-slate-500">Clearance</span><span className="tabular-nums">{formatKD(po.clearanceFee)}</span></div>
                <div className="flex justify-between py-0.5"><span className="text-slate-500">Insurance</span><span className="tabular-nums">{formatKD(po.insurance)}</span></div>
                <div className="flex justify-between py-0.5"><span className="text-slate-500">Other</span><span className="tabular-nums">{formatKD(po.otherCost)}</span></div>
                <div className="flex justify-between py-1 font-semibold"><span>Landed costs</span><span className="tabular-nums">{formatKD(po.landedTotal)}</span></div>
              </div>
              <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-base font-extrabold"><span>Total (KD)</span><span className="tabular-nums">{formatKD(po.total)}</span></div>
              {(po.amountPaid > 0 || po.landedPaid > 0) && (
                <div className="mt-2 space-y-0.5 border-t border-slate-200 pt-2">
                  {po.amountPaid > 0 && (
                    <div className="flex justify-between"><span className="text-slate-500">Paid to supplier</span><span className="font-semibold text-emerald-600 tabular-nums">{formatKD(po.amountPaid)}</span></div>
                  )}
                  {po.landedPaid > 0 && (
                    <div className="flex justify-between"><span className="text-slate-500">Landed costs paid</span><span className="font-semibold text-emerald-600 tabular-nums">{formatKD(po.landedPaid)}</span></div>
                  )}
                </div>
              )}
            </div>

            {['PARTIAL', 'RECEIVED'].includes(po.status) && (
              <>
                <PaySupplier po={po} busy={busy} onPay={(amount, method) => act(() => adminApi.paySupplier(po.id, amount, method))} />
                <PayLanded po={po} busy={busy} onPay={(amount, method) => act(() => adminApi.payLandedCosts(po.id, amount, method))} />
              </>
            )}

            {po.notes && <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">{po.notes}</p>}

            {canReceive && (
              <div className="mt-5 rounded-xl border border-brand-200 bg-brand-50/40 p-4">
                <h3 className="mb-3 font-bold">Receive goods</h3>
                <label className="mb-3 block"><span className="label">Supplier invoice ref</span>
                  <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="INV-1234" className="input" /></label>
                <p className="mb-3 text-xs text-slate-500">
                  Receiving adds the quantities above to stock and updates each product&apos;s weighted-average cost,
                  including a share of the freight and other costs on this order.
                </p>
                <button onClick={receive} disabled={busy} className="btn-primary">
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <><PackageCheck size={17} /> Receive into stock</>}
                </button>
              </div>
            )}

            <div className="mt-5 flex flex-wrap gap-2">
              {po.status === 'DRAFT' && (
                <button onClick={() => act(() => adminApi.setPurchaseOrderStatus(id, 'ORDERED'))} disabled={busy} className="btn-ghost">
                  <Send size={15} /> Mark as ordered
                </button>
              )}
              {canEditStatus && nothingReceived && (
                <button onClick={() => { if (confirm('Cancel this purchase order?')) act(() => adminApi.setPurchaseOrderStatus(id, 'CANCELLED')); }} disabled={busy} className="btn-ghost text-rose-600">
                  <Ban size={15} /> Cancel PO
                </button>
              )}
              {po.status === 'DRAFT' && (
                <button onClick={() => { if (confirm('Delete this draft?')) act(async () => { await adminApi.deletePurchaseOrder(id); onClose(); }); }} disabled={busy} className="btn-ghost text-rose-600">
                  <Trash2 size={15} /> Delete draft
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
