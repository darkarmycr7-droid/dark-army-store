'use client';

import { usePathname } from 'next/navigation';
import AccountShell from '@/components/AccountNav';

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Login/register renders without the account shell or guard
  if (pathname === '/account/login') return <>{children}</>;
  return <AccountShell>{children}</AccountShell>;
}
