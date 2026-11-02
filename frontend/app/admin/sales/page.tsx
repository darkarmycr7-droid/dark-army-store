'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Loader2, Save, X, Trash2, Plus, Check, Truck, FileText, Wallet, Ban,
  FileSignature, Package, Receipt,
} from 'lucide-react';
import {
  adminApi, SalesOrder, SalesOrderInput, SoState, Partner, AdminProduct,
} from '@/lib/adminApi';
import { formatKD } from '@/lib/money';
import ViewShell, { SmartButton, Notebook, StatusBar, ViewMode } from '@/components/odoo/ViewShell';
import Chatter from '@/components/odoo/Chatter';

const FILTERS = [
  { key: 'quotations', label: 'Quotations' },
  { key: 'orders', label: 'Sales Orders' },
  { key: 'toDeliver', label: 'To Deliver' },
  { key: 'toInvoice', label: 'To Invoice' },
  { key: 'cancelled', label: 'Cancelled' },
];
const GROUPS = [
  { key: 'state', label: 'Status' },
  { key: 'partner', label: 'Customer' },
];
const STAGES = [
  { key: 'DRAFT', label: 'Quotation' },
  { key: 'SALE', label: 'Sales Order' },
  { key: 'DONE', label: 'Done' },
];
const STATE_STYLE: Record<SoState, string> = {
  DRAFT: 'bg-slate-100 text-slate-600',
  SENT: 'bg-sky-100 text-sky-700',
  SALE: 'bg-brand-100 text-brand-700',
  DONE: 'bg-emerald-100 text-emerald-700',
  CANCELLED: 'bg-rose-100 text-rose-700',
};
const PAGE = 40;

export default function SalesPage() {
  const [rows, setRows] = useState<SalesOrder[] | null>(null);
  const [total, setTotal] = useState(0);
  const [groups, setGroups] = useState<{ key: string; label: string; count: number }[] | undefined>();
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState<string[]>([]);
  const [groupBy, setGroupBy] = useState('');
  const [view, setView] = useState<ViewMode>('list');
  const [skip, setSkip] = useState(0);
  const [openId, setOpenId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    adminApi
      .salesOrders({ q, filters, groupBy, skip, limit: PAGE })
      .then((d) => { setRows(d.rows); setTotal(d.total); setGroups(d.groups); })
      .catch(() => { setRows([]); setTotal(0); });
  }, [q, filters, groupBy, skip]);

  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);
  useEffect(() => { setSkip(0); }, [q, filters, groupBy]);

  if (creating || openId != null) {
    return <SalesForm id={openId} onClose={() => { setCreating(false); setOpenId(null); load(); }} />;
  }

  return (
    <ViewShell
      title="Sales"
      onNew={() => setCreating(true)}
      newLabel="New Quotation"
      search={q}
      onSearch={setQ}
      searchPlaceholder="Search order #, customer, their reference…"
      filters={FILTERS}
      activeFilters={filters}
      onToggleFilter={(k) => setFilters((f) => (f.includes(k) ? f.filter((x) => x !== k) : [...f, k]))}
      groups={GROUPS}
      activeGroup={groupBy}
      onGroup={setGroupBy}
      view={view}
      onView={setView}
      skip={skip}
      take={PAGE}
      total={total}
      onPage={setSkip}
    >
      {groups && (
        <div className="flex flex-wrap gap-2">
          {groups.map((g) => (
            <span key={g.key} className="rounded-lg bg-white px-3 py-1.5 text-sm shadow-sm">
              <span className="font-semibold">{g.label}</span>
              <span className="ml-2 rounded bg-slate-100 px-1.5 text-xs font-bold text-slate-600">{g.count}</span>
            </span>
          ))}
        </div>
      )}

      {!rows ? (
        <div className="grid place-items-center py-24 text-slate-400"><Loader2 className="animate-spin" /></div>
      ) : rows.length === 0 ? (
        <div className="card grid place-items-center py-24 text-slate-400">No quotations or orders yet.</div>
      ) : view === 'kanban' ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {rows.map((o) => (
            <button key={o.id} onClick={() => setOpenId(o.id)} className="card p-4 text-left transition hover:shadow-md">
              <div className="flex items-center justify-between">
                <span className="font-mono font-bold">{o.name}</span>
                <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${STATE_STYLE[o.state]}`}>{o.state}</span>
              </div>
              <div className="mt-1 truncate text-sm font-semibold">{o.partnerName}</div>
              <div className="text-xs text-slate-400">{new Date(o.dateOrder).toLocaleDateString()}</div>
              <div className="mt-2 text-lg font-extrabold">{formatKD(o.amountTotal)}</div>
              {o.amountDue > 0 && <div className="text-xs text-rose-600">Due {formatKD(o.amountDue)}</div>}
            </button>
          ))}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Number</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Delivery</th>
                  <th className="px-4 py-3">Invoice</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-right">Due</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((o) => (
                  <tr key={o.id} onClick={() => setOpenId(o.id)} className="cursor-pointer hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono font-bold">{o.name}</td>
                    <td className="px-4 py-3">{o.partnerName}</td>
                    <td className="px-4 py-3 text-slate-500">{new Date(o.dateOrder).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-slate-500">{o.deliveryStatus}</td>
                    <td className="px-4 py-3 text-slate-500">{o.invoiceStatus.replace('_', ' ')}</td>
                    <td className="px-4 py-3 text-right font-semibold">{formatKD(o.amountTotal)}</td>
                    <td className={`px-4 py-3 text-right ${o.amountDue > 0 ? 'font-bold text-rose-600' : 'text-slate-400'}`}>
                      {o.amountDue > 0 ? formatKD(o.amountDue) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${STATE_STYLE[o.state]}`}>{o.state}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </ViewShell>
  );
}

// ---------- Form view ----------

type DraftLine = { productId: number; quantity: number; unitPrice: number; discount: number };

function SalesForm({ id, onClose }: { id: number | null; onClose: () => void }) {
  const [so, setSo] = useState<SalesOrder | null>(null);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [form, setForm] = useState<Omit<SalesOrderInput, 'lines'>>({
    partnerId: 0, customerRef: '', paymentTerms: 'CASH', validityDate: null, note: '',
  });
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);

  const editable = !so || ['DRAFT', 'SENT'].includes(so.state);

  const reload = useCallback(async () => {
    if (id == null) return;
    const d = await adminApi.salesOrder(id);
    setSo(d);
    setForm({
      partnerId: d.partnerId,
      customerRef: d.customerRef ?? '',
      paymentTerms: d.paymentTerms,
      validityDate: d.validityDate ? d.validityDate.slice(0, 10) : null,
      note: d.note ?? '',
    });
    setLines(d.lines.map((l) => ({ productId: l.productId, quantity: l.quantity, unitPrice: l.unitPrice, discount: l.discount })));
    setDirty(false);
  }, [id]);

  useEffect(() => {
    adminApi.partners({ filters: ['customers'], limit: 200 }).then((d) => {
      setPartners(d.rows);
      if (id == null && d.rows[0]) setForm((f) => ({ ...f, partnerId: d.rows[0].id }));
    }).catch(() => setPartners([]));
    adminApi.products().then(setProducts).catch(() => setProducts([]));
    reload().catch((e) => setError(e.message));
  }, [id, reload]);

  const set = (k: keyof typeof form, v: any) => { setForm((f) => ({ ...f, [k]: v })); setDirty(true); };
  const setLine = (i: number, patch: Partial<DraftLine>) => {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
    setDirty(true);
  };
  const addLine = () => {
    const p = products[0];
    if (!p) return;
    setLines((ls) => [...ls, { productId: p.id, quantity: 1, unitPrice: p.sellingPrice, discount: 0 }]);
    setDirty(true);
  };

  const untaxed = lines.reduce((s, l) => s + l.quantity * l.unitPrice * (1 - l.discount / 100), 0);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      await reload();
    } catch (e: any) {
      setError(e.message || 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    act(async () => {
      const payload = { ...form, validityDate: form.validityDate || null, lines };
      if (id == null) {
        const created = await adminApi.createSalesOrder(payload);
        setSo(created);
        onClose();
      } else {
        await adminApi.updateSalesOrder(id, payload);
      }
    });

  if (id != null && !so) {
    return <div className="grid place-items-center py-24 text-slate-400"><Loader2 className="animate-spin" /></div>;
  }

  const stageKey = so ? (so.state === 'SENT' ? 'DRAFT' : so.state) : 'DRAFT';
  const undelivered = so?.lines.some((l) => l.deliveredQty < l.quantity);

  return (
    <ViewShell title="Sales" breadcrumb={so ? so.name : 'New Quotation'} onBack={onClose} search="" onSearch={() => {}}>
      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-2">
        {editable && (
          <button onClick={save} disabled={busy || (!dirty && id != null) || !lines.length} className="btn-primary disabled:opacity-40">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <><Save size={16} /> Save</>}
          </button>
        )}
        {so && ['DRAFT', 'SENT'].includes(so.state) && (
          <button onClick={() => act(() => adminApi.confirmSalesOrder(so.id))} disabled={busy} className="btn-primary">
            <Check size={16} /> Confirm
          </button>
        )}
        {so?.state === 'SALE' && undelivered && (
          <button onClick={() => act(() => adminApi.deliverSalesOrder(so.id, so.lines.filter((l) => l.deliveredQty < l.quantity).map((l) => ({ lineId: l.id, qty: l.quantity - l.deliveredQty }))))} disabled={busy} className="btn-ghost">
            <Truck size={16} /> Deliver All
          </button>
        )}
        {so?.state === 'SALE' && so.invoiceStatus === 'TO_INVOICE' && (
          <button onClick={() => act(() => adminApi.invoiceSalesOrder(so.id))} disabled={busy} className="btn-ghost">
            <FileText size={16} /> Create Invoice
          </button>
        )}
        {so && so.invoiceStatus === 'INVOICED' && so.amountDue > 0 && (
          <RegisterPayment so={so} busy={busy} onPay={(a, m) => act(() => adminApi.paySalesOrder(so.id, a, m))} />
        )}
        <button onClick={onClose} className="btn-ghost"><X size={16} /> Close</button>
        {so && !['CANCELLED', 'DONE'].includes(so.state) && (
          <button
            onClick={() => { const r = prompt('Reason for cancelling?'); if (r !== null) act(() => adminApi.cancelSalesOrder(so.id, r || undefined)); }}
            disabled={busy}
            className="btn-ghost ml-auto text-rose-600"
          ><Ban size={15} /> Cancel</button>
        )}
      </div>

      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}

      <div className="card p-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <h2 className="font-mono text-2xl font-extrabold">{so ? so.name : 'New Quotation'}</h2>
          <div className="space-y-2">
            <StatusBar stages={STAGES} current={stageKey} />
            {so && (
              <div className="flex flex-wrap justify-end gap-2">
                <SmartButton Icon={Package} label="Delivery" value={so.deliveryStatus} />
                <SmartButton Icon={Receipt} label="Invoiced" value={formatKD(so.amountInvoiced)} />
                <SmartButton Icon={Wallet} label="Paid" value={formatKD(so.amountPaid)} />
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block sm:col-span-2"><span className="label">Customer</span>
            <select value={form.partnerId} onChange={(e) => set('partnerId', Number(e.target.value))} disabled={!editable} className="input disabled:bg-slate-100">
              {partners.length === 0 && <option value={0}>No customers — add a contact first</option>}
              {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select></label>
          <label className="block"><span className="label">Customer Reference</span>
            <input value={form.customerRef ?? ''} onChange={(e) => set('customerRef', e.target.value)} disabled={!editable} placeholder="Their PO number" className="input disabled:bg-slate-100" /></label>
          <label className="block"><span className="label">Payment Terms</span>
            <select value={form.paymentTerms} onChange={(e) => set('paymentTerms', e.target.value)} disabled={!editable} className="input disabled:bg-slate-100">
              {['CASH', 'NET7', 'NET15', 'NET30'].map((t) => <option key={t} value={t}>{t}</option>)}
            </select></label>
        </div>

        <div className="mt-6">
          <Notebook
            tabs={[
              {
                label: 'Order Lines',
                content: (
                  <>
                    <div className="overflow-x-auto rounded-xl border border-slate-200">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                          <tr>
                            <th className="px-3 py-2">Product</th>
                            <th className="w-24 px-3 py-2">Qty</th>
                            {so && <th className="w-24 px-3 py-2">Delivered</th>}
                            <th className="w-32 px-3 py-2">Unit Price</th>
                            <th className="w-24 px-3 py-2">Disc %</th>
                            <th className="w-32 px-3 py-2 text-right">Subtotal</th>
                            {editable && <th className="w-10 px-3 py-2"></th>}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {lines.length === 0 ? (
                            <tr><td colSpan={7} className="py-8 text-center text-slate-400">No lines yet.</td></tr>
                          ) : lines.map((l, i) => {
                            const saved = so?.lines[i];
                            const sub = l.quantity * l.unitPrice * (1 - l.discount / 100);
                            return (
                              <tr key={i}>
                                <td className="px-3 py-2">
                                  {editable ? (
                                    <select value={l.productId} onChange={(e) => {
                                      const p = products.find((x) => x.id === Number(e.target.value));
                                      setLine(i, { productId: Number(e.target.value), unitPrice: p ? p.sellingPrice : l.unitPrice });
                                    }} className="input py-1.5">
                                      {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                                    </select>
                                  ) : (
                                    <span className="font-medium">{saved?.name}<span className="block text-xs text-slate-400">{saved?.sku}</span></span>
                                  )}
                                </td>
                                <td className="px-3 py-2">
                                  {editable ? <input type="number" min={1} value={l.quantity} onChange={(e) => setLine(i, { quantity: Number(e.target.value) })} className="input py-1.5" /> : l.quantity}
                                </td>
                                {so && <td className="px-3 py-2"><span className={saved && saved.deliveredQty >= saved.quantity ? 'font-semibold text-emerald-600' : ''}>{saved?.deliveredQty ?? 0}</span></td>}
                                <td className="px-3 py-2">
                                  {editable ? <input type="number" min={0} step="0.001" value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: Number(e.target.value) })} className="input py-1.5" /> : formatKD(l.unitPrice)}
                                </td>
                                <td className="px-3 py-2">
                                  {editable ? <input type="number" min={0} max={100} step="0.1" value={l.discount} onChange={(e) => setLine(i, { discount: Number(e.target.value) })} className="input py-1.5" /> : `${l.discount}%`}
                                </td>
                                <td className="px-3 py-2 text-right font-semibold">{formatKD(sub)}</td>
                                {editable && (
                                  <td className="px-3 py-2">
                                    <button onClick={() => { setLines((ls) => ls.filter((_, x) => x !== i)); setDirty(true); }} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={15} /></button>
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {editable && <button onClick={addLine} className="btn-ghost mt-2 text-sm"><Plus size={15} /> Add a product</button>}

                    <div className="mt-4 flex justify-end">
                      <div className="w-full max-w-xs space-y-1 text-sm">
                        <div className="flex justify-between"><span className="text-slate-500">Untaxed</span><span className="font-semibold">{formatKD(so ? so.amountUntaxed : untaxed)}</span></div>
                        {so && so.amountTax > 0 && <div className="flex justify-between"><span className="text-slate-500">Tax</span><span>{formatKD(so.amountTax)}</span></div>}
                        <div className="flex justify-between border-t border-slate-200 pt-1 text-lg font-extrabold"><span>Total</span><span>{formatKD(so ? so.amountTotal : untaxed)}</span></div>
                        {so && so.amountDue > 0 && <div className="flex justify-between font-bold text-rose-600"><span>Amount Due</span><span>{formatKD(so.amountDue)}</span></div>}
                      </div>
                    </div>
                  </>
                ),
              },
              {
                label: 'Other Info',
                content: (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block"><span className="label">Quotation Validity</span>
                      <input type="date" value={form.validityDate ?? ''} onChange={(e) => set('validityDate', e.target.value || null)} disabled={!editable} className="input disabled:bg-slate-100" /></label>
                    <div><span className="label">Salesperson</span><p className="pt-2 text-sm text-slate-600">{so?.salespersonEmail || '—'}</p></div>
                    <label className="block sm:col-span-2"><span className="label">Terms &amp; Notes</span>
                      <textarea value={form.note ?? ''} onChange={(e) => set('note', e.target.value)} disabled={!editable} rows={4} className="input disabled:bg-slate-100" /></label>
                  </div>
                ),
              },
            ]}
          />
        </div>
      </div>

      {so && (
        <Chatter load={() => adminApi.salesOrderMessages(so.id)} post={(b) => adminApi.postSalesOrderMessage(so.id, b)} />
      )}
    </ViewShell>
  );
}

function RegisterPayment({ so, busy, onPay }: { so: SalesOrder; busy: boolean; onPay: (amount: number, method: 'CASH' | 'BANK') => void }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(so.amountDue);
  const [method, setMethod] = useState<'CASH' | 'BANK'>('BANK');
  useEffect(() => { setAmount(so.amountDue); }, [so.amountDue]);

  if (!open) {
    return <button onClick={() => setOpen(true)} className="btn-ghost"><Wallet size={16} /> Register Payment</button>;
  }
  return (
    <span className="flex items-end gap-2 rounded-xl border border-emerald-200 bg-emerald-50/60 p-2">
      <label className="block"><span className="label">Amount</span>
        <input type="number" min={0} max={so.amountDue} step="0.001" value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="input w-32 py-1.5" /></label>
      <label className="block"><span className="label">To</span>
        <select value={method} onChange={(e) => setMethod(e.target.value as 'CASH' | 'BANK')} className="input w-28 py-1.5">
          <option value="BANK">Bank</option><option value="CASH">Cash</option>
        </select></label>
      <button onClick={() => { onPay(amount, method); setOpen(false); }} disabled={busy || amount <= 0} className="btn-primary py-1.5 disabled:opacity-40">
        <FileSignature size={15} /> Post
      </button>
      <button onClick={() => setOpen(false)} className="btn-ghost py-1.5"><X size={15} /></button>
    </span>
  );
}
