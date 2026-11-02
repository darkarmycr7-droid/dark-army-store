'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, Shield, MailCheck, ArrowLeft, KeyRound } from 'lucide-react';
import { useCustomer } from '@/components/CustomerProvider';

function LoginInner() {
  const { login, register, verifyEmail, resend, forgotPassword, resetPassword } = useCustomer();
  const router = useRouter();
  const params = useSearchParams();
  const redirect = params.get('redirect') || '/account';

  const [mode, setMode] = useState<'login' | 'register' | 'verify' | 'forgot' | 'reset'>('login');
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // verify / reset step state
  const [verifyEmailAddr, setVerifyEmailAddr] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [devCode, setDevCode] = useState<string | undefined>();
  const [resent, setResent] = useState(false);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const toVerify = (email: string, dev?: string) => {
    setVerifyEmailAddr(email);
    setDevCode(dev);
    setCode('');
    setMode('verify');
  };

  const submitForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { devCode } = await forgotPassword(form.email);
      setVerifyEmailAddr(form.email);
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
      await resetPassword(verifyEmailAddr, code.trim(), newPassword);
      router.replace(redirect);
    } catch (err: any) {
      setError(err.message || 'Could not reset password');
    } finally {
      setLoading(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = mode === 'login'
        ? await login(form.email, form.password)
        : await register({ name: form.name, email: form.email, phone: form.phone || undefined, password: form.password });
      if ('needsVerification' in res) {
        toVerify(res.email, res.devCode);
      } else {
        router.replace(redirect);
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await verifyEmail(verifyEmailAddr, code.trim());
      router.replace(redirect);
    } catch (err: any) {
      setError(err.message || 'Invalid code');
    } finally {
      setLoading(false);
    }
  };

  const doResend = async () => {
    setError('');
    try {
      const { devCode } = await resend(verifyEmailAddr);
      setDevCode(devCode);
      setResent(true);
      setTimeout(() => setResent(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Could not resend');
    }
  };

  return (
    <div className="container-x py-12">
      <div className="mx-auto max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-600 text-white"><Shield size={20} /></span>
          <span className="text-xl font-extrabold">Dark<span className="text-brand-600">Army</span></span>
        </div>

        {mode === 'forgot' ? (
          <div className="card p-6">
            <button onClick={() => { setMode('login'); setError(''); }} className="mb-3 flex items-center gap-1 text-sm text-slate-500 hover:text-brand-600">
              <ArrowLeft size={15} /> Back to sign in
            </button>
            <div className="mb-4 flex flex-col items-center text-center">
              <span className="mb-2 grid h-12 w-12 place-items-center rounded-full bg-brand-50 text-brand-600"><KeyRound size={24} /></span>
              <h1 className="text-lg font-bold">Forgot your password?</h1>
              <p className="text-sm text-slate-500">Enter your email and we&apos;ll send you a reset code.</p>
            </div>
            <form onSubmit={submitForgot} className="space-y-4">
              <Field label="Email" type="email" value={form.email} onChange={(v) => set('email', v)} required />
              {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}
              <button disabled={loading} className="btn-primary w-full !py-3">
                {loading ? <Loader2 size={18} className="animate-spin" /> : 'Send reset code'}
              </button>
            </form>
          </div>
        ) : mode === 'reset' ? (
          <div className="card p-6">
            <button onClick={() => { setMode('forgot'); setError(''); }} className="mb-3 flex items-center gap-1 text-sm text-slate-500 hover:text-brand-600">
              <ArrowLeft size={15} /> Back
            </button>
            <div className="mb-4 flex flex-col items-center text-center">
              <span className="mb-2 grid h-12 w-12 place-items-center rounded-full bg-brand-50 text-brand-600"><KeyRound size={24} /></span>
              <h1 className="text-lg font-bold">Reset password</h1>
              <p className="text-sm text-slate-500">We sent a code to <strong>{verifyEmailAddr}</strong>. Enter it with your new password.</p>
            </div>
            {devCode && (
              <div className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-center text-sm text-amber-700">
                <strong>Dev mode:</strong> your code is <strong className="tracking-widest">{devCode}</strong>
              </div>
            )}
            <form onSubmit={submitReset} className="space-y-4">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                placeholder="6-digit code"
                className="input text-center text-lg font-bold tracking-widest"
                autoFocus
              />
              <Field label="New Password" type="password" value={newPassword} onChange={setNewPassword} required placeholder="Min. 6 characters" />
              {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}
              <button disabled={loading || code.length < 4 || newPassword.length < 6} className="btn-primary w-full !py-3">
                {loading ? <Loader2 size={18} className="animate-spin" /> : 'Reset & Sign in'}
              </button>
            </form>
          </div>
        ) : mode === 'verify' ? (
          <div className="card p-6">
            <button onClick={() => { setMode('login'); setError(''); }} className="mb-3 flex items-center gap-1 text-sm text-slate-500 hover:text-brand-600">
              <ArrowLeft size={15} /> Back
            </button>
            <div className="mb-4 flex flex-col items-center text-center">
              <span className="mb-2 grid h-12 w-12 place-items-center rounded-full bg-brand-50 text-brand-600"><MailCheck size={24} /></span>
              <h1 className="text-lg font-bold">Verify your email</h1>
              <p className="text-sm text-slate-500">We sent a 6-digit code to <strong>{verifyEmailAddr}</strong>. Enter it below to activate your account.</p>
            </div>

            {devCode && (
              <div className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-center text-sm text-amber-700">
                <strong>Dev mode:</strong> your code is <strong className="tracking-widest">{devCode}</strong>
                <div className="text-xs text-amber-600">(Real emails are sent once you configure SMTP.)</div>
              </div>
            )}

            <form onSubmit={submitCode} className="space-y-4">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                placeholder="••••••"
                className="input text-center text-2xl font-bold tracking-[0.5em]"
                autoFocus
              />
              {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}
              <button disabled={loading || code.length < 4} className="btn-primary w-full !py-3">
                {loading ? <Loader2 size={18} className="animate-spin" /> : 'Verify & Continue'}
              </button>
            </form>

            <div className="mt-4 text-center text-sm text-slate-500">
              Didn&apos;t get it?{' '}
              <button onClick={doResend} className="font-semibold text-brand-600 hover:underline">
                {resent ? 'Code resent ✓' : 'Resend code'}
              </button>
            </div>
          </div>
        ) : (
          <div className="card p-6">
            <div className="mb-5 grid grid-cols-2 rounded-lg bg-slate-100 p-1 text-sm font-semibold">
              <button onClick={() => { setMode('login'); setError(''); }} className={`rounded-md py-2 ${mode === 'login' ? 'bg-white shadow-sm' : 'text-slate-500'}`}>Sign In</button>
              <button onClick={() => { setMode('register'); setError(''); }} className={`rounded-md py-2 ${mode === 'register' ? 'bg-white shadow-sm' : 'text-slate-500'}`}>Create Account</button>
            </div>

            <form onSubmit={submit} className="space-y-4">
              {mode === 'register' && (
                <>
                  <Field label="Full Name" value={form.name} onChange={(v) => set('name', v)} required />
                  <Field label="Phone (optional)" value={form.phone} onChange={(v) => set('phone', v)} placeholder="9XXXXXXX" />
                </>
              )}
              <Field label="Email" type="email" value={form.email} onChange={(v) => set('email', v)} required />
              <Field label="Password" type="password" value={form.password} onChange={(v) => set('password', v)} required placeholder={mode === 'register' ? 'Min. 6 characters' : ''} />

              {mode === 'login' && (
                <div className="-mt-2 text-end">
                  <button type="button" onClick={() => { setMode('forgot'); setError(''); }} className="text-sm font-semibold text-brand-600 hover:underline">
                    Forgot password?
                  </button>
                </div>
              )}

              {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}

              <button disabled={loading} className="btn-primary w-full !py-3">
                {loading ? <Loader2 size={18} className="animate-spin" /> : mode === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            </form>

            {mode === 'register' && (
              <p className="mt-3 text-center text-xs text-slate-400">We&apos;ll email you a code to verify your address.</p>
            )}
            <p className="mt-4 text-center text-xs text-slate-400">
              <Link href="/" className="text-brand-600 hover:underline">Back to store</Link>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', required, placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean; placeholder?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input type={type} required={required} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="input" />
    </label>
  );
}

export default function AccountLoginPage() {
  return (
    <Suspense fallback={<div className="container-x py-24 text-center text-slate-400">Loading…</div>}>
      <LoginInner />
    </Suspense>
  );
}
