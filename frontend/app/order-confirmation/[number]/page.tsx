import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CheckCircle2, Truck, Copy } from 'lucide-react';
import { api } from '@/lib/api';
import { formatKD } from '@/lib/money';
import { OrderStatusBar } from '@/components/OrderStatus';
import Thumb from '@/components/Thumb';
import InvoiceButton from '@/components/InvoiceButton';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Order Confirmed' };

export default async function ConfirmationPage({ params }: { params: { number: string } }) {
  let order;
  try {
    order = await api.orderByNumber(params.number);
  } catch {
    notFound();
  }

  return (
    <div className="container-x py-10">
      <div className="mx-auto max-w-2xl">
        <div className="card p-8 text-center">
          <CheckCircle2 size={56} className="mx-auto text-emerald-500" />
          <h1 className="mt-3 text-2xl font-extrabold">Thank you for your order!</h1>
          <p className="mt-1 text-slate-500">
            A confirmation has been sent to {order.contactEmail}.
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-slate-50 p-4">
              <div className="text-xs uppercase tracking-wide text-slate-400">Order Number</div>
              <div className="text-lg font-extrabold">{order.orderNumber}</div>
            </div>
            <div className="rounded-xl bg-brand-50 p-4">
              <div className="text-xs uppercase tracking-wide text-brand-500">Tracking Number</div>
              <div className="text-lg font-extrabold text-brand-700">{order.trackingNumber}</div>
            </div>
          </div>
        </div>

        <div className="card mt-5 p-6">
          <h2 className="mb-4 font-bold">Order Status</h2>
          <OrderStatusBar status={order.status} />
        </div>

        <div className="card mt-5 p-6">
          <h2 className="mb-4 font-bold">Items</h2>
          <div className="space-y-3">
            {order.items.map((it) => (
              <div key={it.id} className="flex items-center gap-3">
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg">
                  <Thumb src={it.imageUrl} name={it.name} slug={it.sku} iconSize={22} />
                </div>
                <div className="flex-1">
                  <div className="font-medium">{it.name}</div>
                  <div className="text-sm text-slate-400">×{it.quantity} • {formatKD(it.unitPrice)}</div>
                </div>
                <div className="font-semibold">{formatKD(it.lineTotal)}</div>
              </div>
            ))}
          </div>

          <div className="mt-5 space-y-2 border-t border-slate-100 pt-4 text-sm">
            <Row label="Subtotal" value={formatKD(order.subtotal)} />
            {order.discount > 0 && <Row label={`Discount${order.couponCode ? ` (${order.couponCode})` : ''}`} value={`− ${formatKD(order.discount)}`} />}
            <Row label="Delivery" value={order.shipping === 0 ? 'FREE' : formatKD(order.shipping)} />
            {order.tax > 0 && <Row label="Tax" value={formatKD(order.tax)} />}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-lg font-extrabold">
            <span>Total</span>
            <span>{formatKD(order.total)}</span>
          </div>

          <div className="mt-4 flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <Truck size={16} className="text-brand-600" />
            Paying by <strong className="mx-1">{order.payMethod === 'COD' ? 'Cash on Delivery' : order.payMethod}</strong>
            • Shipping to {order.shipArea}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href={`/track?t=${order.trackingNumber}`} className="btn-primary">Track this order</Link>
          <InvoiceButton order={order} />
          <Link href="/products" className="btn-ghost">Continue shopping</Link>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-slate-600">
      <span>{label}</span>
      <span className="font-semibold text-ink">{value}</span>
    </div>
  );
}
