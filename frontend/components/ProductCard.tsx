'use client';

import Link from 'next/link';
import { ShoppingCart, Star } from 'lucide-react';
import type { ProductSummary } from '@/lib/types';
import { formatKD, discountPct } from '@/lib/money';
import { useCart } from './CartProvider';
import { useLang } from './LanguageProvider';
import WishlistButton from './WishlistButton';
import Thumb from './Thumb';

export default function ProductCard({ p }: { p: ProductSummary }) {
  const { add } = useCart();
  const { t, pick } = useLang();
  const off = discountPct(p.price, p.compareAtPrice);
  const name = pick(p.name, p.nameAr);

  return (
    <div className="card group flex h-full flex-col overflow-hidden transition-shadow hover:shadow-hover">
      <Link href={`/products/${p.slug}`} className="relative block aspect-square overflow-hidden">
        <Thumb
          src={p.image}
          name={name}
          slug={p.slug}
          categorySlug={p.category?.slug}
          className="transition duration-300 group-hover:scale-[1.04]"
        />
        <div className="absolute start-2 top-2 flex flex-col gap-1">
          {off && <span className="badge-deal">-{off}%</span>}
          {p.isBestSeller && <span className="rounded-md bg-ink px-1.5 py-0.5 text-[11px] font-extrabold text-white">{t('Best Seller')}</span>}
        </div>
        {!p.inStock && (
          <div className="absolute inset-0 grid place-items-center bg-white/70 text-sm font-bold text-slate-700">
            {t('Out of stock')}
          </div>
        )}
        <WishlistButton
          productId={p.id}
          className="absolute end-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-white/95 shadow-sm hover:bg-white"
          size={16}
        />
      </Link>

      <div className="flex flex-1 flex-col p-3">
        {p.category && <span className="text-[11px] font-bold uppercase tracking-wide text-brand-600">{pick(p.category.name, p.category.nameAr)}</span>}
        <Link href={`/products/${p.slug}`} className="mt-0.5 line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-snug text-ink hover:text-brand-700">
          {name}
        </Link>

        <div className="mt-1 flex items-center gap-1 text-xs text-slate-500">
          <Star size={12} className="fill-amber-400 text-amber-400" />
          <span className="font-semibold text-ink">{p.ratingAvg.toFixed(1)}</span>
          <span className="text-slate-400">({p.ratingCount})</span>
        </div>

        <div className="mt-auto pt-2.5">
          <div className="flex items-end gap-2">
            <span className="price text-lg">{formatKD(p.price)}</span>
            {p.compareAtPrice && <span className="pb-0.5 text-xs text-slate-400 line-through">{formatKD(p.compareAtPrice)}</span>}
          </div>
          <button
            disabled={!p.inStock}
            onClick={() => add({ productId: p.id, name: p.name, slug: p.slug, price: p.price, image: p.image, stockQty: p.stockQty })}
            className="btn-buy mt-2 w-full !py-2 text-sm"
          >
            <ShoppingCart size={16} /> {t('Add to Cart')}
          </button>
        </div>
      </div>
    </div>
  );
}
