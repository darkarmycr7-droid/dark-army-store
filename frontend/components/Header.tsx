'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Search, ShoppingCart, Menu, X, Shield, User, Heart, Globe, ChevronDown } from 'lucide-react';
import { useCart } from './CartProvider';
import { useCustomer } from './CustomerProvider';
import { useLang } from './LanguageProvider';
import { api } from '@/lib/api';
import type { Category } from '@/lib/types';

const NAV = [
  { href: '/products', label: 'Shop' },
  { href: '/products?bestSeller=true', label: 'Best Sellers' },
  { href: '/products?featured=true', label: 'Featured' },
  { href: '/track', label: 'Track Order' },
];

export default function Header() {
  const { count } = useCart();
  const { customer, wishlist } = useCustomer();
  const { t, lang, toggle, pick } = useLang();
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  const [open, setOpen] = useState(false);
  const [cats, setCats] = useState<Category[]>([]);

  useEffect(() => {
    api.categories().then(setCats).catch(() => setCats([]));
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    router.push(`/products?q=${encodeURIComponent(q.trim())}`);
    setOpen(false);
  };

  return (
    <header className="sticky top-0 z-40 shadow-bar">
      {/* Announcement strip */}
      <div className="bg-ink text-center text-xs text-white/90 py-1.5 px-3">
        {t('🇰🇼 Free delivery across Kuwait on orders over KD 20.000 • Cash on Delivery available')}
      </div>

      {/* Main navy bar */}
      <div className="bg-navy text-white">
        <div className="container-x flex h-16 items-center gap-3 sm:gap-5">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-600 text-white">
              <Shield size={18} />
            </span>
            <span className="text-lg font-extrabold tracking-tight">
              Dark<span className="text-accent">Army</span>
            </span>
          </Link>

          <form onSubmit={submit} className="hidden flex-1 md:block">
            <div className="relative mx-auto w-full max-w-2xl">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t('Search products, SKU, brands…')}
                className="w-full rounded-lg border-0 bg-white py-2.5 ps-4 pe-24 text-sm text-ink outline-none placeholder:text-slate-400"
              />
              <button type="submit" className="absolute end-1 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 rounded-md bg-accent px-3 py-1.5 text-sm font-bold text-white hover:bg-accentDark">
                <Search size={16} /> <span className="hidden lg:inline">{t('Search…').replace('…', '')}</span>
              </button>
            </div>
          </form>

          <div className="ms-auto flex items-center gap-1">
            <button onClick={toggle} className="flex h-10 items-center gap-1.5 rounded-lg px-2 text-sm font-bold hover:bg-white/10" aria-label="Switch language" title={lang === 'ar' ? 'English' : 'العربية'}>
              <Globe size={18} /> <span>{lang === 'ar' ? 'EN' : 'ع'}</span>
            </button>

            <Link href="/account/wishlist" className="relative hidden h-10 w-10 place-items-center rounded-lg hover:bg-white/10 sm:grid" aria-label={t('Wishlist')}>
              <Heart size={20} />
              {wishlist.size > 0 && <span className="absolute -end-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-[11px] font-bold text-white">{wishlist.size}</span>}
            </Link>

            <Link href={customer ? '/account' : '/account/login'} className="hidden h-10 items-center gap-2 rounded-lg px-2 hover:bg-white/10 lg:flex" aria-label={t('Account')}>
              <User size={20} />
              <span className="max-w-[90px] truncate text-sm font-semibold">{customer ? customer.name.split(' ')[0] : t('Sign in')}</span>
            </Link>
            <Link href={customer ? '/account' : '/account/login'} className="grid h-10 w-10 place-items-center rounded-lg hover:bg-white/10 lg:hidden" aria-label={t('Account')}>
              <User size={20} />
            </Link>

            <Link href="/cart" className="relative grid h-10 w-10 place-items-center rounded-lg hover:bg-white/10">
              <ShoppingCart size={20} />
              {count > 0 && <span className="absolute -end-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-[11px] font-bold text-white">{count}</span>}
            </Link>

            <button className="grid h-10 w-10 place-items-center rounded-lg hover:bg-white/10 md:hidden" onClick={() => setOpen((o) => !o)} aria-label="Menu">
              {open ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </div>

      {/* Category quick-links bar (desktop) */}
      <div className="hidden bg-white border-b border-slate-200 md:block">
        <div className="container-x flex h-11 items-center gap-1 overflow-x-auto no-scrollbar text-sm">
          <Link href="/products" className="flex items-center gap-1.5 rounded-md px-3 py-1.5 font-bold text-ink hover:bg-slate-100">
            <Menu size={16} /> {t('Shop')}
          </Link>
          {cats.map((c) => (
            <Link key={c.id} href={`/products?category=${c.slug}`} className="whitespace-nowrap rounded-md px-3 py-1.5 font-medium text-slate-600 hover:bg-slate-100 hover:text-brand-700">
              {pick(c.name, c.nameAr)}
            </Link>
          ))}
          <Link href="/products?bestSeller=true" className="ms-auto whitespace-nowrap rounded-md px-3 py-1.5 font-semibold text-deal hover:bg-rose-50">
            🔥 {t('Best Sellers')}
          </Link>
        </div>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="border-t border-slate-200 bg-white md:hidden">
          <div className="container-x py-3 space-y-3">
            <form onSubmit={submit}>
              <div className="relative">
                <Search className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search…')} className="input ps-10" />
              </div>
            </form>
            {NAV.map((n) => (
              <Link key={n.label} href={n.href} onClick={() => setOpen(false)} className="block py-1.5 text-sm font-semibold text-slate-700">
                {t(n.label)}
              </Link>
            ))}
            <div className="border-t border-slate-100 pt-2">
              <p className="mb-1 flex items-center gap-1 text-xs font-bold uppercase text-slate-400"><ChevronDown size={12} /> {t('Shop by Category')}</p>
              {cats.map((c) => (
                <Link key={c.id} href={`/products?category=${c.slug}`} onClick={() => setOpen(false)} className="block py-1.5 text-sm text-slate-600">
                  {pick(c.name, c.nameAr)}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
