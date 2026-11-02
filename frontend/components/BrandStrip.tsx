import Link from 'next/link';
import type { Brand } from '@/lib/types';
import { T } from './Tr';

/**
 * "Popular Brands" logo strip. Falls back to a clean initials chip when a
 * brand has no logo uploaded yet.
 */
export default function BrandStrip({ brands }: { brands: Brand[] }) {
  if (brands.length < 2) return null;

  return (
    <section className="container-x mt-14">
      <div className="flex items-end justify-between">
        <h2 className="text-2xl font-extrabold"><T k="Popular Brands" /></h2>
        <Link href="/products" className="text-sm font-semibold text-brand-600 hover:underline">
          <T k="View all" />
        </Link>
      </div>

      <div className="no-scrollbar mt-6 flex gap-3 overflow-x-auto pb-1">
        {brands.map((b) => (
          <Link
            key={b.id}
            href={`/products?brand=${b.slug}`}
            className="card group flex w-32 shrink-0 flex-col items-center justify-center gap-2 p-4 transition-shadow hover:shadow-hover"
          >
            {b.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={b.logoUrl} alt={b.name} className="h-10 w-auto object-contain" />
            ) : (
              <span className="grid h-12 w-12 place-items-center rounded-full bg-brand-50 text-lg font-extrabold text-brand-600">
                {b.name.slice(0, 2).toUpperCase()}
              </span>
            )}
            <span className="truncate text-xs font-semibold text-slate-600 group-hover:text-brand-700">{b.name}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
