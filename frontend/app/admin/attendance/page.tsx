'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Loader2, Clock, LogIn, LogOut, ScanLine, Trash2, X, Save,
} from 'lucide-react';
import { adminApi, AttendanceRow, Employee, PunchResult } from '@/lib/adminApi';
import ViewShell from '@/components/odoo/ViewShell';
import { SelectField } from '@/components/odoo/Field';

/**
 * Attendance — the punch log, plus the kiosk that produces it.
 *
 * A shift is credited to the day it STARTED, not the clock date: the reference
 * runs three overnight schedules (11 PM to 10 AM among them), so a shift that
 * ends on Monday morning still belongs to Sunday. The `day` column comes from
 * the server for exactly that reason.
 */

const FILTERS = [
  { key: 'today', label: 'Today' },
  { key: 'open', label: 'Still checked in' },
];
const PAGE = 50;

function fmtTime(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export default function AttendancePage() {
  const [rows, setRows] = useState<AttendanceRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [totalHours, setTotalHours] = useState(0);
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState<string[]>(['today']);
  const [skip, setSkip] = useState(0);
  const [kiosk, setKiosk] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    adminApi
      .attendance({ q, filters, skip, limit: PAGE })
      .then((d) => { setRows(d.rows); setTotal(d.total); setTotalHours(d.totalHours); })
      .catch(() => { setRows([]); setTotal(0); });
  }, [q, filters, skip]);

  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);
  useEffect(() => { setSkip(0); }, [q, filters]);

  const toggleFilter = (key: string) =>
    setFilters((f) => (f.includes(key) ? f.filter((x) => x !== key) : [...f, key]));

  const remove = async (row: AttendanceRow) => {
    if (!confirm(`Delete ${row.employeeName}'s attendance on ${row.day}? This cannot be undone.`)) return;
    setError('');
    try {
      await adminApi.deleteAttendance(row.id);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete');
    }
  };

  if (kiosk) return <Kiosk onExit={() => { setKiosk(false); load(); }} />;

  return (
    <ViewShell
      title="Attendance"
      onNew={() => setAdding(true)}
      newLabel="Add Entry"
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
        <button onClick={() => setKiosk(true)} className="btn-primary">
          <ScanLine size={16} /> Open the Kiosk
        </button>
        <span className="ml-auto text-[13px] text-odoo-dim">
          <span className="font-bold tabular-nums text-odoo-ink">{totalHours.toFixed(2)}</span> hours in this view
        </span>
      </div>

      {error && <p className="rounded bg-odoo-bad/15 px-3 py-2 text-sm text-odoo-bad">{error}</p>}
      {adding && <ManualEntry onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} />}

      {!rows ? (
        <div className="grid place-items-center py-24 text-odoo-faint"><Loader2 className="animate-spin" /></div>
      ) : rows.length === 0 ? (
        <div className="card grid place-items-center py-24 text-odoo-dim">
          No attendance for this selection.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="px-4 text-left">Employee</th>
                  <th className="px-4 text-left">Department</th>
                  <th className="px-4 text-left">Day</th>
                  <th className="px-4 text-left">Check In</th>
                  <th className="px-4 text-left">Check Out</th>
                  <th className="px-4 text-right">Hours</th>
                  <th className="px-4 text-left">Source</th>
                  <th className="px-4"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const overnight = r.checkOut && new Date(r.checkOut).getUTCDate() !== new Date(r.checkIn).getUTCDate();
                  return (
                    <tr key={r.id}>
                      <td className="px-4 font-semibold">{r.employeeName}</td>
                      <td className="px-4 text-odoo-dim">{r.departmentName || '—'}</td>
                      <td className="px-4 tabular-nums text-odoo-dim">{r.day}</td>
                      <td className="px-4 tabular-nums">{fmtTime(r.checkIn)}</td>
                      <td className="px-4 tabular-nums">
                        {r.checkOut ? (
                          <>
                            {fmtTime(r.checkOut)}
                            {overnight && <span className="ml-1 text-[11px] text-odoo-info">+1</span>}
                          </>
                        ) : (
                          <span className="inline-flex items-center gap-1 font-semibold text-odoo-ok">
                            <Clock size={12} /> still in
                          </span>
                        )}
                      </td>
                      <td className="px-4 text-right font-bold tabular-nums">
                        {r.checkOut ? r.workedHours.toFixed(2) : '—'}
                      </td>
                      <td className="px-4">
                        <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${
                          r.source === 'KIOSK' ? 'bg-odoo-info/15 text-odoo-info' : 'bg-odoo-raised text-odoo-dim'
                        }`}>
                          {r.source === 'KIOSK' ? 'Kiosk' : 'Manual'}
                        </span>
                      </td>
                      <td className="px-4 text-right">
                        <button
                          onClick={() => remove(r)}
                          title="Delete this entry"
                          className="grid h-7 w-7 place-items-center rounded text-odoo-faint hover:bg-odoo-bad/15 hover:text-odoo-bad"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
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

// ---------- Manual entry ----------

function ManualEntry({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeId, setEmployeeId] = useState<number | null>(null);
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    adminApi.employees({ limit: 500 }).then((d) => setEmployees(d.rows)).catch(() => setEmployees([]));
  }, []);

  const save = async () => {
    if (!employeeId || !checkIn) { setError('Pick an employee and a check-in time.'); return; }
    setSaving(true);
    setError('');
    try {
      await adminApi.createAttendance({
        employeeId,
        // A datetime-local value carries no zone; the browser's own zone is the
        // right reading, since whoever types it is standing in Kuwait.
        checkIn: new Date(checkIn).toISOString(),
        checkOut: checkOut ? new Date(checkOut).toISOString() : null,
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
      setSaving(false);
    }
  };

  return (
    <div className="card space-y-4 p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-bold">Add an attendance entry</h2>
        <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded hover:bg-odoo-raised"><X size={15} /></button>
      </div>
      <p className="text-[13px] text-odoo-dim">
        For correcting a missed punch. Leave the check-out empty to record someone who is still in.
      </p>

      <div className="grid gap-4 md:grid-cols-3">
        <SelectField
          label="Employee"
          value={employeeId}
          onChange={setEmployeeId}
          options={employees.map((e) => ({ value: e.id, label: e.name }))}
          required
        />
        <div>
          <span className="label">Check In<span className="ml-0.5 text-odoo-bad">*</span></span>
          <input type="datetime-local" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} className="input" />
        </div>
        <div>
          <span className="label">Check Out</span>
          <input type="datetime-local" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} className="input" />
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

// ---------- Kiosk ----------

/**
 * The kiosk. One field, one action: a badge scan or a typed PIN toggles the
 * employee in or out, and the device is never told which direction to expect —
 * the server decides from the open attendance row.
 *
 * Badge scanners type the code and press Enter, so the form submit handles both
 * the scanner and a person using the on-screen keypad.
 */
function Kiosk({ onExit }: { onExit: () => void }) {
  const [code, setCode] = useState('');
  const [result, setResult] = useState<PunchResult | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Keep focus in the field: a scanner types wherever the caret is, and a lost
  // caret means a scan lands nowhere.
  useEffect(() => {
    const focus = () => inputRef.current?.focus();
    focus();
    const t = setInterval(focus, 1500);
    return () => clearInterval(t);
  }, []);

  // Clear the confirmation after a few seconds so the next person sees a clean
  // screen rather than the previous employee's name.
  useEffect(() => {
    if (!result && !error) return;
    const t = setTimeout(() => { setResult(null); setError(''); }, 4000);
    return () => clearTimeout(t);
  }, [result, error]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = code.trim();
    if (!value) return;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      // A badge is scanned, a PIN is typed. Sending both lets the server match
      // on either without the kiosk having to know which it just received.
      const r = await adminApi.punch({ badgeId: value, pin: value });
      setResult(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record that punch');
    } finally {
      setBusy(false);
      setCode('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-odoo-ground">
      <header className="flex h-[46px] shrink-0 items-center gap-3 border-b border-odoo-line bg-odoo-surface px-4">
        <ScanLine size={17} className="text-odoo-lift" />
        <span className="text-[13px] font-semibold">Attendance Kiosk</span>
        <span className="ml-auto tabular-nums text-[13px] text-odoo-dim">
          {now.toLocaleTimeString('en-GB')}
        </span>
        <button onClick={onExit} className="btn-ghost h-7 px-2 text-[13px]">
          <X size={14} /> Close
        </button>
      </header>

      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md text-center">
          <div className="mb-1 text-5xl font-extrabold tabular-nums">
            {now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
          </div>
          <div className="mb-8 text-[13px] text-odoo-dim">
            {now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </div>

          <form onSubmit={submit}>
            <input
              ref={inputRef}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Scan a badge or type your PIN"
              autoComplete="off"
              className="input h-14 text-center text-2xl tracking-[0.3em]"
            />
            <button type="submit" disabled={busy || !code.trim()} className="btn-primary mt-3 h-12 w-full text-base disabled:opacity-40">
              {busy ? <Loader2 size={18} className="animate-spin" /> : 'Punch'}
            </button>
          </form>

          <div className="mt-6 min-h-[92px]">
            {result && (
              <div className={`rounded border p-4 ${
                result.direction === 'in'
                  ? 'border-odoo-ok/40 bg-odoo-ok/10'
                  : 'border-odoo-info/40 bg-odoo-info/10'
              }`}>
                <div className={`flex items-center justify-center gap-2 text-lg font-extrabold ${
                  result.direction === 'in' ? 'text-odoo-ok' : 'text-odoo-info'
                }`}>
                  {result.direction === 'in' ? <LogIn size={20} /> : <LogOut size={20} />}
                  {result.direction === 'in' ? 'Checked in' : 'Checked out'}
                </div>
                <div className="mt-1 font-semibold">{result.employee.name}</div>
                <div className="text-[13px] text-odoo-dim">
                  {new Date(result.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                  {result.direction === 'out' && ` · ${result.workedHours.toFixed(2)} hours worked`}
                </div>
              </div>
            )}
            {error && (
              <div className="rounded border border-odoo-bad/40 bg-odoo-bad/10 p-4 text-sm font-semibold text-odoo-bad">
                {error}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
