'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Banknote, CreditCard, Loader2, Lock, ShoppingBag } from 'lucide-react';
import { useCart } from '@/components/CartProvider';
import { useCustomer } from '@/components/CustomerProvider';
import { useLang } from '@/components/LanguageProvider';
import Thumb from '@/components/Thumb';
import { api } from '@/lib/api';
import { customerApi, customerToken, Address } from '@/lib/customerApi';
import { formatKD } from '@/lib/money';
import type { CheckoutConfig } from '@/lib/types';

const KW_AREAS = [
  'Kuwait City', 'Salmiya', 'Hawalli', 'Jahra', 'Farwaniya', 'Fahaheel',
  'Mangaf', 'Mahboula', 'Salwa', 'Jabriya', 'Sabah Al-Salem', 'Mishref', 'Other',
];

const PAY_LABELS: Record<string, { label: string; sub: string; Icon: any }> = {
  COD: { label: 'Cash on Delivery', sub: 'Pay the driver in cash', Icon: Banknote },
  STUB: { label: 'Card (Sandbox)', sub: 'KNET / Visa simulator', Icon: CreditCard },
};

export default function CheckoutPage() {
  const router = useRouter();
  const { lines, subtotal, clear } = useCart();
  const { customer, ready } = useCustomer();
  const { t } = useLang();
  const [cfg, setCfg] = useState<CheckoutConfig | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    name: '', email: '', phone: '',
    area: 'Kuwait City', block: '', street: '', building: '', notes: '',
    deliveryMethod: 'STANDARD',
    payMethod: 'COD',
    coupon: '',
    cardNumber: '', cardName: '',
  });
  const [usePoints, setUsePoints] = useState(false);

  useEffect(() => {
    api.checkoutConfig().then((c) => {
      setCfg(c);
      setForm((f) => ({ ...f, payMethod: c.paymentMethods[0] || 'COD' }));
    }).catch(() => setCfg(null));
  }, []);

  // Sign-in is required to check out
  useEffect(() => {
    if (ready && !customer) {
      router.replace(`/account/login?redirect=${encodeURIComponent('/checkout')}`);
    }
  }, [ready, customer, router]);

  // Prefill from the logged-in customer + load saved addresses
  useEffect(() => {
    if (!customer) return;
    setForm((f) => ({
      ...f,
      name: f.name || customer.name,
      email: f.email || customer.email,
      phone: f.phone || customer.phone || '',
    }));
    customerApi.addresses().then((a) => {
      setAddresses(a);
      const def = a.find((x) => x.isDefault) || a[0];
      if (def) applyAddress(def);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer]);

  const applyAddress = (a: Address) =>
    setForm((f) => ({
      ...f,
      name: a.fullName || f.name,
      phone: a.phone || f.phone,
      area: a.area || f.area,
      block: a.block || '',
      street: a.street || '',
      building: a.building || '',
      notes: a.notes || '',
    }));

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  // Loyalty
  const points = customer?.loyaltyPoints || 0;
  const loyalty = cfg?.loyalty;
  const maxRedeemable = loyalty?.enabled ? Math.min(points, Math.floor(subtotal * loyalty.redeemRate)) : 0;
  const redeemPoints = usePoints ? maxRedeemable : 0;
  const pointsDiscount = loyalty ? Math.round((redeemPoints / loyalty.redeemRate) * 1000) / 1000 : 0;

  const shipping = cfg ? (subtotal >= cfg.freeShippingOver ? 0 : cfg.defaultShipping) : 0;
  const estTotal = Math.max(0, Math.round((subtotal - pointsDiscount + shipping) * 1000) / 1000);
  const willEarn = loyalty?.enabled ? Math.floor(estTotal * loyalty.earnRate) : 0;

  // While auth state resolves (or we're redirecting a guest), don't flash the form
  if (!ready || !customer) {
    return (
      <div className="container-x py-20">
        <div className="card mx-auto max-w-md grid place-items-center gap-3 p-12 text-center">
          <Lock size={40} className="text-brand-500" />
          <h1 className="text-xl font-bold">{t('Sign in to check out')}</h1>
          <p className="text-slate-500">{t('Please sign in or create an account to complete your purchase.')}</p>
          <Link href={`/account/login?redirect=${encodeURIComponent('/checkout')}`} className="btn-primary mt-2">{t('Sign in / Register')}</Link>
        </div>
      </div>
    );
  }

  if (lines.length === 0 && !submitting) {
    return (
      <div className="container-x py-20">
        <div className="card mx-auto max-w-md grid place-items-center gap-3 p-12 text-center">
          <ShoppingBag size={48} className="text-slate-300" />
          <h1 className="text-xl font-bold">{t('Your cart is empty')}</h1>
          <Link href="/products" className="btn-primary mt-2">{t('Browse Products')}</Link>
        </div>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const order = await api.checkout({
        items: lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
        contact: { name: form.name, email: form.email, phone: form.phone },
        shipping: { area: form.area, block: form.block, street: form.street, building: form.building, notes: form.notes },
        deliveryMethod: form.deliveryMethod,
        payMethod: form.payMethod,
        couponCode: form.coupon || undefined,
        redeemPoints: redeemPoints > 0 ? redeemPoints : undefined,
        card: form.payMethod === 'STUB' ? { number: form.cardNumber, name: form.cardName } : undefined,
      }, customerToken.get());
      clear();
      router.push(`/order-confirmation/${order.orderNumber}`);
    } catch (err: any) {
      setError(err.message || 'Could not place order. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <div className="container-x py-8">
      <h1 className="text-2xl font-extrabold">{t('Checkout')}</h1>

      <form onSubmit={submit} className="mt-6 grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          {/* Contact */}
          <section className="card p-6">
            <h2 className="mb-4 text-lg font-bold">{t('1. Contact Information')}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('Full Name')} required value={form.name} onChange={(v) => set('name', v)} />
              <Field label={t('Phone')} required value={form.phone} onChange={(v) => set('phone', v)} placeholder="9XXXXXXX" />
              <div className="sm:col-span-2">
                <Field label={t('Email')} type="email" required value={form.email} onChange={(v) => set('email', v)} />
              </div>
            </div>
          </section>

          {/* Shipping */}
          <section className="card p-6">
            <h2 className="mb-4 text-lg font-bold">{t('2. Shipping Address')}</h2>
            {addresses.length > 0 && (
              <div className="mb-4">
                <span className="label">{t('Use a saved address')}</span>
                <select
                  onChange={(e) => { const a = addresses.find((x) => String(x.id) === e.target.value); if (a) applyAddress(a); }}
                  defaultValue={(addresses.find((a) => a.isDefault) || addresses[0])?.id}
                  className="input"
                >
                  {addresses.map((a) => (
                    <option key={a.id} value={a.id}>{a.label || a.area} — {a.area}{a.block ? `, Block ${a.block}` : ''}{a.isDefault ? ' (default)' : ''}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <span className="label">{t('Area / Governorate')}</span>
                <select value={form.area} onChange={(e) => set('area', e.target.value)} className="input">
                  {KW_AREAS.map((a) => <option key={a}>{a}</option>)}
                </select>
              </div>
              <Field label={t('Block')} value={form.block} onChange={(v) => set('block', v)} />
              <Field label={t('Street')} value={form.street} onChange={(v) => set('street', v)} />
              <Field label={t('Building / House')} value={form.building} onChange={(v) => set('building', v)} />
              <div className="sm:col-span-2">
                <Field label={t('Delivery Notes (optional)')} value={form.notes} onChange={(v) => set('notes', v)} placeholder="" />
              </div>
            </div>
          </section>

          {/* Delivery method */}
          <section className="card p-6">
            <h2 className="mb-4 text-lg font-bold">{t('3. Delivery Method')}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { id: 'STANDARD', label: 'Standard', sub: '2–4 days' },
                { id: 'EXPRESS', label: 'Express', sub: 'Next day' },
              ].map((d) => (
                <label key={d.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 ${form.deliveryMethod === d.id ? 'border-brand-600 bg-brand-50' : 'border-slate-200'}`}>
                  <input type="radio" name="delivery" checked={form.deliveryMethod === d.id} onChange={() => set('deliveryMethod', d.id)} />
                  <div>
                    <div className="font-semibold">{t(d.label)}</div>
                    <div className="text-xs text-slate-500">{d.sub}</div>
                  </div>
                </label>
              ))}
            </div>
          </section>

          {/* Payment */}
          <section className="card p-6">
            <h2 className="mb-4 text-lg font-bold">{t('4. Payment Method')}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {(cfg?.paymentMethods || ['COD']).map((m) => {
                const meta = PAY_LABELS[m] || { label: m, sub: '', Icon: CreditCard };
                return (
                  <label key={m} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 ${form.payMethod === m ? 'border-brand-600 bg-brand-50' : 'border-slate-200'}`}>
                    <input type="radio" name="pay" checked={form.payMethod === m} onChange={() => set('payMethod', m)} />
                    <meta.Icon size={20} className="text-brand-600" />
                    <div>
                      <div className="font-semibold">{t(meta.label)}</div>
                      <div className="text-xs text-slate-500">{t(meta.sub)}</div>
                    </div>
                  </label>
                );
              })}
            </div>

            {form.payMethod === 'STUB' && (
              <div className="mt-4 grid gap-4 sm:grid-cols-2 rounded-xl bg-slate-50 p-4">
                <div className="sm:col-span-2 text-xs text-slate-500">
                  Sandbox: card ending in an <strong>even</strong> digit approves, <strong>odd</strong> declines.
                </div>
                <Field label="Card Number" value={form.cardNumber} onChange={(v) => set('cardNumber', v)} placeholder="4242 4242 4242 4242" />
                <Field label="Name on Card" value={form.cardName} onChange={(v) => set('cardName', v)} />
              </div>
            )}
          </section>
        </div>

        {/* Summary */}
        <div className="card h-fit p-6">
          <h2 className="text-lg font-bold">{t('Your Order')}</h2>
          <div className="mt-4 max-h-64 space-y-3 overflow-y-auto pr-1">
            {lines.map((l) => (
              <div key={l.productId} className="flex items-center gap-3 text-sm">
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg">
                  <Thumb src={l.image} name={l.name} slug={l.slug} iconSize={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{l.name}</div>
                  <div className="text-slate-400">×{l.quantity}</div>
                </div>
                <div className="font-semibold">{formatKD(l.price * l.quantity)}</div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex gap-2">
            <input value={form.coupon} onChange={(e) => set('coupon', e.target.value.toUpperCase())} placeholder="Coupon (try WELCOME10)" className="input" />
          </div>

          {/* Loyalty points */}
          {loyalty?.enabled && points > 0 && (
            <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm">
              <input type="checkbox" checked={usePoints} onChange={(e) => setUsePoints(e.target.checked)} disabled={maxRedeemable <= 0} className="mt-0.5" />
              <span>
                <span className="font-semibold text-amber-800">{t('Use my points')}</span>
                <span className="block text-xs text-amber-700">
                  {points.toLocaleString()} {t('points')} · {t('redeem')} {maxRedeemable.toLocaleString()} {t('for')} −{formatKD(pointsDiscount || maxRedeemable / (loyalty?.redeemRate || 100))}
                </span>
              </span>
            </label>
          )}

          <div className="mt-4 space-y-2 border-t border-slate-100 pt-4 text-sm">
            <Row label={t('Subtotal')} value={formatKD(subtotal)} />
            <Row label={t('Delivery')} value={shipping === 0 ? t('FREE') : formatKD(shipping)} />
            {form.coupon && <Row label="Coupon" value={form.coupon} />}
            {redeemPoints > 0 && <Row label={`${t('Points')} (−${redeemPoints})`} value={`− ${formatKD(pointsDiscount)}`} />}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-lg font-extrabold">
            <span>{t('Total')}</span>
            <span>{formatKD(estTotal)}</span>
          </div>
          {willEarn > 0 && (
            <p className="mt-2 text-center text-xs font-semibold text-amber-700">★ {t('Earn')} {willEarn} {t('points')} {t('on this order')}</p>
          )}

          {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}

          <button disabled={submitting} className="btn-primary mt-5 w-full !py-3">
            {submitting ? <><Loader2 size={18} className="animate-spin" /> {t('Placing order…')}</> : <><Lock size={16} /> {t('Place Order')}</>}
          </button>
          <p className="mt-3 text-center text-xs text-slate-400">{t('Secure checkout • Your data is protected')}</p>
        </div>
      </form>
    </div>
  );
}

function Field({
  label, value, onChange, type = 'text', required, placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean; placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="label">{label}{required && <span className="text-rose-500"> *</span>}</span>
      <input type={type} required={required} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="input" />
    </label>
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
