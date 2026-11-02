'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Loader2, Building2, User, Mail, Phone, Globe, MapPin, ShoppingBag,
  ClipboardList, Archive, ArchiveRestore, Save, X, Users,
} from 'lucide-react';
import { adminApi, Partner, PartnerDetail, PartnerInput, PartnerTag } from '@/lib/adminApi';
import { formatKD } from '@/lib/money';
import ViewShell, { SmartButton, Notebook, ViewMode } from '@/components/odoo/ViewShell';
import Chatter from '@/components/odoo/Chatter';

const FILTERS = [
  { key: 'customers', label: 'Customers' },
  { key: 'suppliers', label: 'Suppliers' },
  { key: 'companies', label: 'Companies' },
  { key: 'individuals', label: 'Individuals' },
  { key: 'archived', label: 'Archived' },
];
const GROUPS = [
  { key: 'type', label: 'Contact Type' },
  { key: 'city', label: 'City' },
  { key: 'area', label: 'Area' },
  { key: 'country', label: 'Country' },
];
const PAGE = 40;

const EMPTY: PartnerInput = {
  name: '', nameAr: '', ref: '', isCompany: true, parentId: null,
  customerRank: 1, supplierRank: 0, jobTitle: '', email: '', phone: '', mobile: '',
  website: '', vat: '', street: '', street2: '', area: '', block: '', building: '',
  floor: '', city: '', country: 'Kuwait', zip: '', imageUrl: '', comment: '',
  paymentTerms: 'CASH', creditLimit: 0, active: true, tagIds: [],
};

export default function ContactsPage() {
  const [rows, setRows] = useState<Partner[] | null>(null);
  const [total, setTotal] = useState(0);
  const [groups, setGroups] = useState<{ key: string; label: string; count: number }[] | undefined>();
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState<string[]>([]);
  const [groupBy, setGroupBy] = useState('');
  const [view, setView] = useState<ViewMode>('kanban');
  const [skip, setSkip] = useState(0);
  const [openId, setOpenId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    adminApi
      .partners({ q, filters, groupBy, skip, limit: PAGE })
      .then((d) => { setRows(d.rows); setTotal(d.total); setGroups(d.groups); })
      .catch(() => { setRows([]); setTotal(0); });
  }, [q, filters, groupBy, skip]);

  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);
  useEffect(() => { setSkip(0); }, [q, filters, groupBy]);

  const toggleFilter = (key: string) =>
    setFilters((f) => (f.includes(key) ? f.filter((x) => x !== key) : [...f, key]));

  if (creating || openId != null) {
    return (
      <ContactForm
        id={openId}
        onClose={() => { setCreating(false); setOpenId(null); load(); }}
      />
    );
  }

  return (
    <ViewShell
      title="Contacts"
      onNew={() => setCreating(true)}
      newLabel="New Contact"
      search={q}
      onSearch={setQ}
      searchPlaceholder="Search name, email, phone, tax ID…"
      filters={FILTERS}
      activeFilters={filters}
      onToggleFilter={toggleFilter}
      groups={GROUPS}
      activeGroup={groupBy}
      onGroup={setGroupBy}
      view={view}
      onView={setView}
      skip={skip}
      take={PAGE}
      total={total}
      onPage={setSkip}
    >
      {groups && (
        <div className="flex flex-wrap gap-2">
          {groups.map((g) => (
            <span key={g.key} className="rounded-lg bg-white px-3 py-1.5 text-sm shadow-sm">
              <span className="font-semibold">{g.label}</span>
              <span className="ml-2 rounded bg-slate-100 px-1.5 text-xs font-bold text-slate-600">{g.count}</span>
            </span>
          ))}
        </div>
      )}

      {!rows ? (
        <div className="grid place-items-center py-24 text-slate-400"><Loader2 className="animate-spin" /></div>
      ) : rows.length === 0 ? (
        <div className="card grid place-items-center py-24 text-slate-400">No contacts match this search.</div>
      ) : view === 'kanban' ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {rows.map((p) => <ContactCard key={p.id} p={p} onOpen={() => setOpenId(p.id)} />)}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">City</th>
                  <th className="px-4 py-3">Tags</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((p) => (
                  <tr key={p.id} onClick={() => setOpenId(p.id)} className={`cursor-pointer hover:bg-slate-50 ${!p.active ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2 font-semibold">
                        {p.isCompany ? <Building2 size={15} className="text-slate-400" /> : <User size={15} className="text-slate-400" />}
                        {p.name}
                      </span>
                      {p.parentName && <div className="ml-6 text-xs text-slate-400">{p.parentName}</div>}
                    </td>
                    <td className="px-4 py-3"><TypeBadges p={p} /></td>
                    <td className="px-4 py-3 text-slate-500">{p.email || '—'}</td>
                    <td className="px-4 py-3 text-slate-500">{p.phone || p.mobile || '—'}</td>
                    <td className="px-4 py-3 text-slate-500">{p.city || p.area || '—'}</td>
                    <td className="px-4 py-3"><Tags tags={p.tags} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </ViewShell>
  );
}

function TypeBadges({ p }: { p: Partner }) {
  return (
    <span className="flex flex-wrap gap-1">
      {p.customerRank > 0 && <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">CUSTOMER</span>}
      {p.supplierRank > 0 && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">SUPPLIER</span>}
      {!p.active && <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">ARCHIVED</span>}
    </span>
  );
}

// Tailwind purges classes it can't see as complete strings, so tag colours are
// looked up from a static map rather than built with `bg-${color}-100`.
const TAG_COLORS: Record<string, string> = {
  slate: 'bg-slate-100 text-slate-700',
  amber: 'bg-amber-100 text-amber-700',
  sky: 'bg-sky-100 text-sky-700',
  emerald: 'bg-emerald-100 text-emerald-700',
  rose: 'bg-rose-100 text-rose-700',
  violet: 'bg-violet-100 text-violet-700',
};

function Tags({ tags }: { tags: PartnerTag[] }) {
  if (!tags.length) return <span className="text-slate-300">—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {tags.map((t) => (
        <span key={t.id} className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${TAG_COLORS[t.color] || TAG_COLORS.slate}`}>
          {t.name}
        </span>
      ))}
    </span>
  );
}

function ContactCard({ p, onOpen }: { p: Partner; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className={`card flex gap-3 p-4 text-left transition hover:shadow-md ${!p.active ? 'opacity-50' : ''}`}>
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
        {p.isCompany ? <Building2 size={19} /> : <User size={19} />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate font-bold">{p.name}</div>
        {p.parentName && <div className="truncate text-xs text-slate-400">{p.parentName}</div>}
        {p.jobTitle && <div className="truncate text-xs text-slate-500">{p.jobTitle}</div>}
        <div className="mt-1 space-y-0.5 text-xs text-slate-500">
          {p.email && <div className="flex items-center gap-1 truncate"><Mail size={11} /> {p.email}</div>}
          {(p.phone || p.mobile) && <div className="flex items-center gap-1"><Phone size={11} /> {p.phone || p.mobile}</div>}
          {(p.city || p.area) && <div className="flex items-center gap-1 truncate"><MapPin size={11} /> {p.city || p.area}</div>}
        </div>
        <div className="mt-2 flex flex-wrap gap-1"><TypeBadges p={p} /><Tags tags={p.tags} /></div>
      </div>
    </button>
  );
}

// ---------- Form view ----------

function ContactForm({ id, onClose }: { id: number | null; onClose: () => void }) {
  const [form, setForm] = useState<PartnerInput>(EMPTY);
  const [detail, setDetail] = useState<PartnerDetail | null>(null);
  const [allTags, setAllTags] = useState<PartnerTag[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);

  const set = (k: keyof PartnerInput, v: any) => { setForm((f) => ({ ...f, [k]: v })); setDirty(true); };

  useEffect(() => {
    adminApi.partnerTags().then(setAllTags).catch(() => setAllTags([]));
    if (id == null) return;
    adminApi.partner(id).then((d) => {
      setDetail(d);
      setForm({ ...d, tagIds: d.tags.map((t) => t.id) } as PartnerInput);
    }).catch((e) => setError(e.message));
  }, [id]);

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      if (id == null) await adminApi.createPartner(form);
      else await adminApi.updatePartner(id, form);
      onClose();
    } catch (e: any) {
      setError(e.message || 'Could not save the contact');
      setSaving(false);
    }
  };

  const archive = async () => {
    if (id == null) return;
    await adminApi.archivePartner(id, !form.active);
    onClose();
  };

  const toggleTag = (tagId: number) =>
    set('tagIds', form.tagIds?.includes(tagId) ? form.tagIds.filter((t) => t !== tagId) : [...(form.tagIds || []), tagId]);

  if (id != null && !detail) {
    return <div className="grid place-items-center py-24 text-slate-400"><Loader2 className="animate-spin" /></div>;
  }

  return (
    <ViewShell
      title="Contacts"
      breadcrumb={id == null ? 'New' : form.name || '—'}
      onBack={onClose}
      search=""
      onSearch={() => {}}
    >
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={save} disabled={saving || !dirty} className="btn-primary disabled:opacity-40">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <><Save size={16} /> Save</>}
        </button>
        <button onClick={onClose} className="btn-ghost"><X size={16} /> Discard</button>
        {id != null && (
          <button onClick={archive} className="btn-ghost ml-auto">
            {form.active ? <><Archive size={15} /> Archive</> : <><ArchiveRestore size={15} /> Unarchive</>}
          </button>
        )}
      </div>

      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}
      {!form.active && (
        <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-600">This contact is archived.</p>
      )}

      <div className="card p-6">
        {/* Smart buttons */}
        {detail && (
          <div className="mb-5 flex flex-wrap justify-end gap-2">
            <SmartButton Icon={ShoppingBag} label="Sales Orders" value={detail.stats.orderCount} />
            <SmartButton Icon={ClipboardList} label="Purchases" value={detail.stats.poCount} />
            <SmartButton Icon={Users} label="Contacts" value={detail.childCount} />
          </div>
        )}

        {/* Type toggle */}
        <div className="mb-4 flex gap-4">
          {[{ v: true, label: 'Company', Icon: Building2 }, { v: false, label: 'Individual', Icon: User }].map((o) => (
            <label key={o.label} className="flex cursor-pointer items-center gap-2 text-sm font-medium">
              <input type="radio" checked={form.isCompany === o.v} onChange={() => set('isCompany', o.v)} className="h-4 w-4" />
              <o.Icon size={15} /> {o.label}
            </label>
          ))}
        </div>

        <input
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder={form.isCompany ? 'Company name' : 'Full name'}
          className="mb-4 w-full border-0 border-b border-slate-200 px-0 pb-2 text-2xl font-extrabold outline-none focus:border-brand-500"
        />

        <div className="grid gap-x-8 gap-y-4 lg:grid-cols-2">
          <div className="space-y-3">
            {!form.isCompany && (
              <Field label="Job Position" value={form.jobTitle} onChange={(v) => set('jobTitle', v)} />
            )}
            <Field label="Name (Arabic)" value={form.nameAr} onChange={(v) => set('nameAr', v)} dir="rtl" />
            <Field label="Reference" value={form.ref} onChange={(v) => set('ref', v)} />
            <Field label="Tax ID / CR" value={form.vat} onChange={(v) => set('vat', v)} />
            <div>
              <span className="label">Contact Type</span>
              <div className="flex gap-4 pt-1">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.customerRank > 0} onChange={(e) => set('customerRank', e.target.checked ? 1 : 0)} className="h-4 w-4" />
                  Customer
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.supplierRank > 0} onChange={(e) => set('supplierRank', e.target.checked ? 1 : 0)} className="h-4 w-4" />
                  Supplier
                </label>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <Field label="Email" value={form.email} onChange={(v) => set('email', v)} type="email" Icon={Mail} />
            <Field label="Phone" value={form.phone} onChange={(v) => set('phone', v)} Icon={Phone} />
            <Field label="Mobile" value={form.mobile} onChange={(v) => set('mobile', v)} Icon={Phone} />
            <Field label="Website" value={form.website} onChange={(v) => set('website', v)} Icon={Globe} />
          </div>
        </div>

        {/* Tags */}
        <div className="mt-5">
          <span className="label">Tags</span>
          <div className="flex flex-wrap gap-2 pt-1">
            {allTags.map((t) => (
              <button
                key={t.id}
                onClick={() => toggleTag(t.id)}
                className={`rounded-full px-3 py-1 text-xs font-bold ${form.tagIds?.includes(t.id) ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >{t.name}</button>
            ))}
            {allTags.length === 0 && <span className="text-sm text-slate-400">No tags yet.</span>}
          </div>
        </div>

        <div className="mt-6">
          <Notebook
            tabs={[
              {
                label: 'Address',
                content: (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <Field label="Street" value={form.street} onChange={(v) => set('street', v)} />
                    <Field label="Street 2" value={form.street2} onChange={(v) => set('street2', v)} />
                    <Field label="Area / Governorate" value={form.area} onChange={(v) => set('area', v)} />
                    <Field label="Block" value={form.block} onChange={(v) => set('block', v)} />
                    <Field label="Building" value={form.building} onChange={(v) => set('building', v)} />
                    <Field label="Floor" value={form.floor} onChange={(v) => set('floor', v)} />
                    <Field label="City" value={form.city} onChange={(v) => set('city', v)} />
                    <Field label="Country" value={form.country} onChange={(v) => set('country', v)} />
                    <Field label="ZIP" value={form.zip} onChange={(v) => set('zip', v)} />
                  </div>
                ),
              },
              {
                label: 'Sales & Purchase',
                content: (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <span className="label">Payment Terms</span>
                      <select value={form.paymentTerms ?? 'CASH'} onChange={(e) => set('paymentTerms', e.target.value)} className="input">
                        {['CASH', 'NET7', 'NET15', 'NET30'].map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <span className="label">Credit Limit (KD)</span>
                      <input type="number" min={0} step="0.001" value={form.creditLimit} onChange={(e) => set('creditLimit', Number(e.target.value))} className="input" />
                      <span className="mt-1 block text-xs text-slate-500">Currently {formatKD(form.creditLimit)}</span>
                    </div>
                  </div>
                ),
              },
              {
                label: 'Internal Notes',
                content: (
                  <textarea value={form.comment ?? ''} onChange={(e) => set('comment', e.target.value)} rows={5} className="input" placeholder="Notes visible to staff only…" />
                ),
              },
              ...(detail && detail.children.length
                ? [{
                    label: `Contacts (${detail.children.length})`,
                    content: (
                      <ul className="divide-y divide-slate-100">
                        {detail.children.map((c) => (
                          <li key={c.id} className="flex items-center justify-between py-2 text-sm">
                            <span><strong>{c.name}</strong>{c.jobTitle && <span className="text-slate-500"> · {c.jobTitle}</span>}</span>
                            <span className="text-slate-500">{c.email || c.phone || ''}</span>
                          </li>
                        ))}
                      </ul>
                    ),
                  }]
                : []),
            ]}
          />
        </div>
      </div>

      {id != null && (
        <Chatter
          load={() => adminApi.partnerMessages(id)}
          post={(body) => adminApi.postPartnerMessage(id, body)}
        />
      )}
    </ViewShell>
  );
}

function Field({
  label, value, onChange, type = 'text', dir, Icon,
}: {
  label: string; value?: string | null; onChange: (v: string) => void;
  type?: string; dir?: string; Icon?: typeof Mail;
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <span className="relative block">
        {Icon && <Icon size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />}
        <input
          type={type}
          dir={dir}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className={`input ${Icon ? 'pl-9' : ''}`}
        />
      </span>
    </label>
  );
}
