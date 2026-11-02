import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Trust-commerce blue (primary actions, links)
        brand: {
          50: '#eef5ff',
          100: '#d9e8ff',
          200: '#bcd7ff',
          300: '#8ebdff',
          400: '#5b97ff',
          500: '#3470f4',
          600: '#1f55e0',
          700: '#1a44bd',
          800: '#1b3c99',
          900: '#1b3678',
        },
        // ERP palette. These resolve to CSS variables defined in app/erp-theme.css
        // so every odoo-* utility follows the dark/light toggle automatically.
        // The variables hold space-separated RGB channels, which is what lets
        // opacity modifiers (bg-odoo-primary/25) keep working.
        odoo: {
          ground: 'rgb(var(--erp-ground) / <alpha-value>)',
          surface: 'rgb(var(--erp-surface) / <alpha-value>)',
          raised: 'rgb(var(--erp-raised) / <alpha-value>)',
          line: 'rgb(var(--erp-line) / <alpha-value>)',
          ink: 'rgb(var(--erp-ink) / <alpha-value>)',
          dim: 'rgb(var(--erp-dim) / <alpha-value>)',
          faint: 'rgb(var(--erp-faint) / <alpha-value>)',
          primary: 'rgb(var(--erp-primary) / <alpha-value>)',
          primaryHi: 'rgb(var(--erp-primary-hi) / <alpha-value>)',
          lift: 'rgb(var(--erp-lift) / <alpha-value>)',
          ok: 'rgb(var(--erp-ok) / <alpha-value>)',
          warn: 'rgb(var(--erp-warn) / <alpha-value>)',
          bad: 'rgb(var(--erp-bad) / <alpha-value>)',
          info: 'rgb(var(--erp-info) / <alpha-value>)',
        },
        ink: '#0f1b2d',        // text / dark surfaces
        navy: '#0b1f3a',       // header bar
        accent: '#ff7a1a',     // orange "buy" CTA + price highlight
        accentDark: '#e8650a',
        deal: '#e11d48',       // discount badges
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(15,27,45,.06), 0 1px 3px rgba(15,27,45,.05)',
        hover: '0 8px 28px rgba(15,27,45,.12)',
        bar: '0 2px 10px rgba(15,27,45,.06)',
      },
      borderRadius: {
        xl: '0.85rem',
        '2xl': '1.1rem',
      },
    },
  },
  plugins: [],
};
export default config;
