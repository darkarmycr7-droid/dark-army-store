'use client';

import { useLang } from './LanguageProvider';

/** Translate a dictionary string. Usable inside server components. */
export function T({ k }: { k: string }) {
  const { t } = useLang();
  return <>{t(k)}</>;
}

/** Show the localized (Arabic when available) value of a name/field. */
export function Loc({ en, ar }: { en: string; ar?: string | null }) {
  const { pick } = useLang();
  return <>{pick(en, ar)}</>;
}
