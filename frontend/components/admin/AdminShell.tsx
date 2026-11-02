'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LayoutDashboard, Package, ShoppingBag, LogOut, Shield, ExternalLink, Menu, X, Settings, Ticket, ScrollText, BarChart3, Images, Truck, ClipboardList, Boxes, ShoppingCart, LayoutGrid, Calculator, Contact, FileSignature, Warehouse, ArrowLeftRight, Factory, Users, CalendarClock, Plane } from 'lucide-react';
import { adminApi, adminToken, AdminUser } from '@/lib/adminApi';
import ThemeToggle from '@/components/odoo/ThemeToggle';

const NAV = [
  { href: '/admin/dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { href: '/admin/contacts', label: 'Contacts', Icon: Contact },
  { href: '/admin/products', label: 'Products', Icon: Package },
  { href: '/admin/suppliers', label: 'Suppliers', Icon: Truck },
  { href: '/admin/purchases', label: 'Purchases', Icon: ClipboardList },
  { href: '/admin/manufacturing', label: 'Manufacturing', Icon: Factory },
  { href: '/admin/warehouses', label: 'Warehouses', Icon: Warehouse },
  { href: '/admin/transfers', label: 'Transfers', Icon: ArrowLeftRight },
  { href: '/admin/stock', label: 'Stock Ledger', Icon: Boxes },
  { href: '/admin/banners', label: 'Banners', Icon: Images },
  { href: '/admin/sales', label: 'Sales', Icon: FileSignature },
  { href: '/admin/orders', label: 'Online Orders', Icon: ShoppingBag },
  { href: '/admin/pos', label: 'Till Sessions', Icon: ShoppingCart },
  { href: '/admin/accounting', label: 'Accounting', Icon: Calculator },
  { href: '/admin/employees', label: 'Employees', Icon: Users },
  { href: '/admin/attendance', label: 'Attendance', Icon: CalendarClock },
  { href: '/admin/timeoff', label: 'Time Off', Icon: Plane },
  { href: '/admin/reports', label: 'Reports', Icon: BarChart3 },
  { href: '/admin/coupons', label: 'Coupons', Icon: Ticket },
  { href: '/admin/audit', label: 'Activity Log', Icon: ScrollText },
  { href: '/admin/settings', label: 'Settings', Icon: Settings },
];

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<AdminUser | null>(null);
  const [checked, setChecked] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!adminToken.get()) {
      router.replace('/admin/login');
      return;
    }
    adminApi
      .me()
      .then(setUser)
      .catch(() => router.replace('/admin/login'))
      .finally(() => setChecked(true));
  }, [router]);

  const logout = () => {
    adminToken.clear();
    router.replace('/admin/login');
  };

  if (!checked) {
    return <div className="grid min-h-screen place-items-center text-slate-400">Loading admin…</div>;
  }

  return (
    // Sidebar 240px; the reference's own chrome heights (46px bar) are used
    // throughout so the two applications feel dimensionally identical.
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
      {/* Sidebar */}
      {/* flex column, not an absolutely-positioned footer: the nav list is long
          enough now to run past the fold, and an absolute footer sat on top of
          the last few links instead of being pushed below them. */}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-60 transform flex-col border-r border-odoo-line bg-odoo-surface text-odoo-ink transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-[46px] shrink-0 items-center gap-2 border-b border-odoo-line px-3">
          <span className="grid h-6 w-6 place-items-center rounded bg-odoo-primary text-white"><Shield size={13} /></span>
          <span className="text-[13px] font-semibold">Dark-Army</span>
          {/* Back to the app launcher, the way Odoo's grid button works */}
          <Link href="/admin" title="All apps" className="ml-auto grid h-7 w-7 place-items-center rounded hover:bg-white/10">
            <LayoutGrid size={16} />
          </Link>
        </div>
        <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 py-2">
          {NAV.map(({ href, label, Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-2.5 rounded px-2.5 py-[7px] text-[13px] font-medium ${active ? 'bg-odoo-primary text-white' : 'text-odoo-ink hover:bg-white/[.06]'}`}
              >
                <Icon size={16} /> {label}
              </Link>
            );
          })}
          <a href="/pos" className="mt-2 flex items-center gap-2.5 rounded border border-odoo-line px-2.5 py-[7px] text-[13px] font-semibold hover:bg-white/[.06]">
            <ShoppingCart size={16} /> Open the Till
          </a>
          <a href="/" target="_blank" className="flex items-center gap-2.5 rounded px-2.5 py-[7px] text-[13px] font-medium text-odoo-dim hover:bg-white/[.06]">
            <ExternalLink size={16} /> View Store
          </a>
          <ThemeToggle />
        </nav>
        <div className="shrink-0 border-t border-odoo-line p-3">
          <div className="mb-2 text-[13px]">
            <div className="font-semibold">{user?.name}</div>
            <div className="text-[11px] text-odoo-faint">{user?.email}</div>
          </div>
          <button onClick={logout} className="flex w-full items-center gap-2 rounded border border-odoo-line px-2.5 py-1.5 text-[13px] hover:bg-white/[.06]">
            <LogOut size={15} /> Sign out
          </button>
        </div>
      </aside>

      {open && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />}

      {/* Content */}
      <div className="min-w-0">
        <header className="flex h-[46px] items-center gap-2 border-b border-odoo-line bg-odoo-surface px-3 lg:hidden">
          <button onClick={() => setOpen(true)} className="grid h-8 w-8 place-items-center rounded hover:bg-white/10">
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
          <span className="text-[13px] font-semibold">Dark-Army</span>
          <span className="ml-auto"><ThemeToggle compact /></span>
        </header>
        {/* 16px gutter matches the reference's control-panel padding */}
        <main className="p-4">{children}</main>
      </div>
    </div>
  );
}
