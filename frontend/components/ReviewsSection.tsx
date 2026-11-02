'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Star, Loader2, Check } from 'lucide-react';
import { api } from '@/lib/api';
import { customerApi } from '@/lib/customerApi';
import { useCustomer } from './CustomerProvider';
import { useLang } from './LanguageProvider';
import type { ProductReview } from '@/lib/types';

function Stars({ value, onSelect, size = 16 }: { value: number; onSelect?: (n: number) => void; size?: number }) {
  return (
    <div className="flex">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!onSelect}
          onClick={() => onSelect?.(n)}
          className={onSelect ? 'cursor-pointer' : 'cursor-default'}
        >
          <Star size={size} className={n <= value ? 'fill-amber-400 text-amber-400' : 'text-slate-300'} />
        </button>
      ))}
    </div>
  );
}

export default function ReviewsSection({ slug, productId }: { slug: string; productId: number }) {
  const { customer } = useCustomer();
  const { t } = useLang();
  const [reviews, setReviews] = useState<ProductReview[] | null>(null);
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const load = () => api.reviews(slug).then(setReviews).catch(() => setReviews([]));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [slug]);

  useEffect(() => {
    if (!customer) return;
    customerApi.myReview(productId).then((r) => {
      if (r) { setRating(r.rating); setTitle(r.title || ''); setBody(r.body || ''); }
    }).catch(() => {});
  }, [customer, productId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await customerApi.postReview(productId, rating, title, body);
      setDone(true);
      setTimeout(() => setDone(false), 2500);
      load();
    } catch (err: any) {
      setError(err.message || 'Could not submit review');
    } finally {
      setSaving(false);
    }
  };

  const avg = reviews && reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;

  return (
    <section className="mt-16">
      <h2 className="text-2xl font-extrabold">{t('Customer Reviews')}</h2>

      <div className="mt-6 grid gap-8 lg:grid-cols-[320px_1fr]">
        {/* Summary + form */}
        <div className="space-y-5">
          <div className="card p-5 text-center">
            <div className="text-4xl font-extrabold text-ink">{avg.toFixed(1)}</div>
            <div className="mt-1 flex justify-center"><Stars value={Math.round(avg)} /></div>
            <div className="mt-1 text-sm text-slate-500">{reviews?.length ?? 0} {t('reviews')}</div>
          </div>

          <div className="card p-5">
            <h3 className="mb-3 font-bold">{t('Write a review')}</h3>
            {!customer ? (
              <p className="text-sm text-slate-500">
                <Link href={`/account/login?redirect=/products/${slug}`} className="font-semibold text-brand-600 hover:underline">{t('Sign in')}</Link> {t('to leave a review.')}
              </p>
            ) : (
              <form onSubmit={submit} className="space-y-3">
                <div>
                  <span className="label">{t('Your rating')}</span>
                  <Stars value={rating} onSelect={setRating} size={26} />
                </div>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('Title (optional)')} className="input" maxLength={120} />
                <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder={t('Share your experience…')} rows={3} className="input" maxLength={2000} />
                {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}
                <button disabled={saving} className="btn-primary w-full">
                  {saving ? <Loader2 size={16} className="animate-spin" /> : done ? <><Check size={16} /> {t('Submitted!')}</> : t('Submit Review')}
                </button>
              </form>
            )}
          </div>
        </div>

        {/* List */}
        <div>
          {!reviews ? (
            <div className="grid place-items-center py-16 text-slate-400"><Loader2 className="animate-spin" /></div>
          ) : reviews.length === 0 ? (
            <div className="card grid place-items-center py-16 text-center text-slate-500">{t('No reviews yet. Be the first!')}</div>
          ) : (
            <div className="space-y-4">
              {reviews.map((r) => (
                <div key={r.id} className="card p-5">
                  <div className="flex items-center justify-between">
                    <Stars value={r.rating} />
                    <span className="text-xs text-slate-400">{new Date(r.createdAt).toLocaleDateString()}</span>
                  </div>
                  {r.title && <div className="mt-2 font-bold text-ink">{r.title}</div>}
                  {r.body && <p className="mt-1 text-sm text-slate-600">{r.body}</p>}
                  <div className="mt-2 text-xs font-semibold text-slate-500">— {r.author}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
