import type {
  Brand,
  Category,
  CheckoutConfig,
  HeroBanner,
  Order,
  ProductDetail,
  ProductList,
  ProductReview,
  ProductSummary,
} from './types';
import { apiBase } from './apiBase';

async function get<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, { cache: 'no-store', ...opts });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.json();
}

export const api = {
  categories: () => get<Category[]>('/categories'),

  brands: () => get<Brand[]>('/brands'),

  banners: () => get<HeroBanner[]>('/banners'),

  bannerSettings: () => get<{ intervalSeconds: number }>('/banner-settings'),

  products: (params: Record<string, string | number | boolean | undefined> = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== '' ) qs.set(k, String(v));
    });
    return get<ProductList>(`/products?${qs.toString()}`);
  },

  product: (slug: string) => get<ProductDetail>(`/products/${slug}`),

  reviews: (slug: string) => get<ProductReview[]>(`/products/${slug}/reviews`),

  productsByIds: (ids: number[]) =>
    get<ProductSummary[]>(`/products/by-ids?ids=${ids.join(',')}`),

  checkoutConfig: () => get<CheckoutConfig>('/orders/checkout/config'),

  checkout: (payload: unknown, token?: string | null) =>
    get<Order>('/orders/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
    }),

  track: (trackingNumber: string) =>
    get<Order>(`/orders/track/${encodeURIComponent(trackingNumber)}`),

  orderByNumber: (orderNumber: string) =>
    get<Order>(`/orders/by-number/${encodeURIComponent(orderNumber)}`),

  newsletter: (email: string) =>
    get<{ ok: boolean }>('/newsletter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    }),
};
