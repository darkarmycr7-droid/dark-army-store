'use client';

import { useEffect, useState } from 'react';
import { KeyRound, Loader2, Check, ShieldAlert, Users, UserPlus, Power } from 'lucide-react';
import { adminApi, AdminUser, TeamMember } from '@/lib/adminApi';

export default function AdminSettingsPage() {
  const [me, setMe] = useState<AdminUser | null>(null);
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    adminApi.me().then(setMe).catch(() => {});
  }, []);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setDone(false);
    if (form.next.length < 8) return setError('New password must be at least 8 characters.');
    if (form.next !== form.confirm) return setError('New password and confirmation do not match.');
    setSaving(true);
    try {
      await adminApi.changePassword(form.current, form.next);
      setDone(true);
      setForm({ current: '', next: '', confirm: '' });
    } catch (err: any) {
      setError(err.message || 'Could not change password');
    } finally {
      setSaving(false);
    }
  };

  const usingDefault = me?.email === 'admin@darkarmy.store';

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Settings</h1>
        <p className="text-slate-500">Manage your admin account.</p>
      </div>

      {usingDefault && (
        <div className="flex items-start gap-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
          <ShieldAlert size={18} className="mt-0.5 shrink-0" />
          <div>
            <strong>You&apos;re using the default admin login.</strong> Change the password below
            before sharing the store over the internet.
          </div>
        </div>
      )}

      <div className="card p-6">
        <div className="mb-4 flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-50 text-brand-600"><KeyRound size={18} /></span>
          <div>
            <h2 className="font-bold">Change Password</h2>
            <p className="text-xs text-slate-500">Signed in as {me?.email}</p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <Field label="Current Password" type="password" value={form.current} onChange={(v) => set('current', v)} autoComplete="current-password" />
          <Field label="New Password" type="password" value={form.next} onChange={(v) => set('next', v)} autoComplete="new-password" hint="At least 8 characters" />
          <Field label="Confirm New Password" type="password" value={form.confirm} onChange={(v) => set('confirm', v)} autoComplete="new-password" />

          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}
          {done && (
            <p className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
              <Check size={16} /> Password updated. Use it next time you sign in.
            </p>
          )}

          <button disabled={saving} className="btn-primary">
            {saving ? <Loader2 size={16} className="animate-spin" /> : 'Update Password'}
          </button>
        </form>
      </div>

      <TeamSection meId={me?.id} />
    </div>
  );
}

function TeamSection({ meId }: { meId?: number }) {
  const [team, setTeam] = useState<TeamMember[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'ADMIN' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState('');

  const load = () => adminApi.team().then(setTeam).catch(() => setTeam([]));
  useEffect(() => { load(); }, []);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setCreated('');
    if (form.password.length < 8) return setError('Password must be at least 8 characters.');
    setSaving(true);
    try {
      const m = await adminApi.createAdmin(form);
      setCreated(`${m.email} can now sign in at /admin/login`);
      setForm({ name: '', email: '', password: '', role: 'ADMIN' });
      setAdding(false);
      load();
    } catch (err: any) {
      setError(err.message || 'Could not create admin');
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (m: TeamMember) => {
    setError('');
    try {
      await adminApi.updateAdmin(m.id, { isActive: !m.isActive });
      load();
    } catch (err: any) {
      setError(err.message || 'Could not update');
    }
  };

  return (
    <div className="card p-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-50 text-brand-600"><Users size={18} /></span>
          <div>
            <h2 className="font-bold">Admin Users</h2>
            <p className="text-xs text-slate-500">People who can sign in to this admin panel.</p>
          </div>
        </div>
        <button onClick={() => { setAdding((a) => !a); setError(''); }} className="btn-ghost"><UserPlus size={16} /> Add admin</button>
      </div>

      {created && <p className="mb-3 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700"><Check size={16} /> {created}</p>}
      {error && <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}

      {adding && (
        <form onSubmit={submit} className="mb-4 grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
          <label className="block"><span className="label">Name</span>
            <input value={form.name} onChange={(e) => set('name', e.target.value)} required className="input" /></label>
          <label className="block"><span className="label">Email</span>
            <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} required className="input" /></label>
          <label className="block"><span className="label">Temporary Password</span>
            <input value={form.password} onChange={(e) => set('password', e.target.value)} required className="input" placeholder="Min. 8 chars — share with them" /></label>
          <label className="block"><span className="label">Role</span>
            <select value={form.role} onChange={(e) => set('role', e.target.value)} className="input">
              <option value="ADMIN">Admin (full access)</option>
              <option value="MANAGER">Manager</option>
              <option value="STAFF">Staff</option>
            </select></label>
          <div className="sm:col-span-2">
            <button disabled={saving} className="btn-primary">{saving ? <Loader2 size={16} className="animate-spin" /> : 'Create Admin'}</button>
            <span className="ml-3 text-xs text-slate-400">Note: roles are stored but all admins currently have full access.</span>
          </div>
        </form>
      )}

      {!team ? (
        <div className="py-6 text-center text-slate-400"><Loader2 className="mx-auto animate-spin" /></div>
      ) : (
        <div className="divide-y divide-slate-100">
          {team.map((m) => (
            <div key={m.id} className="flex items-center justify-between py-3">
              <div>
                <div className="flex items-center gap-2 font-semibold">
                  {m.name}
                  {m.id === meId && <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[11px] font-bold text-brand-600">You</span>}
                  {!m.isActive && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-bold text-slate-500">Disabled</span>}
                </div>
                <div className="text-sm text-slate-500">{m.email} • {m.role}</div>
              </div>
              {m.id !== meId && (
                <button onClick={() => toggle(m)} className={`btn-ghost !py-1.5 ${m.isActive ? 'text-rose-600' : 'text-emerald-600'}`}>
                  <Power size={15} /> {m.isActive ? 'Disable' : 'Enable'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({
  label, value, onChange, type = 'text', autoComplete, hint,
}: {
  label: string; value: string; onChange: (v: string) => void; type?: string; autoComplete?: string; hint?: string;
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input type={type} required autoComplete={autoComplete} value={value} onChange={(e) => onChange(e.target.value)} className="input" />
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}
