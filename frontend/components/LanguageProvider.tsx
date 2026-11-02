'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Lang, translate } from '@/lib/i18n';

interface LangCtx {
  lang: Lang;
  dir: 'ltr' | 'rtl';
  setLang: (l: Lang) => void;
  toggle: () => void;
  t: (key: string) => string;
  /** Pick the localized field: Arabic value when on AR (and present), else the base. */
  pick: (base: string | null | undefined, ar?: string | null) => string;
}

const Ctx = createContext<LangCtx | null>(null);

function apply(lang: Lang) {
  if (typeof document === 'undefined') return;
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  document.documentElement.lang = lang;
  document.documentElement.dir = dir;
  document.cookie = `lang=${lang}; path=/; max-age=31536000`;
}

export function LanguageProvider({ initial = 'en', children }: { initial?: Lang; children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initial);

  useEffect(() => {
    // hydrate from cookie/localStorage on the client
    const stored = (localStorage.getItem('lang') as Lang) || readCookie('lang') as Lang;
    if (stored === 'ar' || stored === 'en') {
      setLangState(stored);
      apply(stored);
    } else {
      apply(initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setLang = (l: Lang) => {
    setLangState(l);
    localStorage.setItem('lang', l);
    apply(l);
  };

  const value = useMemo<LangCtx>(() => ({
    lang,
    dir: lang === 'ar' ? 'rtl' : 'ltr',
    setLang,
    toggle: () => setLang(lang === 'ar' ? 'en' : 'ar'),
    t: (key: string) => translate(key, lang),
    pick: (base, ar) => (lang === 'ar' && ar ? ar : base || ''),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [lang]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  return document.cookie.split('; ').find((c) => c.startsWith(name + '='))?.split('=')[1];
}

export function useLang() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useLang must be used within LanguageProvider');
  return ctx;
}
