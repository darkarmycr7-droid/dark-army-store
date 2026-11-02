const STYLES: Record<string, string> = {
  PENDING: 'bg-slate-100 text-slate-600',
  CONFIRMED: 'bg-sky-100 text-sky-700',
  PROCESSING: 'bg-violet-100 text-violet-700',
  SHIPPED: 'bg-amber-100 text-amber-700',
  DELIVERED: 'bg-emerald-100 text-emerald-700',
  CANCELLED: 'bg-rose-100 text-rose-700',
  RETURNED: 'bg-rose-100 text-rose-700',
  PAID: 'bg-emerald-100 text-emerald-700',
  UNPAID: 'bg-slate-100 text-slate-600',
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-bold ${STYLES[status] || 'bg-slate-100 text-slate-600'}`}>
      {status}
    </span>
  );
}
