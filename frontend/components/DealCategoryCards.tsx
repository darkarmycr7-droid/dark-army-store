import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { Category, ProductSummary } from '@/lib/types';
import { formatKD, discountPct } from '@/lib/money';
import Thumb from './Thumb';
import { T, Loc } from './Tr';

export interface DealGroup {
  category: Pick<Category, 'name' | 'nameAr' | 'slug'>;
  items: ProductSummary[];
}

/**
 * Amazon/Noon-style merchandising cards: a category headline, the best
 * discount in that category, and a 2x2 grid of products inside one card.
 */
export default function DealCategoryCards({ groups }: { groups: DealGroup[] }) {
  const cards = groups.filter((g) => g.items.length >= 2);
  if (!cards.length) return null;

  return (
    <section className="container-x mt-14">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((g) => {
          const maxOff = Math.max(0, ...g.items.map((p) => discountPct(p.price, p.compareAtPrice) || 0));
          const tiles = g.items.slice(0, 4);
          return (
            <div key={g.category.slug} className="card flex flex-col p-4">
              <div className="flex items-baseline justify-between">
                <h3 className="text-base font-extrabold leading-tight">
                  <Loc en={g.category.name} ar={g.category.nameAr} />
                </h3>
                {maxOff > 0 && (
                  <span className="shrink-0 text-xs font-bold text-deal">
                    <T k="Up to" /> {maxOff}%
                  </span>
                )}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                {tiles.map((p) => (
                  <Link key={p.id} href={`/products/${p.slug}`} className="group block">
                    <div className="aspect-square overflow-hidden rounded-lg bg-slate-50">
                      <Thumb
                        src={p.image}
                        name={p.name}
                        slug={p.slug}
                        categorySlug={g.category.slug}
                        iconSize={28}
                        className="transition group-hover:scale-105"
                      />
                    </div>
                    <div className="mt-1 truncate text-[11px] font-semibold text-slate-700">{formatKD(p.price)}</div>
                  </Link>
                ))}
              </div>

              <Link
                href={`/products?category=${g.category.slug}`}
                className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline"
              >
                <T k="See more" /> <ArrowRight size={14} className="rtl-flip-x" />
              </Link>
            </div>
          );
        })}
      </div>
    </section>
  );
}
