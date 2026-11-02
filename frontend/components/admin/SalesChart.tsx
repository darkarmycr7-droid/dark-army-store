'use client';

import { formatKD } from '@/lib/money';

export default function SalesChart({ data }: { data: { date: string; sales: number; orders: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.sales));
  return (
    <div className="card p-6">
      <h2 className="font-bold">Sales — last 14 days</h2>
      <div className="mt-6 flex h-44 items-end gap-1.5">
        {data.map((d) => {
          const h = (d.sales / max) * 100;
          const label = new Date(d.date).toLocaleDateString('en', { day: 'numeric', month: 'short' });
          return (
            <div key={d.date} className="group relative flex flex-1 flex-col items-center justify-end">
              <div
                className="w-full rounded-t bg-brand-500 transition-all group-hover:bg-brand-600"
                style={{ height: `${Math.max(2, h)}%` }}
              />
              <div className="pointer-events-none absolute -top-9 hidden whitespace-nowrap rounded-md bg-ink px-2 py-1 text-xs text-white group-hover:block">
                {formatKD(d.sales)} • {d.orders} order{d.orders === 1 ? '' : 's'}
              </div>
              <span className="mt-1 hidden text-[9px] text-slate-400 sm:block">{label.split(' ')[0]}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
