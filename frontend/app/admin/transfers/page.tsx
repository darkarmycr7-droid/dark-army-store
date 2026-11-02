'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Loader2, Save, X, Trash2, Plus, Send, PackageCheck, Ban, ArrowRight, Truck,
} from 'lucide-react';
import {
  adminApi, StockTransfer, TransferInput, TransferState, Warehouse, AdminProduct,
} from '@/lib/adminApi';
import ViewShell, { StatusBar, Notebook, ViewMode } from '@/components/odoo/ViewShell';

const FILTERS = [
  { key: 'draft', label: 'Draft' },
  { key: 'inTransit', label: 'In Transit' },
  { key: 'done', label: 'Done' },
  { key: 'cancelled', label: 'Cancelled' },
];
const GROUPS = [{ key: 'state', label: 'Status' }];
const STAGES = [
  { key: 'DRAFT', label: 'Draft' },
  { key: 'SENT', label: 'In Transit' },
  { key: 'DONE', label: 'Done' },
];
const STATE_STYLE: Record<TransferState, string> = {
  DRAFT: 'bg-odoo-raised text-odoo-dim',
  SENT: 'bg-odoo-warn/20 text-odoo-warn',
  DONE: 'bg-odoo-ok/20 text-odoo-ok',
  CANCELLED: 'bg-odoo-bad/20 text-odoo-bad',
};
const PAGE = 40;

export default function TransfersPage() {
  const [rows, setRows] = useState<StockTransfer[] | null>(null);
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
      .transfers({ q, filters, groupBy, skip, limit: PAGE })
      .then((d) => { setRows(d.rows); setTotal(d.total); setGroups(d.groups); })
      .catch(() => { setRows([]); setTotal(0); });
  }, [q, filters, groupBy, skip]);

  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);
  useEffect(() => { setSkip(0); }, [q, filters, groupBy]);

  if (creating || openId != null) {
    return <TransferForm id={openId} onClose={() => { setCreating(false); setOpenId(null); load(); }} />;
  }

  return (
    <ViewShell
      title="Transfers"
      onNew={() => setCreating(true)}
      newLabel="New Transfer"
      search={q}
      onSearch={setQ}
      searchPlaceholder="Search reference or warehouse…"
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
            <span key={g.key} className="rounded border border-odoo-line bg-odoo-surface px-3 py-1.5 text-[13px]">
              {g.label} <span className="ml-1 rounded bg-odoo-raised px-1.5 text-xs font-bold">{g.count}</span>
            </span>
          ))}
        </div>
      )}

      {!rows ? (
        <div className="grid place-items-center py-24 text-odoo-faint"><Loader2 className="animate-spin" /></div>
      ) : rows.length === 0 ? (
        <div className="card grid place-items-center py-24 text-odoo-faint">No transfers yet.</div>
      ) : view === 'kanban' ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((t) => (
            <button key={t.id} onClick={() => setOpenId(t.id)} className="card p-4 text-left transition hover:border-odoo-lift">
              <div className="flex items-center justify-between">
                <span className="font-mono font-bold">{t.reference}</span>
                <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${STATE_STYLE[t.state]}`}>{t.state}</span>
              </div>
              <div className="mt-2 flex items-center gap-2 text-[13px]">
                <span className="font-semibold">{t.fromWarehouse?.code}</span>
                <ArrowRight size={13} className="text-odoo-faint" />
                <span className="font-semibold">{t.toWarehouse?.code}</span>
              </div>
              <div className="mt-1 text-xs text-odoo-faint">
                {t.lines.length} line{t.lines.length === 1 ? '' : 's'} · {t.lines.reduce((s, l) => s + l.quantity, 0)} units
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="px-3 text-left">Reference</th>
                  <th className="px-3 text-left">From</th>
                  <th className="px-3 text-left">To</th>
                  <th className="px-3 text-left">Created</th>
                  <th className="px-3 text-right">Lines</th>
                  <th className="px-3 text-right">Units</th>
                  <th className="px-3 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => {
                  const units = t.lines.reduce((s, l) => s + l.quantity, 0);
                  const received = t.lines.reduce((s, l) => s + l.receivedQty, 0);
                  return (
                    <tr key={t.id} onClick={() => setOpenId(t.id)} className="cursor-pointer">
                      <td className="px-3 font-mono font-semibold">{t.reference}</td>
                      <td className="px-3">{t.fromWarehouse?.name}</td>
                      <td className="px-3">{t.toWarehouse?.name}</td>
                      <td className="px-3 text-odoo-dim">{new Date(t.createdAt).toLocaleDateString()}</td>
                      <td className="px-3 text-right tabular-nums">{t.lines.length}</td>
                      <td className="px-3 text-right tabular-nums">
                        {t.state === 'SENT' ? `${received} / ${units}` : units}
                      </td>
                      <td className="px-3"><span className={`rounded px-2 py-0.5 text-xs font-bold ${STATE_STYLE[t.state]}`}>{t.state}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </ViewShell>
  );
}

// ---------- Form ----------

type DraftLine = { productId: number; quantity: number };

function TransferForm({ id, onClose }: { id: number | null; onClose: () => void }) {
  const [t, setT] = useState<StockTransfer | null>(null);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [form, setForm] = useState<Omit<TransferInput, 'lines'>>({ fromWarehouseId: 0, toWarehouseId: 0, note: '' });
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [receipt, setReceipt] = useState<Record<number, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);

  const editable = !t || t.state === 'DRAFT';

  const reload = useCallback(async () => {
    if (id == null) return;
    const d = await adminApi.transfer(id);
    setT(d);
    setForm({ fromWarehouseId: d.fromWarehouseId, toWarehouseId: d.toWarehouseId, note: d.note ?? '' });
    setLines(d.lines.map((l) => ({ productId: l.productId, quantity: l.quantity })));
    setReceipt(Object.fromEntries(d.lines.map((l) => [l.id, l.quantity - l.receivedQty])));
    setDirty(false);
  }, [id]);

  useEffect(() => {
    adminApi.warehouses().then((d) => {
      setWarehouses(d.rows);
      if (id == null && d.rows.length >= 2) {
        const central = d.rows.find((w) => w.isDefault) ?? d.rows[0];
        const other = d.rows.find((w) => w.id !== central.id)!;
        setForm((f) => ({ ...f, fromWarehouseId: central.id, toWarehouseId: other.id }));
      }
    }).catch(() => setWarehouses([]));
    adminApi.products().then(setProducts).catch(() => setProducts([]));
    reload().catch((e) => setError(e.message));
  }, [id, reload]);

  const set = (k: keyof typeof form, v: any) => { setForm((f) => ({ ...f, [k]: v })); setDirty(true); };
  const setLine = (i: number, patch: Partial<DraftLine>) => {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
    setDirty(true);
  };
  const addLine = () => {
    const used = new Set(lines.map((l) => l.productId));
    const p = products.find((x) => !used.has(x.id));
    if (!p) return;
    setLines((ls) => [...ls, { productId: p.id, quantity: 1 }]);
    setDirty(true);
  };

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try { await fn(); await reload(); }
    catch (e: any) { setError(e.message || 'Action failed'); }
    finally { setBusy(false); }
  };

  const save = () =>
    act(async () => {
      const payload = { ...form, lines };
      if (id == null) { await adminApi.createTransfer(payload); onClose(); }
      else await adminApi.updateTransfer(id, payload);
    });

  const receive = () => {
    const picked = Object.entries(receipt)
      .map(([lineId, qty]) => ({ lineId: Number(lineId), qty: Number(qty) }))
      .filter((l) => l.qty > 0);
    if (!picked.length) return setError('Enter a quantity to receive');
    return act(() => adminApi.receiveTransfer(t!.id, picked));
  };

  if (id != null && !t) {
    return <div className="grid place-items-center py-24 text-odoo-faint"><Loader2 className="animate-spin" /></div>;
  }

  const stageKey = t?.state === 'CANCELLED' ? 'DRAFT' : t?.state ?? 'DRAFT';

  return (
    <ViewShell title="Transfers" breadcrumb={t ? t.reference : 'New Transfer'} onBack={onClose} search="" onSearch={() => {}}>
      <div className="flex flex-wrap items-center gap-2">
        {editable && (
          <button onClick={save} disabled={busy || (!dirty && id != null) || !lines.length} className="btn-primary disabled:opacity-40">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <><Save size={15} /> Save</>}
          </button>
        )}
        {t?.state === 'DRAFT' && (
          <button onClick={() => act(() => adminApi.sendTransfer(t.id))} disabled={busy} className="btn-primary">
            <Send size={15} /> Send
          </button>
        )}
        <button onClick={onClose} className="btn-ghost"><X size={15} /> Close</button>
        {t && !['DONE', 'CANCELLED'].includes(t.state) && (
          <button
            onClick={() => { if (confirm('Cancel this transfer? Goods already sent return to the source.')) act(() => adminApi.cancelTransfer(t.id)); }}
            disabled={busy}
            className="btn-ghost ml-auto text-odoo-bad"
          ><Ban size={15} /> Cancel</button>
        )}
      </div>

      {error && <p className="rounded border border-odoo-bad/40 bg-odoo-bad/10 px-3 py-2 text-[13px] text-odoo-bad">{error}</p>}

      <div className="card p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <h2 className="font-mono text-2xl font-extrabold">{t ? t.reference : 'New Transfer'}</h2>
          <StatusBar stages={STAGES} current={stageKey} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block"><span className="label">From warehouse</span>
            <select value={form.fromWarehouseId} onChange={(e) => set('fromWarehouseId', Number(e.target.value))} disabled={!editable} className="input disabled:opacity-60">
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.code} — {w.name}</option>)}
            </select></label>
          <label className="block"><span className="label">To warehouse</span>
            <select value={form.toWarehouseId} onChange={(e) => set('toWarehouseId', Number(e.target.value))} disabled={!editable} className="input disabled:opacity-60">
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.code} — {w.name}</option>)}
            </select></label>
          <label className="block"><span className="label">Note</span>
            <input value={form.note ?? ''} onChange={(e) => set('note', e.target.value)} disabled={!editable} className="input disabled:opacity-60" /></label>
        </div>

        {warehouses.length < 2 && (
          <p className="mt-3 rounded border border-odoo-warn/40 bg-odoo-warn/10 px-3 py-2 text-[13px] text-odoo-warn">
            You need at least two warehouses to move stock between. Add a branch shop first.
          </p>
        )}

        <div className="mt-6">
          <Notebook
            tabs={[{
              label: 'Products',
              content: (
                <>
                  <div className="overflow-x-auto rounded border border-odoo-line">
                    <table className="w-full">
                      <thead>
                        <tr>
                          <th className="px-3 text-left">Product</th>
                          <th className="w-28 px-3 text-left">Quantity</th>
                          {t?.state !== 'DRAFT' && t && <th className="w-28 px-3 text-left">Received</th>}
                          {t?.state === 'SENT' && <th className="w-32 px-3 text-left">Receive now</th>}
                          {editable && <th className="w-10 px-3"></th>}
                        </tr>
                      </thead>
                      <tbody>
                        {lines.length === 0 ? (
                          <tr><td colSpan={5} className="py-8 text-center text-odoo-faint">No products yet.</td></tr>
                        ) : lines.map((l, i) => {
                          const saved = t?.lines[i];
                          const remaining = saved ? saved.quantity - saved.receivedQty : 0;
                          return (
                            <tr key={i}>
                              <td className="px-3">
                                {editable ? (
                                  <select value={l.productId} onChange={(e) => setLine(i, { productId: Number(e.target.value) })} className="input py-1">
                                    {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                                  </select>
                                ) : (
                                  <span>{saved?.name}<span className="block font-mono text-xs text-odoo-faint">{saved?.sku}</span></span>
                                )}
                              </td>
                              <td className="px-3">
                                {editable
                                  ? <input type="number" min={1} value={l.quantity} onChange={(e) => setLine(i, { quantity: Number(e.target.value) })} className="input py-1" />
                                  : <span className="tabular-nums">{l.quantity}</span>}
                              </td>
                              {t?.state !== 'DRAFT' && t && (
                                <td className="px-3 tabular-nums">
                                  <span className={remaining === 0 ? 'font-semibold text-odoo-ok' : ''}>{saved?.receivedQty ?? 0}</span>
                                </td>
                              )}
                              {t?.state === 'SENT' && saved && (
                                <td className="px-3">
                                  <input
                                    type="number" min={0} max={remaining}
                                    value={receipt[saved.id] ?? 0}
                                    onChange={(e) => setReceipt((r) => ({ ...r, [saved.id]: Math.max(0, Math.min(remaining, Number(e.target.value))) }))}
                                    disabled={remaining === 0}
                                    className="input py-1 disabled:opacity-50"
                                  />
                                </td>
                              )}
                              {editable && (
                                <td className="px-3">
                                  <button onClick={() => { setLines((ls) => ls.filter((_, x) => x !== i)); setDirty(true); }} className="grid h-7 w-7 place-items-center rounded text-odoo-faint hover:bg-odoo-bad/15 hover:text-odoo-bad"><Trash2 size={14} /></button>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {editable && <button onClick={addLine} className="btn-ghost mt-2"><Plus size={14} /> Add a product</button>}
                </>
              ),
            }]}
          />
        </div>

        {t?.state === 'SENT' && (
          <div className="mt-5 rounded border border-odoo-warn/40 bg-odoo-warn/[.07] p-4">
            <h3 className="mb-1 flex items-center gap-2 font-semibold"><Truck size={16} /> Goods in transit</h3>
            <p className="mb-3 text-xs text-odoo-dim">
              Stock has already left {t.fromWarehouse?.name}. Receiving adds it to {t.toWarehouse?.name} —
              the company-wide total never changes, only which warehouse holds it.
            </p>
            <button onClick={receive} disabled={busy} className="btn-primary">
              {busy ? <Loader2 size={15} className="animate-spin" /> : <><PackageCheck size={15} /> Receive</>}
            </button>
          </div>
        )}
      </div>
    </ViewShell>
  );
}
