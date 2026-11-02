'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Loader2, KeyRound, ArrowLeft } from 'lucide-react';
import { adminApi, adminToken } from '@/lib/adminApi';

/**
 * The seeded admin login, filled in for you while developing so you aren't
 * retyping it a hundred times a day. A production build starts empty and shows
 * no hint — otherwise a deployed store hands its own credentials to whoever
 * opens the page.
 */
const DEV_LOGIN = process.env.NODE_ENV !== 'production';

export default function AdminLoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'forgot' | 'reset'>('login');
  const [email, setEmail] = useState(DEV_LOGIN ? 'admin@darkarmy.store' : '');
  const [password, setPassword] = useState(DEV_LOGIN ? 'admin123' : '');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [devCode, setDevCode] = useState<string | undefined>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { token } = await adminApi.login(email, password);
      adminToken.set(token);
      router.replace('/admin');
    } catch (err: any) {
      setError(err.message || 'Login failed');
      setLoading(false);
    }
  };

  const submitForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { devCode } = await adminApi.forgot(email);
      setDevCode(devCode);
      setCode('');
      setNewPassword('');
      setMode('reset');
    } catch (err: any) {
      setError(err.message || 'Could not send reset code');
    } finally {
      setLoading(false);
    }
  };

  const submitReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { token } = await adminApi.reset(email, code.trim(), newPassword);
      adminToken.set(token);
      router.replace('/admin');
    } catch (err: any) {
      setError(err.message || 'Could not reset password');
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-ink p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2 text-white">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-600"><Shield size={20} /></span>
          <span className="text-xl font-extrabold">Dark-Army <span className="text-brand-400">Admin</span></span>
        </div>

        {mode === 'login' && (
          <form onSubmit={submit} className="card p-6">
            <h1 className="text-lg font-bold">Sign in</h1>
            <p className="mb-4 text-sm text-slate-500">Manage products, orders & sales.</p>
            <label className="block">
              <span className="label">Email</span>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="input" />
            </label>
            <label className="mt-3 block">
              <span className="label">Password</span>
              <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="input" />
            </label>
            <div className="mt-2 text-end">
              <button type="button" onClick={() => { setMode('forgot'); setError(''); }} className="text-sm font-semibold text-brand-600 hover:underline">
                Forgot password?
              </button>
            </div>
            {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}
            <button disabled={loading} className="btn-primary mt-4 w-full !py-3">
              {loading ? <Loader2 size={18} className="animate-spin" /> : 'Sign in'}
            </button>
            {DEV_LOGIN && (
              <p className="mt-3 text-center text-xs text-slate-400">Demo: admin@darkarmy.store / admin123</p>
            )}
          </form>
        )}

        {mode === 'forgot' && (
          <form onSubmit={submitForgot} className="card p-6">
            <button type="button" onClick={() => { setMode('login'); setError(''); }} className="mb-3 flex items-center gap-1 text-sm text-slate-500 hover:text-brand-600">
              <ArrowLeft size={15} /> Back to sign in
            </button>
            <div className="mb-4 flex flex-col items-center text-center">
              <span className="mb-2 grid h-12 w-12 place-items-center rounded-full bg-brand-50 text-brand-600"><KeyRound size={24} /></span>
              <h1 className="text-lg font-bold">Forgot password?</h1>
              <p className="text-sm text-slate-500">Enter your admin email and we&apos;ll send a reset code.</p>
            </div>
            <label className="block">
              <span className="label">Email</span>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="input" />
            </label>
            {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}
            <button disabled={loading} className="btn-primary mt-4 w-full !py-3">
              {loading ? <Loader2 size={18} className="animate-spin" /> : 'Send reset code'}
            </button>
          </form>
        )}

        {mode === 'reset' && (
          <form onSubmit={submitReset} className="card p-6">
            <button type="button" onClick={() => { setMode('forgot'); setError(''); }} className="mb-3 flex items-center gap-1 text-sm text-slate-500 hover:text-brand-600">
              <ArrowLeft size={15} /> Back
            </button>
            <div className="mb-4 flex flex-col items-center text-center">
              <span className="mb-2 grid h-12 w-12 place-items-center rounded-full bg-brand-50 text-brand-600"><KeyRound size={24} /></span>
              <h1 className="text-lg font-bold">Reset password</h1>
              <p className="text-sm text-slate-500">We sent a code to <strong>{email}</strong>.</p>
            </div>
            {devCode && (
              <div className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-center text-sm text-amber-700">
                <strong>Dev mode:</strong> your code is <strong className="tracking-widest">{devCode}</strong>
              </div>
            )}
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              placeholder="6-digit code"
              className="input text-center text-lg font-bold tracking-widest"
              autoFocus
            />
            <label className="mt-3 block">
              <span className="label">New Password</span>
              <input type="password" required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="input" placeholder="Min. 8 characters" />
            </label>
            {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}
            <button disabled={loading || code.length < 4 || newPassword.length < 8} className="btn-primary mt-4 w-full !py-3">
              {loading ? <Loader2 size={18} className="animate-spin" /> : 'Reset & Sign in'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
