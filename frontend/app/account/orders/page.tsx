'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, Package, ChevronDown, RefreshCw } from 'lucide-react';
import { customerApi } from '@/lib/customerApi';
import { api } from '@/lib/api';
import type { Order } from '@/lib/types';
import { formatKD } from '@/lib/money';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { OrderStatusBar } from '@/components/OrderStatus';
import { useCart } from '@/components/CartProvider';
import Thumb from '@/components/Thumb';
import InvoiceButton from '@/components/InvoiceButton';

export default function MyOrdersPage() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [reordering, setReordering] = useState<number | null>(null);
  const { add } = useCart();
  const router = useRouter();

  useEffect(() => {
    customerApi.orders().then(setOrders).catch(() => setOrders([]));
  }, []);

  const buyAgain = async (order: Order) => {
    setReordering(order.id);
    try {
      const ids = Array.from(new Set(order.items.map((i) => i.productId)));
      const current = await api.productsByIds(ids);
      const byId = new Map(current.map((p) => [p.id, p]));
      let added = 0;
      let skipped = 0;
      for (const it of order.items) {
        const p = byId.get(it.productId);
        if (!p || !p.inStock) { skipped++; continue; }
        add({ productId: p.id, name: p.name, slug: p.slug, price: p.price, image: p.image, stockQty: p.stockQty }, it.quantity);
        added++;
      }
      if (added === 0) {
        alert('None of these items are available right now.');
      } else {
        if (skipped > 0) alert(`${added} item(s) added. ${skipped} are no longer available and were skipped.`);
        router.push('/cart');
      }
    } catch {
      alert('Could not reorder. Please try again.');
    } finally {
      setReordering(null);
    }
  };

  if (!orders) return <div className="grid place-items-center py-24 text-slate-400"><Loader2 className="animate-spin" /></div>;

  if (orders.length === 0) {
    return (
      <div className="card grid place-items-center gap-3 p-12 text-center">
        <Package size={44} className="text-slate-300" />
        <h1 className="text-xl font-bold">No orders yet</h1>
        <p className="text-slate-500">When you place an order it will appear here.</p>
        <Link href="/products" className="btn-primary mt-2">Browse Products</Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold">My Orders</h1>
      {orders.map((o) => (
        <div key={o.id} className="card overflow-hidden">
          <button onClick={() => setOpen(open === o.id ? null : o.id)} className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-slate-50">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold">{o.orderNumber}</span>
                <StatusBadge status={o.status} />
              </div>
              <div className="text-xs text-slate-400">{new Date(o.placedAt).toLocaleString()} • {o.items.length} item(s)</div>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-extrabold">{formatKD(o.total)}</span>
              <ChevronDown size={18} className={`text-slate-400 transition ${open === o.id ? 'rotate-180' : ''}`} />
            </div>
          </button>

          {open === o.id && (
            <div className="border-t border-slate-100 p-4">
              <OrderStatusBar status={o.status} />

              <div className="mt-5 space-y-3">
                {o.items.map((it) => (
                  <div key={it.id} className="flex items-center gap-3">
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg">
                      <Thumb src={it.imageUrl} name={it.name} slug={it.sku} iconSize={20} />
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium">{it.name}</div>
                      <div className="text-xs text-slate-400">×{it.quantity} • {formatKD(it.unitPrice)}</div>
                    </div>
                    <div className="font-semibold">{formatKD(it.lineTotal)}</div>
                  </div>
                ))}
              </div>

              <div className="mt-4 space-y-1 border-t border-slate-100 pt-3 text-sm">
                <Row label="Subtotal" value={formatKD(o.subtotal)} />
                {o.discount > 0 && <Row label="Discount" value={`− ${formatKD(o.discount)}`} />}
                <Row label="Delivery" value={o.shipping === 0 ? 'FREE' : formatKD(o.shipping)} />
                <div className="flex justify-between pt-1 font-extrabold"><span>Total</span><span>{formatKD(o.total)}</span></div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-slate-500">
                <span>Pay: <strong className="text-ink">{o.payMethod === 'COD' ? 'Cash on Delivery' : o.payMethod}</strong></span>
                <span>Ship to: <strong className="text-ink">{o.shipArea}</strong></span>
                <button onClick={() => buyAgain(o)} disabled={reordering === o.id} className="btn-buy ms-auto !py-1.5 text-sm">
                  {reordering === o.id ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Buy again
                </button>
                <InvoiceButton order={o} className="inline-flex items-center gap-1.5 font-semibold text-brand-600 hover:underline" />
                <Link href={`/track?t=${o.trackingNumber}`} className="font-semibold text-brand-600 hover:underline">Track order →</Link>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between text-slate-600"><span>{label}</span><span className="font-semibold text-ink">{value}</span></div>;
}
