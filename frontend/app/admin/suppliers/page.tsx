'use client';

import { useEffect, useState } from 'react';
import { Plus, Loader2, Trash2, Pencil, Search, Truck, Phone, Mail } from 'lucide-react';
import { adminApi, Supplier, SupplierInput, PaymentTerms } from '@/lib/adminApi';

const TERMS: PaymentTerms[] = ['CASH', 'NET7', 'NET15', 'NET30'];
const TERM_LABEL: Record<PaymentTerms, string> = {
  CASH: 'Cash',
  NET7: 'Net 7 days',
  NET15: 'Net 15 days',
  NET30: 'Net 30 days',
};

const EMPTY: SupplierInput = {
  name: '',
  nameAr: '',
  contactName: '',
  phone: '',
  email: '',
  address: '',
  paymentTerms: 'CASH',
  isInternational: false,
  currency: 'KWD',
  notes: '',
  isActive: true,
};

export default function AdminSuppliersPage() {
  const [rows, setRows] = useState<Supplier[] | null>(null);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Supplier | 'new' | null>(null);
  const [error, setError] = useState('');

  const load = (search = q) => adminApi.suppliers(search).then(setRows).catch(() => setRows([]));
  useEffect(() => {
    const t = setTimeout(() => load(q), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const remove = async (s: Supplier) => {
    if (!confirm(`Delete supplier "${s.name}"?`)) return;
    try {
      const res = await adminApi.deleteSupplier(s.id);
      if (res.softDeleted) alert(`${s.name} has purchase history, so it was deactivated instead of deleted.`);
      load();
    } catch (e: any) {
      setError(e.message || 'Could not delete supplier');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold">Suppliers</h1>
          <p className="text-slate-500">{rows?.length ?? 0} vendors</p>
        </div>
        <button onClick={() => { setEditing('new'); setError(''); }} className="btn-primary"><Plus size={18} /> New Supplier</button>
      </div>

      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}

      <div className="card flex items-center gap-2 px-3 py-2">
        <Search size={16} className="text-slate-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, contact or phone…" className="w-full bg-transparent py-1 text-sm outline-none" />
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Supplier</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Terms</th>
                <th className="px-4 py-3">POs</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {!rows ? (
                <tr><td colSpan={6} className="py-16 text-center text-slate-400"><Loader2 className="mx-auto animate-spin" /></td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={6} className="py-16 text-center text-slate-400">No suppliers yet.</td></tr>
              ) : (
                rows.map((s) => (
                  <tr key={s.id} className={`hover:bg-slate-50 ${!s.isActive ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 font-semibold">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600"><Truck size={15} /></span>
                        <div>
                          {s.name}
                          {s.nameAr && <div className="text-xs font-normal text-slate-400">{s.nameAr}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      <div>{s.contactName || '—'}</div>
                      <div className="flex flex-wrap gap-x-3 text-xs">
                        {s.phone && <span className="inline-flex items-center gap-1"><Phone size={11} /> {s.phone}</span>}
                        {s.email && <span className="inline-flex items-center gap-1"><Mail size={11} /> {s.email}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {TERM_LABEL[s.paymentTerms]}
                      {s.isInternational && <span className="ml-2 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-700">{s.currency}</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{s.poCount ?? 0}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${s.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {s.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => { setEditing(s); setError(''); }} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-slate-100" title="Edit"><Pencil size={15} /></button>
                        <button onClick={() => remove(s)} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-rose-50 hover:text-rose-600" title="Delete"><Trash2 size={15} /></button>
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
        <SupplierModal
          supplier={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function SupplierModal({ supplier, onClose, onSaved }: { supplier: Supplier | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<SupplierInput>(
    supplier
      ? {
          name: supplier.name,
          nameAr: supplier.nameAr ?? '',
          contactName: supplier.contactName ?? '',
          phone: supplier.phone ?? '',
          email: supplier.email ?? '',
          address: supplier.address ?? '',
          paymentTerms: supplier.paymentTerms,
          isInternational: supplier.isInternational,
          currency: supplier.currency || 'KWD',
          notes: supplier.notes ?? '',
          isActive: supplier.isActive,
        }
      : EMPTY
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k: keyof SupplierInput, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = { ...form, email: form.email || null };
      if (supplier) await adminApi.updateSupplier(supplier.id, payload);
      else await adminApi.createSupplier(payload);
      onSaved();
    } catch (err: any) {
      setError(err.message || 'Could not save supplier');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
      >
        <h2 className="mb-4 text-lg font-extrabold">{supplier ? `Edit ${supplier.name}` : 'New Supplier'}</h2>
        {error && <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block"><span className="label">Name</span>
            <input value={form.name} onChange={(e) => set('name', e.target.value)} required className="input" /></label>
          <label className="block"><span className="label">Name (Arabic)</span>
            <input value={form.nameAr ?? ''} onChange={(e) => set('nameAr', e.target.value)} dir="rtl" className="input" /></label>
          <label className="block"><span className="label">Contact person</span>
            <input value={form.contactName ?? ''} onChange={(e) => set('contactName', e.target.value)} className="input" /></label>
          <label className="block"><span className="label">Payment terms</span>
            <select value={form.paymentTerms} onChange={(e) => set('paymentTerms', e.target.value)} className="input">
              {TERMS.map((t) => <option key={t} value={t}>{TERM_LABEL[t]}</option>)}
            </select></label>
          <label className="block"><span className="label">Phone</span>
            <input value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} placeholder="+965 …" className="input" /></label>
          <label className="block"><span className="label">Email</span>
            <input type="email" value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} className="input" /></label>
          <label className="block sm:col-span-2"><span className="label">Address</span>
            <input value={form.address ?? ''} onChange={(e) => set('address', e.target.value)} className="input" /></label>
          <label className="block"><span className="label">Invoicing currency</span>
            <input value={form.currency} onChange={(e) => set('currency', e.target.value.toUpperCase())} maxLength={4} placeholder="KWD" className="input font-mono uppercase" /></label>
          <label className="flex items-center gap-2 self-end pb-2">
            <input type="checkbox" checked={form.isInternational} onChange={(e) => { set('isInternational', e.target.checked); if (!e.target.checked) set('currency', 'KWD'); }} className="h-4 w-4" />
            <span className="text-sm font-medium">Overseas supplier</span>
          </label>
          <label className="block sm:col-span-2"><span className="label">Notes</span>
            <textarea value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} rows={2} className="input" /></label>
          <label className="flex items-center gap-2 sm:col-span-2">
            <input type="checkbox" checked={form.isActive} onChange={(e) => set('isActive', e.target.checked)} className="h-4 w-4" />
            <span className="text-sm font-medium">Active</span>
          </label>
        </div>

        <div className="mt-5 flex gap-3">
          <button disabled={saving} className="btn-primary">{saving ? <Loader2 size={16} className="animate-spin" /> : supplier ? 'Save Changes' : 'Create Supplier'}</button>
          <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
        </div>
      </form>
    </div>
  );
}
