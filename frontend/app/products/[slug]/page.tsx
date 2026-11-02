import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';
import ProductDetailView from '@/components/ProductDetailView';
import ProductCard from '@/components/ProductCard';
import ReviewsSection from '@/components/ReviewsSection';
import { T, Loc } from '@/components/Tr';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  try {
    const p = await api.product(params.slug);
    return {
      title: p.name,
      description: p.description?.slice(0, 160) || `Buy ${p.name} at Dark-Army Store.`,
      openGraph: { title: p.name, images: p.image ? [p.image] : [] },
    };
  } catch {
    return { title: 'Product' };
  }
}

export default async function ProductPage({ params }: { params: { slug: string } }) {
  let p;
  try {
    p = await api.product(params.slug);
  } catch {
    notFound();
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.name,
    sku: p.sku,
    image: p.images.map((i) => i.url),
    description: p.description,
    brand: p.brand?.name,
    offers: {
      '@type': 'Offer',
      priceCurrency: 'KWD',
      price: p.price,
      availability: p.inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
    },
    aggregateRating:
      p.ratingCount > 0
        ? { '@type': 'AggregateRating', ratingValue: p.ratingAvg.toFixed(1), reviewCount: p.ratingCount }
        : undefined,
  };

  return (
    <div className="container-x py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <nav className="mb-6 flex items-center gap-1 text-sm text-slate-500">
        <Link href="/" className="hover:text-brand-600"><T k="Home" /></Link>
        <ChevronRight size={14} className="rtl-flip-x" />
        <Link href="/products" className="hover:text-brand-600"><T k="Shop" /></Link>
        {p.category && (
          <>
            <ChevronRight size={14} className="rtl-flip-x" />
            <Link href={`/products?category=${p.category.slug}`} className="hover:text-brand-600"><Loc en={p.category.name} ar={p.category.nameAr} /></Link>
          </>
        )}
        <ChevronRight size={14} className="rtl-flip-x" />
        <span className="text-slate-700"><Loc en={p.name} ar={p.nameAr} /></span>
      </nav>

      <ProductDetailView p={p} />

      <ReviewsSection slug={p.slug} productId={p.id} />

      {p.related.length > 0 && (
        <section className="mt-16">
          <h2 className="text-2xl font-extrabold"><T k="You may also like" /></h2>
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {p.related.map((r) => (
              <ProductCard key={r.id} p={r} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
