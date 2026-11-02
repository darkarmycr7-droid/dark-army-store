'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Loader2, Plus, Trash2, Pencil, X, BookOpen, Undo2, Search, Calculator, Lock,
} from 'lucide-react';
import {
  adminApi, AccountingStatus, LedgerAccount, AccountInput, AccountType, JournalEntry,
} from '@/lib/adminApi';
import { formatKD } from '@/lib/money';
import JournalDashboard from '@/components/accounting/JournalDashboard';

const TYPES: AccountType[] = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'];
const TYPE_STYLE: Record<AccountType, string> = {
  ASSET: 'bg-sky-100 text-sky-700',
  LIABILITY: 'bg-amber-100 text-amber-700',
  EQUITY: 'bg-violet-100 text-violet-700',
  REVENUE: 'bg-emerald-100 text-emerald-700',
  EXPENSE: 'bg-rose-100 text-rose-700',
};

/** The reference opens Accounting on its journals, so this does too. */
const TABS = [
  ['dashboard', 'Dashboard'],
  ['accounts', 'Chart of Accounts'],
  ['journal', 'Journal Entries'],
] as const;
type Tab = (typeof TABS)[number][0];

export default function AdminAccountingPage() {
  const [status, setStatus] = useState<AccountingStatus | null>(null);
  const [tab, setTab] = useState<Tab>('dashboard');
  const [journalFilter, setJournalFilter] = useState<{ id: number; code: string } | null>(null);

  const load = useCallback(() => adminApi.acctStatus().then(setStatus).catch(() => setStatus(null)), []);
  useEffect(() => { load(); }, [load]);

  if (!status) return <div className="grid place-items-center py-24 text-slate-400"><Loader2 className="animate-spin" /></div>;
  if (!status.isLive) return <OpenBooks onOpened={load} />;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold">Accounting</h1>
          <p className="text-slate-500">
            {status.accounts} accounts · {status.entries} journal entries · books opened{' '}
            {status.openedAt ? new Date(status.openedAt).toLocaleDateString() : '—'}
          </p>
        </div>
      </div>

      <div className="flex gap-1 border-b border-odoo-line">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => { setTab(key); if (key !== 'journal') setJournalFilter(null); }}
            className={`-mb-px border-b-2 px-4 py-2 text-[13px] font-medium ${
              tab === key ? 'border-odoo-lift text-odoo-ink' : 'border-transparent text-odoo-dim hover:text-odoo-ink'
            }`}
          >{label}</button>
        ))}
      </div>

      {tab === 'dashboard' && (
        <JournalDashboard
          onOpenJournal={(j) => { setJournalFilter({ id: j.id, code: j.code }); setTab('journal'); }}
        />
      )}
      {tab === 'accounts' && <ChartOfAccounts />}
      {tab === 'journal' && (
        <Journal onChanged={load} journalFilter={journalFilter} onClearJournal={() => setJournalFilter(null)} />
      )}
    </div>
  );
}

// ---------- Go-live ----------

function OpenBooks({ onOpened }: { onOpened: () => void }) {
  const [cash, setCash] = useState(0);
  const [bank, setBank] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await adminApi.openBooks(cash, bank);
      onOpened();
    } catch (err: any) {
      setError(err.message || 'Could not open the books');
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl">
      <div className="card p-7">
        <div className="mb-4 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-600"><BookOpen size={20} /></span>
          <div>
            <h1 className="text-xl font-extrabold">Open the books</h1>
            <p className="text-sm text-slate-500">Set your opening balances to start double-entry accounting.</p>
          </div>
        </div>

        {error && <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}

        <div className="mb-5 space-y-2 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
          <p>
            This seeds a standard chart of accounts and posts one opening entry bringing your
            <strong> stock on hand at cost </strong> onto the balance sheet.
          </p>
          <p>
            From that moment every sale, refund, goods receipt, supplier payment, stock adjustment and till
            session posts to the journal automatically. <strong>Trading before today is not back-posted</strong> —
            this is a clean cutover, the way a real go-live works.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <label className="block">
            <span className="label">Cash on hand (KD)</span>
            <input type="number" min={0} step="0.001" value={cash} onChange={(e) => setCash(Number(e.target.value))} className="input text-lg font-bold" />
            <span className="mt-1 block text-xs text-slate-500">
              Count everything physically held — including the float you keep in the till drawer, or the
              Cash account will never reconcile against a till session.
            </span>
          </label>
          <label className="block">
            <span className="label">Bank balance (KD)</span>
            <input type="number" min={0} step="0.001" value={bank} onChange={(e) => setBank(Number(e.target.value))} className="input text-lg font-bold" />
          </label>

          <button disabled={busy} className="btn-primary w-full justify-center py-3">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <><Lock size={16} /> Open the Books</>}
          </button>
        </form>
      </div>
    </div>
  );
}

// ---------- Chart of accounts ----------

function ChartOfAccounts() {
  const [rows, setRows] = useState<LedgerAccount[] | null>(null);
  const [editing, setEditing] = useState<LedgerAccount | 'new' | null>(null);
  const [error, setError] = useState('');

  const load = () => adminApi.accounts(true).then(setRows).catch(() => setRows([]));
  useEffect(() => { load(); }, []);

  const remove = async (a: LedgerAccount) => {
    if (!confirm(`Delete account ${a.code} ${a.name}?`)) return;
    try {
      const res = await adminApi.deleteAccount(a.id);
      if (res.softDeleted) alert('This account has postings, so it was deactivated instead of deleted.');
      load();
    } catch (e: any) {
      setError(e.message || 'Could not delete the account');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => { setEditing('new'); setError(''); }} className="btn-primary"><Plus size={18} /> New Account</button>
      </div>
      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Account</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3 text-right">Debits</th>
                <th className="px-4 py-3 text-right">Credits</th>
                <th className="px-4 py-3 text-right">Balance</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {!rows ? (
                <tr><td colSpan={7} className="py-16 text-center text-slate-400"><Loader2 className="mx-auto animate-spin" /></td></tr>
              ) : (
                rows.map((a) => (
                  <tr key={a.id} className={`hover:bg-slate-50 ${!a.isActive ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3 font-mono font-bold">{a.code}</td>
                    <td className="px-4 py-3">
                      {a.name}
                      {a.isContra && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">CONTRA</span>}
                      {a.nameAr && <div className="text-xs text-slate-400">{a.nameAr}</div>}
                    </td>
                    <td className="px-4 py-3"><span className={`rounded-md px-2 py-0.5 text-xs font-bold ${TYPE_STYLE[a.type]}`}>{a.type}</span></td>
                    <td className="px-4 py-3 text-right text-slate-500">{formatKD(a.debit ?? 0)}</td>
                    <td className="px-4 py-3 text-right text-slate-500">{formatKD(a.credit ?? 0)}</td>
                    <td className="px-4 py-3 text-right font-bold">{formatKD(a.balance ?? 0)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => { setEditing(a); setError(''); }} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-slate-100"><Pencil size={15} /></button>
                        {!a.isSystem && (
                          <button onClick={() => remove(a)} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-rose-50 hover:text-rose-600"><Trash2 size={15} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <AccountModal
          account={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function AccountModal({ account, onClose, onSaved }: { account: LedgerAccount | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<AccountInput>(
    account
      ? { code: account.code, name: account.name, nameAr: account.nameAr ?? '', type: account.type, isContra: account.isContra, isActive: account.isActive }
      : { code: '', name: '', nameAr: '', type: 'EXPENSE', isContra: false, isActive: true }
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k: keyof AccountInput, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (account) await adminApi.updateAccount(account.id, form);
      else await adminApi.createAccount(form);
      onSaved();
    } catch (err: any) {
      setError(err.message || 'Could not save the account');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-extrabold">{account ? `Edit ${account.code}` : 'New Account'}</h2>
        {error && <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block"><span className="label">Code</span>
            <input value={form.code} onChange={(e) => set('code', e.target.value)} required disabled={account?.isSystem} className="input font-mono disabled:bg-slate-100" /></label>
          <label className="block"><span className="label">Type</span>
            <select value={form.type} onChange={(e) => set('type', e.target.value)} disabled={account?.isSystem} className="input disabled:bg-slate-100">
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select></label>
          <label className="block sm:col-span-2"><span className="label">Name</span>
            <input value={form.name} onChange={(e) => set('name', e.target.value)} required className="input" /></label>
          <label className="block sm:col-span-2"><span className="label">Name (Arabic)</span>
            <input value={form.nameAr ?? ''} onChange={(e) => set('nameAr', e.target.value)} dir="rtl" className="input" /></label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.isContra} onChange={(e) => set('isContra', e.target.checked)} className="h-4 w-4" />
            <span className="text-sm font-medium">Contra account</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.isActive} onChange={(e) => set('isActive', e.target.checked)} className="h-4 w-4" />
            <span className="text-sm font-medium">Active</span>
          </label>
        </div>

        {account?.isSystem && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            This is a system account — the posting rules depend on its code and type, so those are locked.
          </p>
        )}

        <div className="mt-5 flex gap-3">
          <button disabled={busy} className="btn-primary">{busy ? <Loader2 size={16} className="animate-spin" /> : 'Save'}</button>
          <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
        </div>
      </form>
    </div>
  );
}

// ---------- Journal ----------

function Journal({
  onChanged, journalFilter, onClearJournal,
}: {
  onChanged: () => void;
  journalFilter?: { id: number; code: string } | null;
  onClearJournal?: () => void;
}) {
  const [data, setData] = useState<{ rows: JournalEntry[]; total: number } | null>(null);
  const [q, setQ] = useState('');
  const [skip, setSkip] = useState(0);
  const [open, setOpen] = useState<JournalEntry | null>(null);
  const [adding, setAdding] = useState(false);
  const PAGE = 50;

  const journalId = journalFilter?.id;
  const load = useCallback(
    () => adminApi.journal({ q: q || undefined, skip, limit: PAGE, journalId })
      .then(setData).catch(() => setData({ rows: [], total: 0 })),
    [q, skip, journalId]
  );
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  useEffect(() => { setSkip(0); }, [journalId]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {journalFilter && (
          <span className="inline-flex items-center gap-1 rounded bg-odoo-primary/25 px-2 py-1 text-xs font-semibold text-odoo-lift">
            Journal: {journalFilter.code}
            <button onClick={onClearJournal} title="Show all journals"><X size={12} /></button>
          </span>
        )}
        <div className="card flex min-w-[220px] flex-1 items-center gap-2 px-3 py-2">
          <Search size={16} className="text-slate-400" />
          <input value={q} onChange={(e) => { setQ(e.target.value); setSkip(0); }} placeholder="Search entry #, description or reference…" className="w-full bg-transparent py-1 text-sm outline-none" />
        </div>
        <button onClick={() => setAdding(true)} className="btn-primary"><Plus size={18} /> Manual Entry</button>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Entry</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {!data ? (
                <tr><td colSpan={6} className="py-16 text-center text-slate-400"><Loader2 className="mx-auto animate-spin" /></td></tr>
              ) : data.rows.length === 0 ? (
                <tr><td colSpan={6} className="py-16 text-center text-slate-400">No journal entries yet.</td></tr>
              ) : (
                data.rows.map((e) => (
                  <tr key={e.id} onClick={() => setOpen(e)} className="cursor-pointer hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono font-bold">{e.entryNumber}</td>
                    <td className="px-4 py-3 text-slate-500">{new Date(e.date).toLocaleDateString()}</td>
                    <td className="px-4 py-3"><span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">{e.source}</span></td>
                    <td className="px-4 py-3">
                      {e.memo}
                      {e.refLabel && <div className="text-xs text-slate-400">{e.refLabel}</div>}
                    </td>
                    <td className="px-4 py-3 text-right font-bold">{formatKD(e.debit)}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${e.status === 'POSTED' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{e.status}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {data && data.total > PAGE && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">Showing {skip + 1}–{Math.min(skip + PAGE, data.total)} of {data.total}</span>
          <div className="flex gap-2">
            <button disabled={skip === 0} onClick={() => setSkip((s) => Math.max(0, s - PAGE))} className="btn-ghost disabled:opacity-40">Previous</button>
            <button disabled={skip + PAGE >= data.total} onClick={() => setSkip((s) => s + PAGE)} className="btn-ghost disabled:opacity-40">Next</button>
          </div>
        </div>
      )}

      {open && <EntryDrawer entry={open} onClose={() => setOpen(null)} onChanged={() => { setOpen(null); load(); onChanged(); }} />}
      {adding && <ManualEntryModal onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); onChanged(); }} />}
    </div>
  );
}

function EntryDrawer({ entry, onClose, onChanged }: { entry: JournalEntry; onClose: () => void; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const reverse = async () => {
    const reason = prompt('Why is this entry being reversed?');
    if (reason === null) return;
    setBusy(true);
    setError('');
    try {
      await adminApi.reverseJournalEntry(entry.id, reason || undefined);
      onChanged();
    } catch (e: any) {
      setError(e.message || 'Could not reverse the entry');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="h-full w-full max-w-2xl overflow-y-auto bg-white p-6 shadow-xl">
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h2 className="font-mono text-xl font-extrabold">{entry.entryNumber}</h2>
            <p className="text-sm text-slate-500">
              {new Date(entry.date).toLocaleString()} · {entry.source}
              {entry.createdByEmail && ` · ${entry.createdByEmail}`}
            </p>
            {entry.memo && <p className="mt-1 text-sm">{entry.memo}</p>}
          </div>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-slate-100"><X size={18} /></button>
        </div>

        {error && <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Account</th>
                <th className="px-3 py-2 text-right">Debit</th>
                <th className="px-3 py-2 text-right">Credit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {entry.lines.map((l) => (
                <tr key={l.id}>
                  <td className="px-3 py-2">
                    <span className="font-mono font-semibold">{l.accountCode}</span> {l.accountName}
                    {l.memo && <div className="text-xs text-slate-400">{l.memo}</div>}
                  </td>
                  <td className="px-3 py-2 text-right">{l.debit ? formatKD(l.debit) : ''}</td>
                  <td className="px-3 py-2 text-right">{l.credit ? formatKD(l.credit) : ''}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-slate-200 font-bold">
              <tr>
                <td className="px-3 py-2">Total</td>
                <td className="px-3 py-2 text-right">{formatKD(entry.debit)}</td>
                <td className="px-3 py-2 text-right">{formatKD(entry.credit)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {entry.status === 'POSTED' && (
          <button onClick={reverse} disabled={busy} className="btn-ghost mt-5 text-rose-600">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <><Undo2 size={15} /> Reverse this entry</>}
          </button>
        )}
        <p className="mt-3 text-xs text-slate-500">
          Posted entries are never edited or deleted — a correction is posted as its own reversing entry,
          so the audit trail stays intact.
        </p>
      </div>
    </div>
  );
}

function ManualEntryModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [accounts, setAccounts] = useState<LedgerAccount[]>([]);
  const [memo, setMemo] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useState([
    { account: '', debit: 0, credit: 0 },
    { account: '', debit: 0, credit: 0 },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    adminApi.accounts().then((a) => {
      const active = a.filter((x) => x.isActive);
      setAccounts(active);
      setLines((ls) => ls.map((l, i) => ({ ...l, account: l.account || active[i]?.code || '' })));
    }).catch(() => setAccounts([]));
  }, []);

  const setLine = (i: number, patch: Partial<{ account: string; debit: number; credit: number }>) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const debits = lines.reduce((s, l) => s + (l.debit || 0), 0);
  const credits = lines.reduce((s, l) => s + (l.credit || 0), 0);
  const diff = Math.round((debits - credits) * 1000) / 1000;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await adminApi.createJournalEntry({
        date: new Date(date).toISOString(),
        memo,
        lines: lines.filter((l) => l.account && (l.debit || l.credit)),
      });
      onSaved();
    } catch (err: any) {
      setError(err.message || 'Could not post the entry');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-extrabold"><Calculator size={19} /> Manual Journal Entry</h2>
        {error && <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}

        <div className="mb-4 grid gap-4 sm:grid-cols-3">
          <label className="block"><span className="label">Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" /></label>
          <label className="block sm:col-span-2"><span className="label">Description</span>
            <input value={memo} onChange={(e) => setMemo(e.target.value)} required minLength={2} placeholder="Rent for September…" className="input" /></label>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Account</th>
                <th className="w-32 px-3 py-2">Debit</th>
                <th className="w-32 px-3 py-2">Credit</th>
                <th className="w-10 px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lines.map((l, i) => (
                <tr key={i}>
                  <td className="px-3 py-2">
                    <select value={l.account} onChange={(e) => setLine(i, { account: e.target.value })} className="input py-1.5">
                      <option value="">— select —</option>
                      {accounts.map((a) => <option key={a.id} value={a.code}>{a.code} — {a.name}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input type="number" min={0} step="0.001" value={l.debit || ''} onChange={(e) => setLine(i, { debit: Number(e.target.value), credit: 0 })} className="input py-1.5 text-right" /></td>
                  <td className="px-3 py-2">
                    <input type="number" min={0} step="0.001" value={l.credit || ''} onChange={(e) => setLine(i, { credit: Number(e.target.value), debit: 0 })} className="input py-1.5 text-right" /></td>
                  <td className="px-3 py-2">
                    {lines.length > 2 && (
                      <button type="button" onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={15} /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button type="button" onClick={() => setLines((ls) => [...ls, { account: '', debit: 0, credit: 0 }])} className="btn-ghost mt-2 text-sm">
          <Plus size={15} /> Add line
        </button>

        <div className={`mt-4 flex justify-between rounded-xl px-4 py-3 font-bold ${diff === 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
          <span>{diff === 0 ? 'Balanced' : `Out of balance by ${formatKD(Math.abs(diff))}`}</span>
          <span>{formatKD(debits)} / {formatKD(credits)}</span>
        </div>

        <div className="mt-5 flex gap-3">
          <button disabled={busy || diff !== 0 || debits === 0} className="btn-primary disabled:opacity-40">
            {busy ? <Loader2 size={16} className="animate-spin" /> : 'Post Entry'}
          </button>
          <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
        </div>
      </form>
    </div>
  );
}
