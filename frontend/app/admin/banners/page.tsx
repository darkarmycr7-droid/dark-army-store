'use client';

import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Loader2, Upload, ArrowUp, ArrowDown, ImageOff, Timer, Check } from 'lucide-react';
import { adminApi, AdminBanner, BannerInput } from '@/lib/adminApi';

const empty: BannerInput = {
  title: '', titleAr: '', subtitle: '', subtitleAr: '', ctaLabel: '', ctaLabelAr: '',
  ctaHref: '/products', imageUrl: null, align: 'left', overlay: 40, isActive: true,
};

export default function BannersPage() {
  const [rows, setRows] = useState<AdminBanner[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AdminBanner | null>(null);
  const [creating, setCreating] = useState(false);

  const load = () => {
    setLoading(true);
    adminApi.banners().then(setRows).catch(() => setRows([])).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const remove = async (b: AdminBanner) => {
    if (!confirm(`Delete banner “${b.title.split('\n')[0]}”?`)) return;
    await adminApi.deleteBanner(b.id);
    load();
  };

  const move = async (idx: number, dir: -1 | 1) => {
    const next = [...rows];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    setRows(next);
    await adminApi.reorderBanners(next.map((b) => b.id));
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold">Homepage Banners</h1>
          <p className="text-slate-500">Slides shown in the storefront hero. Drag order with the arrows.</p>
        </div>
        <button onClick={() => setCreating(true)} className="btn-primary"><Plus size={18} /> New Banner</button>
      </div>

      <SliderTiming />

      {loading ? (
        <div className="grid place-items-center py-24 text-slate-400"><Loader2 className="animate-spin" /></div>
      ) : rows.length === 0 ? (
        <div className="card mt-6 grid place-items-center py-20 text-center">
          <p className="text-lg font-semibold">No banners yet</p>
          <p className="text-slate-500">Create one — until then the storefront shows a default slide.</p>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {rows.map((b, i) => (
            <div key={b.id} className="card flex items-center gap-4 p-3">
              <div className="flex flex-col">
                <button onClick={() => move(i, -1)} disabled={i === 0} className="grid h-6 w-6 place-items-center rounded hover:bg-slate-100 disabled:opacity-30"><ArrowUp size={14} /></button>
                <button onClick={() => move(i, 1)} disabled={i === rows.length - 1} className="grid h-6 w-6 place-items-center rounded hover:bg-slate-100 disabled:opacity-30"><ArrowDown size={14} /></button>
              </div>
              <div className="relative h-16 w-28 shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-brand-700 to-brand-900">
                {b.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={b.imageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full w-full place-items-center text-white/50"><ImageOff size={18} /></div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-bold">{b.title.split('\n').join(' ')}</div>
                <div className="truncate text-sm text-slate-500">{b.subtitle || '—'}</div>
                <div className="mt-1 flex gap-2 text-xs">
                  <span className={`rounded px-1.5 py-0.5 font-semibold ${b.isActive ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>{b.isActive ? 'Active' : 'Hidden'}</span>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-500">align: {b.align}</span>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-500">→ {b.ctaHref}</span>
                </div>
              </div>
              <div className="flex gap-1">
                <button onClick={() => setEditing(b)} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-slate-100"><Pencil size={16} /></button>
                <button onClick={() => remove(b)} className="grid h-9 w-9 place-items-center rounded-lg text-rose-500 hover:bg-rose-50"><Trash2 size={16} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {(creating || editing) && (
        <BannerModal
          banner={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { setCreating(false); setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function SliderTiming() {
  const [seconds, setSeconds] = useState(5);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    adminApi.bannerSettings().then((s) => setSeconds(s.intervalSeconds)).catch(() => {}).finally(() => setLoaded(true));
  }, []);

  const save = async () => {
    setError(''); setDone(false);
    if (seconds < 2 || seconds > 30) return setError('Choose between 2 and 30 seconds.');
    setSaving(true);
    try {
      await adminApi.updateBannerSettings(seconds);
      setDone(true);
      setTimeout(() => setDone(false), 2500);
    } catch (e: any) { setError(e.message || 'Could not save'); }
    finally { setSaving(false); }
  };

  return (
    <div className="card mt-4 flex flex-wrap items-center gap-3 p-4">
      <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-50 text-brand-600"><Timer size={18} /></span>
      <div className="mr-2">
        <div className="font-bold">Slide timing</div>
        <div className="text-xs text-slate-500">How long each slide shows before sliding to the next.</div>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number" min={2} max={30} step={1} value={loaded ? seconds : ''}
          onChange={(e) => setSeconds(Number(e.target.value))}
          className="input w-24" disabled={!loaded}
        />
        <span className="text-sm font-semibold text-slate-600">seconds</span>
      </div>
      <button onClick={save} disabled={saving || !loaded} className="btn-primary">
        {saving ? <Loader2 size={16} className="animate-spin" /> : 'Save'}
      </button>
      {done && <span className="flex items-center gap-1 text-sm font-semibold text-emerald-600"><Check size={15} /> Saved</span>}
      {error && <span className="text-sm font-semibold text-rose-600">{error}</span>}
    </div>
  );
}

function BannerModal({ banner, onClose, onSaved }: { banner: AdminBanner | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<BannerInput>(empty);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (banner) {
      const { id, sortOrder, ...rest } = banner;
      void id; void sortOrder;
      setForm(rest);
    } else setForm(empty);
  }, [banner]);

  const set = (k: keyof BannerInput, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setError('');
    try {
      const { url } = await adminApi.uploadBannerImage(file);
      set('imageUrl', url);
    } catch (err: any) { setError(err.message || 'Upload failed'); }
    finally { setUploading(false); }
  };

  const save = async () => {
    setError('');
    if (!form.title.trim()) return setError('Title is required');
    setSaving(true);
    try {
      if (banner) await adminApi.updateBanner(banner.id, form);
      else await adminApi.createBanner(form);
      onSaved();
    } catch (err: any) { setError(err.message || 'Could not save'); setSaving(false); }
  };

  const alignClass = form.align === 'center' ? 'items-center text-center' : form.align === 'right' ? 'items-end text-end' : 'items-start text-start';

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-6 py-4">
          <h2 className="text-lg font-bold">{banner ? 'Edit Banner' : 'New Banner'}</h2>
        </div>

        <div className="space-y-5 p-6">
          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}

          {/* Live preview */}
          <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-brand-700 to-brand-900 text-white">
            {form.imageUrl && (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={form.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
                <div className="absolute inset-0 bg-black" style={{ opacity: (form.overlay ?? 40) / 100 }} />
              </>
            )}
            <div className={`relative flex min-h-[160px] flex-col justify-center p-6 ${alignClass}`}>
              <h3 className="whitespace-pre-line text-2xl font-extrabold leading-tight drop-shadow">{form.title || 'Your headline here'}</h3>
              {form.subtitle && <p className="mt-1 max-w-md text-sm text-white/90 drop-shadow">{form.subtitle}</p>}
              <span className="mt-3 inline-block self-start rounded-lg bg-accent px-4 py-2 text-sm font-bold">{form.ctaLabel || 'Shop Now'}</span>
            </div>
          </div>

          {/* Background image */}
          <div>
            <span className="label">Background image (optional — leave empty for brand gradient)</span>
            <div className="flex items-center gap-3">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50">
                {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />} Upload
                <input type="file" accept="image/*" className="hidden" onChange={onUpload} />
              </label>
              {form.imageUrl && (
                <button onClick={() => set('imageUrl', null)} className="text-sm font-semibold text-rose-500">Remove image</button>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Title (English) — use Enter for line breaks" value={form.title} onChange={(v) => set('title', v)} textarea />
            <Field label="Title (Arabic)" value={form.titleAr || ''} onChange={(v) => set('titleAr', v)} dir="rtl" textarea />
            <Field label="Subtitle (English)" value={form.subtitle || ''} onChange={(v) => set('subtitle', v)} />
            <Field label="Subtitle (Arabic)" value={form.subtitleAr || ''} onChange={(v) => set('subtitleAr', v)} dir="rtl" />
            <Field label="Button label (English)" value={form.ctaLabel || ''} onChange={(v) => set('ctaLabel', v)} />
            <Field label="Button label (Arabic)" value={form.ctaLabelAr || ''} onChange={(v) => set('ctaLabelAr', v)} dir="rtl" />
            <Field label="Button link" value={form.ctaHref || ''} onChange={(v) => set('ctaHref', v)} placeholder="/products?category=electronics" />
            <div>
              <span className="label">Text alignment</span>
              <select value={form.align} onChange={(e) => set('align', e.target.value)} className="input">
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </div>
          </div>

          <div>
            <span className="label">Image darkening (for text readability): {form.overlay}%</span>
            <input type="range" min={0} max={80} step={5} value={form.overlay} onChange={(e) => set('overlay', Number(e.target.value))} className="w-full" disabled={!form.imageUrl} />
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={form.isActive} onChange={(e) => set('isActive', e.target.checked)} className="h-4 w-4" />
            Active (visible on storefront)
          </label>
        </div>

        <div className="sticky bottom-0 flex justify-end gap-3 border-t border-slate-100 bg-white px-6 py-4">
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button onClick={save} disabled={saving} className="btn-primary">
            {saving ? <Loader2 size={18} className="animate-spin" /> : banner ? 'Save Changes' : 'Create Banner'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, dir, textarea, placeholder }: { label: string; value: string; onChange: (v: string) => void; dir?: 'rtl' | 'ltr'; textarea?: boolean; placeholder?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {textarea ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} dir={dir} rows={2} placeholder={placeholder} className="input" />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} dir={dir} placeholder={placeholder} className="input" />
      )}
    </label>
  );
}
