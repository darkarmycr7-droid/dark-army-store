'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Package, Heart, MapPin, Loader2, Save, Star } from 'lucide-react';
import { useCustomer } from '@/components/CustomerProvider';
import { customerApi, LoyaltyInfo } from '@/lib/customerApi';
import type { Order } from '@/lib/types';
import { formatKD } from '@/lib/money';
import { StatusBadge } from '@/components/admin/StatusBadge';

export default function AccountOverview() {
  const { customer, wishlist, setCustomer } = useCustomer();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [addrCount, setAddrCount] = useState<number | null>(null);
  const [loyalty, setLoyalty] = useState<LoyaltyInfo | null>(null);
  const [form, setForm] = useState({ name: customer?.name || '', phone: customer?.phone || '' });
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    customerApi.orders().then(setOrders).catch(() => setOrders([]));
    customerApi.addresses().then((a) => setAddrCount(a.length)).catch(() => setAddrCount(0));
    customerApi.loyalty().then(setLoyalty).catch(() => setLoyalty(null));
  }, []);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await customerApi.updateProfile({ name: form.name, phone: form.phone });
      setCustomer(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const stats = [
    { label: 'Orders', value: orders?.length ?? '—', Icon: Package, href: '/account/orders', tint: 'bg-brand-50 text-brand-600' },
    { label: 'Wishlist', value: wishlist.size, Icon: Heart, href: '/account/wishlist', tint: 'bg-rose-50 text-rose-600' },
    { label: 'Addresses', value: addrCount ?? '—', Icon: MapPin, href: '/account/addresses', tint: 'bg-emerald-50 text-emerald-600' },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold">Welcome back, {customer?.name.split(' ')[0]} 👋</h1>

      {/* Reward points */}
      {loyalty?.enabled && (
        <div className="overflow-hidden rounded-xl bg-gradient-to-r from-brand-700 to-brand-900 p-5 text-white">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-white/80"><Star size={16} className="fill-amber-300 text-amber-300" /> Reward Points</div>
              <div className="mt-1 text-3xl font-extrabold">{loyalty.points.toLocaleString()} <span className="text-base font-semibold text-white/70">pts</span></div>
              <div className="text-sm text-white/80">Worth {formatKD(loyalty.valueKD)} off your next order</div>
            </div>
            <div className="text-end text-xs text-white/70">
              <div>Earn {loyalty.earnRate} pts / KD</div>
              <div>{loyalty.redeemRate} pts = KD 1</div>
            </div>
          </div>
          {loyalty.transactions.length > 0 && (
            <div className="mt-4 border-t border-white/15 pt-3 text-sm">
              {loyalty.transactions.slice(0, 3).map((tx) => (
                <div key={tx.id} className="flex items-center justify-between py-0.5 text-white/85">
                  <span className="truncate">{tx.note || tx.type}</span>
                  <span className={`font-bold ${tx.points >= 0 ? 'text-amber-300' : 'text-white/70'}`}>{tx.points >= 0 ? '+' : ''}{tx.points}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="card flex items-center gap-4 p-5 hover:shadow-md">
            <span className={`grid h-12 w-12 place-items-center rounded-xl ${s.tint}`}><s.Icon size={22} /></span>
            <div>
              <div className="text-2xl font-extrabold">{s.value}</div>
              <div className="text-sm text-slate-500">{s.label}</div>
            </div>
          </Link>
        ))}
      </div>

      {/* Recent orders */}
      <div className="card p-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-bold">Recent Orders</h2>
          <Link href="/account/orders" className="text-sm font-semibold text-brand-600 hover:underline">View all</Link>
        </div>
        {!orders ? (
          <div className="py-6 text-center text-slate-400"><Loader2 className="mx-auto animate-spin" /></div>
        ) : orders.length === 0 ? (
          <p className="py-4 text-sm text-slate-500">You haven&apos;t placed any orders yet. <Link href="/products" className="text-brand-600 hover:underline">Start shopping →</Link></p>
        ) : (
          <div className="space-y-2">
            {orders.slice(0, 4).map((o) => (
              <Link key={o.id} href={`/account/orders`} className="flex items-center justify-between rounded-lg p-2 hover:bg-slate-50">
                <div>
                  <div className="text-sm font-semibold">{o.orderNumber}</div>
                  <div className="text-xs text-slate-400">{new Date(o.placedAt).toLocaleDateString()} • {o.items.length} item(s)</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold">{formatKD(o.total)}</div>
                  <StatusBadge status={o.status} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Profile */}
      <div className="card p-6">
        <h2 className="mb-4 font-bold">Profile</h2>
        <form onSubmit={saveProfile} className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="label">Full Name</span>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="input" />
          </label>
          <label className="block">
            <span className="label">Phone</span>
            <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className="input" />
          </label>
          <label className="block sm:col-span-2">
            <span className="label">Email</span>
            <input value={customer?.email || ''} disabled className="input bg-slate-50 text-slate-400" />
          </label>
          <div className="sm:col-span-2">
            <button disabled={saving} className="btn-primary">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <><Save size={16} /> {saved ? 'Saved!' : 'Save Changes'}</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
