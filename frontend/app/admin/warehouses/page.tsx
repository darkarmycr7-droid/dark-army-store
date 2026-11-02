'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Loader2, Warehouse as WhIcon, Store, Save, X, Trash2, Star, MapPin, Phone, Boxes, Package,
} from 'lucide-react';
import { adminApi, Warehouse, WarehouseDetail, WarehouseInput } from '@/lib/adminApi';
import { formatKD } from '@/lib/money';
import ViewShell, { SmartButton, Notebook, ViewMode } from '@/components/odoo/ViewShell';

const FILTERS = [
  { key: 'central', label: 'Central' },
  { key: 'shops', label: 'Shops' },
  { key: 'archived', label: 'Archived' },
];

const EMPTY: WarehouseInput = {
  code: '', name: '', nameAr: '', type: 'SHOP', isDefault: false,
  area: '', address: '', phone: '', isActive: true,
};

export default function WarehousesPage() {
  const [rows, setRows] = useState<Warehouse[] | null>(null);
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState<string[]>([]);
  const [view, setView] = useState<ViewMode>('kanban');
  const [openId, setOpenId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(
    () => adminApi.warehouses({ q, filters }).then((d) => setRows(d.rows)).catch(() => setRows([])),
    [q, filters]
  );
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);

  if (creating || openId != null) {
    return <WarehouseForm id={openId} onClose={() => { setCreating(false); setOpenId(null); load(); }} />;
  }

  const totalValue = (rows || []).reduce((s, w) => s + (w.stockValue ?? 0), 0);

  return (
    <ViewShell
      title="Warehouses"
      onNew={() => setCreating(true)}
      newLabel="New Warehouse"
      search={q}
      onSearch={setQ}
      searchPlaceholder="Search name, code or area…"
      filters={FILTERS}
      activeFilters={filters}
      onToggleFilter={(k) => setFilters((f) => (f.includes(k) ? f.filter((x) => x !== k) : [...f, k]))}
      view={view}
      onView={setView}
    >
      {rows && rows.length > 0 && (
        <div className="flex flex-wrap gap-2 text-[13px] text-odoo-dim">
          <span className="rounded border border-odoo-line bg-odoo-surface px-3 py-1.5">
            {rows.length} warehouse{rows.length === 1 ? '' : 's'}
          </span>
          <span className="rounded border border-odoo-line bg-odoo-surface px-3 py-1.5">
            Total stock value <b className="text-odoo-ink">{formatKD(totalValue)}</b>
          </span>
        </div>
      )}

      {!rows ? (
        <div className="grid place-items-center py-24 text-odoo-faint"><Loader2 className="animate-spin" /></div>
      ) : rows.length === 0 ? (
        <div className="card grid place-items-center py-24 text-odoo-faint">No warehouses match this search.</div>
      ) : view === 'kanban' ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((w) => (
            <button key={w.id} onClick={() => setOpenId(w.id)} className="card p-4 text-left transition hover:border-odoo-lift">
              <div className="flex items-start gap-3">
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded ${w.type === 'CENTRAL' ? 'bg-odoo-primary/30 text-odoo-lift' : 'bg-odoo-raised text-odoo-dim'}`}>
                  {w.type === 'CENTRAL' ? <WhIcon size={18} /> : <Store size={18} />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{w.name}</span>
                    {w.isDefault && <Star size={13} className="shrink-0 text-odoo-warn" fill="currentColor" />}
                  </div>
                  <div className="font-mono text-xs text-odoo-faint">{w.code}</div>
                  {w.area && <div className="mt-1 flex items-center gap-1 text-xs text-odoo-dim"><MapPin size={11} /> {w.area}</div>}
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 border-t border-odoo-line pt-3 text-center">
                <div><div className="text-sm font-bold">{w.skuCount}</div><div className="text-[10px] uppercase tracking-wide text-odoo-faint">SKUs</div></div>
                <div><div className="text-sm font-bold">{w.units ?? 0}</div><div className="text-[10px] uppercase tracking-wide text-odoo-faint">Units</div></div>
                <div><div className="text-sm font-bold">{formatKD(w.stockValue ?? 0)}</div><div className="text-[10px] uppercase tracking-wide text-odoo-faint">Value</div></div>
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
                  <th className="px-3 text-left">Code</th>
                  <th className="px-3 text-left">Name</th>
                  <th className="px-3 text-left">Type</th>
                  <th className="px-3 text-left">Area</th>
                  <th className="px-3 text-right">SKUs</th>
                  <th className="px-3 text-right">Units</th>
                  <th className="px-3 text-right">Stock Value</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((w) => (
                  <tr key={w.id} onClick={() => setOpenId(w.id)} className="cursor-pointer">
                    <td className="px-3 font-mono font-semibold">{w.code}</td>
                    <td className="px-3">
                      {w.name} {w.isDefault && <span className="ml-1 rounded bg-odoo-warn/20 px-1.5 py-0.5 text-[10px] font-bold text-odoo-warn">DEFAULT</span>}
                    </td>
                    <td className="px-3 text-odoo-dim">{w.type === 'CENTRAL' ? 'Central' : 'Shop'}</td>
                    <td className="px-3 text-odoo-dim">{w.area || '—'}</td>
                    <td className="px-3 text-right tabular-nums">{w.skuCount}</td>
                    <td className="px-3 text-right tabular-nums">{w.units ?? 0}</td>
                    <td className="px-3 text-right font-semibold tabular-nums">{formatKD(w.stockValue ?? 0)}</td>
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

function WarehouseForm({ id, onClose }: { id: number | null; onClose: () => void }) {
  const [form, setForm] = useState<WarehouseInput>(EMPTY);
  const [detail, setDetail] = useState<WarehouseDetail | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);

  const set = (k: keyof WarehouseInput, v: any) => { setForm((f) => ({ ...f, [k]: v })); setDirty(true); };

  useEffect(() => {
    if (id == null) return;
    adminApi.warehouse(id).then((d) => { setDetail(d); setForm(d as WarehouseInput); }).catch((e) => setError(e.message));
  }, [id]);

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      if (id == null) await adminApi.createWarehouse(form);
      else await adminApi.updateWarehouse(id, form);
      onClose();
    } catch (e: any) {
      setError(e.message || 'Could not save the warehouse');
      setSaving(false);
    }
  };

  const remove = async () => {
    if (id == null || !confirm(`Delete warehouse "${form.name}"?`)) return;
    try {
      const r = await adminApi.deleteWarehouse(id);
      if (r.archived) alert('This warehouse has stock history, so it was archived instead of deleted.');
      onClose();
    } catch (e: any) { setError(e.message); }
  };

  if (id != null && !detail) {
    return <div className="grid place-items-center py-24 text-odoo-faint"><Loader2 className="animate-spin" /></div>;
  }

  const stockValue = detail?.stock.reduce((s, r) => s + r.value, 0) ?? 0;

  return (
    <ViewShell title="Warehouses" breadcrumb={id == null ? 'New' : form.name || '—'} onBack={onClose} search="" onSearch={() => {}}>
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={save} disabled={saving || (!dirty && id != null)} className="btn-primary disabled:opacity-40">
          {saving ? <Loader2 size={15} className="animate-spin" /> : <><Save size={15} /> Save</>}
        </button>
        <button onClick={onClose} className="btn-ghost"><X size={15} /> Discard</button>
        {id != null && !form.isDefault && (
          <button onClick={remove} className="btn-ghost ml-auto text-odoo-bad"><Trash2 size={15} /> Delete</button>
        )}
      </div>

      {error && <p className="rounded border border-odoo-bad/40 bg-odoo-bad/10 px-3 py-2 text-[13px] text-odoo-bad">{error}</p>}

      <div className="card p-5">
        {detail && (
          <div className="mb-5 flex flex-wrap justify-end gap-2">
            <SmartButton Icon={Package} label="SKUs" value={detail.stock.length} />
            <SmartButton Icon={Boxes} label="Units" value={detail.stock.reduce((s, r) => s + r.quantity, 0)} />
            <SmartButton Icon={WhIcon} label="Stock Value" value={formatKD(stockValue)} />
          </div>
        )}

        <input
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder="Warehouse name"
          className="mb-4 w-full border-0 border-b border-odoo-line bg-transparent px-0 pb-2 text-2xl font-extrabold text-odoo-ink outline-none focus:border-odoo-lift"
        />

        <div className="grid gap-x-8 gap-y-3 lg:grid-cols-2">
          <div className="space-y-3">
            <label className="block"><span className="label">Short code</span>
              <input value={form.code} onChange={(e) => set('code', e.target.value.toUpperCase())} placeholder="SHOP1" className="input font-mono uppercase" /></label>
            <label className="block"><span className="label">Name (Arabic)</span>
              <input value={form.nameAr ?? ''} onChange={(e) => set('nameAr', e.target.value)} dir="rtl" className="input" /></label>
            <label className="block"><span className="label">Type</span>
              <select value={form.type} onChange={(e) => set('type', e.target.value)} className="input">
                <option value="CENTRAL">Central warehouse</option>
                <option value="SHOP">Branch shop</option>
              </select></label>
          </div>
          <div className="space-y-3">
            <label className="block"><span className="label">Area</span>
              <input value={form.area ?? ''} onChange={(e) => set('area', e.target.value)} className="input" /></label>
            <label className="block"><span className="label">Address</span>
              <input value={form.address ?? ''} onChange={(e) => set('address', e.target.value)} className="input" /></label>
            <label className="block"><span className="label">Phone</span>
              <input value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} className="input" /></label>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-5">
          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={form.isDefault} onChange={(e) => set('isDefault', e.target.checked)} className="h-4 w-4" />
            Default warehouse
          </label>
          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={form.isActive} onChange={(e) => set('isActive', e.target.checked)} className="h-4 w-4" />
            Active
          </label>
        </div>
        <p className="mt-2 text-xs text-odoo-faint">
          The default warehouse receives anything not explicitly assigned — purchases, POS sales and
          adjustments all land there unless another is chosen.
        </p>

        {detail && (
          <div className="mt-6">
            <Notebook
              tabs={[{
                label: `Stock on Hand (${detail.stock.length})`,
                content: detail.stock.length === 0 ? (
                  <p className="py-6 text-center text-[13px] text-odoo-faint">No stock held here yet.</p>
                ) : (
                  <div className="overflow-x-auto rounded border border-odoo-line">
                    <table className="w-full">
                      <thead>
                        <tr>
                          <th className="px-3 text-left">Product</th>
                          <th className="px-3 text-left">SKU</th>
                          <th className="px-3 text-right">Quantity</th>
                          <th className="px-3 text-right">Unit Cost</th>
                          <th className="px-3 text-right">Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.stock.map((s) => (
                          <tr key={s.productId}>
                            <td className="px-3">{s.name}</td>
                            <td className="px-3 font-mono text-xs text-odoo-faint">{s.sku}</td>
                            <td className={`px-3 text-right tabular-nums ${s.low ? 'font-bold text-odoo-warn' : ''}`}>{s.quantity}</td>
                            <td className="px-3 text-right tabular-nums text-odoo-dim">{formatKD(s.unitCost)}</td>
                            <td className="px-3 text-right font-semibold tabular-nums">{formatKD(s.value)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ),
              }]}
            />
          </div>
        )}
      </div>
    </ViewShell>
  );
}
