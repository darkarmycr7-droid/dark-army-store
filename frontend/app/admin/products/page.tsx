'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, Search, Pencil, Trash2, Loader2, Star, Zap } from 'lucide-react';
import { adminApi, AdminProduct } from '@/lib/adminApi';
import { formatKD } from '@/lib/money';
import ProductModal from '@/components/admin/ProductModal';
import Thumb from '@/components/Thumb';

export default function AdminProductsPage() {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [cats, setCats] = useState<{ id: number; name: string }[]>([]);
  const [q, setQ] = useState('');
  const [lowStock, setLowStock] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AdminProduct | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    adminApi.products(q, lowStock).then(setProducts).finally(() => setLoading(false));
  }, [q, lowStock]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { adminApi.categories().then(setCats).catch(() => {}); }, []);

  const remove = async (p: AdminProduct) => {
    if (!confirm(`Delete "${p.name}"? If it's in past orders it will be deactivated instead.`)) return;
    await adminApi.deleteProduct(p.id);
    load();
  };

  const closeAndReload = () => { setEditing(null); setCreating(false); load(); };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Products</h1>
          <p className="text-slate-500">{products.length} products</p>
        </div>
        <button onClick={() => setCreating(true)} className="btn-primary"><Plus size={18} /> New Product</button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or SKU…" className="input pl-10" />
        </div>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={lowStock} onChange={(e) => setLowStock(e.target.checked)} /> Low stock only
        </label>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">SKU</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3 text-right">Cost</th>
                <th className="px-4 py-3 text-right">Price</th>
                <th className="px-4 py-3 text-right">Stock</th>
                <th className="px-4 py-3">Flags</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={8} className="py-16 text-center text-slate-400"><Loader2 className="mx-auto animate-spin" /></td></tr>
              ) : products.length === 0 ? (
                <tr><td colSpan={8} className="py-16 text-center text-slate-400">No products found.</td></tr>
              ) : (
                products.map((p) => (
                  <tr key={p.id} className={`hover:bg-slate-50 ${!p.isActive ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg">
                          <Thumb src={p.image} name={p.name} slug={p.slug} categorySlug={p.category?.name?.toLowerCase()} iconSize={18} />
                        </div>
                        <span className="font-medium">{p.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{p.sku}</td>
                    <td className="px-4 py-3 text-slate-500">{p.category?.name || '—'}</td>
                    <td className="px-4 py-3 text-right text-slate-500">{formatKD(p.costPrice)}</td>
                    <td className="px-4 py-3 text-right font-semibold">{formatKD(p.sellingPrice)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-bold ${p.stockQty === 0 ? 'text-rose-600' : p.stockQty <= p.lowStockAlert ? 'text-amber-600' : 'text-slate-700'}`}>
                        {p.stockQty}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 text-slate-300">
                        {p.isFeatured && <Zap size={15} className="text-brand-500" />}
                        {p.isBestSeller && <Star size={15} className="text-amber-400" />}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => setEditing(p)} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-brand-50 hover:text-brand-600"><Pencil size={15} /></button>
                        <button onClick={() => remove(p)} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-rose-50 hover:text-rose-600"><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {(editing || creating) && (
        <ProductModal
          product={editing}
          categories={cats}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSaved={closeAndReload}
        />
      )}
    </div>
  );
}
