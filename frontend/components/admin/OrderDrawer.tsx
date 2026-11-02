'use client';

import { useEffect, useState } from 'react';
import { X, Loader2, Truck, MapPin, Phone, Mail, RotateCcw } from 'lucide-react';
import { adminApi, AdminOrder } from '@/lib/adminApi';
import { formatKD } from '@/lib/money';
import { StatusBadge } from './StatusBadge';
import Thumb from '@/components/Thumb';

const FLOW = ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED'];

export default function OrderDrawer({ id, onClose, onUpdated }: { id: number; onClose: () => void; onUpdated: () => void }) {
  const [order, setOrder] = useState<AdminOrder | null>(null);
  const [status, setStatus] = useState('');
  const [driver, setDriver] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    adminApi.order(id).then((o) => {
      setOrder(o);
      setStatus(o.status);
      setDriver(o.driverName || '');
    });
  }, [id]);

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const updated = await adminApi.updateOrderStatus(id, status, undefined, driver || undefined);
      setOrder(updated);
      onUpdated();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const refund = async () => {
    if (!confirm('Refund this order? The payment will be marked refunded and items returned to stock.')) return;
    const reason = prompt('Reason (optional):') || undefined;
    setSaving(true);
    setError('');
    try {
      const updated = await adminApi.refundOrder(id, reason);
      setOrder(updated);
      setStatus(updated.status);
      onUpdated();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <div className="h-full w-full max-w-lg overflow-y-auto bg-white" onClick={(e) => e.stopPropagation()}>
        {!order ? (
          <div className="grid h-full place-items-center text-slate-400"><Loader2 className="animate-spin" /></div>
        ) : (
          <>
            <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white px-6 py-4">
              <div>
                <h2 className="text-lg font-bold">{order.orderNumber}</h2>
                <span className="text-xs text-slate-400">Tracking {order.trackingNumber}</span>
              </div>
              <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-slate-100"><X size={18} /></button>
            </div>

            <div className="space-y-5 p-6">
              <div className="flex items-center gap-2">
                <StatusBadge status={order.status} />
                <StatusBadge status={order.payStatus} />
                <span className="text-xs text-slate-400">{new Date(order.placedAt).toLocaleString()}</span>
              </div>

              {/* Update */}
              <div className="card border border-slate-200 p-4">
                <h3 className="mb-3 text-sm font-bold">Update Order</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <span className="label">Status</span>
                    <select value={status} onChange={(e) => setStatus(e.target.value)} className="input">
                      {FLOW.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <span className="label">Driver</span>
                    <input value={driver} onChange={(e) => setDriver(e.target.value)} placeholder="Assign driver" className="input" />
                  </div>
                </div>
                {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
                <button onClick={save} disabled={saving} className="btn-primary mt-3 w-full">
                  {saving ? <Loader2 size={16} className="animate-spin" /> : 'Save Update'}
                </button>

                {/* Refund */}
                {order.payStatus === 'REFUNDED' ? (
                  <p className="mt-3 flex items-center justify-center gap-1.5 rounded-lg bg-slate-50 py-2 text-sm font-semibold text-slate-500">
                    <RotateCcw size={15} /> Refunded
                  </p>
                ) : (
                  <button onClick={refund} disabled={saving} className="btn-ghost mt-2 w-full !text-rose-600 hover:!bg-rose-50">
                    <RotateCcw size={15} /> Refund order
                  </button>
                )}
                <p className="mt-1.5 text-center text-[11px] text-slate-400">Marks payment refunded &amp; returns items to stock.</p>
              </div>

              {/* Customer */}
              <div>
                <h3 className="mb-2 text-sm font-bold">Customer & Shipping</h3>
                <div className="space-y-1.5 rounded-xl bg-slate-50 p-4 text-sm">
                  <div className="font-semibold">{order.contactName}</div>
                  <div className="flex items-center gap-2 text-slate-500"><Phone size={14} /> {order.contactPhone}</div>
                  <div className="flex items-center gap-2 text-slate-500"><Mail size={14} /> {order.contactEmail}</div>
                  <div className="flex items-start gap-2 text-slate-500"><MapPin size={14} className="mt-0.5" />
                    {[order.shipArea, order.shipBlock && `Block ${order.shipBlock}`, order.shipStreet && `St ${order.shipStreet}`, order.shipBuilding].filter(Boolean).join(', ')}
                  </div>
                  {order.shipNotes && <div className="text-slate-400">Note: {order.shipNotes}</div>}
                  <div className="flex items-center gap-2 pt-1 text-slate-500"><Truck size={14} /> {order.deliveryMethod} • Pay: {order.payMethod}</div>
                </div>
              </div>

              {/* Items */}
              <div>
                <h3 className="mb-2 text-sm font-bold">Items</h3>
                <div className="space-y-2">
                  {order.items.map((it) => (
                    <div key={it.id} className="flex items-center gap-3 text-sm">
                      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg">
                        <Thumb src={it.imageUrl} name={it.name} slug={it.sku} iconSize={18} />
                      </div>
                      <span className="flex-1">{it.name} <span className="text-slate-400">×{it.quantity}</span></span>
                      <span className="font-semibold">{formatKD(it.lineTotal)}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-sm">
                  <Row label="Subtotal" value={formatKD(order.subtotal)} />
                  {order.discount > 0 && <Row label={`Discount${order.couponCode ? ` (${order.couponCode})` : ''}`} value={`− ${formatKD(order.discount)}`} />}
                  <Row label="Delivery" value={order.shipping === 0 ? 'FREE' : formatKD(order.shipping)} />
                  <div className="flex justify-between pt-1 text-base font-extrabold"><span>Total</span><span>{formatKD(order.total)}</span></div>
                </div>
              </div>

              {/* Timeline */}
              {order.events && order.events.length > 0 && (
                <div>
                  <h3 className="mb-2 text-sm font-bold">History</h3>
                  <ol className="relative border-l border-slate-200 pl-5">
                    {order.events.map((e) => (
                      <li key={e.id} className="mb-3 last:mb-0">
                        <span className="absolute -left-[6px] mt-1 h-3 w-3 rounded-full bg-brand-600" />
                        <div className="text-sm font-semibold">{e.status}</div>
                        {e.note && <div className="text-xs text-slate-500">{e.note}</div>}
                        <div className="text-xs text-slate-400">{new Date(e.createdAt).toLocaleString()}</div>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between text-slate-600"><span>{label}</span><span className="font-semibold text-ink">{value}</span></div>;
}
