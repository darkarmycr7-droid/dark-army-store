'use client';

import { useEffect, useState } from 'react';
import { X, Upload, Trash2, Loader2, Plus } from 'lucide-react';
import { adminApi, AdminProduct, ProductInput } from '@/lib/adminApi';
import { formatKD } from '@/lib/money';

interface Props {
  product: AdminProduct | null; // null = create
  categories: { id: number; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}

const empty: ProductInput = {
  name: '', nameAr: '', sku: '', barcode: '', description: '', descriptionAr: '', specs: [],
  categoryId: null, unit: 'PCS', costPrice: 0, sellingPrice: 0, compareAtPrice: null,
  stockQty: 0, lowStockAlert: 5, isActive: true, isFeatured: false, isBestSeller: false, images: [],
};

export default function ProductModal({ product, categories, onClose, onSaved }: Props) {
  const [form, setForm] = useState<ProductInput>(empty);
  const [images, setImages] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (product) {
      setForm({
        name: product.name, nameAr: product.nameAr || '', sku: product.sku, barcode: product.barcode,
        description: product.description, descriptionAr: product.descriptionAr || '',
        specs: product.specs, categoryId: product.categoryId, unit: product.unit,
        costPrice: product.costPrice, sellingPrice: product.sellingPrice, compareAtPrice: product.compareAtPrice,
        stockQty: product.stockQty, lowStockAlert: product.lowStockAlert,
        isActive: product.isActive, isFeatured: product.isFeatured, isBestSeller: product.isBestSeller,
      });
      setImages(product.images.map((i) => i.url));
    } else {
      setForm(empty);
      setImages([]);
    }
  }, [product]);

  const set = (k: keyof ProductInput, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    setError('');
    try {
      for (const f of files) {
        const { url } = await adminApi.uploadImage(f);
        setImages((prev) => [...prev, url]);
      }
    } catch (err: any) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const addImageUrl = () => {
    const url = prompt('Image URL (https://…)');
    if (url) setImages((prev) => [...prev, url]);
  };

  const save = async () => {
    setError('');
    if (!form.name.trim()) return setError('Name is required');
    if (!form.sellingPrice || form.sellingPrice <= 0) return setError('Selling price must be greater than 0');
    setSaving(true);
    try {
      const payload: ProductInput = { ...form, images };
      if (product) await adminApi.updateProduct(product.id, payload);
      else await adminApi.createProduct(payload);
      onSaved();
    } catch (err: any) {
      setError(err.message || 'Could not save');
      setSaving(false);
    }
  };

  const margin = form.sellingPrice - form.costPrice;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white px-6 py-4">
          <h2 className="text-lg font-bold">{product ? 'Edit Product' : 'New Product'}</h2>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-slate-100"><X size={18} /></button>
        </div>

        <div className="space-y-5 p-6">
          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}

          {/* Images */}
          <div>
            <span className="label">Images</span>
            <div className="flex flex-wrap gap-3">
              {images.map((url, i) => (
                <div key={i} className="relative h-20 w-20 overflow-hidden rounded-xl border border-slate-200">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="h-full w-full object-cover" />
                  <button onClick={() => setImages((p) => p.filter((_, n) => n !== i))} className="absolute right-0 top-0 grid h-5 w-5 place-items-center rounded-bl-lg bg-rose-500 text-white">
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
              <label className="grid h-20 w-20 cursor-pointer place-items-center rounded-xl border-2 border-dashed border-slate-300 text-slate-400 hover:border-brand-400 hover:text-brand-500">
                {uploading ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
                <input type="file" accept="image/*" multiple className="hidden" onChange={onUpload} />
              </label>
              <button onClick={addImageUrl} type="button" className="grid h-20 w-20 place-items-center rounded-xl border-2 border-dashed border-slate-200 text-xs text-slate-400 hover:border-brand-400">
                <Plus size={16} /> URL
              </button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name (English) *" value={form.name} onChange={(v) => set('name', v)} />
            <Field label="Name (Arabic) — الاسم بالعربية" value={form.nameAr || ''} onChange={(v) => set('nameAr', v)} dir="rtl" />
            <Field label="SKU (auto if blank)" value={form.sku || ''} onChange={(v) => set('sku', v)} />
            <div>
              <span className="label">Category</span>
              <select value={form.categoryId ?? ''} onChange={(e) => set('categoryId', e.target.value ? Number(e.target.value) : null)} className="input">
                <option value="">— none —</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <Field label="Barcode" value={form.barcode || ''} onChange={(v) => set('barcode', v)} />
            <NumField label="Cost Price (KD)" value={form.costPrice} onChange={(v) => set('costPrice', v)} />
            <NumField label="Selling Price (KD) *" value={form.sellingPrice} onChange={(v) => set('sellingPrice', v)} />
            <NumField label="Compare-at Price (KD)" value={form.compareAtPrice ?? 0} onChange={(v) => set('compareAtPrice', v || null)} />
            <Field label="Unit" value={form.unit || 'PCS'} onChange={(v) => set('unit', v)} />
            <NumField label="Stock Quantity" value={form.stockQty} onChange={(v) => set('stockQty', Math.round(v))} integer />
            <NumField label="Low-stock Alert" value={form.lowStockAlert} onChange={(v) => set('lowStockAlert', Math.round(v))} integer />
          </div>

          <div className="space-y-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
            <div>
              Margin per unit: <strong className={margin >= 0 ? 'text-emerald-600' : 'text-rose-600'}>{formatKD(margin)}</strong>
            </div>
            {product && (
              <div className="text-slate-600">
                Average cost (from goods receipts):{' '}
                <strong>{formatKD(product.avgCost || product.costPrice)}</strong>
                <span className="block text-xs text-slate-500">
                  Maintained by the stock ledger — receive a purchase order to change it. Editing the quantity above
                  posts a stock adjustment.
                </span>
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <span className="label">Description (English)</span>
              <textarea value={form.description || ''} onChange={(e) => set('description', e.target.value)} rows={3} className="input" />
            </div>
            <div>
              <span className="label">Description (Arabic) — الوصف بالعربية</span>
              <textarea value={form.descriptionAr || ''} onChange={(e) => set('descriptionAr', e.target.value)} rows={3} dir="rtl" className="input" />
            </div>
          </div>

          <div className="flex flex-wrap gap-5">
            <Toggle label="Active" checked={form.isActive} onChange={(v) => set('isActive', v)} />
            <Toggle label="Featured" checked={form.isFeatured} onChange={(v) => set('isFeatured', v)} />
            <Toggle label="Best Seller" checked={form.isBestSeller} onChange={(v) => set('isBestSeller', v)} />
          </div>
        </div>

        <div className="sticky bottom-0 flex justify-end gap-3 border-t border-slate-100 bg-white px-6 py-4">
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button onClick={save} disabled={saving} className="btn-primary">
            {saving ? <Loader2 size={18} className="animate-spin" /> : product ? 'Save Changes' : 'Create Product'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, dir }: { label: string; value: string; onChange: (v: string) => void; dir?: 'rtl' | 'ltr' }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} dir={dir} className="input" />
    </label>
  );
}
function NumField({ label, value, onChange, integer }: { label: string; value: number; onChange: (v: number) => void; integer?: boolean }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input type="number" min={0} step={integer ? 1 : 0.001} value={value} onChange={(e) => onChange(Number(e.target.value))} className="input" />
    </label>
  );
}
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4" />
      {label}
    </label>
  );
}
