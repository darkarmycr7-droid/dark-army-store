'use client';

import { useEffect, useState } from 'react';
import { Loader2, MapPin, Plus, Pencil, Trash2, Star, X } from 'lucide-react';
import { customerApi, Address } from '@/lib/customerApi';

const KW_AREAS = ['Kuwait City', 'Salmiya', 'Hawalli', 'Jahra', 'Farwaniya', 'Fahaheel', 'Mangaf', 'Mahboula', 'Salwa', 'Jabriya', 'Sabah Al-Salem', 'Mishref', 'Other'];

const blank: Partial<Address> = { label: 'Home', fullName: '', phone: '', area: 'Kuwait City', block: '', street: '', building: '', notes: '', isDefault: false };

export default function AddressesPage() {
  const [list, setList] = useState<Address[] | null>(null);
  const [editing, setEditing] = useState<Partial<Address> | null>(null);

  const load = () => customerApi.addresses().then(setList).catch(() => setList([]));
  useEffect(() => { load(); }, []);

  const remove = async (id: number) => {
    if (!confirm('Delete this address?')) return;
    await customerApi.deleteAddress(id);
    load();
  };

  const save = async (data: Partial<Address>) => {
    if (data.id) await customerApi.updateAddress(data.id, data);
    else await customerApi.addAddress(data);
    setEditing(null);
    load();
  };

  if (!list) return <div className="grid place-items-center py-24 text-slate-400"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Saved Addresses</h1>
        <button onClick={() => setEditing({ ...blank })} className="btn-primary"><Plus size={18} /> Add Address</button>
      </div>

      {list.length === 0 ? (
        <div className="card grid place-items-center gap-3 p-12 text-center">
          <MapPin size={44} className="text-slate-300" />
          <p className="text-slate-500">No saved addresses yet.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {list.map((a) => (
            <div key={a.id} className="card p-5">
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-2 font-bold">
                  {a.label || 'Address'}
                  {a.isDefault && <span className="flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-600"><Star size={11} className="fill-emerald-500 text-emerald-500" /> Default</span>}
                </span>
                <div className="flex gap-1">
                  <button onClick={() => setEditing(a)} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-brand-50 hover:text-brand-600"><Pencil size={15} /></button>
                  <button onClick={() => remove(a.id)} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-rose-50 hover:text-rose-600"><Trash2 size={15} /></button>
                </div>
              </div>
              <div className="text-sm text-slate-600">
                <div className="font-medium text-ink">{a.fullName} • {a.phone}</div>
                <div>{[a.area, a.block && `Block ${a.block}`, a.street && `St ${a.street}`, a.building].filter(Boolean).join(', ')}</div>
                {a.notes && <div className="text-slate-400">{a.notes}</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && <AddressModal initial={editing} onClose={() => setEditing(null)} onSave={save} />}
    </div>
  );
}

function AddressModal({ initial, onClose, onSave }: { initial: Partial<Address>; onClose: () => void; onSave: (d: Partial<Address>) => Promise<void> }) {
  const [form, setForm] = useState<Partial<Address>>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k: keyof Address, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.fullName || !form.phone || !form.area) return setError('Name, phone and area are required');
    setSaving(true);
    try {
      await onSave(form);
    } catch (err: any) {
      setError(err.message || 'Could not save');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={submit} className="w-full max-w-lg rounded-2xl bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-bold">{form.id ? 'Edit Address' : 'New Address'}</h2>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="grid gap-4 p-6 sm:grid-cols-2">
          {error && <p className="sm:col-span-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}
          <F label="Label" value={form.label || ''} onChange={(v) => set('label', v)} placeholder="Home / Work" />
          <F label="Full Name *" value={form.fullName || ''} onChange={(v) => set('fullName', v)} />
          <F label="Phone *" value={form.phone || ''} onChange={(v) => set('phone', v)} />
          <label className="block">
            <span className="label">Area *</span>
            <select value={form.area} onChange={(e) => set('area', e.target.value)} className="input">
              {KW_AREAS.map((a) => <option key={a}>{a}</option>)}
            </select>
          </label>
          <F label="Block" value={form.block || ''} onChange={(v) => set('block', v)} />
          <F label="Street" value={form.street || ''} onChange={(v) => set('street', v)} />
          <F label="Building / House" value={form.building || ''} onChange={(v) => set('building', v)} />
          <F label="Notes" value={form.notes || ''} onChange={(v) => set('notes', v)} />
          <label className="flex items-center gap-2 text-sm font-medium sm:col-span-2">
            <input type="checkbox" checked={!!form.isDefault} onChange={(e) => set('isDefault', e.target.checked)} /> Set as default address
          </label>
        </div>
        <div className="flex justify-end gap-3 border-t border-slate-100 px-6 py-4">
          <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
          <button disabled={saving} className="btn-primary">{saving ? <Loader2 size={16} className="animate-spin" /> : 'Save Address'}</button>
        </div>
      </form>
    </div>
  );
}

function F({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="input" />
    </label>
  );
}
