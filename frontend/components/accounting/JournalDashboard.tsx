'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Loader2, Plus, Save, X, Trash2, Pencil, BookOpen, Banknote, Landmark,
  FileText, ShoppingCart, Boxes, ArrowRight,
} from 'lucide-react';
import {
  adminApi, AccountingJournal, JournalInput, JournalType, LedgerAccount, PosRegister,
} from '@/lib/adminApi';
import { formatKD } from '@/lib/money';
import { Field, SelectField } from '@/components/odoo/Field';

/**
 * The accounting dashboard, built the way the reference builds it: one card per
 * journal, not a wall of numbers. A journal is the book an entry is written in,
 * and it is the unit an accountant actually navigates by — "show me what went
 * through the bank this month", not "show me entries 400 to 450".
 *
 * Cards for CASH and BANK journals carry the balance of the account they move
 * money through; sale, purchase and general journals have no single balance to
 * show, so they show their entry count instead of an invented figure.
 */

const TYPE_META: Record<JournalType, { label: string; Icon: typeof BookOpen; tint: string }> = {
  SALE: { label: 'Sales', Icon: FileText, tint: 'text-sky-400' },
  PURCHASE: { label: 'Purchase', Icon: ShoppingCart, tint: 'text-amber-400' },
  CASH: { label: 'Cash', Icon: Banknote, tint: 'text-emerald-400' },
  BANK: { label: 'Bank', Icon: Landmark, tint: 'text-violet-400' },
  GENERAL: { label: 'General', Icon: Boxes, tint: 'text-slate-400' },
};

const TYPE_OPTIONS: { value: JournalType; label: string }[] = [
  { value: 'SALE', label: 'Sales' },
  { value: 'PURCHASE', label: 'Purchase' },
  { value: 'CASH', label: 'Cash' },
  { value: 'BANK', label: 'Bank' },
  { value: 'GENERAL', label: 'Miscellaneous' },
];

const EMPTY: JournalInput = { code: '', name: '', type: 'GENERAL', defaultAccountId: null, posRegisterId: null };

export default function JournalDashboard({ onOpenJournal }: { onOpenJournal?: (j: AccountingJournal) => void }) {
  const [rows, setRows] = useState<AccountingJournal[] | null>(null);
  const [accounts, setAccounts] = useState<LedgerAccount[]>([]);
  const [registers, setRegisters] = useState<PosRegister[]>([]);
  const [editing, setEditing] = useState<{ id: number | null; form: JournalInput } | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    adminApi.journals().then(setRows).catch(() => setRows([]));
  }, []);

  useEffect(() => {
    load();
    adminApi.accounts().then(setAccounts).catch(() => setAccounts([]));
    adminApi.posRegisters().then(setRegisters).catch(() => setRegisters([]));
  }, [load]);

  // Grouped by type, in the order an accountant reads them.
  const groups = useMemo(() => {
    const order: JournalType[] = ['SALE', 'PURCHASE', 'BANK', 'CASH', 'GENERAL'];
    return order
      .map((t) => [t, (rows ?? []).filter((r) => r.type === t)] as const)
      .filter(([, list]) => list.length > 0);
  }, [rows]);

  const save = async () => {
    if (!editing) return;
    if (!editing.form.code.trim() || !editing.form.name.trim()) {
      setError('A journal needs a code and a name.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (editing.id == null) await adminApi.createJournal(editing.form);
      else await adminApi.updateJournal(editing.id, editing.form);
      setEditing(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (j: AccountingJournal) => {
    if (!confirm(`Delete the journal "${j.name}" (${j.code})?`)) return;
    setError('');
    setNotice('');
    try {
      const res = await adminApi.deleteJournal(j.id);
      if (res.archived) {
        setNotice(`${j.code} holds ${res.entries} entr${res.entries === 1 ? 'y' : 'ies'}, so it was archived rather than deleted — those entries keep pointing at it.`);
      }
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete');
    }
  };

  const chartEmpty = accounts.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => { setEditing({ id: null, form: { ...EMPTY } }); setError(''); }} className="btn-primary">
          <Plus size={16} /> New Journal
        </button>
        <span className="ml-auto text-[13px] text-odoo-dim">
          {rows?.length ?? 0} journal{rows?.length === 1 ? '' : 's'}
        </span>
      </div>

      {chartEmpty && (
        <p className="rounded bg-odoo-warn/15 px-3 py-2 text-sm text-odoo-warn">
          The chart of accounts is empty, so journals have nothing to point at yet. Open the books first —
          the journals will be linked to their accounts automatically.
        </p>
      )}
      {error && <p className="rounded bg-odoo-bad/15 px-3 py-2 text-sm text-odoo-bad">{error}</p>}
      {notice && <p className="rounded bg-odoo-info/15 px-3 py-2 text-sm text-odoo-info">{notice}</p>}

      {editing && (
        <div className="card space-y-4 p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">{editing.id == null ? 'New journal' : 'Edit journal'}</h2>
            <button onClick={() => setEditing(null)} className="grid h-7 w-7 place-items-center rounded hover:bg-odoo-raised">
              <X size={15} />
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            <Field
              label="Code"
              value={editing.form.code}
              onChange={(v) => setEditing((e) => e && ({ ...e, form: { ...e.form, code: v.toUpperCase() } }))}
              placeholder="CSHR1"
              hint="Short, unique."
              required
            />
            <Field
              label="Name"
              value={editing.form.name}
              onChange={(v) => setEditing((e) => e && ({ ...e, form: { ...e.form, name: v } }))}
              placeholder="CASH-Rai 1"
              required
            />
            <SelectField
              label="Type"
              value={editing.form.type}
              onChange={(v) => setEditing((e) => e && ({ ...e, form: { ...e.form, type: (v ?? 'GENERAL') as JournalType } }))}
              options={TYPE_OPTIONS}
              required
            />
            <SelectField
              label="Account"
              value={editing.form.defaultAccountId ?? null}
              onChange={(v) => setEditing((e) => e && ({ ...e, form: { ...e.form, defaultAccountId: v } }))}
              options={accounts.map((a) => ({ value: a.id, label: `${a.code} ${a.name}` }))}
              hint="The account this book moves money through."
            />
            <SelectField
              label="Till"
              value={editing.form.posRegisterId ?? null}
              onChange={(v) => setEditing((e) => e && ({ ...e, form: { ...e.form, posRegisterId: v } }))}
              options={registers.map((r) => ({ value: r.id, label: r.name }))}
              hint="Optional — ties a cash journal to one register."
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
            No journals yet.
            <span className="mt-1 block text-[13px] text-odoo-faint">
              Every entry is written in a journal — add one per bank account, per till, and per kind of operation.
            </span>
          </span>
        </div>
      ) : (
        groups.map(([type, list]) => (
          <section key={type}>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-odoo-faint">
              {TYPE_META[type].label}
            </h3>
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(270px,1fr))]">
              {list.map((j) => (
                <JournalCard
                  key={j.id}
                  j={j}
                  onOpen={onOpenJournal ? () => onOpenJournal(j) : undefined}
                  onEdit={() => {
                    setEditing({ id: j.id, form: {
                      code: j.code, name: j.name, nameAr: j.nameAr, type: j.type,
                      defaultAccountId: j.defaultAccountId, posRegisterId: j.posRegisterId,
                    } });
                    setError('');
                  }}
                  onDelete={() => remove(j)}
                />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function JournalCard({
  j, onOpen, onEdit, onDelete,
}: {
  j: AccountingJournal;
  onOpen?: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { Icon, tint } = TYPE_META[j.type];
  const holdsMoney = j.type === 'CASH' || j.type === 'BANK';

  return (
    <div className="card flex flex-col gap-2 p-4">
      <div className="flex items-start gap-2">
        <Icon size={16} className={`mt-0.5 shrink-0 ${tint}`} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-bold">{j.name}</div>
          <div className="text-xs text-odoo-faint">
            {j.code}
            {j.defaultAccountCode && <> · {j.defaultAccountCode}</>}
          </div>
        </div>
        <div className="flex shrink-0 gap-0.5">
          <button onClick={onEdit} title="Edit" className="grid h-6 w-6 place-items-center rounded text-odoo-faint hover:bg-odoo-raised hover:text-odoo-ink">
            <Pencil size={13} />
          </button>
          {!j.isSystem && (
            <button onClick={onDelete} title="Delete" className="grid h-6 w-6 place-items-center rounded text-odoo-faint hover:bg-odoo-bad/15 hover:text-odoo-bad">
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>

      {holdsMoney ? (
        <div>
          <div className="text-xs text-odoo-faint">Balance</div>
          <div className={`text-lg font-extrabold tabular-nums ${
            (j.balance ?? 0) < 0 ? 'text-odoo-bad' : ''
          }`}>
            {j.balance == null ? '—' : formatKD(j.balance)}
          </div>
        </div>
      ) : (
        <div>
          <div className="text-xs text-odoo-faint">Entries</div>
          <div className="text-lg font-extrabold tabular-nums">{j.entryCount}</div>
        </div>
      )}

      <div className="text-xs text-odoo-faint">
        {j.posRegisterName && <span className="block truncate">Till: {j.posRegisterName}</span>}
        {j.lastEntryAt
          ? <>Last entry {new Date(j.lastEntryAt).toLocaleDateString('en-GB')}</>
          : 'No entries yet'}
      </div>

      {onOpen && (
        <button onClick={onOpen} className="btn-ghost mt-auto w-full justify-center text-[13px]">
          Entries <ArrowRight size={14} />
        </button>
      )}
    </div>
  );
}
