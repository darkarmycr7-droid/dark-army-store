'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { SlidersHorizontal, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import type { Category, ProductList } from '@/lib/types';
import ProductCard from './ProductCard';

const SORTS = [
  ['newest', 'Newest'],
  ['popular', 'Most Popular'],
  ['price_asc', 'Price: Low to High'],
  ['price_desc', 'Price: High to Low'],
  ['name', 'Name A–Z'],
] as const;

export default function ProductsBrowser() {
  const router = useRouter();
  const params = useSearchParams();

  const [cats, setCats] = useState<Category[]>([]);
  const [data, setData] = useState<ProductList | null>(null);
  const [loading, setLoading] = useState(true);
  const [maxPrice, setMaxPrice] = useState(params.get('maxPrice') || '');

  const current = useMemo(
    () => ({
      q: params.get('q') || '',
      category: params.get('category') || '',
      brand: params.get('brand') || '',
      sort: params.get('sort') || 'newest',
      inStock: params.get('inStock') === 'true',
      featured: params.get('featured') === 'true',
      bestSeller: params.get('bestSeller') === 'true',
      onSale: params.get('onSale') === 'true',
      maxPrice: params.get('maxPrice') || '',
      page: Number(params.get('page') || 1),
    }),
    [params]
  );

  const update = useCallback(
    (patch: Record<string, string | number | boolean | undefined>, resetPage = true) => {
      const next = new URLSearchParams(params.toString());
      Object.entries(patch).forEach(([k, v]) => {
        if (v === undefined || v === '' || v === false) next.delete(k);
        else next.set(k, String(v));
      });
      if (resetPage) next.delete('page');
      router.push(`/products?${next.toString()}`);
    },
    [params, router]
  );

  useEffect(() => {
    api.categories().then(setCats).catch(() => setCats([]));
  }, []);

  useEffect(() => {
    setLoading(true);
    api
      .products({
        q: current.q || undefined,
        category: current.category || undefined,
        brand: current.brand || undefined,
        sort: current.sort,
        inStock: current.inStock || undefined,
        featured: current.featured || undefined,
        bestSeller: current.bestSeller || undefined,
        onSale: current.onSale || undefined,
        maxPrice: current.maxPrice || undefined,
        page: current.page,
        pageSize: 12,
      })
      .then(setData)
      .catch(() => setData({ items: [], total: 0, page: 1, pageSize: 12, totalPages: 0 }))
      .finally(() => setLoading(false));
  }, [current]);

  const heading = current.q
    ? `Results for “${current.q}”`
    : current.onSale
    ? 'Deals & Offers'
    : current.bestSeller
    ? 'Best Sellers'
    : current.featured
    ? 'Featured Products'
    : cats.find((c) => c.slug === current.category)?.name || 'All Products';

  return (
    <div className="container-x py-8">
      <h1 className="text-2xl font-extrabold">{heading}</h1>
      <p className="text-slate-500">{data ? `${data.total} products` : '…'}</p>

      <div className="mt-6 grid gap-8 lg:grid-cols-[260px_1fr]">
        {/* Sidebar */}
        <aside className="space-y-6">
          <div className="card p-5">
            <div className="mb-3 flex items-center gap-2 font-bold">
              <SlidersHorizontal size={16} /> Filters
            </div>

            <div className="mb-4">
              <div className="label">Category</div>
              <ul className="space-y-1 text-sm">
                <li>
                  <button onClick={() => update({ category: '' })} className={`hover:text-brand-600 ${!current.category ? 'font-bold text-brand-600' : 'text-slate-600'}`}>
                    All categories
                  </button>
                </li>
                {cats.map((c) => (
                  <li key={c.id}>
                    <button onClick={() => update({ category: c.slug })} className={`hover:text-brand-600 ${current.category === c.slug ? 'font-bold text-brand-600' : 'text-slate-600'}`}>
                      {c.name} <span className="text-slate-400">({c.productCount})</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mb-4">
              <div className="label">Max Price (KD)</div>
              <div className="flex gap-2">
                <input
                  type="number"
                  min={0}
                  step="0.5"
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value)}
                  placeholder="e.g. 10"
                  className="input"
                />
                <button onClick={() => update({ maxPrice })} className="btn-ghost shrink-0">Go</button>
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={current.inStock} onChange={(e) => update({ inStock: e.target.checked })} />
              In stock only
            </label>
          </div>
        </aside>

        {/* Results */}
        <div>
          <div className="mb-4 flex items-center justify-between gap-3">
            <span className="text-sm text-slate-500">
              {data ? `Page ${data.page} of ${Math.max(1, data.totalPages)}` : ''}
            </span>
            <select value={current.sort} onChange={(e) => update({ sort: e.target.value })} className="input max-w-[220px]">
              {SORTS.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>

          {loading ? (
            <div className="grid place-items-center py-24 text-slate-400">
              <Loader2 className="animate-spin" />
            </div>
          ) : data && data.items.length > 0 ? (
            <>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {data.items.map((p) => (
                  <ProductCard key={p.id} p={p} />
                ))}
              </div>

              {data.totalPages > 1 && (
                <div className="mt-8 flex items-center justify-center gap-2">
                  <button disabled={current.page <= 1} onClick={() => update({ page: current.page - 1 }, false)} className="btn-ghost">
                    Prev
                  </button>
                  {Array.from({ length: data.totalPages }).map((_, i) => (
                    <button
                      key={i}
                      onClick={() => update({ page: i + 1 }, false)}
                      className={`h-9 w-9 rounded-lg text-sm font-semibold ${current.page === i + 1 ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}
                    >
                      {i + 1}
                    </button>
                  ))}
                  <button disabled={current.page >= data.totalPages} onClick={() => update({ page: current.page + 1 }, false)} className="btn-ghost">
                    Next
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="card grid place-items-center py-24 text-center">
              <p className="text-lg font-semibold">No products found</p>
              <p className="text-slate-500">Try adjusting your search or filters.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
