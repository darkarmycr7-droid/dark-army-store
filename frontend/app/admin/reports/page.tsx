'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, FileSpreadsheet, FileText, FileDown, BarChart3 } from 'lucide-react';
import { adminApi, ReportData } from '@/lib/adminApi';
import { exportCSV, exportExcel, exportPDF, display } from '@/lib/reportExport';

const TABS = [
  { id: 'sales', label: 'Sales' },
  { id: 'products', label: 'Products' },
  { id: 'customers', label: 'Customers' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'purchases', label: 'Purchases' },
  { id: 'movements', label: 'Stock Movements' },
  { id: 'sessions', label: 'Cash Sessions' },
  { id: 'pnl', label: 'P&L (Orders)' },
  // Derived from the journal rather than recomputed from orders.
  { id: 'acct:trial-balance', label: 'Trial Balance' },
  { id: 'acct:income-statement', label: 'Income Statement' },
  { id: 'acct:balance-sheet', label: 'Balance Sheet' },
  { id: 'acct:ledger', label: 'General Ledger' },
  { id: 'acct:payables', label: 'Supplier Balances' },
];

// Point-in-time snapshots — a date range makes no sense for these.
const NO_DATE = new Set(['inventory', 'acct:balance-sheet', 'acct:payables']);

function isoDaysAgo(n: number) {
  return new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
}

export default function AdminReportsPage() {
  const [type, setType] = useState('sales');
  const [from, setFrom] = useState(isoDaysAgo(30));
  const [to, setTo] = useState(isoDaysAgo(0));
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const usesDate = !NO_DATE.has(type);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    // "acct:" reports come from the accounting module's own endpoints.
    const p = type.startsWith('acct:')
      ? adminApi.acctReport(type.slice(5), {
          from: usesDate ? from : undefined,
          to: usesDate ? to : undefined,
        })
      : adminApi.report(type, usesDate ? from : undefined, usesDate ? to : undefined);
    p.then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [type, from, to, usesDate]);

  useEffect(() => { load(); }, [load]);

  const subtitle = usesDate ? `${from} → ${to}` : `As of ${isoDaysAgo(0)}`;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-50 text-brand-600"><BarChart3 size={18} /></span>
        <div>
          <h1 className="text-2xl font-extrabold">Reports</h1>
          <p className="text-slate-500">Sales, products, customers, inventory, purchases & P&amp;L — export to Excel, PDF or CSV.</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setType(t.id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${type === t.id ? 'bg-brand-600 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Controls */}
      <div className="card flex flex-wrap items-end gap-4 p-4">
        {usesDate && (
          <>
            <label className="block">
              <span className="label">From</span>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input" />
            </label>
            <label className="block">
              <span className="label">To</span>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input" />
            </label>
          </>
        )}
        <div className="ms-auto flex flex-wrap gap-2">
          <button disabled={!data} onClick={() => data && exportExcel(data)} className="btn-ghost"><FileSpreadsheet size={16} className="text-emerald-600" /> Excel</button>
          <button disabled={!data} onClick={() => data && exportPDF(data, subtitle)} className="btn-ghost"><FileText size={16} className="text-rose-600" /> PDF</button>
          <button disabled={!data} onClick={() => data && exportCSV(data)} className="btn-ghost"><FileDown size={16} className="text-brand-600" /> CSV</button>
        </div>
      </div>

      {/* Summary cards */}
      {data && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {data.summary.map((s) => (
            <div key={s.label} className="card p-4">
              <div className="text-xs uppercase tracking-wide text-slate-400">{s.label}</div>
              <div className="text-xl font-extrabold text-ink">{display(s.value, s.money)}</div>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="card overflow-hidden">
        {error && <p className="p-4 text-sm text-rose-600">{error}</p>}
        {loading ? (
          <div className="grid place-items-center py-20 text-slate-400"><Loader2 className="animate-spin" /></div>
        ) : data && data.rows.length === 0 ? (
          <div className="grid place-items-center py-20 text-slate-400">No data for this range.</div>
        ) : data ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>{data.columns.map((c) => <th key={c.key} className="whitespace-nowrap px-4 py-3">{c.label}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.rows.map((row, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    {data.columns.map((c) => (
                      <td key={c.key} className={`whitespace-nowrap px-4 py-2.5 ${c.money ? 'font-semibold tabular-nums' : ''}`}>
                        {display(row[c.key], c.money)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  );
}
