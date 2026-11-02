'use client';

import { Suspense } from 'react';
import { usePathname } from 'next/navigation';
import Header from './Header';
import Footer from './Footer';
import LiveBackground from './LiveBackground';
import { FloatingWhatsApp } from './WhatsApp';

export default function StoreChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Staff screens render bare: the admin panel has its own shell, and the till
  // needs the full viewport with no shopper header or footer.
  const isStaff = pathname.startsWith('/admin') || pathname.startsWith('/pos');

  if (isStaff) return <>{children}</>;

  return (
    <>
      <LiveBackground />
      <Suspense fallback={<div className="h-16" />}>
        <Header />
      </Suspense>
      <main className="flex-1">{children}</main>
      <Footer />
      <FloatingWhatsApp />
    </>
  );
}
