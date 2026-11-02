'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Heart, Loader2, ShoppingCart, Trash2 } from 'lucide-react';
import { customerApi, WishProduct } from '@/lib/customerApi';
import { useCustomer } from '@/components/CustomerProvider';
import { useCart } from '@/components/CartProvider';
import Thumb from '@/components/Thumb';
import { formatKD } from '@/lib/money';

export default function WishlistPage() {
  const { toggleWish } = useCustomer();
  const { add } = useCart();
  const [items, setItems] = useState<WishProduct[] | null>(null);

  const load = () => customerApi.wishlist().then((w) => setItems(w.items)).catch(() => setItems([]));
  useEffect(() => { load(); }, []);

  const remove = async (id: number) => {
    await toggleWish(id);
    setItems((prev) => prev?.filter((p) => p.id !== id) ?? null);
  };

  if (!items) return <div className="grid place-items-center py-24 text-slate-400"><Loader2 className="animate-spin" /></div>;

  if (items.length === 0) {
    return (
      <div className="card grid place-items-center gap-3 p-12 text-center">
        <Heart size={44} className="text-slate-300" />
        <h1 className="text-xl font-bold">Your wishlist is empty</h1>
        <p className="text-slate-500">Tap the heart on any product to save it here.</p>
        <Link href="/products" className="btn-primary mt-2">Browse Products</Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">Wishlist <span className="text-slate-400">({items.length})</span></h1>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((p) => (
          <div key={p.id} className="card overflow-hidden">
            <Link href={`/products/${p.slug}`} className="block aspect-square overflow-hidden">
              <Thumb src={p.image} name={p.name} slug={p.slug} categorySlug={p.category?.slug} iconSize={48} />
            </Link>
            <div className="p-4">
              <Link href={`/products/${p.slug}`} className="line-clamp-2 font-semibold hover:text-brand-600">{p.name}</Link>
              <div className="mt-1 text-lg font-extrabold">{formatKD(p.price)}</div>
              <div className="mt-3 flex gap-2">
                <button
                  disabled={!p.inStock}
                  onClick={() => add({ productId: p.id, name: p.name, slug: p.slug, price: p.price, image: p.image, stockQty: p.stockQty })}
                  className="btn-primary flex-1 !py-2 text-sm"
                >
                  <ShoppingCart size={15} /> {p.inStock ? 'Add to Cart' : 'Out of stock'}
                </button>
                <button onClick={() => remove(p.id)} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-400 hover:bg-rose-50 hover:text-rose-500" aria-label="Remove">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
