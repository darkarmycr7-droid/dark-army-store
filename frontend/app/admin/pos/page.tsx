'use client';

import { useEffect, useState } from 'react';
import { Loader2, X, ExternalLink, ShoppingCart, ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { adminApi, PosSessionRow, PosSessionReport } from '@/lib/adminApi';
import { formatKD } from '@/lib/money';
import RegisterManager from '@/components/pos/RegisterManager';

type Tab = 'sessions' | 'registers';

export default function AdminPosSessionsPage() {
  const [tab, setTab] = useState<Tab>('sessions');
  const [rows, setRows] = useState<PosSessionRow[] | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);

  const load = () => adminApi.posSessions().then(setRows).catch(() => setRows([]));
  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold">Point of Sale</h1>
          <p className="text-slate-500">
            {tab === 'sessions'
              ? `${rows?.length ?? 0} sessions — cash control and Z-reports`
              : 'Configure the tills — one register per drawer'}
          </p>
        </div>
        <a href="/pos" className="btn-primary"><ShoppingCart size={18} /> Open the Till <ExternalLink size={14} /></a>
      </div>

      <div className="flex gap-1 border-b border-odoo-line">
        {([['sessions', 'Sessions'], ['registers', 'Registers']] as [Tab, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`-mb-px border-b-2 px-4 py-2 text-[13px] font-medium ${
              tab === key ? 'border-odoo-lift text-odoo-ink' : 'border-transparent text-odoo-dim hover:text-odoo-ink'
            }`}
          >{label}</button>
        ))}
      </div>

      {tab === 'registers' && <RegisterManager />}
      {tab === 'sessions' && (
      <>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Session</th>
                <th className="px-4 py-3">Register</th>
                <th className="px-4 py-3">Opened</th>
                <th className="px-4 py-3">Closed</th>
                <th className="px-4 py-3 text-right">Sales</th>
                <th className="px-4 py-3 text-right">Float</th>
                <th className="px-4 py-3 text-right">Variance</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {!rows ? (
                <tr><td colSpan={8} className="py-16 text-center text-slate-400"><Loader2 className="mx-auto animate-spin" /></td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={8} className="py-16 text-center text-slate-400">No till sessions yet.</td></tr>
              ) : (
                rows.map((s) => (
                  <tr key={s.id} onClick={() => setOpenId(s.id)} className="cursor-pointer hover:bg-slate-50">
                    <td className="px-4 py-3 font-bold">{s.sessionNumber}</td>
                    <td className="px-4 py-3 text-slate-500">{s.registerName}</td>
                    <td className="px-4 py-3 text-slate-500">
                      {new Date(s.openedAt).toLocaleString()}
                      {s.openedByEmail && <div className="text-xs text-slate-400">{s.openedByEmail}</div>}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{s.closedAt ? new Date(s.closedAt).toLocaleString() : '—'}</td>
                    <td className="px-4 py-3 text-right">{s.orderCount}</td>
                    <td className="px-4 py-3 text-right text-slate-500">{formatKD(s.openingFloat)}</td>
                    <td className={`px-4 py-3 text-right font-bold ${s.variance == null ? 'text-slate-400' : s.variance === 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {s.variance == null ? '—' : formatKD(s.variance)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${s.status === 'OPEN' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{s.status}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      </>
      )}

      {openId != null && <ZReport id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function ZReport({ id, onClose }: { id: number; onClose: () => void }) {
  const [r, setR] = useState<PosSessionReport | null>(null);
  useEffect(() => { adminApi.posSessionReport(id).then(setR).catch(() => setR(null)); }, [id]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="h-full w-full max-w-2xl overflow-y-auto bg-white p-6 shadow-xl">
        {!r ? (
          <div className="grid h-full place-items-center text-slate-400"><Loader2 className="animate-spin" /></div>
        ) : (
          <>
            <div className="mb-5 flex items-start justify-between">
              <div>
                <h2 className="text-xl font-extrabold">{r.sessionNumber}</h2>
                <p className="text-sm text-slate-500">
                  {r.registerName} · {new Date(r.openedAt).toLocaleString()}
                  {r.closedAt && ` → ${new Date(r.closedAt).toLocaleString()}`}
                </p>
              </div>
              <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-slate-100"><X size={18} /></button>
            </div>

            {/* Cash reconciliation — the part that gets signed off */}
            <div className="rounded-xl border border-slate-200 p-4">
              <h3 className="mb-3 font-bold">Cash reconciliation</h3>
              <Line label="Opening float" value={formatKD(r.openingFloat)} />
              <Line label="Expected in drawer" value={formatKD(r.expectedCash)} bold />
              <Line label="Counted" value={r.closingCounted != null ? formatKD(r.closingCounted) : '—'} />
              <div className={`mt-2 flex justify-between border-t border-slate-200 pt-2 font-extrabold ${r.variance == null ? '' : r.variance === 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                <span>Variance</span>
                <span>{r.variance == null ? 'Session still open' : r.variance === 0 ? 'Balanced' : formatKD(r.variance)}</span>
              </div>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200 p-4">
                <h3 className="mb-3 font-bold">Trading</h3>
                <Line label="Sales" value={String(r.orderCount)} />
                <Line label="Refunds" value={String(r.refundCount)} />
                <Line label="Gross" value={formatKD(r.gross)} />
                <Line label="Discounts" value={`- ${formatKD(r.discounts)}`} />
                <Line label="Net takings" value={formatKD(r.net)} bold />
                <Line label="Cost of goods" value={formatKD(r.cogs)} />
                <Line label="Gross profit" value={formatKD(r.grossProfit)} bold />
              </div>

              <div className="rounded-xl border border-slate-200 p-4">
                <h3 className="mb-3 font-bold">By tender</h3>
                {r.byTender.length === 0 ? (
                  <p className="text-sm text-slate-400">No payments taken.</p>
                ) : (
                  r.byTender.map((t) => <Line key={t.method} label={`${t.method} (${t.count})`} value={formatKD(t.amount)} />)
                )}
              </div>
            </div>

            {r.cashMoves.length > 0 && (
              <div className="mt-4 rounded-xl border border-slate-200 p-4">
                <h3 className="mb-3 font-bold">Cash in / out</h3>
                {r.cashMoves.map((m) => (
                  <div key={m.id} className="flex items-center justify-between border-b border-slate-100 py-2 text-sm last:border-0">
                    <span className="flex items-center gap-2">
                      {m.type === 'IN' ? <ArrowUpRight size={14} className="text-emerald-600" /> : <ArrowDownRight size={14} className="text-rose-600" />}
                      <span>{m.reason}</span>
                    </span>
                    <span className={`font-semibold ${m.type === 'IN' ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {m.type === 'IN' ? '+' : '-'}{formatKD(m.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 rounded-xl border border-slate-200 p-4">
              <h3 className="mb-3 font-bold">Sales in this session</h3>
              {r.orders.length === 0 ? (
                <p className="text-sm text-slate-400">Nothing sold yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                      <tr><th className="py-2">Sale</th><th className="py-2">Time</th><th className="py-2">Items</th><th className="py-2">Payment</th><th className="py-2 text-right">Total</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {r.orders.map((o) => (
                        <tr key={o.id} className={o.payStatus === 'REFUNDED' ? 'text-rose-600 line-through' : ''}>
                          <td className="py-2 font-medium">{o.orderNumber}</td>
                          <td className="py-2 text-slate-500">{new Date(o.placedAt).toLocaleTimeString()}</td>
                          <td className="py-2 text-slate-500">{o.itemCount}</td>
                          <td className="py-2 text-slate-500">{o.payMethod}</td>
                          <td className="py-2 text-right font-semibold">{formatKD(o.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Line({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between py-1 text-sm ${bold ? 'font-bold' : ''}`}>
      <span className={bold ? '' : 'text-slate-500'}>{label}</span>
      <span>{value}</span>
    </div>
  );
}
