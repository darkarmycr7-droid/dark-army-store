'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Loader2, Save, X, Trash2, Plus, Check, Factory, Ban, Hammer, Layers, AlertTriangle,
} from 'lucide-react';
import {
  adminApi, Mo, MoInput, MoState, Bom, BomInput, AdminProduct, Warehouse, ExplodedComponent,
} from '@/lib/adminApi';
import { formatKD } from '@/lib/money';
import ViewShell, { SmartButton, Notebook, StatusBar, ViewMode } from '@/components/odoo/ViewShell';

const MO_FILTERS = [
  { key: 'draft', label: 'Draft' },
  { key: 'inProgress', label: 'In Progress' },
  { key: 'done', label: 'Done' },
  { key: 'cancelled', label: 'Cancelled' },
];
const STAGES = [
  { key: 'DRAFT', label: 'Draft' },
  { key: 'CONFIRMED', label: 'In Progress' },
  { key: 'DONE', label: 'Done' },
];
const STATE_STYLE: Record<MoState, string> = {
  DRAFT: 'bg-odoo-raised text-odoo-dim',
  CONFIRMED: 'bg-odoo-warn/20 text-odoo-warn',
  DONE: 'bg-odoo-ok/20 text-odoo-ok',
  CANCELLED: 'bg-odoo-bad/20 text-odoo-bad',
};
const PAGE = 40;

export default function ManufacturingPage() {
  const [tab, setTab] = useState<'orders' | 'boms'>('orders');
  return (
    <div className="space-y-4">
      <div className="flex gap-1">
        {(['orders', 'boms'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded px-3 py-1.5 text-[13px] font-medium ${tab === t ? 'bg-odoo-primary text-white' : 'bg-odoo-surface text-odoo-dim hover:bg-odoo-raised'}`}
          >{t === 'orders' ? 'Manufacturing Orders' : 'Bills of Materials'}</button>
        ))}
      </div>
      {tab === 'orders' ? <Orders /> : <Boms />}
    </div>
  );
}

// ---------------------------------------------------------------- Orders ----

function Orders() {
  const [rows, setRows] = useState<Mo[] | null>(null);
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
    adminApi.manufacturingOrders({ q, filters, groupBy, skip, limit: PAGE })
      .then((d) => { setRows(d.rows); setTotal(d.total); setGroups(d.groups); })
      .catch(() => { setRows([]); setTotal(0); });
  }, [q, filters, groupBy, skip]);
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);
  useEffect(() => { setSkip(0); }, [q, filters, groupBy]);

  if (creating || openId != null) {
    return <MoForm id={openId} onClose={() => { setCreating(false); setOpenId(null); load(); }} />;
  }

  return (
    <ViewShell
      title="Manufacturing"
      onNew={() => setCreating(true)}
      newLabel="New Order"
      search={q}
      onSearch={setQ}
      searchPlaceholder="Search reference or product…"
      filters={MO_FILTERS}
      activeFilters={filters}
      onToggleFilter={(k) => setFilters((f) => (f.includes(k) ? f.filter((x) => x !== k) : [...f, k]))}
      groups={[{ key: 'state', label: 'Status' }]}
      activeGroup={groupBy}
      onGroup={setGroupBy}
      view={view}
      onView={setView}
      skip={skip} take={PAGE} total={total} onPage={setSkip}
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
        <div className="card grid place-items-center py-24 text-odoo-faint">No manufacturing orders yet.</div>
      ) : view === 'kanban' ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((m) => (
            <button key={m.id} onClick={() => setOpenId(m.id)} className="card p-4 text-left hover:border-odoo-lift">
              <div className="flex items-center justify-between">
                <span className="font-mono font-bold">{m.reference}</span>
                <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${STATE_STYLE[m.state]}`}>{m.state}</span>
              </div>
              <div className="mt-1 truncate font-semibold">{m.productName}</div>
              <div className="mt-2 text-[13px] text-odoo-dim">
                {m.producedQty} / {m.quantity} produced
              </div>
              {m.unitCost > 0 && <div className="text-xs text-odoo-faint">Unit cost {formatKD(m.unitCost)}</div>}
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
                  <th className="px-3 text-left">Product</th>
                  <th className="px-3 text-left">Warehouse</th>
                  <th className="px-3 text-right">Produced</th>
                  <th className="px-3 text-right">Unit Cost</th>
                  <th className="px-3 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.id} onClick={() => setOpenId(m.id)} className="cursor-pointer">
                    <td className="px-3 font-mono font-semibold">{m.reference}</td>
                    <td className="px-3">{m.productName}</td>
                    <td className="px-3 text-odoo-dim">{m.warehouseName || '—'}</td>
                    <td className="px-3 text-right tabular-nums">{m.producedQty} / {m.quantity}</td>
                    <td className="px-3 text-right tabular-nums">{m.unitCost > 0 ? formatKD(m.unitCost) : '—'}</td>
                    <td className="px-3"><span className={`rounded px-2 py-0.5 text-xs font-bold ${STATE_STYLE[m.state]}`}>{m.state}</span></td>
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

function MoForm({ id, onClose }: { id: number | null; onClose: () => void }) {
  const [mo, setMo] = useState<Mo | null>(null);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [boms, setBoms] = useState<Bom[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [preview, setPreview] = useState<ExplodedComponent[]>([]);
  const [form, setForm] = useState<Omit<MoInput, 'components'>>({ productId: 0, bomId: null, warehouseId: null, quantity: 1, note: '' });
  const [produceQty, setProduceQty] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);

  const editable = !mo || mo.state === 'DRAFT';

  const reload = useCallback(async () => {
    if (id == null) return;
    const d = await adminApi.manufacturingOrder(id);
    setMo(d);
    setForm({ productId: d.productId, bomId: d.bomId, warehouseId: d.warehouseId, quantity: d.quantity, note: d.note ?? '' });
    setProduceQty(d.quantity - d.producedQty);
    setDirty(false);
  }, [id]);

  useEffect(() => {
    adminApi.products().then(setProducts).catch(() => setProducts([]));
    adminApi.boms({ limit: 200 }).then((d) => setBoms(d.rows)).catch(() => setBoms([]));
    adminApi.warehouses().then((d) => {
      setWarehouses(d.rows);
      if (id == null) {
        const def = d.rows.find((w) => w.isDefault) ?? d.rows[0];
        if (def) setForm((f) => ({ ...f, warehouseId: def.id }));
      }
    }).catch(() => setWarehouses([]));
    reload().catch((e) => setError(e.message));
  }, [id, reload]);

  // Preview what the run will consume, so shortages show before confirming.
  useEffect(() => {
    if (mo || !form.bomId || form.quantity < 1) { setPreview([]); return; }
    adminApi.explodeBom(form.bomId, form.quantity, form.warehouseId ?? undefined)
      .then(setPreview).catch(() => setPreview([]));
  }, [mo, form.bomId, form.quantity, form.warehouseId]);

  const set = (k: keyof typeof form, v: any) => { setForm((f) => ({ ...f, [k]: v })); setDirty(true); };

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await fn(); await reload(); }
    catch (e: any) { setError(e.message || 'Action failed'); }
    finally { setBusy(false); }
  };

  const save = () => act(async () => {
    if (id == null) { await adminApi.createMo(form); onClose(); }
    else await adminApi.updateMo(id, form);
  });

  if (id != null && !mo) {
    return <div className="grid place-items-center py-24 text-odoo-faint"><Loader2 className="animate-spin" /></div>;
  }

  const stageKey = mo?.state === 'CANCELLED' ? 'DRAFT' : mo?.state ?? 'DRAFT';
  const remaining = mo ? mo.quantity - mo.producedQty : 0;
  const shortages = (mo?.components ?? preview).filter((c: any) =>
    c.available !== undefined && c.available < (c.quantityRequired - (c.quantityConsumed ?? 0))
  );

  return (
    <ViewShell title="Manufacturing" breadcrumb={mo ? mo.reference : 'New Order'} onBack={onClose} search="" onSearch={() => {}}>
      <div className="flex flex-wrap items-center gap-2">
        {editable && (
          <button onClick={save} disabled={busy || (!dirty && id != null) || !form.productId} className="btn-primary disabled:opacity-40">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <><Save size={15} /> Save</>}
          </button>
        )}
        {mo?.state === 'DRAFT' && (
          <button onClick={() => act(() => adminApi.confirmMo(mo.id))} disabled={busy} className="btn-primary">
            <Check size={15} /> Confirm
          </button>
        )}
        <button onClick={onClose} className="btn-ghost"><X size={15} /> Close</button>
        {mo && !['DONE', 'CANCELLED'].includes(mo.state) && mo.producedQty === 0 && (
          <button onClick={() => { if (confirm('Cancel this manufacturing order?')) act(() => adminApi.cancelMo(mo.id)); }} disabled={busy} className="btn-ghost ml-auto text-odoo-bad">
            <Ban size={15} /> Cancel
          </button>
        )}
      </div>

      {error && <p className="rounded border border-odoo-bad/40 bg-odoo-bad/10 px-3 py-2 text-[13px] text-odoo-bad">{error}</p>}

      <div className="card p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <h2 className="font-mono text-2xl font-extrabold">{mo ? mo.reference : 'New Order'}</h2>
          <div className="space-y-2">
            <StatusBar stages={STAGES} current={stageKey} />
            {mo && (
              <div className="flex flex-wrap justify-end gap-2">
                <SmartButton Icon={Factory} label="Produced" value={`${mo.producedQty} / ${mo.quantity}`} />
                <SmartButton Icon={Layers} label="Unit Cost" value={mo.unitCost > 0 ? formatKD(mo.unitCost) : '—'} />
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block lg:col-span-2"><span className="label">Product to make</span>
            <select value={form.productId} onChange={(e) => set('productId', Number(e.target.value))} disabled={!editable} className="input disabled:opacity-60">
              <option value={0}>— choose —</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
            </select></label>
          <label className="block"><span className="label">Bill of materials</span>
            <select value={form.bomId ?? ''} onChange={(e) => set('bomId', e.target.value ? Number(e.target.value) : null)} disabled={!editable} className="input disabled:opacity-60">
              <option value="">— none —</option>
              {boms.filter((b) => !form.productId || b.productId === form.productId).map((b) => (
                <option key={b.id} value={b.id}>{b.reference} — {b.name || b.productName}</option>
              ))}
            </select></label>
          <label className="block"><span className="label">Quantity</span>
            <input type="number" min={1} value={form.quantity} onChange={(e) => set('quantity', Number(e.target.value))} disabled={!editable} className="input disabled:opacity-60" /></label>
          <label className="block lg:col-span-2"><span className="label">Warehouse</span>
            <select value={form.warehouseId ?? ''} onChange={(e) => set('warehouseId', e.target.value ? Number(e.target.value) : null)} disabled={!editable} className="input disabled:opacity-60">
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            <span className="mt-1 block text-xs text-odoo-faint">Components are consumed here, and finished goods produced here.</span></label>
          <label className="block lg:col-span-2"><span className="label">Note</span>
            <input value={form.note ?? ''} onChange={(e) => set('note', e.target.value)} disabled={!editable} className="input disabled:opacity-60" /></label>
        </div>

        {shortages.length > 0 && (
          <p className="mt-4 flex items-start gap-2 rounded border border-odoo-warn/40 bg-odoo-warn/10 px-3 py-2 text-[13px] text-odoo-warn">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            <span>Not enough stock for {shortages.length} component{shortages.length === 1 ? '' : 's'} at this warehouse. Transfer or purchase more before producing.</span>
          </p>
        )}

        <div className="mt-6">
          <Notebook
            tabs={[{
              label: 'Components',
              content: (
                <div className="overflow-x-auto rounded border border-odoo-line">
                  <table className="w-full">
                    <thead>
                      <tr>
                        <th className="px-3 text-left">Component</th>
                        <th className="px-3 text-right">Required</th>
                        {mo && <th className="px-3 text-right">Consumed</th>}
                        <th className="px-3 text-right">Available</th>
                        <th className="px-3 text-right">Unit Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(mo?.components ?? preview).length === 0 ? (
                        <tr><td colSpan={5} className="py-8 text-center text-odoo-faint">
                          {form.bomId ? 'No components.' : 'Choose a bill of materials to explode its components.'}
                        </td></tr>
                      ) : (mo?.components ?? preview).map((c: any, i: number) => {
                        const need = c.quantityRequired - (c.quantityConsumed ?? 0);
                        const short = c.available !== undefined && c.available < need;
                        return (
                          <tr key={c.id ?? i}>
                            <td className="px-3">{c.name}<span className="block font-mono text-xs text-odoo-faint">{c.sku}</span></td>
                            <td className="px-3 text-right tabular-nums">{c.quantityRequired}</td>
                            {mo && <td className="px-3 text-right tabular-nums">{c.quantityConsumed}</td>}
                            <td className={`px-3 text-right tabular-nums ${short ? 'font-bold text-odoo-warn' : 'text-odoo-dim'}`}>
                              {c.available ?? '—'}
                            </td>
                            <td className="px-3 text-right tabular-nums text-odoo-dim">{formatKD(c.unitCost)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ),
            }]}
          />
        </div>

        {mo?.state === 'CONFIRMED' && remaining > 0 && (
          <div className="mt-5 rounded border border-odoo-ok/40 bg-odoo-ok/[.07] p-4">
            <h3 className="mb-1 flex items-center gap-2 font-semibold"><Hammer size={16} /> Produce</h3>
            <p className="mb-3 text-xs text-odoo-dim">
              Consumes the components and adds the finished goods to stock. The finished product&apos;s cost
              is the total component cost divided by the quantity produced.
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <label className="block"><span className="label">Quantity ({remaining} left)</span>
                <input type="number" min={1} max={remaining} value={produceQty}
                  onChange={(e) => setProduceQty(Math.max(1, Math.min(remaining, Number(e.target.value))))}
                  className="input w-32" /></label>
              <button onClick={() => act(() => adminApi.produceMo(mo.id, produceQty))} disabled={busy || produceQty < 1} className="btn-primary disabled:opacity-40">
                {busy ? <Loader2 size={15} className="animate-spin" /> : <><Factory size={15} /> Produce</>}
              </button>
            </div>
          </div>
        )}
      </div>
    </ViewShell>
  );
}

// ------------------------------------------------------------------ BoMs ----

function Boms() {
  const [rows, setRows] = useState<Bom[] | null>(null);
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => adminApi.boms({ q, limit: PAGE }).then((d) => setRows(d.rows)).catch(() => setRows([])), [q]);
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);

  if (creating || openId != null) {
    return <BomForm id={openId} onClose={() => { setCreating(false); setOpenId(null); load(); }} />;
  }

  return (
    <ViewShell
      title="Bills of Materials"
      onNew={() => setCreating(true)}
      newLabel="New BoM"
      search={q}
      onSearch={setQ}
      searchPlaceholder="Search reference or product…"
    >
      {!rows ? (
        <div className="grid place-items-center py-24 text-odoo-faint"><Loader2 className="animate-spin" /></div>
      ) : rows.length === 0 ? (
        <div className="card grid place-items-center py-24 text-odoo-faint">No bills of materials yet.</div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="px-3 text-left">Reference</th>
                  <th className="px-3 text-left">Product</th>
                  <th className="px-3 text-left">Name</th>
                  <th className="px-3 text-right">Yields</th>
                  <th className="px-3 text-right">Components</th>
                  <th className="px-3 text-right">Cost / Unit</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b.id} onClick={() => setOpenId(b.id)} className="cursor-pointer">
                    <td className="px-3 font-mono font-semibold">{b.reference}</td>
                    <td className="px-3">{b.productName}</td>
                    <td className="px-3 text-odoo-dim">{b.name || '—'}</td>
                    <td className="px-3 text-right tabular-nums">{b.quantity}</td>
                    <td className="px-3 text-right tabular-nums">{b.lines.length}</td>
                    <td className="px-3 text-right font-semibold tabular-nums">{formatKD(b.unitCost)}</td>
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

function BomForm({ id, onClose }: { id: number | null; onClose: () => void }) {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [bom, setBom] = useState<Bom | null>(null);
  const [form, setForm] = useState<BomInput>({ productId: 0, quantity: 1, name: '', isActive: true, lines: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    adminApi.products().then(setProducts).catch(() => setProducts([]));
    if (id == null) return;
    adminApi.bom(id).then((b) => {
      setBom(b);
      setForm({
        productId: b.productId, quantity: b.quantity, name: b.name ?? '', isActive: b.isActive,
        lines: b.lines.map((l) => ({ componentId: l.componentId, quantity: l.quantity })),
      });
    }).catch((e) => setError(e.message));
  }, [id]);

  const byId = new Map(products.map((p) => [p.id, p]));
  const totalCost = form.lines.reduce((s, l) => {
    const p = byId.get(l.componentId);
    return s + (p ? (p.avgCost || p.costPrice) * l.quantity : 0);
  }, 0);

  const save = async () => {
    setBusy(true); setError('');
    try {
      if (id == null) await adminApi.createBom(form);
      else await adminApi.updateBom(id, form);
      onClose();
    } catch (e: any) { setError(e.message || 'Could not save'); setBusy(false); }
  };

  const remove = async () => {
    if (id == null || !confirm('Delete this bill of materials?')) return;
    try {
      const r = await adminApi.deleteBom(id);
      if (r.archived) alert('This BoM has been used by an order, so it was archived instead.');
      onClose();
    } catch (e: any) { setError(e.message); }
  };

  return (
    <ViewShell title="Bills of Materials" breadcrumb={bom ? bom.reference : 'New BoM'} onBack={onClose} search="" onSearch={() => {}}>
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={save} disabled={busy || !form.productId || !form.lines.length} className="btn-primary disabled:opacity-40">
          {busy ? <Loader2 size={15} className="animate-spin" /> : <><Save size={15} /> Save</>}
        </button>
        <button onClick={onClose} className="btn-ghost"><X size={15} /> Discard</button>
        {id != null && <button onClick={remove} className="btn-ghost ml-auto text-odoo-bad"><Trash2 size={15} /> Delete</button>}
      </div>

      {error && <p className="rounded border border-odoo-bad/40 bg-odoo-bad/10 px-3 py-2 text-[13px] text-odoo-bad">{error}</p>}

      <div className="card p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block lg:col-span-2"><span className="label">Finished product</span>
            <select value={form.productId} onChange={(e) => setForm((f) => ({ ...f, productId: Number(e.target.value) }))} className="input">
              <option value={0}>— choose —</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
            </select></label>
          <label className="block"><span className="label">Yields (units per run)</span>
            <input type="number" min={1} value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: Number(e.target.value) }))} className="input" /></label>
          <label className="block"><span className="label">Name (optional)</span>
            <input value={form.name ?? ''} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="input" /></label>
        </div>

        <div className="mt-6">
          <span className="label">Components</span>
          <div className="overflow-x-auto rounded border border-odoo-line">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="px-3 text-left">Component</th>
                  <th className="w-32 px-3 text-left">Quantity</th>
                  <th className="px-3 text-right">Unit Cost</th>
                  <th className="px-3 text-right">Line Cost</th>
                  <th className="w-10 px-3"></th>
                </tr>
              </thead>
              <tbody>
                {form.lines.length === 0 ? (
                  <tr><td colSpan={5} className="py-8 text-center text-odoo-faint">No components yet.</td></tr>
                ) : form.lines.map((l, i) => {
                  const p = byId.get(l.componentId);
                  const unit = p ? p.avgCost || p.costPrice : 0;
                  return (
                    <tr key={i}>
                      <td className="px-3">
                        <select value={l.componentId} onChange={(e) => setForm((f) => ({ ...f, lines: f.lines.map((x, idx) => idx === i ? { ...x, componentId: Number(e.target.value) } : x) }))} className="input py-1">
                          {products.filter((x) => x.id !== form.productId).map((x) => <option key={x.id} value={x.id}>{x.name} ({x.sku})</option>)}
                        </select>
                      </td>
                      <td className="px-3">
                        <input type="number" min={1} value={l.quantity} onChange={(e) => setForm((f) => ({ ...f, lines: f.lines.map((x, idx) => idx === i ? { ...x, quantity: Number(e.target.value) } : x) }))} className="input py-1" />
                      </td>
                      <td className="px-3 text-right tabular-nums text-odoo-dim">{formatKD(unit)}</td>
                      <td className="px-3 text-right font-semibold tabular-nums">{formatKD(unit * l.quantity)}</td>
                      <td className="px-3">
                        <button onClick={() => setForm((f) => ({ ...f, lines: f.lines.filter((_, idx) => idx !== i) }))} className="grid h-7 w-7 place-items-center rounded text-odoo-faint hover:bg-odoo-bad/15 hover:text-odoo-bad"><Trash2 size={14} /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button
            onClick={() => {
              const used = new Set(form.lines.map((l) => l.componentId));
              const next = products.find((p) => p.id !== form.productId && !used.has(p.id));
              if (next) setForm((f) => ({ ...f, lines: [...f.lines, { componentId: next.id, quantity: 1 }] }));
            }}
            className="btn-ghost mt-2"
          ><Plus size={14} /> Add a component</button>

          <div className="mt-4 flex justify-end">
            <div className="w-full max-w-xs space-y-1 text-[13px]">
              <div className="flex justify-between"><span className="text-odoo-dim">Total component cost</span><span className="font-semibold">{formatKD(totalCost)}</span></div>
              <div className="flex justify-between border-t border-odoo-line pt-1 font-extrabold">
                <span>Cost per finished unit</span><span>{formatKD(totalCost / (form.quantity || 1))}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ViewShell>
  );
}
