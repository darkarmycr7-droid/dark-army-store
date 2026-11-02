'use client';

import { useEffect, useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { adminApi, AuditEntry } from '@/lib/adminApi';

const METHOD_COLOR: Record<string, string> = {
  POST: 'bg-emerald-100 text-emerald-700',
  PUT: 'bg-amber-100 text-amber-700',
  PATCH: 'bg-amber-100 text-amber-700',
  DELETE: 'bg-rose-100 text-rose-700',
};

export default function AdminAuditPage() {
  const [rows, setRows] = useState<AuditEntry[] | null>(null);

  useEffect(() => {
    adminApi.audit(150).then(setRows).catch(() => setRows([]));
  }, []);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-50 text-brand-600"><ShieldCheck size={18} /></span>
        <div>
          <h1 className="text-2xl font-extrabold">Activity Log</h1>
          <p className="text-slate-500">Every change made in the admin panel.</p>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Who</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Details</th>
                <th className="px-4 py-3">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {!rows ? (
                <tr><td colSpan={5} className="py-16 text-center text-slate-400"><Loader2 className="mx-auto animate-spin" /></td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={5} className="py-16 text-center text-slate-400">No activity recorded yet.</td></tr>
              ) : (
                rows.map((r) => {
                  const [method, path] = r.action.split(' ');
                  return (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="whitespace-nowrap px-4 py-3 text-slate-500">{new Date(r.createdAt).toLocaleString()}</td>
                      <td className="px-4 py-3 font-medium">{r.actorEmail || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`me-2 rounded px-1.5 py-0.5 text-[11px] font-bold ${METHOD_COLOR[method] || 'bg-slate-100 text-slate-600'}`}>{method}</span>
                        <span className="text-slate-600">{path?.replace('/api/admin', '')}</span>
                        {r.status && r.status >= 400 && <span className="ms-2 rounded bg-rose-100 px-1.5 py-0.5 text-[11px] font-bold text-rose-700">{r.status}</span>}
                      </td>
                      <td className="max-w-[280px] truncate px-4 py-3 font-mono text-xs text-slate-400">{r.metadata || '—'}</td>
                      <td className="px-4 py-3 text-slate-400">{r.ip || '—'}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
