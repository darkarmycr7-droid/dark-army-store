import Link from 'next/link';
import { Truck, ShieldCheck, CreditCard, Headphones, ArrowRight, ShoppingBasket, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import HeroSlider from '@/components/HeroSlider';
import Testimonials from '@/components/Testimonials';
import Thumb from '@/components/Thumb';
import FlashDeals from '@/components/FlashDeals';
import DealCategoryCards, { DealGroup } from '@/components/DealCategoryCards';
import BrandStrip from '@/components/BrandStrip';
import RecentlyViewed from '@/components/RecentlyViewed';
import ProductCarousel from '@/components/ProductCarousel';
import { T, Loc } from '@/components/Tr';

export const dynamic = 'force-dynamic';

const BADGES = [
  { Icon: Truck, title: 'Fast Delivery', sub: 'Across all Kuwait' },
  { Icon: CreditCard, title: 'Secure Payment', sub: 'KNET, cards & COD' },
  { Icon: ShieldCheck, title: 'Genuine Products', sub: '100% authentic' },
  { Icon: Headphones, title: '7-Day Support', sub: 'Here to help' },
];

async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch {
    return fallback;
  }
}

export default async function HomePage() {
  const [cats, featured, best, sale, brands, banners] = await Promise.all([
    safe(api.categories(), []),
    safe(api.products({ featured: true, pageSize: 12 }), { items: [] } as any),
    safe(api.products({ bestSeller: true, pageSize: 12 }), { items: [] } as any),
    safe(api.products({ onSale: true, pageSize: 12, sort: 'popular' }), { items: [] } as any),
    safe(api.brands(), []),
    safe(api.banners(), []),
  ]);
  const { intervalSeconds } = await safe(api.bannerSettings(), { intervalSeconds: 5 });

  // Build "quad" deal cards from the first few categories that have products.
  const dealCats = cats.filter((c) => c.productCount > 0).slice(0, 4);
  const dealGroups: DealGroup[] = (
    await Promise.all(
      dealCats.map(async (c) => {
        const res = await safe(api.products({ category: c.slug, pageSize: 4, sort: 'popular' }), { items: [] } as any);
        return { category: { name: c.name, nameAr: c.nameAr, slug: c.slug }, items: res.items };
      })
    )
  ).filter((g) => g.items.length >= 2);

  return (
    <>
      <HeroSlider banners={banners} intervalSeconds={intervalSeconds} />

      {/* Trust badges */}
      <section className="container-x mt-8">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {BADGES.map(({ Icon, title, sub }) => (
            <div key={title} className="card flex items-center gap-3 p-4">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-600">
                <Icon size={20} />
              </span>
              <div>
                <div className="text-sm font-bold"><T k={title} /></div>
                <div className="text-xs text-slate-500"><T k={sub} /></div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Quad deal cards (Amazon/Noon style) */}
      <DealCategoryCards groups={dealGroups} />

      {/* Flash deals with live countdown */}
      <FlashDeals items={sale.items} />

      {/* Categories */}
      <section className="container-x mt-14">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-extrabold"><T k="Shop by Category" /></h2>
            <p className="text-slate-500"><T k="Find exactly what you need." /></p>
          </div>
          <Link href="/products" className="text-sm font-semibold text-brand-600 hover:underline">
            <T k="View all" />
          </Link>
        </div>
        <div className="mt-6 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {cats.map((c) => (
            <Link key={c.id} href={`/products?category=${c.slug}`} className="card group overflow-hidden text-center transition-shadow hover:shadow-hover">
              <div className="aspect-[4/3] overflow-hidden">
                <Thumb src={c.imageUrl} name={c.name} slug={c.slug} categorySlug={c.slug} iconSize={44} className="transition group-hover:scale-105" />
              </div>
              <div className="p-2.5">
                <div className="truncate text-sm font-bold leading-tight text-ink"><Loc en={c.name} ar={c.nameAr} /></div>
                <div className="text-xs text-slate-400">{c.productCount} <T k="items" /></div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Featured */}
      {featured.items.length > 0 && (
        <ProductCarousel title="Featured Products" subtitle="Hand-picked for you" href="/products?featured=true" items={featured.items} />
      )}

      {/* Promo banner */}
      <section className="container-x mt-14">
        <div className="overflow-hidden rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 p-8 md:p-10 text-ink">
          <div className="max-w-lg">
            <span className="rounded-full bg-ink/10 px-3 py-1 text-xs font-bold"><T k="LIMITED OFFER" /></span>
            <h3 className="mt-3 text-2xl font-extrabold md:text-3xl"><T k="Get 10% off your first order" /></h3>
            <p className="mt-2 text-ink/80"><T k="Use code" /> <strong>WELCOME10</strong> <T k="at checkout. Minimum order KD 5." /></p>
            <Link href="/products" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-ink px-6 py-3 font-bold text-white hover:bg-ink/90">
              <T k="Start shopping" /> <ArrowRight size={18} className="rtl-flip-x" />
            </Link>
          </div>
        </div>
      </section>

      {/* Best sellers */}
      {best.items.length > 0 && (
        <ProductCarousel title="Best Sellers" subtitle="Most loved by our customers" href="/products?bestSeller=true" items={best.items} />
      )}

      {/* Popular brands */}
      <BrandStrip brands={brands} />

      {/* Recently viewed (client, localStorage-driven) */}
      <RecentlyViewed />

      <Testimonials />

      {/* About */}
      <section className="container-x mt-16">
        <div className="card grid gap-6 p-8 md:grid-cols-2 md:p-10">
          <div>
            <h2 className="text-2xl font-extrabold"><T k="About Dark-Army Store" /></h2>
            <p className="mt-3 text-slate-600">
              <T k="Dark-Army Store is Kuwait's all-in-one online shop. From daily groceries to the latest electronics, premium home essentials and beauty care — we bring everything your home and family need to one convenient place, with fast nationwide delivery and flexible payment including Cash on Delivery." />
            </p>
            <div className="mt-5 grid grid-cols-3 gap-4 text-center">
              {[
                ['10k+', 'Happy customers'],
                ['5k+', 'Products'],
                ['24h', 'Avg. delivery'],
              ].map(([n, l]) => (
                <div key={l} className="rounded-xl bg-slate-50 p-3">
                  <div className="text-xl font-extrabold text-brand-600">{n}</div>
                  <div className="text-xs text-slate-500"><T k={l} /></div>
                </div>
              ))}
            </div>
          </div>
          <div className="relative grid min-h-[240px] place-items-center overflow-hidden rounded-2xl bg-gradient-to-br from-brand-600 to-brand-900 text-white">
            <div className="pointer-events-none absolute -end-10 -top-10 h-44 w-44 rounded-full bg-white/10" />
            <div className="pointer-events-none absolute -bottom-12 -start-6 h-40 w-40 rounded-full bg-white/5" />
            <div className="relative grid grid-cols-3 gap-5 p-6">
              {[Truck, ShieldCheck, CreditCard, Headphones, ShoppingBasket, Sparkles].map((Icon, idx) => (
                <Icon key={idx} size={40} strokeWidth={1.4} className="text-white/85" />
              ))}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
