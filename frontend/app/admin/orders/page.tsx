'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Search, Loader2 } from 'lucide-react';
import { adminApi, AdminOrder } from '@/lib/adminApi';
import { formatKD } from '@/lib/money';
import { StatusBadge } from '@/components/admin/StatusBadge';
import OrderDrawer from '@/components/admin/OrderDrawer';

const TABS = ['', 'PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'];

function OrdersInner() {
  const params = useSearchParams();
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<number | null>(params.get('id') ? Number(params.get('id')) : null);

  const load = useCallback(() => {
    setLoading(true);
    adminApi.orders(status, q).then(setOrders).finally(() => setLoading(false));
  }, [status, q]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold">Orders</h1>
        <p className="text-slate-500">{orders.length} orders</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <button
            key={t || 'all'}
            onClick={() => setStatus(t)}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${status === t ? 'bg-brand-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
          >
            {t || 'All'}
          </button>
        ))}
        <div className="relative ml-auto min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Order #, name, phone…" className="input pl-10" />
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Payment</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={6} className="py-16 text-center text-slate-400"><Loader2 className="mx-auto animate-spin" /></td></tr>
              ) : orders.length === 0 ? (
                <tr><td colSpan={6} className="py-16 text-center text-slate-400">No orders found.</td></tr>
              ) : (
                orders.map((o) => (
                  <tr key={o.id} onClick={() => setOpenId(o.id)} className="cursor-pointer hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="font-semibold">{o.orderNumber}</div>
                      <div className="text-xs text-slate-400">{o.items.length} item(s)</div>
                    </td>
                    <td className="px-4 py-3">
                      <div>{o.contactName}</div>
                      <div className="text-xs text-slate-400">{o.contactPhone}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{new Date(o.placedAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-slate-500">{o.payMethod}</td>
                    <td className="px-4 py-3 text-right font-bold">{formatKD(o.total)}</td>
                    <td className="px-4 py-3"><StatusBadge status={o.status} /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {openId && <OrderDrawer id={openId} onClose={() => setOpenId(null)} onUpdated={load} />}
    </div>
  );
}

export default function AdminOrdersPage() {
  return (
    <Suspense fallback={<div className="py-24 text-center text-slate-400">Loading…</div>}>
      <OrdersInner />
    </Suspense>
  );
}
