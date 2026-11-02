'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

export const ERP_THEME_KEY = 'da-erp-theme';
export type ErpTheme = 'dark' | 'light';

/**
 * Dark/light switch for the staff screens.
 *
 * The choice is stamped as `data-erp-theme` on <html>, which flips the CSS
 * variables in app/erp-theme.css — so every `.erp` rule and every `odoo-*`
 * Tailwind utility follows it at once. It is applied by an inline script in
 * the root layout before first paint, so there is no flash on load; this
 * component only reads the already-applied value and writes changes.
 *
 * The customer storefront is unaffected — these rules are scoped to `.erp`.
 */
export default function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<ErpTheme>('dark');

  useEffect(() => {
    const current = (document.documentElement.getAttribute('data-erp-theme') as ErpTheme) || 'dark';
    setTheme(current);
  }, []);

  const toggle = () => {
    const next: ErpTheme = theme === 'dark' ? 'light' : 'dark';
    const html = document.documentElement;
    html.setAttribute('data-erp-theme', next);

    // Chrome does not always re-resolve elements whose property is also claimed
    // by a competing rule (Tailwind's own `.card` / `.input` component styles),
    // leaving them a toggle behind. Forcing one synchronous style recalculation
    // fixes it; it happens within the same frame, so nothing flickers.
    const prev = html.style.display;
    html.style.display = 'none';
    void html.offsetHeight;
    html.style.display = prev;

    try {
      localStorage.setItem(ERP_THEME_KEY, next);
    } catch {
      /* private mode — the choice just won't persist */
    }
    setTheme(next);
  };

  const label = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
  const Icon = theme === 'dark' ? Sun : Moon;

  if (compact) {
    return (
      <button
        onClick={toggle}
        title={label}
        aria-label={label}
        className="grid h-7 w-7 place-items-center rounded text-odoo-dim hover:bg-odoo-raised hover:text-odoo-ink"
      >
        <Icon size={15} />
      </button>
    );
  }

  return (
    <button
      onClick={toggle}
      title={label}
      aria-label={label}
      className="flex w-full items-center gap-2.5 rounded px-2.5 py-[7px] text-[13px] font-medium text-odoo-dim hover:bg-odoo-raised hover:text-odoo-ink"
    >
      <Icon size={16} /> {theme === 'dark' ? 'Light theme' : 'Dark theme'}
    </button>
  );
}
