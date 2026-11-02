import {
  ShoppingBasket,
  CookingPot,
  Smartphone,
  Sparkles,
  SprayCan,
  Baby,
  Package,
  type LucideIcon,
} from 'lucide-react';

/**
 * Product/category thumbnail. Shows a real uploaded image when present;
 * otherwise renders a clean, consistent branded placeholder (soft gradient +
 * category icon) so the catalog looks intentional instead of using stock
 * photos. Pure component — safe in server or client components.
 */

const CATEGORY_ICON: Record<string, LucideIcon> = {
  groceries: ShoppingBasket,
  'home-kitchen': CookingPot,
  electronics: Smartphone,
  'health-beauty': Sparkles,
  cleaning: SprayCan,
  'baby-kids': Baby,
};

// Tasteful gradient pairs; pick deterministically so each product is stable.
const GRADIENTS = [
  'from-blue-50 to-indigo-100 text-brand-600',
  'from-sky-50 to-cyan-100 text-sky-600',
  'from-amber-50 to-orange-100 text-accent',
  'from-emerald-50 to-teal-100 text-emerald-600',
  'from-rose-50 to-pink-100 text-rose-500',
  'from-violet-50 to-purple-100 text-violet-600',
  'from-slate-50 to-slate-200 text-slate-500',
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function isReal(src?: string | null): src is string {
  return !!src && !src.includes('picsum.photos');
}

export default function Thumb({
  src,
  name,
  slug,
  categorySlug,
  className = '',
  iconSize = 56,
  rounded = '',
}: {
  src?: string | null;
  name: string;
  slug?: string;
  categorySlug?: string | null;
  className?: string;
  iconSize?: number;
  rounded?: string;
}) {
  if (isReal(src)) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={name} className={`h-full w-full object-cover ${rounded} ${className}`} />;
  }

  const key = slug || name || 'x';
  const grad = GRADIENTS[hash(key) % GRADIENTS.length];
  const Icon = (categorySlug && CATEGORY_ICON[categorySlug]) || Package;

  return (
    <div
      className={`relative flex h-full w-full flex-col items-center justify-center bg-gradient-to-br ${grad} ${rounded} ${className}`}
      aria-label={name}
    >
      <Icon size={iconSize} className="opacity-90" />
      <span className="pointer-events-none absolute bottom-2 left-2 right-2 truncate text-center text-[10px] font-bold uppercase tracking-wide opacity-60">
        {name}
      </span>
    </div>
  );
}
