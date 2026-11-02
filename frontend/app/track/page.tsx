'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { PackageSearch, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { formatKD } from '@/lib/money';
import type { Order } from '@/lib/types';
import { OrderStatusBar } from '@/components/OrderStatus';

function TrackInner() {
  const params = useSearchParams();
  const [code, setCode] = useState(params.get('t') || '');
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const lookup = async (value: string) => {
    if (!value) return;
    setLoading(true);
    setError('');
    setOrder(null);
    try {
      setOrder(await api.track(value.trim().toUpperCase()));
    } catch {
      setError('No order found with that tracking number.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (params.get('t')) lookup(params.get('t')!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="container-x py-10">
      <div className="mx-auto max-w-2xl">
        <div className="card p-8 text-center">
          <PackageSearch size={44} className="mx-auto text-brand-600" />
          <h1 className="mt-2 text-2xl font-extrabold">Track Your Order</h1>
          <p className="text-slate-500">Enter the tracking number from your confirmation.</p>
          <form
            onSubmit={(e) => { e.preventDefault(); lookup(code); }}
            className="mx-auto mt-5 flex max-w-md gap-2"
          >
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. DR7TRHZ2DT" className="input uppercase" />
            <button className="btn-primary shrink-0">Track</button>
          </form>
        </div>

        {loading && (
          <div className="mt-6 grid place-items-center py-10 text-slate-400"><Loader2 className="animate-spin" /></div>
        )}
        {error && <p className="mt-6 rounded-xl bg-rose-50 px-4 py-3 text-center text-rose-600">{error}</p>}

        {order && (
          <>
            <div className="card mt-6 p-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm text-slate-400">Order {order.orderNumber}</div>
                  <div className="font-bold">Tracking {order.trackingNumber}</div>
                </div>
                <span className="rounded-full bg-brand-50 px-3 py-1 text-sm font-semibold text-brand-700">{order.status}</span>
              </div>
              <OrderStatusBar status={order.status} />
            </div>

            <div className="card mt-5 p-6">
              <h2 className="mb-3 font-bold">Timeline</h2>
              <ol className="relative border-l border-slate-200 pl-5">
                {order.events.map((e) => (
                  <li key={e.id} className="mb-4 last:mb-0">
                    <span className="absolute -left-[6px] mt-1 h-3 w-3 rounded-full bg-brand-600" />
                    <div className="text-sm font-semibold">{e.status}</div>
                    {e.note && <div className="text-sm text-slate-500">{e.note}</div>}
                    <div className="text-xs text-slate-400">{new Date(e.createdAt).toLocaleString()}</div>
                  </li>
                ))}
              </ol>
            </div>

            <div className="card mt-5 p-6">
              <h2 className="mb-3 font-bold">Summary</h2>
              {order.items.map((it) => (
                <div key={it.id} className="flex justify-between py-1 text-sm">
                  <span className="text-slate-600">{it.name} ×{it.quantity}</span>
                  <span className="font-semibold">{formatKD(it.lineTotal)}</span>
                </div>
              ))}
              <div className="mt-3 flex justify-between border-t border-slate-100 pt-3 font-extrabold">
                <span>Total</span><span>{formatKD(order.total)}</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function TrackPage() {
  return (
    <Suspense fallback={<div className="container-x py-24 text-center text-slate-400">Loading…</div>}>
      <TrackInner />
    </Suspense>
  );
}
