import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import './globals.css';
// Loaded after globals so the staff theme's rules land last in the cascade and
// beat Tailwind's own .card / .input component styles. Scoped to `.erp`.
import './erp-theme.css';
import { CartProvider } from '@/components/CartProvider';
import { CustomerProvider } from '@/components/CustomerProvider';
import { LanguageProvider } from '@/components/LanguageProvider';
import StoreChrome from '@/components/StoreChrome';
import PWARegister from '@/components/PWARegister';
import type { Lang } from '@/lib/i18n';

export const metadata: Metadata = {
  title: {
    default: 'Dark-Army Store — All-in-One Online Store in Kuwait',
    template: '%s | Dark-Army Store',
  },
  description:
    'Shop groceries, home & kitchen, electronics, beauty and more at Dark-Army Store. Fast delivery across Kuwait with Cash on Delivery and KNET.',
  keywords: ['Kuwait online store', 'Dark-Army Store', 'online shopping Kuwait', 'COD Kuwait'],
  openGraph: { title: 'Dark-Army Store', type: 'website', locale: 'en_KW' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Read saved language server-side so the very first paint has the right
  // direction (no flash of LTR before hydration).
  const lang = (cookies().get('lang')?.value === 'ar' ? 'ar' : 'en') as Lang;
  const dir = lang === 'ar' ? 'rtl' : 'ltr';

  return (
    <html lang={lang} dir={dir}>
      <head>
        {/* PWA — installable app */}
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="theme-color" content="#0b1f3a" />
        <link rel="apple-touch-icon" href="/icon.svg" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Dark-Army" />
        {/* Arabic-capable font (Cairo) alongside the default Latin font */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap"
          rel="stylesheet"
        />
        {/* Apply the staff theme before first paint so the admin and till never
            flash the wrong one. Only stamps an attribute on <html>; the
            storefront's own styling is unaffected. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('da-erp-theme');document.documentElement.setAttribute('data-erp-theme',t==='light'?'light':'dark')}catch(e){document.documentElement.setAttribute('data-erp-theme','dark')}`,
          }}
        />
      </head>
      <body className="min-h-screen flex flex-col font-sans antialiased">
        <PWARegister />
        <LanguageProvider initial={lang}>
          <CustomerProvider>
            <CartProvider>
              <StoreChrome>{children}</StoreChrome>
            </CartProvider>
          </CustomerProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
