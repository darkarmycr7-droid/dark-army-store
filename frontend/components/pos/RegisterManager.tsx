'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Save, X, Trash2, Pencil, Store, CircleDot } from 'lucide-react';
import { adminApi, PosRegister, PosRegisterInput, Warehouse } from '@/lib/adminApi';
import { formatKD } from '@/lib/money';
import { Field, SelectField, CheckField } from '@/components/odoo/Field';

/**
 * Register configuration — build the tills by hand, in whatever shape the
 * business actually has.
 *
 * A register is the long-lived thing (the drawer in the corner of the shop); a
 * session is one shift on it. Deleting is only allowed while a register has no
 * shifts behind it; after that it archives, because "which till took this
 * money" has to stay answerable.
 */

const EMPTY: PosRegisterInput = { name: '', branch: '', warehouseId: null, cashControl: true };

export default function RegisterManager() {
  const [rows, setRows] = useState<PosRegister[] | null>(null);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [editing, setEditing] = useState<{ id: number | null; form: PosRegisterInput } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    adminApi.posRegisters().then(setRows).catch(() => setRows([]));
  }, []);

  useEffect(() => {
    load();
    adminApi.warehouses().then((d) => setWarehouses(d.rows)).catch(() => setWarehouses([]));
  }, [load]);

  const branches = useMemo(() => {
    const map = new Map<string, PosRegister[]>();
    for (const r of rows ?? []) {
      const key = r.branch || 'Ungrouped';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return [...map.entries()];
  }, [rows]);

  // Offer the branch names already in use, so they stay spelled consistently.
  const knownBranches = useMemo(
    () => [...new Set((rows ?? []).map((r) => r.branch).filter((b): b is string => !!b))].sort(),
    [rows],
  );

  const save = async () => {
    if (!editing) return;
    if (!editing.form.name.trim()) { setError('Give the register a name.'); return; }
    setBusy(true);
    setError('');
    try {
      if (editing.id == null) await adminApi.createPosRegister(editing.form);
      else await adminApi.updatePosRegister(editing.id, editing.form);
      setEditing(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (r: PosRegister) => {
    if (!confirm(`Delete the register "${r.name}"?`)) return;
    setError('');
    try {
      const res = await adminApi.deletePosRegister(r.id);
      if (res.archived) {
        setError(`"${r.name}" has ${res.sessions} shift(s) behind it, so it was archived rather than deleted — its history stays intact.`);
      }
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => { setEditing({ id: null, form: { ...EMPTY } }); setError(''); }} className="btn-primary">
          <Plus size={16} /> New Register
        </button>
        <span className="ml-auto text-[13px] text-odoo-dim">
          {rows?.length ?? 0} register{rows?.length === 1 ? '' : 's'}
        </span>
      </div>

      {error && <p className="rounded bg-odoo-bad/15 px-3 py-2 text-sm text-odoo-bad">{error}</p>}

      {editing && (
        <div className="card space-y-4 p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">{editing.id == null ? 'New register' : 'Edit register'}</h2>
            <button onClick={() => setEditing(null)} className="grid h-7 w-7 place-items-center rounded hover:bg-odoo-raised">
              <X size={15} />
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Field
              label="Register name"
              value={editing.form.name}
              onChange={(v) => setEditing((e) => e && ({ ...e, form: { ...e.form, name: v } }))}
              placeholder="e.g. Al-Rai 1"
              required
            />
            <div>
              <span className="label">Branch</span>
              <input
                list="pos-branches"
                value={editing.form.branch ?? ''}
                onChange={(e) => setEditing((s) => s && ({ ...s, form: { ...s.form, branch: e.target.value } }))}
                placeholder="e.g. Al-Rai"
                className="input"
              />
              <datalist id="pos-branches">
                {knownBranches.map((b) => <option key={b} value={b} />)}
              </datalist>
              <p className="mt-1 text-[11px] text-odoo-faint">Registers sharing a branch are grouped together.</p>
            </div>
            <SelectField
              label="Sells stock from"
              value={editing.form.warehouseId ?? null}
              onChange={(v) => setEditing((e) => e && ({ ...e, form: { ...e.form, warehouseId: v } }))}
              options={warehouses.map((w) => ({ value: w.id, label: `${w.name}${w.isDefault ? ' (central)' : ''}` }))}
              placeholder="Default warehouse"
              hint="Sales reduce THIS shop's stock."
            />
            <CheckField
              label="Cash control"
              checked={editing.form.cashControl ?? true}
              onChange={(v) => setEditing((e) => e && ({ ...e, form: { ...e.form, cashControl: v } }))}
              hint="Count the drawer when opening."
            />
          </div>

          <div className="flex gap-2">
            <button onClick={save} disabled={busy} className="btn-primary disabled:opacity-40">
              {busy ? <Loader2 size={16} className="animate-spin" /> : <><Save size={16} /> Save</>}
            </button>
            <button onClick={() => setEditing(null)} className="btn-ghost">Cancel</button>
          </div>
        </div>
      )}

      {!rows ? (
        <div className="grid place-items-center py-20 text-odoo-faint"><Loader2 className="animate-spin" /></div>
      ) : rows.length === 0 ? (
        <div className="card grid place-items-center px-6 py-20 text-center text-odoo-dim">
          <span>
            No registers yet.
            <span className="mt-1 block text-[13px] text-odoo-faint">
              Add one for each till. Give registers in the same shop the same branch name and they group together.
            </span>
          </span>
        </div>
      ) : (
        branches.map(([branch, registers]) => (
          <section key={branch}>
            <h3 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-odoo-faint">
              <Store size={13} /> {branch}
            </h3>
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="px-4 text-left">Register</th>
                      <th className="px-4 text-left">Sells stock from</th>
                      <th className="px-4 text-left">Cash control</th>
                      <th className="px-4 text-left">Status</th>
                      <th className="px-4 text-left">Last closing</th>
                      <th className="px-4"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {registers.map((r) => (
                      <tr key={r.id}>
                        <td className="px-4 font-semibold">{r.name}</td>
                        <td className="px-4 text-odoo-dim">{r.warehouseName || 'Default warehouse'}</td>
                        <td className="px-4 text-odoo-dim">{r.cashControl ? 'On' : 'Off'}</td>
                        <td className="px-4">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                            r.status === 'OPEN' ? 'bg-odoo-ok/20 text-odoo-ok' : 'bg-odoo-raised text-odoo-faint'
                          }`}>
                            <CircleDot size={10} />
                            {r.status === 'OPEN' ? `Open · ${r.cashierName ?? r.openSessionNumber}` : 'Closed'}
                          </span>
                        </td>
                        <td className="px-4 text-odoo-dim">
                          {r.lastClosedAt
                            ? <>{new Date(r.lastClosedAt).toLocaleDateString('en-GB')}
                              {r.lastClosingCash != null && <span className="ml-1 text-xs">({formatKD(r.lastClosingCash)})</span>}</>
                            : '—'}
                        </td>
                        <td className="px-4">
                          <div className="flex justify-end gap-1">
                            <button
                              onClick={() => { setEditing({ id: r.id, form: {
                                name: r.name, branch: r.branch, warehouseId: r.warehouseId, cashControl: r.cashControl,
                              } }); setError(''); }}
                              title="Edit"
                              className="grid h-7 w-7 place-items-center rounded text-odoo-faint hover:bg-odoo-raised hover:text-odoo-ink"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              onClick={() => remove(r)}
                              title="Delete"
                              className="grid h-7 w-7 place-items-center rounded text-odoo-faint hover:bg-odoo-bad/15 hover:text-odoo-bad"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        ))
      )}
    </div>
  );
}
