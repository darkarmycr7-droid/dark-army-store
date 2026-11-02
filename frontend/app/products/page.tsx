import { Suspense } from 'react';
import ProductsBrowser from '@/components/ProductsBrowser';

export const metadata = { title: 'Shop All Products' };

export default function ProductsPage() {
  return (
    <Suspense fallback={<div className="container-x py-24 text-center text-slate-400">Loading…</div>}>
      <ProductsBrowser />
    </Suspense>
  );
}
