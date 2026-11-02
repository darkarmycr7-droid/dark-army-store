'use client';

import Link from 'next/link';
import { Minus, Plus, Trash2, ShoppingBag, ArrowRight } from 'lucide-react';
import { useCart } from '@/components/CartProvider';
import { useCustomer } from '@/components/CustomerProvider';
import { useLang } from '@/components/LanguageProvider';
import Thumb from '@/components/Thumb';
import { WhatsAppButton } from '@/components/WhatsApp';
import { formatKD } from '@/lib/money';

const FREE_OVER = Number(process.env.NEXT_PUBLIC_FREE_SHIPPING_OVER || 20);

export default function CartPage() {
  const { lines, subtotal, setQty, remove } = useCart();
  const { customer } = useCustomer();
  const { t } = useLang();

  if (lines.length === 0) {
    return (
      <div className="container-x py-20">
        <div className="card mx-auto max-w-md grid place-items-center gap-3 p-12 text-center">
          <ShoppingBag size={48} className="text-slate-300" />
          <h1 className="text-xl font-bold">{t('Your cart is empty')}</h1>
          <p className="text-slate-500">{t("Looks like you haven't added anything yet.")}</p>
          <Link href="/products" className="btn-primary mt-2">{t('Start Shopping')}</Link>
        </div>
      </div>
    );
  }

  const remaining = Math.max(0, FREE_OVER - subtotal);

  return (
    <div className="container-x py-8">
      <h1 className="text-2xl font-extrabold">{t('Shopping Cart')}</h1>

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="space-y-3">
          {remaining > 0 ? (
            <div className="rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-700">
              Add <strong>{formatKD(remaining)}</strong> more to get <strong>FREE delivery</strong> 🚚
            </div>
          ) : (
            <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              🎉 You&apos;ve unlocked <strong>free delivery!</strong>
            </div>
          )}

          {lines.map((l) => (
            <div key={l.productId} className="card flex items-center gap-4 p-3">
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl">
                <Thumb src={l.image} name={l.name} slug={l.slug} iconSize={28} />
              </div>
              <div className="min-w-0 flex-1">
                <Link href={`/products/${l.slug}`} className="line-clamp-2 font-semibold hover:text-brand-600">{l.name}</Link>
                <div className="text-sm text-slate-500">{formatKD(l.price)} {t('each')}</div>
              </div>
              <div className="flex items-center rounded-lg border border-slate-200">
                <button onClick={() => setQty(l.productId, l.quantity - 1)} className="grid h-9 w-9 place-items-center hover:bg-slate-50"><Minus size={15} /></button>
                <span className="w-9 text-center text-sm font-semibold">{l.quantity}</span>
                <button onClick={() => setQty(l.productId, l.quantity + 1)} disabled={l.quantity >= l.stockQty} className="grid h-9 w-9 place-items-center hover:bg-slate-50 disabled:opacity-30"><Plus size={15} /></button>
              </div>
              <div className="w-24 text-right font-bold">{formatKD(l.price * l.quantity)}</div>
              <button onClick={() => remove(l.productId)} className="grid h-9 w-9 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-500"><Trash2 size={16} /></button>
            </div>
          ))}
        </div>

        {/* Summary */}
        <div className="card h-fit p-6">
          <h2 className="text-lg font-bold">{t('Order Summary')}</h2>
          <div className="mt-4 space-y-2 text-sm">
            <Row label={t('Subtotal')} value={formatKD(subtotal)} />
            <Row label={t('Delivery')} value={subtotal >= FREE_OVER ? t('FREE') : t('Calculated at checkout')} />
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4 text-lg font-extrabold">
            <span>{t('Total')}</span>
            <span>{formatKD(subtotal)}</span>
          </div>
          <Link
            href={customer ? '/checkout' : `/account/login?redirect=${encodeURIComponent('/checkout')}`}
            className="btn-primary mt-5 w-full !py-3"
          >
            {customer ? t('Proceed to Checkout') : t('Sign in to Checkout')} <ArrowRight size={18} className="rtl-flip-x" />
          </Link>
          {!customer && (
            <p className="mt-2 text-center text-xs text-slate-400">{t('An account is required to place an order.')}</p>
          )}
          <WhatsAppButton
            className="mt-3 w-full !py-3"
            message={`${t('Hi! I want to order:')}\n${lines.map((l) => `• ${l.name} ×${l.quantity} — ${formatKD(l.price * l.quantity)}`).join('\n')}\n${t('Total')}: ${formatKD(subtotal)}`}
          />
          <Link href="/products" className="mt-3 block text-center text-sm font-medium text-brand-600 hover:underline">
            {t('Continue shopping')}
          </Link>
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
