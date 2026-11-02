'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { DollarSign, ShoppingBag, Users, Package, Boxes, TrendingUp, AlertTriangle, Loader2 } from 'lucide-react';
import { adminApi, Dashboard } from '@/lib/adminApi';
import { formatKD } from '@/lib/money';
import SalesChart from '@/components/admin/SalesChart';
import { StatusBadge } from '@/components/admin/StatusBadge';

export default function AdminDashboardPage() {
  const [d, setD] = useState<Dashboard | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    adminApi.dashboard().then(setD).catch((e) => setErr(e.message));
  }, []);

  if (err) return <p className="rounded-lg bg-rose-50 p-4 text-rose-600">{err}</p>;
  if (!d) return <div className="grid place-items-center py-24 text-slate-400"><Loader2 className="animate-spin" /></div>;

  const cards = [
    { label: 'Revenue', value: formatKD(d.cards.revenue), Icon: DollarSign, tint: 'bg-emerald-50 text-emerald-600' },
    { label: 'Orders', value: d.cards.orders, Icon: ShoppingBag, tint: 'bg-brand-50 text-brand-600' },
    { label: 'Customers', value: d.cards.customers, Icon: Users, tint: 'bg-amber-50 text-amber-600' },
    { label: 'Products', value: d.cards.products, Icon: Package, tint: 'bg-sky-50 text-sky-600' },
    { label: 'Inventory Value (cost)', value: formatKD(d.cards.inventoryValue), Icon: Boxes, tint: 'bg-violet-50 text-violet-600' },
    { label: 'Potential Profit', value: formatKD(d.cards.potentialProfit), Icon: TrendingUp, tint: 'bg-rose-50 text-rose-600' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Dashboard</h1>
        <p className="text-slate-500">Overview of your store performance.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className="card flex items-center gap-4 p-5">
            <span className={`grid h-12 w-12 place-items-center rounded-xl ${c.tint}`}><c.Icon size={22} /></span>
            <div>
              <div className="text-sm text-slate-500">{c.label}</div>
              <div className="text-xl font-extrabold">{c.value}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2"><SalesChart data={d.salesByDay} /></div>

        <div className="card p-6">
          <h2 className="mb-3 flex items-center gap-2 font-bold"><AlertTriangle size={18} className="text-amber-500" /> Low Stock</h2>
          {d.lowStock.length === 0 ? (
            <p className="text-sm text-slate-400">All products are well stocked. 🎉</p>
          ) : (
            <ul className="space-y-2">
              {d.lowStock.map((p) => (
                <li key={p.id} className="flex items-center justify-between text-sm">
                  <span className="truncate">{p.name}</span>
                  <span className={`ml-2 shrink-0 rounded-md px-2 py-0.5 text-xs font-bold ${p.stockQty === 0 ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-700'}`}>
                    {p.stockQty} left
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent orders */}
        <div className="card p-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold">Recent Orders</h2>
            <Link href="/admin/orders" className="text-sm font-semibold text-brand-600 hover:underline">View all</Link>
          </div>
          <div className="space-y-2">
            {d.recentOrders.map((o) => (
              <Link key={o.id} href={`/admin/orders?id=${o.id}`} className="flex items-center justify-between rounded-lg p-2 hover:bg-slate-50">
                <div>
                  <div className="text-sm font-semibold">{o.orderNumber}</div>
                  <div className="text-xs text-slate-400">{o.contactName} • {o.items.length} item(s)</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold">{formatKD(o.total)}</div>
                  <StatusBadge status={o.status} />
                </div>
              </Link>
            ))}
            {d.recentOrders.length === 0 && <p className="text-sm text-slate-400">No orders yet.</p>}
          </div>
        </div>

        {/* Top products */}
        <div className="card p-6">
          <h2 className="mb-3 font-bold">Top Products</h2>
          <div className="space-y-2">
            {d.topProducts.map((p, i) => (
              <div key={p.id} className="flex items-center gap-3 rounded-lg p-2">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-50 text-sm font-bold text-brand-600">{i + 1}</span>
                <span className="flex-1 truncate text-sm font-medium">{p.name}</span>
                <span className="text-xs text-slate-400">{p.soldCount} sold</span>
                <span className="text-sm font-bold">{formatKD(p.price)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
