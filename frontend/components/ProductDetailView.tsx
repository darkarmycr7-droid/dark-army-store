'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Minus, Plus, ShoppingCart, Check, Star, Truck, ShieldCheck } from 'lucide-react';
import type { ProductDetail } from '@/lib/types';
import { formatKD, discountPct } from '@/lib/money';
import { recordView } from '@/lib/recentlyViewed';
import { useCart } from './CartProvider';
import { useLang } from './LanguageProvider';
import WishlistButton from './WishlistButton';
import ProductGallery from './ProductGallery';
import { WhatsAppButton } from './WhatsApp';

export default function ProductDetailView({ p }: { p: ProductDetail }) {
  const { add } = useCart();
  const { t, pick } = useLang();
  const name = pick(p.name, p.nameAr);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const off = discountPct(p.price, p.compareAtPrice);

  // Remember this product for the homepage "Recently viewed" rail.
  useEffect(() => {
    recordView(p.id);
  }, [p.id]);

  const onAdd = () => {
    add({ productId: p.id, name: p.name, slug: p.slug, price: p.price, image: p.image, stockQty: p.stockQty }, qty);
    setAdded(true);
    setTimeout(() => setAdded(false), 1800);
  };

  return (
    <div className="grid gap-10 md:grid-cols-2">
      {/* Gallery */}
      <ProductGallery images={p.images} name={name} slug={p.slug} categorySlug={p.category?.slug} />

      {/* Info */}
      <div>
        {p.category && (
          <Link href={`/products?category=${p.category.slug}`} className="text-sm font-semibold text-brand-600">
            {pick(p.category.name, p.category.nameAr)}
          </Link>
        )}
        <h1 className="mt-1 text-3xl font-extrabold">{name}</h1>

        <div className="mt-2 flex items-center gap-3 text-sm text-slate-500">
          <span className="flex items-center gap-1">
            <Star size={15} className="fill-amber-400 text-amber-400" /> {p.ratingAvg.toFixed(1)} ({p.ratingCount})
          </span>
          <span>•</span>
          <span>SKU: {p.sku}</span>
          {p.brand && <><span>•</span><span>{p.brand.name}</span></>}
        </div>

        <div className="mt-4 flex items-end gap-3">
          <span className="text-3xl font-extrabold text-ink">{formatKD(p.price)}</span>
          {p.compareAtPrice && <span className="text-lg text-slate-400 line-through">{formatKD(p.compareAtPrice)}</span>}
          {off && <span className="rounded-md bg-rose-100 px-2 py-1 text-sm font-bold text-rose-600">{t('Save')} {off}%</span>}
        </div>

        <div className="mt-2">
          {p.inStock ? (
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-600">
              <Check size={16} /> {t('In stock')} ({p.stockQty} {t('available')})
            </span>
          ) : (
            <span className="text-sm font-semibold text-rose-600">{t('Out of stock')}</span>
          )}
        </div>

        {(pick(p.description, p.descriptionAr) || p.description) && (
          <p className="mt-4 text-slate-600">{pick(p.description || '', p.descriptionAr)}</p>
        )}

        {/* Buy box */}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <div className="flex items-center rounded-lg border border-slate-200">
            <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="grid h-11 w-11 place-items-center hover:bg-slate-50">
              <Minus size={16} />
            </button>
            <span className="w-10 text-center font-semibold">{qty}</span>
            <button onClick={() => setQty((q) => Math.min(p.stockQty, q + 1))} className="grid h-11 w-11 place-items-center hover:bg-slate-50">
              <Plus size={16} />
            </button>
          </div>
          <button disabled={!p.inStock} onClick={onAdd} className="btn-buy flex-1 min-w-[180px] !py-3">
            {added ? <><Check size={18} /> {t('Added to cart')}</> : <><ShoppingCart size={18} /> {t('Add to Cart')}</>}
          </button>
          <WishlistButton productId={p.id} withLabel className="btn-ghost !py-3" size={18} />
        </div>

        <div className="mt-3">
          <WhatsAppButton
            className="w-full !py-3"
            message={`${t('Hi! I want to order:')} ${name} — ${formatKD(p.price)}${typeof window !== 'undefined' ? `\n${window.location.href}` : ''}`}
          />
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
          <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-3"><Truck size={18} className="text-brand-600" /> {t('Fast delivery in Kuwait')}</div>
          <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-3"><ShieldCheck size={18} className="text-brand-600" /> {t('Genuine & guaranteed')}</div>
        </div>

        {/* Specs */}
        {p.specs.length > 0 && (
          <div className="mt-6">
            <h3 className="mb-2 font-bold">{t('Specifications')}</h3>
            <table className="w-full text-sm">
              <tbody>
                {p.specs.map((s, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="py-2 pr-4 font-medium text-slate-500">{s.key}</td>
                    <td className="py-2 font-semibold">{s.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
