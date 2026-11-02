'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Loader2, Save, X, Archive, ArchiveRestore, IdCard, Plane, FileBadge,
  CalendarClock, Clock, LogIn, LogOut, Users, AlertTriangle, Briefcase,
  Calendar, SlidersHorizontal, Check, Camera, UserRound, BellRing,
} from 'lucide-react';
import {
  adminApi, DepartmentCounts, Employee, EmployeeDetail, EmployeeInput,
  EmployeeTag, HrConfig, LeaveBalance,
} from '@/lib/adminApi';
import ViewShell, { SmartButton, Notebook, StatusBar, ViewMode } from '@/components/odoo/ViewShell';
import Chatter from '@/components/odoo/Chatter';
import { Field, NumberField, SelectField, ReadField } from '@/components/odoo/Field';
import LeaveStateBadge from '@/components/odoo/LeaveStateBadge';
import SearchPanel from '@/components/odoo/SearchPanel';
import { StatusBadge, DocBadge, EmployeeIdPill, TagPill, STATUS_LABEL } from '@/components/odoo/EmployeeBadges';

/**
 * Employees — laid out to match the reference instance's own Employees app.
 *
 * Kanban is the DEFAULT view there, not the list: 382 photo cards with the
 * status and document validity readable at a glance is how HR actually uses it.
 * The department rail down the left is the reference's `<searchpanel>`, and the
 * status and document pills use its solid-fill styling rather than this admin's
 * usual tinted chips — deliberately, so they carry across a wall of cards.
 */

const FILTERS = [
  { key: 'status:WORKING', label: 'Working' },
  { key: 'status:ON_PROBATION', label: 'On Probation' },
  { key: 'status:ON_LEAVE', label: 'On Leave' },
  { key: 'atwork', label: 'At Work (checked in)' },
  { key: 'offtoday', label: 'On Time Off today' },
  { key: 'newhires', label: 'Newly Hired (90 days)' },
  { key: 'expiring', label: 'Documents expiring (60 days)' },
  { key: 'nodocs', label: 'Missing a document' },
  { key: 'kiosk', label: 'Has a kiosk badge' },
  { key: 'archived', label: 'Archived' },
];
const GROUPS = [
  { key: 'department', label: 'Department' },
  { key: 'jobPosition', label: 'Job Position' },
  { key: 'manager', label: 'Manager' },
  { key: 'status', label: 'Status' },
  { key: 'employeeType', label: 'Employee Type' },
  { key: 'schedule', label: 'Working Schedule' },
];
const PAGE = 40;

/** List columns the reference marks `optional` — hidden until asked for. */
const OPTIONAL_COLUMNS = [
  { key: 'civilId', label: 'Civil ID' },
  { key: 'passport', label: 'Passport' },
  { key: 'workPermit', label: 'Work Permit' },
  { key: 'schedule', label: 'Working Schedule' },
  { key: 'nationality', label: 'Nationality' },
  { key: 'hireDate', label: 'Hire Date' },
  { key: 'employeeType', label: 'Employee Type' },
  { key: 'badgeId', label: 'Badge ID' },
  { key: 'tags', label: 'Tags' },
];
const COLUMNS_KEY = 'da-hr-employee-columns';

const EMPTY: EmployeeInput = {
  name: '', nameAr: '', ref: '', status: 'WORKING', employeeType: 'EMPLOYEE',
  departmentId: null, jobPositionId: null, jobTitle: '', managerId: null, workLocation: '',
  workEmail: '', workPhone: '', mobile: '', privatePhone: '',
  nationality: '', birthday: null, gender: null, marital: null,
  civilId: '', civilIdExpiry: null, passportNo: '', passportExpiry: null,
  workPermitNo: '', workPermitExpiry: null, badgeId: '', pin: '',
  workScheduleId: null, hireDate: null, endDate: null, monthlySalary: 0,
  emergencyContact: '', emergencyPhone: '', notes: '', tagIds: [],
};

/** Days until a date, negative once it has passed. */
function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(`${iso}T00:00:00Z`).getTime() - Date.now()) / 86_400_000);
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

/**
 * A stable colour per employee, so the same person keeps the same tile every
 * time the list loads. Derived from the name, not the id, so it survives an
 * import that renumbers everybody.
 */
const PHOTO_TINTS = [
  'from-indigo-500 to-indigo-700', 'from-emerald-500 to-emerald-700', 'from-rose-500 to-rose-700',
  'from-amber-500 to-orange-600', 'from-sky-500 to-blue-700', 'from-violet-500 to-purple-700',
  'from-teal-500 to-teal-700', 'from-fuchsia-500 to-pink-700',
];
function tintFor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PHOTO_TINTS[h % PHOTO_TINTS.length];
}

export default function EmployeesPage() {
  const [rows, setRows] = useState<Employee[] | null>(null);
  const [total, setTotal] = useState(0);
  const [groups, setGroups] = useState<{ key: string; label: string; count: number }[] | undefined>();
  const [panel, setPanel] = useState<DepartmentCounts | null>(null);
  const [depts, setDepts] = useState<number[]>([]);
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState<string[]>([]);
  const [groupBy, setGroupBy] = useState('');
  // Kanban first — that is the reference's default, and it is the view that
  // makes 382 people scannable.
  const [view, setView] = useState<ViewMode>('kanban');
  const [skip, setSkip] = useState(0);
  const [openId, setOpenId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [columns, setColumns] = useState<string[]>([]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(COLUMNS_KEY);
      if (saved) setColumns(JSON.parse(saved));
    } catch { /* first run, or storage blocked */ }
  }, []);

  /**
   * Functional update, not `setColumns(next)` from a value the caller computed.
   * Two toggles in the same tick both close over the same `columns` array, so
   * the second silently discards the first — which is exactly what happens when
   * someone ticks several columns quickly.
   */
  const toggleColumn = (key: string) => {
    setColumns((prev) => {
      const next = prev.includes(key) ? prev.filter((c) => c !== key) : [...prev, key];
      try { localStorage.setItem(COLUMNS_KEY, JSON.stringify(next)); } catch { /* storage blocked */ }
      return next;
    });
  };

  const load = useCallback(() => {
    adminApi
      .employees({ q, filters, groupBy, departmentId: depts, skip, limit: PAGE })
      .then((d) => { setRows(d.rows); setTotal(d.total); setGroups(d.groups); })
      .catch(() => { setRows([]); setTotal(0); });
  }, [q, filters, groupBy, depts, skip]);

  const loadPanel = useCallback(() => {
    adminApi.departmentCounts(filters).then(setPanel).catch(() => setPanel(null));
  }, [filters]);

  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);
  useEffect(() => { loadPanel(); }, [loadPanel]);
  useEffect(() => { setSkip(0); }, [q, filters, groupBy, depts]);

  const toggleFilter = (key: string) =>
    setFilters((f) => (f.includes(key) ? f.filter((x) => x !== key) : [...f, key]));

  if (creating || openId != null) {
    return (
      <EmployeeForm
        id={openId}
        onClose={() => { setCreating(false); setOpenId(null); load(); loadPanel(); }}
      />
    );
  }

  return (
    <div className="-mt-1 flex min-h-[75vh]">
      <SearchPanel
        title="Department"
        Icon={Users}
        total={panel?.total ?? 0}
        items={(panel?.departments ?? []).map((d) => ({
          id: d.id, label: d.name, sublabel: d.nameAr, count: d.count,
        }))}
        selected={depts}
        onToggle={(id) => setDepts((d) => (d.includes(id as number) ? d.filter((x) => x !== id) : [...d, id as number]))}
        onClear={() => setDepts([])}
      />

      <div className="min-w-0 flex-1 pl-4">
        <ViewShell
          title="Employees"
          onNew={() => setCreating(true)}
          newLabel="New"
          search={q}
          onSearch={setQ}
          searchPlaceholder="Search name, Employee ID, Civil ID, passport, badge…"
          filters={FILTERS}
          activeFilters={filters}
          onToggleFilter={toggleFilter}
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
                  <span className="font-semibold">{g.label}</span>
                  <span className="ml-2 rounded bg-odoo-raised px-1.5 text-xs font-bold tabular-nums text-odoo-dim">{g.count}</span>
                </span>
              ))}
            </div>
          )}

          {!rows ? (
            <div className="grid place-items-center py-24 text-odoo-faint"><Loader2 className="animate-spin" /></div>
          ) : rows.length === 0 ? (
            <div className="card grid place-items-center py-24 text-odoo-dim">No employees match this search.</div>
          ) : view === 'kanban' ? (
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(268px,1fr))]">
              {rows.map((e) => <EmployeeCard key={e.id} e={e} onOpen={() => setOpenId(e.id)} />)}
            </div>
          ) : (
            <EmployeeList
              rows={rows}
              columns={columns}
              onToggleColumn={toggleColumn}
              onOpen={setOpenId}
            />
          )}
        </ViewShell>
      </div>
    </div>
  );
}

// ---------- Kanban ----------

/**
 * The reference's card: photo down the left at full card height, everything
 * else stacked beside it. Without real photos a tinted initials tile stands in —
 * it holds the same shape, so the grid does not reflow once photos arrive.
 */
function EmployeeCard({ e, onOpen }: { e: Employee; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className={`card group flex overflow-hidden p-0 text-left transition hover:border-odoo-lift ${!e.active ? 'opacity-50' : ''}`}
    >
      <span className="w-[72px] shrink-0 self-stretch">
        {e.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={e.imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className={`grid h-full min-h-[150px] w-full place-items-center bg-gradient-to-br ${tintFor(e.name)} text-lg font-bold text-white`}>
            {initials(e.name)}
          </span>
        )}
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-1.5 p-2.5">
        <span className="flex items-start gap-2">
          <EmployeeIdPill value={e.ref} />
          {!e.active && <span className="ml-auto text-[10px] font-bold uppercase text-odoo-faint">Archived</span>}
        </span>

        <span><StatusBadge status={e.status} /></span>

        {/* Two lines, then clip — the reference wraps names rather than cutting
            them at one line, because a truncated Arabic or four-part name is
            unidentifiable. */}
        <span className="line-clamp-2 text-[13px] font-bold leading-tight">{e.name}</span>

        {(e.jobTitle || e.jobPositionName) && (
          <span className="flex items-center gap-1.5 truncate text-xs text-odoo-dim">
            <Briefcase size={11} className="shrink-0 text-odoo-lift" />
            <span className="truncate">{e.jobTitle || e.jobPositionName}</span>
          </span>
        )}

        {e.hireDate && (
          <span className="flex items-center gap-1.5 text-xs text-odoo-dim">
            <Calendar size={11} className="shrink-0 text-odoo-faint" />
            {new Date(`${e.hireDate}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
        )}

        {!!e.tags.length && (
          <span className="flex flex-wrap gap-1">
            {e.tags.map((t) => <TagPill key={t.id} tag={t} />)}
          </span>
        )}

        <span className="mt-auto flex flex-wrap items-center gap-1 pt-1">
          <DocBadge label="Civil ID" status={e.docs.civilId} />
          <DocBadge label="Passport" status={e.docs.passport} />
          {e.badgeId && <IdCard size={13} className="ml-auto text-odoo-faint" />}
        </span>
      </span>
    </button>
  );
}

// ---------- List ----------

function EmployeeList({
  rows, columns, onToggleColumn, onOpen,
}: {
  rows: Employee[];
  columns: string[];
  onToggleColumn: (key: string) => void;
  onOpen: (id: number) => void;
}) {
  const has = (k: string) => columns.includes(k);

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="w-[30px] px-2"></th>
              <th className="px-3 text-left">Employee ID</th>
              <th className="px-3 text-left">Employee Name</th>
              <th className="px-3 text-left">Work Phone</th>
              <th className="px-3 text-left">Employee Status</th>
              <th className="px-3 text-left">Department</th>
              <th className="px-3 text-left">Job</th>
              <th className="px-3 text-left">Manager</th>
              {has('employeeType') && <th className="px-3 text-left">Type</th>}
              {has('schedule') && <th className="px-3 text-left">Schedule</th>}
              {has('nationality') && <th className="px-3 text-left">Nationality</th>}
              {has('hireDate') && <th className="px-3 text-left">Hire Date</th>}
              {has('civilId') && <th className="px-3 text-left">Civil ID</th>}
              {has('passport') && <th className="px-3 text-left">Passport</th>}
              {has('workPermit') && <th className="px-3 text-left">Work Permit</th>}
              {has('badgeId') && <th className="px-3 text-left">Badge ID</th>}
              {has('tags') && <th className="px-3 text-left">Tags</th>}
              <th className="w-[38px] px-2">
                <ColumnPicker columns={columns} onToggle={onToggleColumn} />
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id} onClick={() => onOpen(e.id)} className={`cursor-pointer ${!e.active ? 'opacity-50' : ''}`}>
                <td className="px-2">
                  <span className={`grid h-6 w-6 place-items-center rounded-md bg-gradient-to-br ${tintFor(e.name)} text-[9px] font-bold text-white`}>
                    {initials(e.name)}
                  </span>
                </td>
                <td className="px-3 tabular-nums text-odoo-dim">{e.ref || '—'}</td>
                <td className="px-3 font-semibold">{e.name}</td>
                <td className="px-3 text-odoo-dim">{e.workPhone || e.mobile || '—'}</td>
                <td className="px-3"><StatusBadge status={e.status} /></td>
                <td className="px-3 text-odoo-dim">{e.departmentName || '—'}</td>
                <td className="px-3 text-odoo-dim">{e.jobPositionName || e.jobTitle || '—'}</td>
                <td className="px-3 text-odoo-dim">{e.managerName || '—'}</td>
                {has('employeeType') && <td className="px-3 text-odoo-dim">{e.employeeType.toLowerCase()}</td>}
                {has('schedule') && <td className="px-3 text-odoo-dim">{e.workScheduleName || '—'}</td>}
                {has('nationality') && <td className="px-3 text-odoo-dim">{e.nationality || '—'}</td>}
                {has('hireDate') && <td className="px-3 tabular-nums text-odoo-dim">{e.hireDate || '—'}</td>}
                {has('civilId') && <td className="px-3"><DocBadge label="Civil ID" status={e.docs.civilId} /></td>}
                {has('passport') && <td className="px-3"><DocBadge label="Passport" status={e.docs.passport} /></td>}
                {has('workPermit') && <td className="px-3"><DocBadge label="Permit" status={e.docs.workPermit} /></td>}
                {has('badgeId') && <td className="px-3 tabular-nums text-odoo-dim">{e.badgeId || '—'}</td>}
                {has('tags') && (
                  <td className="px-3">
                    <span className="flex flex-wrap gap-1">{e.tags.map((t) => <TagPill key={t.id} tag={t} />)}</span>
                  </td>
                )}
                <td className="px-2"></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** The reference's optional-column dropdown, at the right end of the header. */
function ColumnPicker({ columns, onToggle }: { columns: string[]; onToggle: (key: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (ev: MouseEvent) => {
      if (ref.current && !ref.current.contains(ev.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={(ev) => { ev.stopPropagation(); setOpen((o) => !o); }}
        title="Choose columns"
        className="grid h-6 w-6 place-items-center rounded text-odoo-faint hover:bg-odoo-raised hover:text-odoo-ink"
      >
        <SlidersHorizontal size={14} />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 min-w-[190px] rounded border border-odoo-line bg-odoo-surface py-1 text-left shadow-xl">
          {OPTIONAL_COLUMNS.map((c) => (
            <button
              key={c.key}
              onClick={(ev) => { ev.stopPropagation(); onToggle(c.key); }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] font-normal normal-case tracking-normal text-odoo-ink hover:bg-white/[.06]"
            >
              <span className="grid h-4 w-4 place-items-center">
                {columns.includes(c.key) && <Check size={13} className="text-odoo-lift" />}
              </span>
              {c.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Form view ----------

function EmployeeForm({ id, onClose }: { id: number | null; onClose: () => void }) {
  const [form, setForm] = useState<EmployeeInput>(EMPTY);
  const [detail, setDetail] = useState<EmployeeDetail | null>(null);
  const [config, setConfig] = useState<HrConfig | null>(null);
  const [managers, setManagers] = useState<Employee[]>([]);
  const [allTags, setAllTags] = useState<EmployeeTag[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const set = (k: keyof EmployeeInput, v: any) => { setForm((f) => ({ ...f, [k]: v })); setDirty(true); };

  const reload = useCallback(() => {
    if (id == null) return;
    adminApi.employee(id).then((d) => {
      setDetail(d);
      setForm({ ...d, tagIds: d.tags.map((t) => t.id) } as EmployeeInput);
    }).catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    adminApi.hrConfig().then(setConfig).catch(() => setConfig(null));
    adminApi.employeeTags().then(setAllTags).catch(() => setAllTags([]));
    adminApi.employees({ limit: 500 }).then((d) => setManagers(d.rows)).catch(() => setManagers([]));
    reload();
  }, [reload]);

  // Job positions narrow to the chosen department when that department has any
  // of its own; otherwise every position stays selectable.
  const jobOptions = useMemo(() => {
    if (!config) return [];
    const inDept = config.jobPositions.filter((j) => j.departmentId === form.departmentId);
    const list = form.departmentId && inDept.length ? inDept : config.jobPositions;
    return list.map((j) => ({ value: j.id, label: j.name }));
  }, [config, form.departmentId]);

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      if (id == null) await adminApi.createEmployee(form);
      else await adminApi.updateEmployee(id, form);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the employee');
      setSaving(false);
    }
  };

  const archive = async () => {
    if (id == null) return;
    setError('');
    try {
      if (detail?.active) await adminApi.archiveEmployee(id);
      else await adminApi.unarchiveEmployee(id);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not archive');
    }
  };

  const punch = async () => {
    if (id == null || !detail) return;
    setBusy(true);
    setError('');
    try {
      if (detail.checkedIn) await adminApi.checkOut(id);
      else await adminApi.checkIn(id);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not record attendance');
    } finally {
      setBusy(false);
    }
  };

  const toggleTag = (tagId: number) =>
    set('tagIds', form.tagIds?.includes(tagId) ? form.tagIds.filter((t) => t !== tagId) : [...(form.tagIds || []), tagId]);

  if (id != null && !detail) {
    return <div className="grid place-items-center py-24 text-odoo-faint"><Loader2 className="animate-spin" /></div>;
  }

  const annual = detail?.balances.find((b) => b.requiresAllocation);

  return (
    <ViewShell
      title="Employees"
      breadcrumb={id == null ? 'New' : form.name || '—'}
      onBack={onClose}
      search=""
      onSearch={() => {}}
    >
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={save} disabled={saving || !dirty} className="btn-primary disabled:opacity-40">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <><Save size={16} /> Save</>}
        </button>
        <button onClick={onClose} className="btn-ghost"><X size={16} /> Discard</button>

        {detail && detail.active && (
          <button onClick={punch} disabled={busy} className="btn-ghost">
            {busy ? <Loader2 size={15} className="animate-spin" />
              : detail.checkedIn ? <><LogOut size={15} /> Check Out</> : <><LogIn size={15} /> Check In</>}
          </button>
        )}

        {id != null && (
          <button onClick={archive} className="btn-ghost ml-auto">
            {detail?.active ? <><Archive size={15} /> Archive</> : <><ArchiveRestore size={15} /> Unarchive</>}
          </button>
        )}
      </div>

      {error && <p className="rounded bg-odoo-bad/15 px-3 py-2 text-sm text-odoo-bad">{error}</p>}
      {detail && !detail.active && (
        <p className="rounded bg-odoo-raised px-3 py-2 text-sm font-semibold text-odoo-dim">This employee is archived.</p>
      )}
      {detail?.checkedIn && (
        <p className="flex items-center gap-2 rounded bg-odoo-ok/15 px-3 py-2 text-sm font-semibold text-odoo-ok">
          <Clock size={15} /> Checked in since {new Date(detail.checkedInSince!).toLocaleString('en-GB')}
        </p>
      )}

      {/* Status pipeline + presence, as the reference lays them out: the stages
          across the top of the sheet, the present/absent pill on the right. */}
      <div className="flex flex-wrap items-center gap-3">
        <StatusBar
          align="start"
          current={form.status ?? 'WORKING'}
          stages={(Object.keys(STATUS_LABEL) as (keyof typeof STATUS_LABEL)[]).map((k) => ({
            key: k, label: STATUS_LABEL[k],
          }))}
          onSelect={(k) => set('status', k)}
        />
        {detail && <span className="ml-auto"><PresencePill detail={detail} /></span>}
      </div>

      <div className="card p-6">
        {detail && (
          <div className="mb-5 flex flex-wrap justify-end gap-2">
            <SmartButton Icon={CalendarClock} label="Attendance" value={detail.attendanceCount} />
            <SmartButton Icon={Plane} label="Time Off" value={detail.leaveCount} />
            <SmartButton Icon={Clock} label="Hours this month" value={detail.hoursThisMonth.toFixed(2)} />
            {annual && <SmartButton Icon={FileBadge} label={`${annual.leaveTypeName} left`} value={annual.remaining} />}
            {!!detail.reports.length && <SmartButton Icon={Users} label="Reports" value={detail.reports.length} />}
          </div>
        )}

        <div className="mb-5 flex items-start gap-4">
          <PhotoField
            name={form.name || ''}
            url={form.imageUrl ?? null}
            onChange={(url) => set('imageUrl', url)}
          />
          <div className="min-w-0 flex-1">
            <input
              value={form.name ?? ''}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Employee's full name"
              className="w-full border-0 border-b border-odoo-line bg-transparent px-0 pb-1.5 text-2xl font-extrabold outline-none focus:border-odoo-lift"
            />
            <input
              value={form.jobTitle ?? ''}
              onChange={(e) => set('jobTitle', e.target.value)}
              placeholder="Job title"
              className="mt-1.5 w-full border-0 bg-transparent px-0 text-[13px] text-odoo-dim outline-none"
            />
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {allTags.map((t) => {
                const on = form.tagIds?.includes(t.id);
                return (
                  <button
                    key={t.id}
                    onClick={() => toggleTag(t.id)}
                    className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                      on ? 'bg-odoo-primary text-white' : 'bg-odoo-raised text-odoo-faint hover:text-odoo-ink'
                    }`}
                  >{t.name}</button>
                );
              })}
            </div>

            {/* The reference's one-line document summary, right under the name —
                the fastest answer to "can this person legally work today". */}
            {detail && (
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <DocBadge label="Civil ID" status={detail.docs.civilId} />
                <DocBadge label="Passport" status={detail.docs.passport} />
                <DocBadge label="Work Permit" status={detail.docs.workPermit} />
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-x-8 gap-y-4 lg:grid-cols-2">
          <div className="space-y-3">
            <SelectField
              label="Department"
              value={form.departmentId ?? null}
              onChange={(v) => { set('departmentId', v); set('jobPositionId', null); }}
              options={(config?.departments ?? []).map((d) => ({
                value: d.id, label: d.nameAr ? `${d.name} — ${d.nameAr}` : d.name,
              }))}
            />
            <SelectField
              label="Job Position"
              value={form.jobPositionId ?? null}
              onChange={(v) => set('jobPositionId', v)}
              options={jobOptions}
            />
            <SelectField
              label="Manager"
              value={form.managerId ?? null}
              onChange={(v) => set('managerId', v)}
              options={managers.filter((m) => m.id !== id).map((m) => ({ value: m.id, label: m.name }))}
            />
          </div>

          <div className="space-y-3">
            <Field label="Employee ID" value={form.ref} onChange={(v) => set('ref', v)} hint="The number on the badge." />
            <SelectField
              label="Employee Type"
              value={form.employeeType ?? 'EMPLOYEE'}
              onChange={(v) => set('employeeType', v)}
              options={[
                { value: 'EMPLOYEE', label: 'Employee' }, { value: 'WORKER', label: 'Worker' },
                { value: 'STUDENT', label: 'Student' }, { value: 'TRAINEE', label: 'Trainee' },
                { value: 'CONTRACTOR', label: 'Contractor' }, { value: 'FREELANCE', label: 'Freelancer' },
              ]}
            />
            <SelectField
              label="Working Schedule"
              value={form.workScheduleId ?? null}
              onChange={(v) => set('workScheduleId', v)}
              options={(config?.schedules ?? []).map((s) => ({
                value: s.id,
                label: `${s.name}${s.startTime && s.endTime && s.endTime <= s.startTime ? '  (overnight)' : ''}`,
              }))}
              hint="Sets the hours a shift is expected to run, and which weekdays leave is counted against."
            />
            <Field label="Name (Arabic)" value={form.nameAr} onChange={(v) => set('nameAr', v)} dir="rtl" />
          </div>
        </div>

        <div className="mt-6">
          <Notebook
            tabs={[
              {
                label: 'Documents',
                content: (
                  <div className="grid gap-x-8 gap-y-4 lg:grid-cols-2">
                    <div className="space-y-3">
                      <Field label="Civil ID" value={form.civilId} onChange={(v) => set('civilId', v)} Icon={IdCard} />
                      <Field label="Passport Number" value={form.passportNo} onChange={(v) => set('passportNo', v)} Icon={Plane} />
                      <Field label="Work Permit Number" value={form.workPermitNo} onChange={(v) => set('workPermitNo', v)} Icon={FileBadge} />
                      <Field label="Nationality" value={form.nationality} onChange={(v) => set('nationality', v)} />
                    </div>
                    <div className="space-y-3">
                      <ExpiryField label="Civil ID Expiry" value={form.civilIdExpiry} onChange={(v) => set('civilIdExpiry', v)} />
                      <ExpiryField label="Passport Expiry" value={form.passportExpiry} onChange={(v) => set('passportExpiry', v)} />
                      <ExpiryField label="Work Permit Expiry" value={form.workPermitExpiry} onChange={(v) => set('workPermitExpiry', v)} />
                    </div>
                  </div>
                ),
              },
              {
                label: 'Work Information',
                content: (
                  <div className="grid gap-x-8 gap-y-4 lg:grid-cols-2">
                    <div className="space-y-3">
                      <Field label="Work Email" value={form.workEmail} onChange={(v) => set('workEmail', v)} type="email" />
                      <Field label="Work Phone" value={form.workPhone} onChange={(v) => set('workPhone', v)} />
                      <Field label="Mobile" value={form.mobile} onChange={(v) => set('mobile', v)} />
                      <Field label="Work Location" value={form.workLocation} onChange={(v) => set('workLocation', v)} />
                    </div>
                    <div className="space-y-3">
                      <Field label="Hire Date" value={form.hireDate} onChange={(v) => set('hireDate', v || null)} type="date" />
                      <Field label="End Date" value={form.endDate} onChange={(v) => set('endDate', v || null)} type="date" />
                      <NumberField
                        label="Monthly Salary"
                        value={form.monthlySalary}
                        onChange={(v) => set('monthlySalary', v)}
                        suffix="KD"
                        hint="Recorded for reference. Payroll is not calculated here."
                      />
                    </div>
                  </div>
                ),
              },
              {
                label: 'Personal',
                content: (
                  <div className="grid gap-x-8 gap-y-4 lg:grid-cols-2">
                    <div className="space-y-3">
                      <Field label="Date of Birth" value={form.birthday} onChange={(v) => set('birthday', v || null)} type="date" />
                      <SelectField
                        label="Gender"
                        value={form.gender ?? null}
                        onChange={(v) => set('gender', v)}
                        options={[{ value: 'MALE', label: 'Male' }, { value: 'FEMALE', label: 'Female' }]}
                      />
                      <SelectField
                        label="Marital Status"
                        value={form.marital ?? null}
                        onChange={(v) => set('marital', v)}
                        options={[
                          { value: 'SINGLE', label: 'Single' },
                          { value: 'MARRIED', label: 'Married' },
                          { value: 'WIDOWED', label: 'Widowed' },
                          { value: 'DIVORCED', label: 'Divorced' },
                        ]}
                      />
                      <Field label="Private Phone" value={form.privatePhone} onChange={(v) => set('privatePhone', v)} />
                    </div>
                    <div className="space-y-3">
                      <Field label="Emergency Contact" value={form.emergencyContact} onChange={(v) => set('emergencyContact', v)} />
                      <Field label="Emergency Phone" value={form.emergencyPhone} onChange={(v) => set('emergencyPhone', v)} />
                      <div>
                        <span className="label">Internal Notes</span>
                        <textarea
                          value={form.notes ?? ''}
                          onChange={(e) => set('notes', e.target.value)}
                          rows={4}
                          className="input"
                        />
                      </div>
                    </div>
                  </div>
                ),
              },
              {
                label: 'Attendance & Kiosk',
                content: (
                  <div className="grid gap-x-8 gap-y-4 lg:grid-cols-2">
                    <div className="space-y-3">
                      <Field
                        label="Badge ID"
                        value={form.badgeId}
                        onChange={(v) => set('badgeId', v)}
                        hint="Scanned at the kiosk. Must be unique across all employees."
                      />
                      <Field
                        label="Kiosk PIN"
                        value={form.pin}
                        onChange={(v) => set('pin', v)}
                        hint="Typed at the kiosk when there is no badge to scan."
                      />
                    </div>
                    {detail && (
                      <div className="space-y-3">
                        <ReadField label="Recent Attendance">
                          {detail.recentAttendance.length === 0 ? (
                            <span className="text-odoo-faint">Nothing recorded yet.</span>
                          ) : (
                            <div className="space-y-1">
                              {detail.recentAttendance.slice(0, 6).map((a) => (
                                <div key={a.id} className="flex items-center justify-between gap-3 border-b border-odoo-line py-1">
                                  <span>{a.day}</span>
                                  <span className="text-odoo-dim">
                                    {new Date(a.checkIn).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                                    {' → '}
                                    {a.checkOut
                                      ? new Date(a.checkOut).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
                                      : <span className="text-odoo-ok">still in</span>}
                                  </span>
                                  <span className="font-semibold tabular-nums">{a.workedHours ? `${a.workedHours}h` : '—'}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </ReadField>
                      </div>
                    )}
                  </div>
                ),
              },
              ...(detail ? [{ label: 'Time Off', content: <BalancesTab detail={detail} /> }] : []),
              ...(detail ? [{ label: 'Organisation', content: <OrgChart detail={detail} /> }] : []),
            ]}
          />
        </div>
      </div>

      {/* Below the sheet, as the reference stacks them on a narrow window:
          what needs chasing, then the record's own history. */}
      {detail && (
        <div className="grid gap-4 lg:grid-cols-2">
          <ActivityPanel detail={detail} />
          <Chatter
            load={() => adminApi.employeeMessages(detail.id)}
            post={(body) => adminApi.postEmployeeMessage(detail.id, body)}
          />
        </div>
      )}
    </ViewShell>
  );
}

/** Present / absent / on leave, the way the reference badges it. */
function PresencePill({ detail }: { detail: EmployeeDetail }) {
  if (detail.presence === 'on_leave') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-odoo-info/20 px-3 py-1 text-xs font-bold text-odoo-info">
        <span className="h-2 w-2 rounded-full bg-odoo-info" />
        On {detail.onLeaveType || 'leave'} until {detail.onLeaveUntil}
      </span>
    );
  }
  if (detail.presence === 'present') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-odoo-ok/20 px-3 py-1 text-xs font-bold text-odoo-ok">
        <span className="h-2 w-2 rounded-full bg-odoo-ok" /> Present
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-odoo-raised px-3 py-1 text-xs font-bold text-odoo-faint">
      <span className="h-2 w-2 rounded-full bg-odoo-faint" /> Absent
    </span>
  );
}

/**
 * Document reminders. The reference schedules dismissible activity records;
 * these are derived from the expiry dates, so they cannot be marked done while
 * the document is still lapsing — they clear when the date is renewed.
 */
function ActivityPanel({ detail }: { detail: EmployeeDetail }) {
  return (
    <div className="rounded border border-odoo-line bg-odoo-surface p-4">
      <h3 className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-odoo-dim">
        <BellRing size={15} /> Planned Activities
      </h3>

      {detail.activities.length === 0 ? (
        <p className="py-4 text-center text-[13px] text-odoo-faint">
          Nothing to chase — no document lapses within a year.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {detail.activities.map((a) => (
            <li key={a.document} className="flex gap-3">
              <span className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full ${
                a.daysUntil < 0 ? 'bg-odoo-bad/20 text-odoo-bad'
                  : a.daysUntil <= 60 ? 'bg-odoo-warn/20 text-odoo-warn'
                  : 'bg-odoo-raised text-odoo-faint'
              }`}>
                <AlertTriangle size={13} />
              </span>
              <div className="min-w-0 flex-1">
                <div className={`text-[13px] font-semibold ${
                  a.daysUntil < 0 ? 'text-odoo-bad' : a.daysUntil <= 60 ? 'text-odoo-warn' : 'text-odoo-ink'
                }`}>
                  {a.daysUntil < 0 ? `Overdue by ${Math.abs(a.daysUntil)} days` : `Due in ${a.daysUntil} days`}
                  {': '}&ldquo;{a.summary}&rdquo;
                </div>
                <div className="text-xs text-odoo-faint">
                  {a.number ? `${a.document} ${a.number}` : a.document} · renew the expiry date to clear this
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Manager above, direct reports below — the reference's Organization Chart. */
function OrgChart({ detail }: { detail: EmployeeDetail }) {
  if (!detail.managerName && detail.reports.length === 0) {
    return (
      <p className="text-[13px] text-odoo-faint">
        Set a manager, or make this person somebody&rsquo;s manager, to draw the chart.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {detail.managerName && (
        <div>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-odoo-faint">Reports to</h3>
          <div className="flex items-center gap-2.5 rounded border border-odoo-line px-3 py-2">
            <span className={`grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br ${tintFor(detail.managerName)} text-[10px] font-bold text-white`}>
              {initials(detail.managerName)}
            </span>
            <span className="text-[13px] font-semibold">{detail.managerName}</span>
          </div>
        </div>
      )}

      <div>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-odoo-faint">
          Direct reports ({detail.reports.length})
        </h3>
        {detail.reports.length === 0 ? (
          <p className="text-[13px] text-odoo-faint">Nobody reports to {detail.name}.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {detail.reports.map((r) => (
              <div key={r.id} className="flex items-center gap-2.5 rounded border border-odoo-line px-3 py-2">
                <span className={`grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br ${tintFor(r.name)} text-[10px] font-bold text-white`}>
                  {r.imageUrl
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={r.imageUrl} alt="" className="h-full w-full object-cover" />
                    : initials(r.name)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold">{r.name}</span>
                  {r.jobTitle && <span className="block truncate text-xs text-odoo-faint">{r.jobTitle}</span>}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The employee photo, sized and placed like the reference's — top-left of the
 * form sheet, at the same 72px width the kanban card uses, so what you see here
 * is what the card will show.
 *
 * Click or drop a file on it. The upload happens immediately and the form holds
 * the returned URL, so a photo picked and then discarded leaves an orphan file
 * on disk rather than a broken record — the safer of the two failure modes.
 */
function PhotoField({
  name, url, onChange,
}: { name: string; url: string | null; onChange: (url: string | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('That is not an image file.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { url: uploaded } = await adminApi.uploadEmployeePhoto(file);
      onChange(uploaded);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(false);
      // Clear the input so re-picking the same file still fires onChange.
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="shrink-0">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); void upload(e.dataTransfer.files?.[0]); }}
        className={`group relative h-[86px] w-[72px] overflow-hidden rounded border ${
          dragging ? 'border-odoo-lift' : 'border-odoo-line'
        }`}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={name} className="h-full w-full object-cover" />
        ) : (
          <span className={`grid h-full w-full place-items-center bg-gradient-to-br ${
            name ? tintFor(name) : 'from-odoo-raised to-odoo-raised'
          } text-xl font-bold text-white`}>
            {name ? initials(name) : <UserRound size={24} className="text-odoo-faint" />}
          </span>
        )}

        {/* The overlay is always present for keyboard users, and fades in on hover. */}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          title={url ? 'Replace photo' : 'Upload a photo'}
          className="absolute inset-0 grid place-items-center bg-black/55 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
        >
          {busy ? <Loader2 size={18} className="animate-spin text-white" /> : <Camera size={18} className="text-white" />}
        </button>

        {url && !busy && (
          <button
            type="button"
            onClick={() => onChange(null)}
            title="Remove photo"
            className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded bg-black/65 text-white opacity-0 transition-opacity hover:bg-odoo-bad group-hover:opacity-100"
          >
            <X size={12} />
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => void upload(e.target.files?.[0])}
      />

      <p className="mt-1.5 w-[72px] text-[10px] leading-tight text-odoo-faint">
        {error ? <span className="text-odoo-bad">{error}</span> : 'Click or drop an image'}
      </p>
    </div>
  );
}

/** A date input that says, in words, how close the document is to lapsing. */
function ExpiryField({
  label, value, onChange,
}: { label: string; value: string | null | undefined; onChange: (v: string | null) => void }) {
  const days = daysUntil(value ?? null);
  return (
    <div>
      <span className="label">{label}</span>
      <input
        type="date"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="input"
      />
      {days !== null && (
        <p className={`mt-1 flex items-center gap-1 text-[11px] font-semibold ${
          days < 0 ? 'text-odoo-bad' : days <= 60 ? 'text-odoo-warn' : 'text-odoo-faint'
        }`}>
          {days <= 60 && <AlertTriangle size={11} />}
          {days < 0 ? `Expired ${Math.abs(days)} days ago` : `${days} days remaining`}
        </p>
      )}
    </div>
  );
}

function BalancesTab({ detail }: { detail: EmployeeDetail }) {
  // Types with no allocation and nothing taken are noise on an individual's
  // record — the full list lives in Time Off.
  const shown = detail.balances.filter((b) => b.requiresAllocation || b.allocated > 0 || b.taken > 0);

  return (
    <div className="space-y-5">
      <div>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-odoo-faint">Balances for {detail.year}</h3>
        {shown.length === 0 ? (
          <p className="text-[13px] text-odoo-faint">No allocation granted and no leave taken this year.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="px-3 text-left">Leave Type</th>
                  <th className="px-3 text-right">Allocated</th>
                  <th className="px-3 text-right">Taken</th>
                  <th className="px-3 text-right">Remaining</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((b: LeaveBalance) => (
                  <tr key={b.leaveTypeId}>
                    <td className="px-3">{b.leaveTypeName}</td>
                    <td className="px-3 text-right tabular-nums">{b.requiresAllocation ? b.allocated : '—'}</td>
                    <td className="px-3 text-right tabular-nums">{b.taken}</td>
                    <td className={`px-3 text-right font-bold tabular-nums ${
                      b.requiresAllocation && b.remaining <= 0 ? 'text-odoo-bad' : ''
                    }`}>
                      {b.requiresAllocation ? b.remaining : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-odoo-faint">Recent Requests</h3>
        {detail.recentLeaves.length === 0 ? (
          <p className="text-[13px] text-odoo-faint">No time off requested.</p>
        ) : (
          <div className="space-y-1">
            {detail.recentLeaves.map((l) => (
              <div key={l.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-odoo-line py-1.5 text-[13px]">
                <span className="font-medium">{l.leaveTypeName}</span>
                <span className="text-odoo-dim">{l.dateFrom} → {l.dateTo}</span>
                <span className="tabular-nums">{l.days} day{l.days === 1 ? '' : 's'}</span>
                <LeaveStateBadge state={l.state} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
