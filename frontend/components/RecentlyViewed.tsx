'use client';

import { useEffect, useState } from 'react';
import type { ProductSummary } from '@/lib/types';
import { api } from '@/lib/api';
import { getRecentlyViewed } from '@/lib/recentlyViewed';
import ProductCarousel from './ProductCarousel';

export default function RecentlyViewed() {
  const [items, setItems] = useState<ProductSummary[]>([]);

  useEffect(() => {
    const ids = getRecentlyViewed();
    if (!ids.length) return;
    api
      .productsByIds(ids)
      .then(setItems)
      .catch(() => setItems([]));
  }, []);

  // Need at least a couple to be worth a rail
  if (items.length < 2) return null;

  return <ProductCarousel title="Recently viewed" subtitle="Pick up where you left off" items={items} />;
}
