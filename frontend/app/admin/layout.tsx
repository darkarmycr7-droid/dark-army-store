'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import AdminShell from '@/components/admin/AdminShell';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // The admin panel is English-only — keep it LTR regardless of the shopper's
  // language choice, and restore the storefront direction on the way out.
  useEffect(() => {
    const html = document.documentElement;
    const prev = { dir: html.dir, lang: html.lang };
    html.dir = 'ltr';
    html.lang = 'en';
    return () => {
      html.dir = prev.dir;
      html.lang = prev.lang;
    };
  }, []);

  // `erp` scopes the Odoo dark theme (globals.css) to staff screens only, so
  // the customer storefront keeps its own light identity.
  // The login screen and the app launcher render without the sidebar shell —
  // the launcher is the ERP home, like Odoo's apps grid.
  if (pathname === '/admin/login' || pathname === '/admin') {
    return <div className="erp flex-1">{children}</div>;
  }
  return (
    <div className="erp flex-1">
      <AdminShell>{children}</AdminShell>
    </div>
  );
}
