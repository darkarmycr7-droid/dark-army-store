'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useLang } from './LanguageProvider';
import type { HeroBanner } from '@/lib/types';

// Fallback slides if the admin hasn't created any banners yet.
const FALLBACK: HeroBanner[] = [
  {
    id: -1,
    title: 'Everything You Need.\nDelivered Across Kuwait.',
    subtitle: 'Groceries, home, electronics & more — one store, endless choices.',
    ctaLabel: 'Shop Now',
    ctaHref: '/products',
    imageUrl: null,
    align: 'left',
    overlay: 40,
  },
];

const ALIGN: Record<string, string> = {
  left: 'items-start text-start',
  center: 'items-center text-center mx-auto',
  right: 'items-end text-end ms-auto',
};

export default function HeroSlider({ banners, intervalSeconds = 5 }: { banners?: HeroBanner[]; intervalSeconds?: number }) {
  const { t, pick } = useLang();
  const slides = banners && banners.length ? banners : FALLBACK;
  const [i, setI] = useState(0);
  const go = (n: number) => setI((n + slides.length) % slides.length);

  useEffect(() => {
    if (slides.length < 2) return;
    const ms = Math.max(2, intervalSeconds) * 1000;
    const tmr = setInterval(() => setI((p) => (p + 1) % slides.length), ms);
    return () => clearInterval(tmr);
  }, [slides.length, intervalSeconds]);

  const s = slides[Math.min(i, slides.length - 1)];
  const title = pick(s.title, s.titleAr);
  const subtitle = pick(s.subtitle || '', s.subtitleAr);
  const ctaLabel = pick(s.ctaLabel || 'Shop Now', s.ctaLabelAr);

  return (
    <section className="container-x mt-4">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-700 to-brand-900 text-white">
        {/* Background image (if any) + readability scrim */}
        {s.imageUrl && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={s.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-black" style={{ opacity: (s.overlay ?? 40) / 100 }} />
          </>
        )}
        {/* Decorative shapes only show on plain-gradient slides */}
        {!s.imageUrl && (
          <>
            <div className="pointer-events-none absolute -end-16 -top-16 h-64 w-64 rounded-full bg-white/10" />
            <div className="pointer-events-none absolute -bottom-20 end-32 h-52 w-52 rounded-full bg-white/5" />
          </>
        )}

        <div className="relative flex min-h-[320px] flex-col justify-center p-8 md:min-h-[400px] md:p-14">
          <div className={`flex max-w-xl flex-col ${ALIGN[s.align] || ALIGN.left}`}>
            <span className="inline-block rounded-full bg-white/15 px-3 py-1 text-xs font-bold backdrop-blur">
              DARK-ARMY STORE
            </span>
            {/* Reserve 3 lines so 2- and 3-line titles keep the same height */}
            <h1 className="mt-3 flex min-h-[6.5rem] flex-col justify-center whitespace-pre-line text-3xl font-extrabold leading-tight drop-shadow md:min-h-[9rem] md:text-5xl">
              {title}
            </h1>
            {/* Reserve 2 lines so 1- and 2-line sub-texts keep the same height */}
            <p className="mt-4 flex min-h-[3rem] max-w-md items-start text-white/90 drop-shadow">{subtitle}</p>
            <Link
              href={s.ctaHref || '/products'}
              className="mt-6 inline-flex items-center gap-2 self-start rounded-lg bg-accent px-6 py-3 font-bold text-white shadow-lg hover:bg-accentDark"
            >
              {ctaLabel} <ChevronRight size={18} className="rtl-flip-x" />
            </Link>
          </div>
        </div>

        {slides.length > 1 && (
          <>
            <button onClick={() => go(i - 1)} aria-label={t('Previous')} className="absolute start-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/15 hover:bg-white/25">
              <ChevronLeft size={20} className="rtl-flip-x" />
            </button>
            <button onClick={() => go(i + 1)} aria-label={t('Next')} className="absolute end-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/15 hover:bg-white/25">
              <ChevronRight size={20} className="rtl-flip-x" />
            </button>
            <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2">
              {slides.map((_, n) => (
                <button key={n} onClick={() => go(n)} aria-label={`Slide ${n + 1}`} className={`h-2 rounded-full transition-all ${n === i ? 'w-6 bg-white' : 'w-2 bg-white/40'}`} />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
