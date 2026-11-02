'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { LayoutGrid, Package, Heart, MapPin, LogOut, Loader2 } from 'lucide-react';
import { useCustomer } from './CustomerProvider';

const LINKS = [
  { href: '/account', label: 'Overview', Icon: LayoutGrid, exact: true },
  { href: '/account/orders', label: 'My Orders', Icon: Package },
  { href: '/account/wishlist', label: 'Wishlist', Icon: Heart },
  { href: '/account/addresses', label: 'Addresses', Icon: MapPin },
];

/** Wraps authenticated account pages with a sidebar + guard. */
export default function AccountShell({ children }: { children: React.ReactNode }) {
  const { customer, ready, logout } = useCustomer();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (ready && !customer) router.replace(`/account/login?redirect=${encodeURIComponent(pathname)}`);
  }, [ready, customer, router, pathname]);

  if (!ready || !customer) {
    return <div className="container-x grid place-items-center py-32 text-slate-400"><Loader2 className="animate-spin" /></div>;
  }

  return (
    <div className="container-x py-8">
      <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
        <aside>
          <div className="card p-5">
            <div className="mb-4">
              <div className="text-xs uppercase tracking-wide text-slate-400">Signed in as</div>
              <div className="truncate font-bold">{customer.name}</div>
              <div className="truncate text-sm text-slate-500">{customer.email}</div>
            </div>
            <nav className="space-y-1">
              {LINKS.map(({ href, label, Icon, exact }) => {
                const active = exact ? pathname === href : pathname.startsWith(href);
                return (
                  <Link key={href} href={href} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${active ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
                    <Icon size={18} /> {label}
                  </Link>
                );
              })}
              <button onClick={logout} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-rose-50 hover:text-rose-600">
                <LogOut size={18} /> Sign out
              </button>
            </nav>
          </div>
        </aside>
        <div>{children}</div>
      </div>
    </div>
  );
}
