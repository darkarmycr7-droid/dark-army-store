'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { customerApi, customerToken, Customer } from '@/lib/customerApi';

export type AuthResult = { ok: true } | { needsVerification: true; email: string; devCode?: string };

interface CustomerCtx {
  customer: Customer | null;
  ready: boolean;
  wishlist: Set<number>;
  login: (email: string, password: string) => Promise<AuthResult>;
  register: (data: { name: string; email: string; phone?: string; password: string }) => Promise<AuthResult>;
  verifyEmail: (email: string, code: string) => Promise<void>;
  resend: (email: string) => Promise<{ devCode?: string }>;
  forgotPassword: (email: string) => Promise<{ devCode?: string }>;
  resetPassword: (email: string, code: string, newPassword: string) => Promise<void>;
  logout: () => void;
  refresh: () => void;
  isWished: (productId: number) => boolean;
  toggleWish: (productId: number) => Promise<boolean>; // returns new state; throws if logged out
  setCustomer: (c: Customer) => void;
}

const Ctx = createContext<CustomerCtx | null>(null);

export function CustomerProvider({ children }: { children: React.ReactNode }) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [wishlist, setWishlist] = useState<Set<number>>(new Set());
  const [ready, setReady] = useState(false);

  const loadWishlist = useCallback(() => {
    customerApi
      .wishlist()
      .then((w) => setWishlist(new Set(w.ids)))
      .catch(() => setWishlist(new Set()));
  }, []);

  const bootstrap = useCallback(() => {
    if (!customerToken.get()) {
      setCustomer(null);
      setReady(true);
      return;
    }
    customerApi
      .me()
      .then((c) => {
        setCustomer(c);
        loadWishlist();
      })
      .catch(() => {
        customerToken.clear();
        setCustomer(null);
      })
      .finally(() => setReady(true));
  }, [loadWishlist]);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  const applySession = (token: string, c: Customer) => {
    customerToken.set(token);
    setCustomer(c);
    loadWishlist();
  };

  const login: CustomerCtx['login'] = async (email, password) => {
    const res = await customerApi.login(email, password);
    if (res.status === 'VERIFY') return { needsVerification: true, email: res.email, devCode: res.devCode };
    applySession(res.token, res.customer);
    return { ok: true };
  };

  const register: CustomerCtx['register'] = async (data) => {
    const res = await customerApi.register(data);
    if (res.status === 'VERIFY') return { needsVerification: true, email: res.email, devCode: res.devCode };
    applySession(res.token, res.customer);
    return { ok: true };
  };

  const verifyEmail: CustomerCtx['verifyEmail'] = async (email, code) => {
    const res = await customerApi.verifyEmail(email, code);
    applySession(res.token, res.customer);
  };

  const resend: CustomerCtx['resend'] = async (email) => {
    const { devCode } = await customerApi.resend(email);
    return { devCode };
  };

  const forgotPassword: CustomerCtx['forgotPassword'] = async (email) => {
    const { devCode } = await customerApi.forgot(email);
    return { devCode };
  };

  const resetPassword: CustomerCtx['resetPassword'] = async (email, code, newPassword) => {
    const res = await customerApi.reset(email, code, newPassword);
    applySession(res.token, res.customer);
  };

  const logout = () => {
    customerToken.clear();
    setCustomer(null);
    setWishlist(new Set());
  };

  const toggleWish: CustomerCtx['toggleWish'] = async (productId) => {
    if (!customer) throw new Error('LOGIN_REQUIRED');
    const wished = wishlist.has(productId);
    // optimistic
    setWishlist((prev) => {
      const next = new Set(prev);
      if (wished) next.delete(productId);
      else next.add(productId);
      return next;
    });
    try {
      if (wished) await customerApi.removeWish(productId);
      else await customerApi.addWish(productId);
      return !wished;
    } catch (e) {
      loadWishlist(); // revert to server truth
      throw e;
    }
  };

  const value = useMemo<CustomerCtx>(
    () => ({
      customer,
      ready,
      wishlist,
      login,
      register,
      verifyEmail,
      resend,
      forgotPassword,
      resetPassword,
      logout,
      refresh: bootstrap,
      isWished: (id) => wishlist.has(id),
      toggleWish,
      setCustomer,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [customer, ready, wishlist]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCustomer() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useCustomer must be used within CustomerProvider');
  return ctx;
}
