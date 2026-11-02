'use client';

import { useRouter } from 'next/navigation';
import { Heart } from 'lucide-react';
import { useState } from 'react';
import { useCustomer } from './CustomerProvider';
import { useLang } from './LanguageProvider';

export default function WishlistButton({
  productId,
  className = '',
  size = 18,
  withLabel = false,
}: {
  productId: number;
  className?: string;
  size?: number;
  withLabel?: boolean;
}) {
  const { isWished, toggleWish, customer } = useCustomer();
  const { t } = useLang();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const wished = isWished(productId);

  const onClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!customer) {
      router.push(`/account/login?redirect=${encodeURIComponent(location.pathname)}`);
      return;
    }
    setBusy(true);
    try {
      await toggleWish(productId);
    } catch {
      /* reverted in provider */
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={onClick}
      disabled={busy}
      aria-label={wished ? 'Remove from wishlist' : 'Add to wishlist'}
      title={wished ? 'In your wishlist' : 'Add to wishlist'}
      className={`inline-flex items-center gap-1.5 ${className}`}
    >
      <Heart size={size} className={wished ? 'fill-rose-500 text-rose-500' : 'text-slate-500'} />
      {withLabel && <span className="text-sm font-semibold">{wished ? t('Wishlisted') : t('Wishlist')}</span>}
    </button>
  );
}
