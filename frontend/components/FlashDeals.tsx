'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Zap, ChevronLeft, ChevronRight } from 'lucide-react';
import type { ProductSummary } from '@/lib/types';
import ProductCard from './ProductCard';
import { useLang } from './LanguageProvider';

function msUntilMidnight() {
  const now = new Date();
  const end = new Date(now);
  end.setHours(24, 0, 0, 0); // next local midnight
  return end.getTime() - now.getTime();
}

function Segment({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="grid h-9 w-9 place-items-center rounded-lg bg-ink font-mono text-sm font-extrabold text-white tabular-nums">
        {String(value).padStart(2, '0')}
      </span>
      <span className="mt-1 text-[10px] font-semibold uppercase text-slate-400">{label}</span>
    </div>
  );
}

export default function FlashDeals({ items }: { items: ProductSummary[] }) {
  const { t, lang } = useLang();
  const ref = useRef<HTMLDivElement>(null);
  const [ms, setMs] = useState<number | null>(null);

  useEffect(() => {
    setMs(msUntilMidnight());
    const id = setInterval(() => setMs(msUntilMidnight()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!items.length) return null;

  const total = Math.max(0, ms ?? 0);
  const h = Math.floor(total / 3_600_000);
  const m = Math.floor((total % 3_600_000) / 60_000);
  const s = Math.floor((total % 60_000) / 1000);

  const scroll = (dir: 'prev' | 'next') => {
    const el = ref.current;
    if (!el) return;
    const amount = el.clientWidth; // page by a full view (5 visible cards)
    const sign = (dir === 'next' ? 1 : -1) * (lang === 'ar' ? -1 : 1);
    el.scrollBy({ left: amount * sign, behavior: 'smooth' });
  };

  return (
    <section className="container-x mt-14">
      <div className="overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-deal text-white">
              <Zap size={18} className="fill-white" />
            </span>
            <div>
              <h2 className="text-xl font-extrabold leading-none">{t('Flash Deals')}</h2>
              <p className="text-xs text-slate-500">{t('Ends at midnight — grab them fast!')}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Reserve space so the timer doesn't shift on hydration */}
            <div className="flex items-center gap-1.5">
              <Segment value={h} label={t('Hrs')} />
              <span className="pb-4 font-extrabold text-slate-400">:</span>
              <Segment value={m} label={t('Min')} />
              <span className="pb-4 font-extrabold text-slate-400">:</span>
              <Segment value={s} label={t('Sec')} />
            </div>
            <div className="hidden items-center gap-2 sm:flex">
              <button onClick={() => scroll('prev')} aria-label={t('Previous')} className="grid h-9 w-9 place-items-center rounded-full bg-white text-slate-600 shadow-sm hover:bg-slate-50">
                <ChevronLeft size={18} className="rtl-flip-x" />
              </button>
              <button onClick={() => scroll('next')} aria-label={t('Next')} className="grid h-9 w-9 place-items-center rounded-full bg-white text-slate-600 shadow-sm hover:bg-slate-50">
                <ChevronRight size={18} className="rtl-flip-x" />
              </button>
            </div>
          </div>
        </div>

        {/* Padding lives on this wrapper, NOT the scroll track, so exactly
            5 cards fit and the 6th is clipped (no peeking sliver). */}
        <div className="px-5 pb-5">
          <div ref={ref} className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto">
            {items.map((p) => (
              <div key={p.id} className="w-[calc((100%_-_0.75rem)/2)] shrink-0 snap-start sm:w-[calc((100%_-_1.5rem)/3)] md:w-[calc((100%_-_2.25rem)/4)] lg:w-[calc((100%_-_3rem)/5)]">
                <ProductCard p={p} />
              </div>
            ))}
          </div>
        </div>

        <div className="px-5 pb-4">
          <Link href="/products?onSale=true" className="text-sm font-semibold text-brand-600 hover:underline">
            {t('View all deals')}
          </Link>
        </div>
      </div>
    </section>
  );
}
