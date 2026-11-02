'use client';

import { useState } from 'react';
import { api } from '@/lib/api';

export default function Newsletter() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState('loading');
    try {
      await api.newsletter(email);
      setState('done');
      setEmail('');
    } catch {
      setState('error');
    }
  };

  if (state === 'done') {
    return <p className="text-sm text-emerald-400">✓ You&apos;re subscribed. Welcome aboard!</p>;
  }

  return (
    <form onSubmit={submit} className="flex gap-2">
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@email.com"
        className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-500 outline-none focus:border-brand-400"
      />
      <button disabled={state === 'loading'} className="btn-primary shrink-0">
        {state === 'loading' ? '…' : 'Join'}
      </button>
    </form>
  );
}
