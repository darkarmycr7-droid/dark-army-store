'use client';

import { useEffect, useState } from 'react';
import { Plus, Loader2, Trash2, Power, Ticket } from 'lucide-react';
import { adminApi, Coupon, CouponInput } from '@/lib/adminApi';
import { formatKD } from '@/lib/money';

export default function AdminCouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');

  const load = () => adminApi.coupons().then(setCoupons).catch(() => setCoupons([]));
  useEffect(() => { load(); }, []);

  const toggle = async (c: Coupon) => {
    await adminApi.updateCoupon(c.id, { isActive: !c.isActive });
    load();
  };
  const remove = async (c: Coupon) => {
    if (!confirm(`Delete coupon "${c.code}"?`)) return;
    await adminApi.deleteCoupon(c.id);
    load();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold">Coupons</h1>
          <p className="text-slate-500">{coupons?.length ?? 0} discount codes</p>
        </div>
        <button onClick={() => { setAdding((a) => !a); setError(''); }} className="btn-primary"><Plus size={18} /> New Coupon</button>
      </div>

      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}

      {adding && <CouponForm onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} setError={setError} />}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Discount</th>
                <th className="px-4 py-3">Min order</th>
                <th className="px-4 py-3">Used</th>
                <th className="px-4 py-3">Expires</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {!coupons ? (
                <tr><td colSpan={7} className="py-16 text-center text-slate-400"><Loader2 className="mx-auto animate-spin" /></td></tr>
              ) : coupons.length === 0 ? (
                <tr><td colSpan={7} className="py-16 text-center text-slate-400">No coupons yet.</td></tr>
              ) : (
                coupons.map((c) => (
                  <tr key={c.id} className={`hover:bg-slate-50 ${!c.isActive ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3"><span className="inline-flex items-center gap-1.5 font-bold"><Ticket size={15} className="text-brand-600" /> {c.code}</span></td>
                    <td className="px-4 py-3 font-semibold">{c.type === 'PERCENT' ? `${c.value}%` : formatKD(c.value)}</td>
                    <td className="px-4 py-3 text-slate-500">{c.minSubtotal > 0 ? formatKD(c.minSubtotal) : '—'}</td>
                    <td className="px-4 py-3 text-slate-500">{c.usedCount}{c.maxUses ? ` / ${c.maxUses}` : ''}</td>
                    <td className="px-4 py-3 text-slate-500">{c.expiresAt ? new Date(c.expiresAt).toLocaleDateString() : 'Never'}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${c.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {c.isActive ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => toggle(c)} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-slate-100" title={c.isActive ? 'Disable' : 'Enable'}><Power size={15} /></button>
                        <button onClick={() => remove(c)} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-rose-50 hover:text-rose-600"><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function CouponForm({ onClose, onSaved, setError }: { onClose: () => void; onSaved: () => void; setError: (s: string) => void }) {
  const [form, setForm] = useState<CouponInput>({ code: '', type: 'PERCENT', value: 10, minSubtotal: 0, maxUses: null, expiresAt: null, isActive: true });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof CouponInput, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await adminApi.createCoupon({
        ...form,
        code: form.code.toUpperCase().trim(),
        maxUses: form.maxUses || null,
        expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
      });
      onSaved();
    } catch (err: any) {
      setError(err.message || 'Could not create coupon');
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="card grid gap-4 p-5 sm:grid-cols-3">
      <label className="block"><span className="label">Code</span>
        <input value={form.code} onChange={(e) => set('code', e.target.value.toUpperCase())} required placeholder="SAVE10" className="input uppercase" /></label>
      <label className="block"><span className="label">Type</span>
        <select value={form.type} onChange={(e) => set('type', e.target.value)} className="input">
          <option value="PERCENT">Percentage (%)</option>
          <option value="FIXED">Fixed amount (KD)</option>
        </select></label>
      <label className="block"><span className="label">Value</span>
        <input type="number" min={0} step="0.001" value={form.value} onChange={(e) => set('value', Number(e.target.value))} required className="input" /></label>
      <label className="block"><span className="label">Min Order (KD)</span>
        <input type="number" min={0} step="0.001" value={form.minSubtotal} onChange={(e) => set('minSubtotal', Number(e.target.value))} className="input" /></label>
      <label className="block"><span className="label">Max Uses (optional)</span>
        <input type="number" min={1} value={form.maxUses ?? ''} onChange={(e) => set('maxUses', e.target.value ? Number(e.target.value) : null)} className="input" /></label>
      <label className="block"><span className="label">Expires (optional)</span>
        <input type="date" value={form.expiresAt ?? ''} onChange={(e) => set('expiresAt', e.target.value || null)} className="input" /></label>
      <div className="sm:col-span-3 flex gap-3">
        <button disabled={saving} className="btn-primary">{saving ? <Loader2 size={16} className="animate-spin" /> : 'Create Coupon'}</button>
        <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
      </div>
    </form>
  );
}
