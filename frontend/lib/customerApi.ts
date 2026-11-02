import type { Order } from './types';
import { apiBase } from './apiBase';

const TOKEN_KEY = 'da-customer-token';

export const customerToken = {
  get: () => (typeof window === 'undefined' ? null : localStorage.getItem(TOKEN_KEY)),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export class CustomerAuthError extends Error {}

async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = customerToken.get();
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(opts.headers as any) };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${apiBase()}/account${path}`, { cache: 'no-store', ...opts, headers });
  if (res.status === 401) {
    customerToken.clear();
    throw new CustomerAuthError('Not authenticated');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.json();
}

export interface Customer { id: number; name: string; email: string; phone: string | null; loyaltyPoints: number }

export interface LoyaltyInfo {
  points: number;
  earnRate: number;
  redeemRate: number;
  enabled: boolean;
  valueKD: number;
  transactions: { id: number; points: number; type: string; note: string | null; createdAt: string }[];
}

export interface Address {
  id: number; label: string | null; fullName: string; phone: string;
  area: string; block: string | null; street: string | null; building: string | null;
  floor: string | null; notes: string | null; isDefault: boolean;
}
export type AddressInput = Omit<Address, 'id'>;

export interface WishProduct {
  id: number; name: string; slug: string; price: number; compareAtPrice: number | null;
  inStock: boolean; stockQty: number; image: string | null;
  category: { id: number; name: string; slug: string } | null;
  isBestSeller: boolean; ratingAvg: number; ratingCount: number;
}

export type AuthResponse =
  | { status: 'OK'; token: string; customer: Customer }
  | { status: 'VERIFY'; email: string; devCode?: string };

export const customerApi = {
  register: (data: { name: string; email: string; phone?: string; password: string }) =>
    req<AuthResponse>('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  login: (email: string, password: string) =>
    req<AuthResponse>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  verifyEmail: (email: string, code: string) =>
    req<{ status: 'OK'; token: string; customer: Customer }>('/auth/verify-email', { method: 'POST', body: JSON.stringify({ email, code }) }),
  resend: (email: string) =>
    req<{ ok: boolean; devCode?: string }>('/auth/resend', { method: 'POST', body: JSON.stringify({ email }) }),
  forgot: (email: string) =>
    req<{ ok: boolean; devCode?: string }>('/auth/forgot', { method: 'POST', body: JSON.stringify({ email }) }),
  reset: (email: string, code: string, newPassword: string) =>
    req<{ status: 'OK'; token: string; customer: Customer }>('/auth/reset', { method: 'POST', body: JSON.stringify({ email, code, newPassword }) }),
  me: () => req<Customer>('/auth/me'),
  updateProfile: (data: { name: string; phone?: string | null }) =>
    req<Customer>('/profile', { method: 'PUT', body: JSON.stringify(data) }),

  addresses: () => req<Address[]>('/addresses'),
  addAddress: (data: Partial<AddressInput>) => req<Address>('/addresses', { method: 'POST', body: JSON.stringify(data) }),
  updateAddress: (id: number, data: Partial<AddressInput>) => req<Address>(`/addresses/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteAddress: (id: number) => req<{ ok: boolean }>(`/addresses/${id}`, { method: 'DELETE' }),

  wishlist: () => req<{ ids: number[]; items: WishProduct[] }>('/wishlist'),
  addWish: (productId: number) => req<{ ok: boolean }>(`/wishlist/${productId}`, { method: 'POST' }),
  removeWish: (productId: number) => req<{ ok: boolean }>(`/wishlist/${productId}`, { method: 'DELETE' }),

  orders: () => req<Order[]>('/orders'),
  order: (orderNumber: string) => req<Order>(`/orders/${orderNumber}`),

  loyalty: () => req<LoyaltyInfo>('/loyalty'),

  myReview: (productId: number) => req<{ rating: number; title: string | null; body: string | null } | null>(`/reviews/${productId}`),
  postReview: (productId: number, rating: number, title: string, body: string) =>
    req<{ id: number }>('/reviews', { method: 'POST', body: JSON.stringify({ productId, rating, title: title || undefined, body: body || undefined }) }),
};
