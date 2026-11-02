'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  LayoutDashboard, Package, ShoppingBag, ShoppingCart, Truck, ClipboardList, Boxes,
  BarChart3, Ticket, Images, ScrollText, Settings, Globe, Calculator, Receipt,
  Loader2, LogOut, Search, Contact, FileSignature, Warehouse, ArrowLeftRight, Factory,
  Users, CalendarClock, Plane,
} from 'lucide-react';
import { adminApi, adminToken, AdminUser } from '@/lib/adminApi';
import ThemeToggle from '@/components/odoo/ThemeToggle';

/** Odoo-style app launcher. Each module is a tile; clicking one drops into the
 *  normal admin shell (or the till / storefront for the two that live outside it). */
type App = {
  label: string;
  href: string;
  Icon: typeof Package;
  /** Icon tile colour — one per module so they stay recognisable by shape + colour. */
  tint: string;
  group: 'Operations' | 'Inventory' | 'People' | 'Reporting' | 'Store' | 'System';
  external?: boolean;
  soon?: boolean;
  hint?: string;
};

const APPS: App[] = [
  { label: 'Dashboard', href: '/admin/dashboard', Icon: LayoutDashboard, tint: 'from-indigo-500 to-indigo-600', group: 'Operations' },
  { label: 'Point of Sale', href: '/pos', Icon: ShoppingCart, tint: 'from-fuchsia-500 to-purple-600', group: 'Operations', external: true, hint: 'Open the till' },
  { label: 'Sales', href: '/admin/sales', Icon: FileSignature, tint: 'from-blue-500 to-cyan-600', group: 'Operations' },
  { label: 'Online Orders', href: '/admin/orders', Icon: ShoppingBag, tint: 'from-sky-500 to-blue-600', group: 'Operations' },
  { label: 'Till Sessions', href: '/admin/pos', Icon: Receipt, tint: 'from-violet-500 to-violet-700', group: 'Operations' },

  { label: 'Contacts', href: '/admin/contacts', Icon: Contact, tint: 'from-rose-400 to-rose-600', group: 'Operations' },

  { label: 'Products', href: '/admin/products', Icon: Package, tint: 'from-emerald-500 to-emerald-700', group: 'Inventory' },
  { label: 'Manufacturing', href: '/admin/manufacturing', Icon: Factory, tint: 'from-slate-500 to-slate-700', group: 'Inventory' },
  { label: 'Warehouses', href: '/admin/warehouses', Icon: Warehouse, tint: 'from-teal-500 to-teal-700', group: 'Inventory' },
  { label: 'Transfers', href: '/admin/transfers', Icon: ArrowLeftRight, tint: 'from-cyan-500 to-teal-600', group: 'Inventory' },
  { label: 'Stock Ledger', href: '/admin/stock', Icon: Boxes, tint: 'from-emerald-600 to-teal-700', group: 'Inventory' },
  { label: 'Purchase', href: '/admin/purchases', Icon: ClipboardList, tint: 'from-amber-500 to-orange-600', group: 'Inventory' },
  { label: 'Suppliers', href: '/admin/suppliers', Icon: Truck, tint: 'from-orange-500 to-red-500', group: 'Inventory' },

  { label: 'Employees', href: '/admin/employees', Icon: Users, tint: 'from-indigo-500 to-blue-700', group: 'People' },
  { label: 'Attendance', href: '/admin/attendance', Icon: CalendarClock, tint: 'from-sky-500 to-indigo-600', group: 'People' },
  { label: 'Time Off', href: '/admin/timeoff', Icon: Plane, tint: 'from-teal-400 to-emerald-600', group: 'People' },

  { label: 'Reports', href: '/admin/reports', Icon: BarChart3, tint: 'from-rose-500 to-pink-600', group: 'Reporting' },
  { label: 'Accounting', href: '/admin/accounting', Icon: Calculator, tint: 'from-yellow-500 to-amber-600', group: 'Reporting' },

  { label: 'Coupons', href: '/admin/coupons', Icon: Ticket, tint: 'from-lime-500 to-green-600', group: 'Store' },
  { label: 'Banners', href: '/admin/banners', Icon: Images, tint: 'from-cyan-500 to-sky-600', group: 'Store' },
  { label: 'Website', href: '/', Icon: Globe, tint: 'from-blue-500 to-indigo-600', group: 'Store', external: true, hint: 'View the storefront' },

  { label: 'Activity Log', href: '/admin/audit', Icon: ScrollText, tint: 'from-stone-500 to-stone-700', group: 'System' },
  { label: 'Settings', href: '/admin/settings', Icon: Settings, tint: 'from-zinc-500 to-zinc-700', group: 'System' },
];

const GROUPS: App['group'][] = ['Operations', 'Inventory', 'People', 'Reporting', 'Store', 'System'];

export default function AdminAppsPage() {
  const router = useRouter();
  const [user, setUser] = useState<AdminUser | null>(null);
  const [checked, setChecked] = useState(false);
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!adminToken.get()) {
      router.replace('/admin/login');
      return;
    }
    adminApi.me().then(setUser).catch(() => router.replace('/admin/login')).finally(() => setChecked(true));
  }, [router]);

  if (!checked) {
    return <div className="grid flex-1 place-items-center bg-odoo-ground text-odoo-faint"><Loader2 className="animate-spin" /></div>;
  }

  const term = q.trim().toLowerCase();
  const matches = term ? APPS.filter((a) => a.label.toLowerCase().includes(term)) : APPS;

  return (
    // flex-1: the root <body> is a flex column, so the launcher must grow to
    // fill it — otherwise the body background shows through below the fold.
    <div className="flex-1 bg-odoo-ground text-odoo-ink">
      {/* Top bar — 46px, matching the reference application's navbar */}
      <header className="flex h-[46px] items-center gap-2.5 border-b border-odoo-line bg-odoo-surface px-4">
        <span className="grid h-6 w-6 place-items-center rounded bg-odoo-primary text-[13px] font-bold">D</span>
        <span className="text-[13px] font-semibold">Dark-Army <span className="text-odoo-lift">ERP</span></span>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle compact />
          <span className="hidden text-right text-sm sm:block">
            <span className="block font-semibold">{user?.name}</span>
            <span className="block text-xs text-odoo-faint">{user?.email}</span>
          </span>
          <button
            onClick={() => { adminToken.clear(); router.replace('/admin/login'); }}
            className="grid h-7 w-7 place-items-center rounded hover:bg-white/10"
            title="Sign out"
          >
            <LogOut size={15} />
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-5 py-10">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-extrabold">Apps</h1>
          <p className="text-sm text-odoo-dim">Everything in one place — pick a module to get started.</p>
        </div>

        <div className="mx-auto mb-10 flex h-[33px] max-w-md items-center gap-2 rounded border border-odoo-line bg-odoo-surface px-2.5">
          <Search size={15} className="text-odoo-faint" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
            placeholder="Search apps…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-odoo-faint"
          />
        </div>

        {term ? (
          // Keyed on the term so a new set of results deals itself in again
          // rather than appearing all at once.
          <AppGrid key={term} apps={matches} offset={0} />
        ) : (
          // `shown` keeps the stagger running across section boundaries, so the
          // whole page deals in as one wave instead of restarting each group.
          (() => {
            let shown = 0;
            return GROUPS.map((g, gi) => {
              const apps = APPS.filter((a) => a.group === g);
              if (!apps.length) return null;
              const offset = shown;
              shown += apps.length;
              return (
                <section key={g} className="app-group mb-10" style={{ '--g': gi } as CSSProperties}>
                  <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-odoo-faint">{g}</h2>
                  <AppGrid apps={apps} offset={offset} />
                </section>
              );
            });
          })()
        )}

        {term && matches.length === 0 && (
          <p className="py-10 text-center text-odoo-dim">No app matches “{q}”.</p>
        )}
      </div>
    </div>
  );
}

function AppGrid({ apps, offset }: { apps: App[]; offset: number }) {
  return (
    <div className="grid grid-cols-3 gap-x-4 gap-y-7 sm:grid-cols-4 md:grid-cols-6">
      {apps.map((a, i) => <AppTile key={a.label} app={a} index={offset + i} />)}
    </div>
  );
}

/** `index` drives the entrance stagger; the motion itself lives in
 *  app/erp-theme.css so it can be switched off in one place for
 *  prefers-reduced-motion. */
function AppTile({ app, index }: { app: App; index: number }) {
  const { label, href, Icon, tint, external, soon, hint } = app;

  const inner = (
    <>
      <span
        className={`tile-icon grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br ${tint} shadow-lg ${soon ? 'opacity-40 grayscale' : ''}`}
      >
        <Icon size={28} className="tile-glyph text-white" />
      </span>
      <span className={`tile-label text-center text-xs font-semibold ${soon ? 'text-odoo-faint' : 'text-odoo-ink'}`}>{label}</span>
      {soon && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-odoo-faint">Soon</span>}
    </>
  );

  const className = `app-tile flex flex-col items-center gap-2 ${soon ? 'cursor-default' : ''}`;
  const style = { '--i': index } as CSSProperties;

  if (soon) return <div className={className} style={style} title={hint}>{inner}</div>;

  // The till and the storefront live outside the admin shell.
  if (external) {
    return <a href={href} className={className} style={style} title={hint}>{inner}</a>;
  }
  return <Link href={href} className={className} style={style} title={hint}>{inner}</Link>;
}
