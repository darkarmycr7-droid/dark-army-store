'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ProductSummary } from '@/lib/types';
import ProductCard from './ProductCard';
import { useLang } from './LanguageProvider';

interface Props {
  title: string;
  subtitle?: string;
  href?: string;
  items: ProductSummary[];
}

/**
 * Horizontal, scroll-snapping product rail with prev/next arrows.
 * RTL-aware: arrows scroll in the visually correct direction.
 */
export default function ProductCarousel({ title, subtitle, href, items }: Props) {
  const { t, lang } = useLang();
  const ref = useRef<HTMLDivElement>(null);

  if (!items.length) return null;

  const scroll = (dir: 'prev' | 'next') => {
    const el = ref.current;
    if (!el) return;
    // Page by a full view (the 5 visible cards).
    const amount = el.clientWidth;
    // In RTL the scroll axis is inverted, so flip the sign.
    const sign = (dir === 'next' ? 1 : -1) * (lang === 'ar' ? -1 : 1);
    el.scrollBy({ left: amount * sign, behavior: 'smooth' });
  };

  return (
    <section className="container-x mt-14">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-extrabold">{t(title)}</h2>
          {subtitle && <p className="text-slate-500">{t(subtitle)}</p>}
        </div>
        <div className="flex items-center gap-2">
          {href && (
            <Link href={href} className="text-sm font-semibold text-brand-600 hover:underline">
              {t('View all')}
            </Link>
          )}
          <button
            onClick={() => scroll('prev')}
            aria-label={t('Previous')}
            className="grid h-9 w-9 place-items-center rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          >
            <ChevronLeft size={18} className="rtl-flip-x" />
          </button>
          <button
            onClick={() => scroll('next')}
            aria-label={t('Next')}
            className="grid h-9 w-9 place-items-center rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          >
            <ChevronRight size={18} className="rtl-flip-x" />
          </button>
        </div>
      </div>

      <div
        ref={ref}
        className="no-scrollbar mt-6 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth pb-1"
      >
        {items.map((p) => (
          <div key={p.id} className="w-[calc((100%_-_0.75rem)/2)] shrink-0 snap-start sm:w-[calc((100%_-_1.5rem)/3)] md:w-[calc((100%_-_2.25rem)/4)] lg:w-[calc((100%_-_3rem)/5)]">
            <ProductCard p={p} />
          </div>
        ))}
      </div>
    </section>
  );
}
