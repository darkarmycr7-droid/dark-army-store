'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Loader2, Check, X, Save, Ban, Undo2, Send, Trash2, Plane, Wallet, Plus,
} from 'lucide-react';
import {
  adminApi, Allocation, Employee, HrConfig, LeaveRow, LeaveInput,
} from '@/lib/adminApi';
import ViewShell from '@/components/odoo/ViewShell';
import { SelectField, NumberField } from '@/components/odoo/Field';
import LeaveStateBadge from '@/components/odoo/LeaveStateBadge';

/**
 * Time Off — requests, approvals and allocations.
 *
 * The rules that matter live on the server: only annual leave draws on an
 * allocation, a request cannot overlap another, and approving one that would
 * overdraw the balance is refused. This screen shows the state and offers the
 * transitions; it never decides them.
 */

const FILTERS = [
  { key: 'pending', label: 'To approve' },
  { key: 'approved', label: 'Approved' },
  { key: 'refused', label: 'Refused' },
  { key: 'current', label: 'Off today' },
  { key: 'upcoming', label: 'Upcoming' },
];
const PAGE = 40;

type Tab = 'requests' | 'allocations';

export default function TimeOffPage() {
  const [tab, setTab] = useState<Tab>('requests');
  const [rows, setRows] = useState<LeaveRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [totalDays, setTotalDays] = useState(0);
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState<string[]>([]);
  const [skip, setSkip] = useState(0);
  const [config, setConfig] = useState<HrConfig | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(() => {
    adminApi
      .leaves({ q, filters, skip, limit: PAGE })
      .then((d) => { setRows(d.rows); setTotal(d.total); setTotalDays(d.totalDays); })
      .catch(() => { setRows([]); setTotal(0); });
  }, [q, filters, skip]);

  useEffect(() => {
    adminApi.hrConfig().then(setConfig).catch(() => setConfig(null));
    adminApi.employees({ limit: 500 }).then((d) => setEmployees(d.rows)).catch(() => setEmployees([]));
  }, []);
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);
  useEffect(() => { setSkip(0); }, [q, filters]);

  const toggleFilter = (key: string) =>
    setFilters((f) => (f.includes(key) ? f.filter((x) => x !== key) : [...f, key]));

  const act = async (row: LeaveRow, action: 'submit' | 'approve' | 'refuse' | 'cancel' | 'reset') => {
    if (action === 'refuse') {
      const reason = prompt(`Why is ${row.employeeName}'s ${row.leaveTypeName} refused?`);
      if (reason === null) return;
      setBusyId(row.id);
      setError('');
      try { await adminApi.leaveAction(row.id, 'refuse', reason); load(); }
      catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
      finally { setBusyId(null); }
      return;
    }
    setBusyId(row.id);
    setError('');
    try { await adminApi.leaveAction(row.id, action); load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setBusyId(null); }
  };

  const remove = async (row: LeaveRow) => {
    if (!confirm(`Delete this ${row.leaveTypeName} request for ${row.employeeName}?`)) return;
    setError('');
    try { await adminApi.deleteLeave(row.id); load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
  };

  if (tab === 'allocations') {
    return (
      <AllocationsView
        config={config}
        employees={employees}
        onBack={() => { setTab('requests'); load(); }}
      />
    );
  }

  return (
    <ViewShell
      title="Time Off"
      onNew={() => setCreating(true)}
      newLabel="New Request"
      search={q}
      onSearch={setQ}
      searchPlaceholder="Search employee…"
      filters={FILTERS}
      activeFilters={filters}
      onToggleFilter={toggleFilter}
      skip={skip}
      take={PAGE}
      total={total}
      onPage={setSkip}
    >
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setTab('allocations')} className="btn-ghost">
          <Wallet size={15} /> Allocations
        </button>
        <span className="ml-auto text-[13px] text-odoo-dim">
          <span className="font-bold tabular-nums text-odoo-ink">{totalDays}</span> days in this view
        </span>
      </div>

      {error && <p className="rounded bg-odoo-bad/15 px-3 py-2 text-sm text-odoo-bad">{error}</p>}

      {creating && config && (
        <LeaveForm
          config={config}
          employees={employees}
          onClose={() => setCreating(false)}
          onSaved={() => { setCreating(false); load(); }}
        />
      )}

      {!rows ? (
        <div className="grid place-items-center py-24 text-odoo-faint"><Loader2 className="animate-spin" /></div>
      ) : rows.length === 0 ? (
        <div className="card grid place-items-center py-24 text-odoo-dim">No requests match this selection.</div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="px-4 text-left">Employee</th>
                  <th className="px-4 text-left">Type</th>
                  <th className="px-4 text-left">From</th>
                  <th className="px-4 text-left">To</th>
                  <th className="px-4 text-right">Days</th>
                  <th className="px-4 text-left">Pay</th>
                  <th className="px-4 text-left">Status</th>
                  <th className="px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4">
                      <span className="block font-semibold">{r.employeeName}</span>
                      {r.departmentName && <span className="block text-xs text-odoo-faint">{r.departmentName}</span>}
                    </td>
                    <td className="px-4">{r.leaveTypeName}</td>
                    <td className="px-4 tabular-nums text-odoo-dim">{r.dateFrom}</td>
                    <td className="px-4 tabular-nums text-odoo-dim">{r.dateTo}</td>
                    <td className="px-4 text-right font-bold tabular-nums">{r.days}</td>
                    <td className="px-4 tabular-nums text-odoo-dim">{r.payPercent}%</td>
                    <td className="px-4">
                      <LeaveStateBadge state={r.state} />
                      {r.state === 'REFUSED' && r.refusedReason && (
                        <span className="mt-0.5 block max-w-[180px] truncate text-[11px] text-odoo-faint" title={r.refusedReason}>
                          {r.refusedReason}
                        </span>
                      )}
                    </td>
                    <td className="px-4">
                      <div className="flex justify-end gap-1">
                        {busyId === r.id ? (
                          <Loader2 size={15} className="animate-spin text-odoo-faint" />
                        ) : (
                          <>
                            {r.state === 'DRAFT' && (
                              <IconAction Icon={Send} title="Submit for approval" onClick={() => act(r, 'submit')} />
                            )}
                            {(r.state === 'TO_APPROVE' || r.state === 'DRAFT') && (
                              <IconAction Icon={Check} title="Approve" tone="ok" onClick={() => act(r, 'approve')} />
                            )}
                            {r.state === 'TO_APPROVE' && (
                              <IconAction Icon={X} title="Refuse" tone="bad" onClick={() => act(r, 'refuse')} />
                            )}
                            {r.state === 'APPROVED' && (
                              <>
                                <IconAction Icon={Ban} title="Cancel" onClick={() => act(r, 'cancel')} />
                                <IconAction Icon={Undo2} title="Reset to draft" onClick={() => act(r, 'reset')} />
                              </>
                            )}
                            {(r.state === 'REFUSED' || r.state === 'CANCELLED') && (
                              <IconAction Icon={Undo2} title="Reset to draft" onClick={() => act(r, 'reset')} />
                            )}
                            {r.state !== 'APPROVED' && (
                              <IconAction Icon={Trash2} title="Delete" tone="bad" onClick={() => remove(r)} />
                            )}
                          </>
                        )}
                      </div>
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

function IconAction({
  Icon, title, onClick, tone,
}: { Icon: typeof Check; title: string; onClick: () => void; tone?: 'ok' | 'bad' }) {
  const hover = tone === 'ok' ? 'hover:bg-odoo-ok/15 hover:text-odoo-ok'
    : tone === 'bad' ? 'hover:bg-odoo-bad/15 hover:text-odoo-bad'
    : 'hover:bg-odoo-raised hover:text-odoo-ink';
  return (
    <button onClick={onClick} title={title} className={`grid h-7 w-7 place-items-center rounded text-odoo-faint ${hover}`}>
      <Icon size={14} />
    </button>
  );
}

// ---------- New request ----------

function LeaveForm({
  config, employees, onClose, onSaved,
}: {
  config: HrConfig;
  employees: Employee[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<LeaveInput>({
    employeeId: 0, leaveTypeId: config.leaveTypes[0]?.id ?? 0,
    dateFrom: '', dateTo: '', reason: '',
  });
  const [days, setDays] = useState<number | null>(null);
  const [overridden, setOverridden] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Ask the server what the range costs — it knows the employee's rest days.
  useEffect(() => {
    if (overridden || !form.employeeId || !form.dateFrom || !form.dateTo) return;
    let cancelled = false;
    adminApi
      .proposeLeaveDays(form.employeeId, form.dateFrom, form.dateTo)
      .then((d) => { if (!cancelled) setDays(d.days); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [form.employeeId, form.dateFrom, form.dateTo, overridden]);

  const type = config.leaveTypes.find((t) => t.id === form.leaveTypeId);

  const save = async (draft: boolean) => {
    if (!form.employeeId || !form.dateFrom || !form.dateTo) {
      setError('Pick an employee and both dates.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await adminApi.createLeave({ ...form, days: days ?? undefined, draft });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
      setSaving(false);
    }
  };

  return (
    <div className="card space-y-4 p-5">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-bold"><Plane size={16} /> New time off request</h2>
        <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded hover:bg-odoo-raised"><X size={15} /></button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <SelectField
          label="Employee"
          value={form.employeeId || null}
          onChange={(v) => setForm((f) => ({ ...f, employeeId: Number(v) || 0 }))}
          options={employees.map((e) => ({ value: e.id, label: e.name }))}
          required
        />
        <SelectField
          label="Leave Type"
          value={form.leaveTypeId || null}
          onChange={(v) => setForm((f) => ({ ...f, leaveTypeId: Number(v) || 0 }))}
          options={config.leaveTypes.map((t) => ({ value: t.id, label: t.name }))}
          required
        />
        <div>
          <span className="label">From<span className="ml-0.5 text-odoo-bad">*</span></span>
          <input
            type="date"
            value={form.dateFrom}
            onChange={(e) => setForm((f) => ({ ...f, dateFrom: e.target.value, dateTo: f.dateTo || e.target.value }))}
            className="input"
          />
        </div>
        <div>
          <span className="label">To<span className="ml-0.5 text-odoo-bad">*</span></span>
          <input
            type="date"
            value={form.dateTo}
            min={form.dateFrom || undefined}
            onChange={(e) => setForm((f) => ({ ...f, dateTo: e.target.value }))}
            className="input"
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <NumberField
          label="Days"
          value={days ?? 0}
          onChange={(v) => { setDays(v); setOverridden(true); }}
          step="0.5"
          min={0.5}
          hint={overridden
            ? 'Typed in by hand — the calculated figure is no longer applied.'
            : "Worked out from the range and the employee's schedule. Change it for a half day."}
        />
        <div>
          <span className="label">Reason</span>
          <input
            value={form.reason ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
            className="input"
          />
        </div>
      </div>

      {type && (
        <p className="text-[13px] text-odoo-dim">
          {type.requiresAllocation
            ? 'Draws on the employee’s allocation. Approval is refused if the balance will not cover it.'
            : 'No allocation needed.'}
          {type.payPercent < 100 && ` Paid at ${type.payPercent}% of salary.`}
        </p>
      )}

      {error && <p className="rounded bg-odoo-bad/15 px-3 py-2 text-sm text-odoo-bad">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <button onClick={() => save(false)} disabled={saving} className="btn-primary disabled:opacity-40">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <><Save size={16} /> Submit for approval</>}
        </button>
        <button onClick={() => save(true)} disabled={saving} className="btn-ghost">Save as draft</button>
        <button onClick={onClose} className="btn-ghost">Cancel</button>
      </div>
    </div>
  );
}

// ---------- Allocations ----------

function AllocationsView({
  config, employees, onBack,
}: { config: HrConfig | null; employees: Employee[]; onBack: () => void }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [rows, setRows] = useState<Allocation[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    adminApi.allocations({ year }).then(setRows).catch(() => setRows([]));
  }, [year]);
  useEffect(() => { load(); }, [load]);

  const remove = async (a: Allocation) => {
    if (!confirm(`Remove ${a.employeeName}'s ${a.days} days of ${a.leaveTypeName} for ${a.year}?`)) return;
    setError('');
    try { await adminApi.deleteAllocation(a.id); load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
  };

  return (
    <ViewShell
      title="Time Off"
      breadcrumb={`Allocations ${year}`}
      onBack={onBack}
      onNew={() => setAdding(true)}
      newLabel="Grant Days"
      search=""
      onSearch={() => {}}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] text-odoo-dim">Year</span>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="input w-28">
          {[year - 2, year - 1, year, year + 1].filter((v, i, a) => a.indexOf(v) === i).sort().map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <p className="ml-auto max-w-lg text-right text-[13px] text-odoo-faint">
          One allocation per employee, type and year. Granting again replaces the figure rather than adding to it.
        </p>
      </div>

      {error && <p className="rounded bg-odoo-bad/15 px-3 py-2 text-sm text-odoo-bad">{error}</p>}

      {adding && config && (
        <AllocationForm
          config={config}
          employees={employees}
          year={year}
          onClose={() => setAdding(false)}
          onSaved={() => { setAdding(false); load(); }}
        />
      )}

      {!rows ? (
        <div className="grid place-items-center py-24 text-odoo-faint"><Loader2 className="animate-spin" /></div>
      ) : rows.length === 0 ? (
        <div className="card grid place-items-center py-24 text-center text-odoo-dim">
          <span>
            No days allocated for {year}.
            <span className="mt-1 block text-[13px] text-odoo-faint">
              Annual leave cannot be approved until an allocation exists.
            </span>
          </span>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="px-4 text-left">Employee</th>
                  <th className="px-4 text-left">Department</th>
                  <th className="px-4 text-left">Leave Type</th>
                  <th className="px-4 text-right">Days</th>
                  <th className="px-4 text-left">Note</th>
                  <th className="px-4"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id}>
                    <td className="px-4 font-semibold">{a.employeeName}</td>
                    <td className="px-4 text-odoo-dim">{a.departmentName || '—'}</td>
                    <td className="px-4">{a.leaveTypeName}</td>
                    <td className="px-4 text-right font-bold tabular-nums">{a.days}</td>
                    <td className="px-4 text-odoo-dim">{a.note || '—'}</td>
                    <td className="px-4 text-right">
                      <IconAction Icon={Trash2} title="Remove" tone="bad" onClick={() => remove(a)} />
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

function AllocationForm({
  config, employees, year, onClose, onSaved,
}: {
  config: HrConfig;
  employees: Employee[];
  year: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const allocTypes = config.leaveTypes.filter((t) => t.requiresAllocation);
  const [employeeId, setEmployeeId] = useState<number | null>(null);
  const [leaveTypeId, setLeaveTypeId] = useState<number | null>(allocTypes[0]?.id ?? null);
  const [days, setDays] = useState(allocTypes[0]?.maxDaysPerYear ?? 30);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!employeeId || !leaveTypeId) { setError('Pick an employee and a leave type.'); return; }
    setSaving(true);
    setError('');
    try {
      await adminApi.saveAllocation({ employeeId, leaveTypeId, year, days, note });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
      setSaving(false);
    }
  };

  return (
    <div className="card space-y-4 p-5">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-bold"><Plus size={16} /> Grant days for {year}</h2>
        <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded hover:bg-odoo-raised"><X size={15} /></button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <SelectField
          label="Employee"
          value={employeeId}
          onChange={setEmployeeId}
          options={employees.map((e) => ({ value: e.id, label: e.name }))}
          required
        />
        <SelectField
          label="Leave Type"
          value={leaveTypeId}
          onChange={(v) => {
            setLeaveTypeId(v);
            const t = allocTypes.find((x) => x.id === v);
            if (t?.maxDaysPerYear) setDays(t.maxDaysPerYear);
          }}
          options={allocTypes.map((t) => ({ value: t.id, label: t.name }))}
          required
        />
        <NumberField label="Days" value={days} onChange={setDays} step="0.5" min={0} />
        <div>
          <span className="label">Note</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} className="input" />
        </div>
      </div>

      {error && <p className="rounded bg-odoo-bad/15 px-3 py-2 text-sm text-odoo-bad">{error}</p>}

      <div className="flex gap-2">
        <button onClick={save} disabled={saving} className="btn-primary disabled:opacity-40">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <><Save size={16} /> Save</>}
        </button>
        <button onClick={onClose} className="btn-ghost">Cancel</button>
      </div>
    </div>
  );
}
