'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Loader2, Search, X, Delete, LayoutDashboard, ShoppingCart, Lock,
  ChevronLeft, CircleDot, Store, Settings,
} from 'lucide-react';
import { adminApi, PosCashier, PosRegister } from '@/lib/adminApi';
import { formatKD } from '@/lib/money';
import ThemeToggle from '@/components/odoo/ThemeToggle';

/**
 * Opening a till, in the four steps the reference uses:
 *
 *   registers → cashier → PIN → opening control → sell
 *
 * Each step is its own full screen because this runs on a shop tablet, not a
 * desk: big targets, one decision per screen, and a way back from every one.
 *
 * The PIN is checked by the server twice — once here so the cashier gets an
 * immediate answer, and again when the session is actually created. Verifying
 * once and then trusting the client to say who it was would let anybody open a
 * till as anybody.
 */

type Step =
  | { name: 'registers' }
  | { name: 'cashier'; register: PosRegister }
  | { name: 'pin'; register: PosRegister; cashier: PosCashier }
  | { name: 'opening'; register: PosRegister; cashier: PosCashier; pin: string };

export default function OpenRegisterFlow({
  onOpened,
}: {
  onOpened: (registerId: number) => void;
}) {
  const [step, setStep] = useState<Step>({ name: 'registers' });

  return (
    <div className="flex min-h-screen flex-col bg-odoo-ground text-odoo-ink">
      <header className="flex h-[46px] shrink-0 items-center gap-2.5 border-b border-odoo-line bg-odoo-surface px-4">
        {step.name !== 'registers' ? (
          <button
            onClick={() => setStep(
              step.name === 'cashier' ? { name: 'registers' }
                : step.name === 'pin' ? { name: 'cashier', register: step.register }
                : { name: 'pin', register: step.register, cashier: step.cashier },
            )}
            className="grid h-7 w-7 place-items-center rounded hover:bg-odoo-raised"
            title="Back"
          >
            <ChevronLeft size={17} />
          </button>
        ) : (
          <span className="grid h-6 w-6 place-items-center rounded bg-odoo-primary text-white">
            <ShoppingCart size={13} />
          </span>
        )}
        <span className="text-[13px] font-semibold">
          Point of Sale
          {step.name !== 'registers' && <span className="text-odoo-faint"> / {step.register.name}</span>}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle compact />
          <a href="/admin" className="btn-ghost h-7 px-2 text-[13px]">
            <LayoutDashboard size={14} /> Admin
          </a>
        </div>
      </header>

      {step.name === 'registers' && (
        <RegisterGrid
          onPick={(register) => {
            // An already-open register goes straight back to selling — the
            // reference labels that button "Continue Selling" for a reason.
            if (register.status === 'OPEN') onOpened(register.id);
            else setStep({ name: 'cashier', register });
          }}
        />
      )}

      {step.name === 'cashier' && (
        <CashierList
          register={step.register}
          onPick={(cashier) => setStep({ name: 'pin', register: step.register, cashier })}
        />
      )}

      {step.name === 'pin' && (
        <PinPad
          register={step.register}
          cashier={step.cashier}
          onVerified={(pin) => setStep({ name: 'opening', register: step.register, cashier: step.cashier, pin })}
        />
      )}

      {step.name === 'opening' && (
        <OpeningControl
          register={step.register}
          cashier={step.cashier}
          pin={step.pin}
          onOpened={() => onOpened(step.register.id)}
        />
      )}
    </div>
  );
}

// ---------- Step 1: registers ----------

function RegisterGrid({ onPick }: { onPick: (r: PosRegister) => void }) {
  const [rows, setRows] = useState<PosRegister[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    adminApi.posRegisters()
      .then(setRows)
      .catch((e) => { setError(e.message); setRows([]); });
  }, []);

  // Grouped by branch, in the order the server sent them.
  const branches = useMemo(() => {
    const map = new Map<string, PosRegister[]>();
    for (const r of rows ?? []) {
      const key = r.branch || 'Other';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return [...map.entries()];
  }, [rows]);

  if (!rows) {
    return <div className="grid flex-1 place-items-center text-odoo-faint"><Loader2 className="animate-spin" /></div>;
  }

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-5 py-8">
      <h1 className="text-2xl font-extrabold">Point of Sale</h1>
      <p className="mb-7 text-sm text-odoo-dim">Pick a register to start or continue a session.</p>

      {error && <p className="mb-4 rounded bg-odoo-bad/15 px-3 py-2 text-sm text-odoo-bad">{error}</p>}

      {rows.length === 0 ? (
        <div className="card grid place-items-center gap-3 px-6 py-20 text-center text-odoo-dim">
          <span>
            No registers set up yet.
            <span className="mt-1 block text-[13px] text-odoo-faint">
              Add one for each till. Registers sharing a branch name are grouped together here.
            </span>
          </span>
          <a href="/admin/pos" className="btn-primary"><Settings size={15} /> Set up registers</a>
        </div>
      ) : (
        branches.map(([branch, registers]) => (
          <section key={branch} className="mb-8">
            <h2 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-odoo-faint">
              <Store size={13} /> {branch}
            </h2>
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(250px,1fr))]">
              {registers.map((r) => <RegisterCard key={r.id} r={r} onPick={() => onPick(r)} />)}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function RegisterCard({ r, onPick }: { r: PosRegister; onPick: () => void }) {
  const open = r.status === 'OPEN';
  return (
    <button
      onClick={onPick}
      className={`card flex flex-col gap-2 p-4 text-left transition hover:border-odoo-lift ${
        open ? 'border-odoo-ok/50' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-bold">{r.name}</span>
        <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
          open ? 'bg-odoo-ok/20 text-odoo-ok' : 'bg-odoo-raised text-odoo-faint'
        }`}>
          <CircleDot size={10} /> {open ? 'Open' : 'Closed'}
        </span>
      </div>

      {r.warehouseName && (
        <span className="text-xs text-odoo-faint">Sells {r.warehouseName} stock</span>
      )}

      {open ? (
        <span className="text-[13px] text-odoo-dim">
          {r.cashierName ? <>Signed in: <span className="font-semibold text-odoo-ink">{r.cashierName}</span></> : r.openSessionNumber}
          {r.openedAt && (
            <span className="block text-xs text-odoo-faint">
              since {new Date(r.openedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </span>
      ) : (
        <span className="text-[13px] text-odoo-faint">
          {r.lastClosedAt ? (
            <>
              Last closed {new Date(r.lastClosedAt).toLocaleDateString('en-GB')}
              {r.lastClosingCash != null && (
                <span className="block text-xs">Drawer left at {formatKD(r.lastClosingCash)}</span>
              )}
            </>
          ) : 'Never opened'}
        </span>
      )}

      <span className={`mt-1 w-full rounded px-3 py-2 text-center text-[13px] font-bold ${
        open ? 'bg-odoo-ok text-black' : 'bg-odoo-primary text-white'
      }`}>
        {open ? 'Continue Selling' : 'Open Register'}
      </span>
    </button>
  );
}

// ---------- Step 2: cashier ----------

function CashierList({ register, onPick }: { register: PosRegister; onPick: (c: PosCashier) => void }) {
  const [rows, setRows] = useState<PosCashier[] | null>(null);
  const [q, setQ] = useState('');

  const load = useCallback(() => {
    adminApi.posCashiers(register.id, q).then(setRows).catch(() => setRows([]));
  }, [register.id, q]);

  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-5 py-8">
      <h1 className="text-2xl font-extrabold">Who is on the till?</h1>
      <p className="mb-6 text-sm text-odoo-dim">Select your name, then enter your PIN.</p>

      <div className="mb-6 flex h-[38px] items-center gap-2 rounded border border-odoo-line bg-odoo-surface px-3">
        <Search size={16} className="text-odoo-faint" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
          placeholder="Search by name or employee ID…"
          className="w-full bg-transparent text-sm outline-none placeholder:text-odoo-faint"
        />
      </div>

      {!rows ? (
        <div className="grid place-items-center py-20 text-odoo-faint"><Loader2 className="animate-spin" /></div>
      ) : rows.length === 0 ? (
        <div className="card grid place-items-center px-6 py-16 text-center text-odoo-dim">
          <span>
            {q ? `Nobody matches “${q}”.` : 'No cashiers set up yet.'}
            <span className="mt-1 block text-[13px] text-odoo-faint">
              A cashier is any active employee with a Kiosk PIN, set on their record under
              Employees → Attendance &amp; Kiosk.
            </span>
          </span>
        </div>
      ) : (
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
          {rows.map((c) => (
            <button
              key={c.id}
              onClick={() => onPick(c)}
              className="card flex items-center gap-3 p-3 text-left transition hover:border-odoo-lift"
            >
              <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full bg-odoo-primary text-sm font-bold text-white">
                {c.imageUrl
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={c.imageUrl} alt="" className="h-full w-full object-cover" />
                  : c.name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-bold">{c.name}</span>
                <span className="block truncate text-xs text-odoo-faint">
                  {c.ref ? `${c.ref} · ` : ''}{c.jobTitle || c.departmentName || 'Cashier'}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Step 3: PIN ----------

function PinPad({
  register, cashier, onVerified,
}: { register: PosRegister; cashier: PosCashier; onVerified: (pin: string) => void }) {
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = useCallback(async (value: string) => {
    if (!value) return;
    setBusy(true);
    setError('');
    try {
      await adminApi.posVerifyCashier(register.id, cashier.id, value);
      onVerified(value);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Wrong PIN.');
      setPin('');
    } finally {
      setBusy(false);
    }
  }, [register.id, cashier.id, onVerified]);

  // A physical keypad or a barcode-style badge reader types digits and Enter;
  // both have to work without touching the screen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (busy) return;
      if (/^\d$/.test(e.key)) setPin((p) => (p.length < 12 ? p + e.key : p));
      else if (e.key === 'Backspace') setPin((p) => p.slice(0, -1));
      else if (e.key === 'Enter') setPin((p) => { void submit(p); return p; });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, submit]);

  const press = (d: string) => setPin((p) => (p.length < 12 ? p + d : p));

  return (
    <div className="grid flex-1 place-items-center px-5 py-8">
      <div className="w-full max-w-xs text-center">
        <span className="mx-auto mb-3 grid h-20 w-20 place-items-center overflow-hidden rounded-full bg-odoo-primary text-xl font-bold text-white">
          {cashier.imageUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={cashier.imageUrl} alt="" className="h-full w-full object-cover" />
            : cashier.name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()}
        </span>
        <h1 className="text-lg font-extrabold">{cashier.name}</h1>
        <p className="mb-5 text-[13px] text-odoo-dim">{register.name}</p>

        <div className="mb-2 flex h-14 items-center justify-center gap-2.5 rounded border border-odoo-line bg-odoo-surface">
          {pin.length === 0 ? (
            <span className="flex items-center gap-2 text-[13px] text-odoo-faint"><Lock size={14} /> Enter your PIN</span>
          ) : (
            pin.split('').map((_, i) => <span key={i} className="h-3 w-3 rounded-full bg-odoo-ink" />)
          )}
        </div>

        <p className="mb-4 min-h-[18px] text-[13px] font-semibold text-odoo-bad">{error}</p>

        <div className="grid grid-cols-3 gap-2.5">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <button key={d} onClick={() => press(d)} className="h-14 rounded border border-odoo-line bg-odoo-surface text-xl font-bold hover:bg-odoo-raised">
              {d}
            </button>
          ))}
          <button onClick={() => setPin('')} title="Clear" className="grid h-14 place-items-center rounded border border-odoo-line bg-odoo-surface text-odoo-dim hover:bg-odoo-raised">
            <X size={18} />
          </button>
          <button onClick={() => press('0')} className="h-14 rounded border border-odoo-line bg-odoo-surface text-xl font-bold hover:bg-odoo-raised">
            0
          </button>
          <button onClick={() => setPin((p) => p.slice(0, -1))} title="Backspace" className="grid h-14 place-items-center rounded border border-odoo-line bg-odoo-surface text-odoo-dim hover:bg-odoo-raised">
            <Delete size={18} />
          </button>
        </div>

        <button
          onClick={() => submit(pin)}
          disabled={busy || !pin}
          className="btn-primary mt-3 h-12 w-full justify-center text-base disabled:opacity-40"
        >
          {busy ? <Loader2 size={18} className="animate-spin" /> : 'Sign in'}
        </button>
      </div>
    </div>
  );
}

// ---------- Step 4: opening control ----------

function OpeningControl({
  register, cashier, pin, onOpened,
}: {
  register: PosRegister;
  cashier: PosCashier;
  pin: string;
  onOpened: () => void;
}) {
  const [cash, setCash] = useState('0.000');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.select(); }, []);

  const open = async () => {
    const amount = Number(cash);
    if (!Number.isFinite(amount) || amount < 0) {
      setError('Enter the cash counted in the drawer, or 0.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await adminApi.posOpenRegister({
        registerId: register.id,
        cashierId: cashier.id,
        pin,
        openingFloat: amount,
        openingNote: note.trim() || undefined,
      });
      onOpened();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open the register');
      setBusy(false);
    }
  };

  return (
    <div className="grid flex-1 place-items-center px-5 py-8">
      <div className="w-full max-w-md rounded border border-odoo-line bg-odoo-surface p-6">
        <h1 className="text-lg font-extrabold">Opening Control</h1>
        <p className="mb-5 text-[13px] text-odoo-dim">
          {register.name} · {cashier.name}
        </p>

        <label className="mb-4 block">
          <span className="label">Opening cash</span>
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="number"
              min={0}
              step="0.001"
              value={cash}
              onChange={(e) => setCash(e.target.value)}
              className="input text-lg font-bold tabular-nums"
            />
            <button
              onClick={() => setCash('0.000')}
              title="Clear"
              className="grid h-[38px] w-9 shrink-0 place-items-center rounded border border-odoo-line text-odoo-faint hover:bg-odoo-raised"
            >
              <X size={15} />
            </button>
          </div>
          <p className="mt-1 text-[11px] text-odoo-faint">
            Count the drawer before you start. Everything the till expects at closing is measured from this number.
          </p>
        </label>

        <label className="mb-5 block">
          <span className="label">Opening note</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="Add an opening note…"
            className="input"
          />
        </label>

        {error && <p className="mb-4 rounded bg-odoo-bad/15 px-3 py-2 text-sm text-odoo-bad">{error}</p>}

        <button onClick={open} disabled={busy} className="btn-primary h-11 w-full justify-center text-base disabled:opacity-40">
          {busy ? <Loader2 size={18} className="animate-spin" /> : 'Open Register'}
        </button>
      </div>
    </div>
  );
}
