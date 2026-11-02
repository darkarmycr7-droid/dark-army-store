import { IdCard } from 'lucide-react';
import type { DocStatus, EmployeeStatus, EmployeeTag } from '@/lib/adminApi';

/**
 * The pills on an employee card and row, copied from the reference instance.
 *
 * Measured there: 12px text, weight 500, ~3px/10px padding, fully rounded, and
 * a SOLID fill with dark text — not the tinted-background style used elsewhere
 * in this admin. That contrast is the point: status is the first thing scanned
 * across a wall of 382 cards.
 */

const STATUS_STYLE: Record<EmployeeStatus, string> = {
  WORKING: 'bg-odoo-ok text-black',
  ON_PROBATION: 'bg-odoo-warn text-black',
  ON_LEAVE: 'bg-odoo-info text-black',
  ON_NOTICE: 'bg-odoo-lift text-black',
  SEVERANCE: 'bg-odoo-faint text-black',
  TERMINATED: 'bg-odoo-bad text-white',
};

export const STATUS_LABEL: Record<EmployeeStatus, string> = {
  WORKING: 'Working',
  ON_PROBATION: 'On Probation',
  ON_LEAVE: 'On Leave',
  ON_NOTICE: 'On Notice',
  SEVERANCE: 'Severance',
  TERMINATED: 'Terminated',
};

export function StatusBadge({ status }: { status: EmployeeStatus }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-[3px] text-xs font-medium leading-none ${STATUS_STYLE[status] || STATUS_STYLE.WORKING}`}>
      {STATUS_LABEL[status] || status}
    </span>
  );
}

const DOC_STYLE: Record<DocStatus, string> = {
  valid: 'bg-odoo-ok text-black',
  expiring: 'bg-odoo-warn text-black',
  expired: 'bg-odoo-bad text-white',
  undated: 'bg-odoo-raised text-odoo-dim',
  missing: 'bg-odoo-raised text-odoo-faint',
};

const DOC_LABEL: Record<DocStatus, string> = {
  valid: 'Valid',
  expiring: 'Expiring Soon',
  expired: 'Expired',
  // The reference has no word for these two; it just shows nothing, which hides
  // the very records HR needs to chase.
  undated: 'No expiry',
  missing: 'Missing',
};

export function DocBadge({ label, status }: { label: string; status: DocStatus }) {
  return (
    <span className={`inline-block rounded px-1.5 py-[3px] text-[11px] font-medium leading-none ${DOC_STYLE[status]}`}>
      {label}: {DOC_LABEL[status]}
    </span>
  );
}

/**
 * The employee-number pill, with the badge icon the reference puts beside it.
 *
 * The prop is `value`, NOT `ref` — React reserves `ref`, and passing a string
 * to it on a function component throws at runtime rather than failing to type.
 */
export function EmployeeIdPill({ value }: { value: string | null }) {
  if (!value) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded bg-odoo-primary px-1.5 py-[3px] text-[11px] font-medium leading-none text-white">
      <IdCard size={11} /> {value}
    </span>
  );
}

const TAG_STYLE: Record<string, string> = {
  slate: 'bg-slate-500/25 text-slate-300',
  sky: 'bg-sky-500/25 text-sky-300',
  emerald: 'bg-emerald-500/25 text-emerald-300',
  amber: 'bg-amber-500/25 text-amber-300',
  rose: 'bg-rose-500/25 text-rose-300',
  violet: 'bg-violet-500/25 text-violet-300',
  teal: 'bg-teal-500/25 text-teal-300',
  orange: 'bg-orange-500/25 text-orange-300',
  stone: 'bg-stone-500/25 text-stone-300',
};

export function TagPill({ tag }: { tag: EmployeeTag }) {
  return (
    <span className={`inline-block rounded px-1.5 py-[3px] text-[11px] font-medium leading-none ${TAG_STYLE[tag.color] || TAG_STYLE.slate}`}>
      {tag.name}
    </span>
  );
}
