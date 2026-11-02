'use client';

import { useState } from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * Odoo's `<searchpanel>` — the category rail down the left of a list or kanban.
 *
 * Measured from the reference: 220px wide, on the surface colour, a 1px right
 * border, 29px rows at 14px. "All" clears the selection; clicking rows
 * multi-selects, which is what `select="multi"` means there.
 *
 * It collapses, because on a 1280px laptop 220px is the difference between four
 * kanban columns and three.
 */

export interface SearchPanelItem {
  id: number | string;
  label: string;
  sublabel?: string | null;
  count: number;
}

export default function SearchPanel({
  title, Icon, items, selected, onToggle, onClear, total, totalLabel = 'All',
}: {
  title: string;
  Icon: LucideIcon;
  items: SearchPanelItem[];
  selected: (number | string)[];
  onToggle: (id: number | string) => void;
  onClear: () => void;
  total: number;
  totalLabel?: string;
}) {
  const [open, setOpen] = useState(true);

  if (!open) {
    return (
      <aside className="shrink-0 border-r border-odoo-line bg-odoo-surface">
        <button
          onClick={() => setOpen(true)}
          title={`Show ${title.toLowerCase()}`}
          className="grid h-9 w-9 place-items-center text-odoo-faint hover:text-odoo-ink"
        >
          <PanelLeftOpen size={15} />
        </button>
      </aside>
    );
  }

  return (
    <aside className="w-[220px] shrink-0 overflow-y-auto border-r border-odoo-line bg-odoo-surface">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <Icon size={13} className="text-odoo-faint" />
        <span className="text-xs font-bold uppercase tracking-widest text-odoo-dim">{title}</span>
        <button
          onClick={() => setOpen(false)}
          title={`Hide ${title.toLowerCase()}`}
          className="ml-auto grid h-5 w-5 place-items-center rounded text-odoo-faint hover:text-odoo-ink"
        >
          <PanelLeftClose size={14} />
        </button>
      </div>

      <button
        onClick={onClear}
        className={`flex h-[29px] w-full items-center justify-between px-3 text-left text-sm ${
          selected.length === 0 ? 'bg-odoo-raised font-semibold text-odoo-ink' : 'text-odoo-dim hover:bg-odoo-raised/60'
        }`}
      >
        <span>{totalLabel}</span>
        <span className="tabular-nums text-xs text-odoo-faint">{total}</span>
      </button>

      {items.map((it) => {
        const active = selected.includes(it.id);
        return (
          <button
            key={it.id}
            onClick={() => onToggle(it.id)}
            title={it.sublabel ? `${it.label} — ${it.sublabel}` : it.label}
            className={`flex h-[29px] w-full items-center justify-between gap-2 px-3 text-left text-sm ${
              active ? 'bg-odoo-primary/30 font-semibold text-odoo-ink' : 'text-odoo-dim hover:bg-odoo-raised/60'
            }`}
          >
            <span className="min-w-0 truncate">{it.label}</span>
            <span className="shrink-0 tabular-nums text-xs text-odoo-faint">{it.count}</span>
          </button>
        );
      })}
    </aside>
  );
}
