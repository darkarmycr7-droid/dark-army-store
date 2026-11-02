import { Check, Clock, Package, Truck, Home, XCircle } from 'lucide-react';

const FLOW = [
  { key: 'PENDING', label: 'Placed', Icon: Clock },
  { key: 'CONFIRMED', label: 'Confirmed', Icon: Check },
  { key: 'PROCESSING', label: 'Processing', Icon: Package },
  { key: 'SHIPPED', label: 'Shipped', Icon: Truck },
  { key: 'DELIVERED', label: 'Delivered', Icon: Home },
];

export function OrderStatusBar({ status }: { status: string }) {
  if (status === 'CANCELLED' || status === 'RETURNED') {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-rose-50 px-4 py-3 font-semibold text-rose-600">
        <XCircle size={18} /> Order {status.toLowerCase()}
      </div>
    );
  }
  const idx = Math.max(0, FLOW.findIndex((f) => f.key === status));
  return (
    <div className="flex items-center">
      {FLOW.map((f, i) => {
        const done = i <= idx;
        return (
          <div key={f.key} className="flex flex-1 flex-col items-center">
            <div className="flex w-full items-center">
              <div className={`h-1 flex-1 ${i === 0 ? 'opacity-0' : done ? 'bg-brand-600' : 'bg-slate-200'}`} />
              <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${done ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-400'}`}>
                <f.Icon size={16} />
              </div>
              <div className={`h-1 flex-1 ${i === FLOW.length - 1 ? 'opacity-0' : i < idx ? 'bg-brand-600' : 'bg-slate-200'}`} />
            </div>
            <span className={`mt-1 text-xs font-medium ${done ? 'text-ink' : 'text-slate-400'}`}>{f.label}</span>
          </div>
        );
      })}
    </div>
  );
}
