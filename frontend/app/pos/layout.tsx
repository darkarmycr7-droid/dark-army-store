'use client';

import { useEffect } from 'react';

/** The till runs full-screen with no admin sidebar, English and LTR — the
 *  operator needs the whole width for the product grid and ticket. */
export default function PosLayout({ children }: { children: React.ReactNode }) {
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

  // flex-1 because the root <body> is a flex column; `erp` applies the Odoo
  // dark theme that the rest of the staff screens use.
  return <div className="erp flex flex-1 flex-col">{children}</div>;
}
