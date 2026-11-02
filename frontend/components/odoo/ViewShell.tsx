'use client';

import { useState, useRef, useEffect } from 'react';
import {
  ChevronLeft, ChevronRight, List, LayoutGrid, Search, X, Filter,
  Layers, ChevronDown, Plus, Check,
} from 'lucide-react';

/**
 * Odoo-style view chrome, reused by every module.
 *
 * Gives you: breadcrumb + New button, a search bar with Filters / Group By
 * dropdowns and removable facets, a pager, and a list/kanban view switcher.
 * A module supplies its own filter and group-by definitions and renders its
 * own rows — everything else is shared.
 */

export type ViewMode = 'list' | 'kanban';

export interface FilterDef {
  key: string;
  label: string;
}
export interface GroupDef {
  key: string;
  label: string;
}

export interface ViewShellProps {
  title: string;
  /** e.g. "Contacts / Gulf Trading Co." — the trailing crumb of a form view. */
  breadcrumb?: string;
  onBack?: () => void;
  onNew?: () => void;
  newLabel?: string;

  search: string;
  onSearch: (v: string) => void;
  searchPlaceholder?: string;

  filters?: FilterDef[];
  activeFilters?: string[];
  onToggleFilter?: (key: string) => void;

  groups?: GroupDef[];
  activeGroup?: string;
  onGroup?: (key: string) => void;

  view?: ViewMode;
  onView?: (v: ViewMode) => void;

  /** Pager — omit total to hide it. */
  skip?: number;
  take?: number;
  total?: number;
  onPage?: (skip: number) => void;

  children: React.ReactNode;
}

export default function ViewShell(p: ViewShellProps) {
  const showPager = p.total !== undefined && p.take !== undefined && p.skip !== undefined;
  const from = showPager ? Math.min(p.skip! + 1, p.total!) : 0;
  const to = showPager ? Math.min(p.skip! + p.take!, p.total!) : 0;

  return (
    <div className="space-y-4">
      {/* Control panel */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {p.onBack && (
            <button onClick={p.onBack} className="grid h-7 w-7 place-items-center rounded hover:bg-white/[.08]">
              <ChevronLeft size={17} />
            </button>
          )}
          <div className="min-w-0">
            <h1 className="truncate text-xl font-extrabold">
              {p.breadcrumb ? (
                <>
                  <button onClick={p.onBack} className="text-odoo-faint hover:text-odoo-ink">{p.title}</button>
                  <span className="mx-1.5 text-odoo-faint">/</span>
                  {p.breadcrumb}
                </>
              ) : (
                p.title
              )}
            </h1>
          </div>
          {p.onNew && (
            <button onClick={p.onNew} className="btn-primary ml-2 shrink-0">
              <Plus size={15} /> {p.newLabel || 'New'}
            </button>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {showPager && p.total! > 0 && (
            <div className="flex items-center gap-1 text-[13px] text-odoo-dim">
              <span className="tabular-nums">{from}-{to} / {p.total}</span>
              <button
                disabled={p.skip! <= 0}
                onClick={() => p.onPage?.(Math.max(0, p.skip! - p.take!))}
                className="grid h-7 w-7 place-items-center rounded hover:bg-white/[.08] disabled:opacity-30"
              ><ChevronLeft size={15} /></button>
              <button
                disabled={to >= p.total!}
                onClick={() => p.onPage?.(p.skip! + p.take!)}
                className="grid h-7 w-7 place-items-center rounded hover:bg-white/[.08] disabled:opacity-30"
              ><ChevronRight size={15} /></button>
            </div>
          )}
          {p.view && p.onView && (
            <div className="flex h-[33px] overflow-hidden rounded border border-odoo-line">
              {(['list', 'kanban'] as ViewMode[]).map((v) => (
                <button
                  key={v}
                  onClick={() => p.onView!(v)}
                  title={v === 'list' ? 'List' : 'Kanban'}
                  className={`grid w-9 place-items-center ${p.view === v ? 'bg-odoo-primary text-white' : 'text-odoo-dim hover:bg-white/[.06]'}`}
                >
                  {v === 'list' ? <List size={15} /> : <LayoutGrid size={15} />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Search bar with facets */}
      {!p.breadcrumb && (
        <div className="flex min-h-[33px] flex-wrap items-center gap-2 rounded border border-odoo-line bg-odoo-surface px-2.5 py-1">
          <Search size={15} className="shrink-0 text-odoo-faint" />

          {p.activeFilters?.map((key) => {
            const f = p.filters?.find((x) => x.key === key);
            if (!f) return null;
            return (
              <span key={key} className="inline-flex items-center gap-1 rounded bg-odoo-primary/25 px-2 py-0.5 text-xs font-semibold text-odoo-lift">
                {f.label}
                <button onClick={() => p.onToggleFilter?.(key)}><X size={12} /></button>
              </span>
            );
          })}
          {p.activeGroup && (
            <span className="inline-flex items-center gap-1 rounded bg-odoo-info/15 px-2 py-0.5 text-xs font-semibold text-odoo-info">
              {p.groups?.find((g) => g.key === p.activeGroup)?.label}
              <button onClick={() => p.onGroup?.('')}><X size={12} /></button>
            </span>
          )}

          <input
            value={p.search}
            onChange={(e) => p.onSearch(e.target.value)}
            placeholder={p.searchPlaceholder || 'Search…'}
            className="min-w-[120px] flex-1 bg-transparent py-1 text-sm outline-none"
          />

          {!!p.filters?.length && (
            <Dropdown label="Filters" Icon={Filter}>
              {p.filters.map((f) => (
                <DropdownItem
                  key={f.key}
                  checked={p.activeFilters?.includes(f.key)}
                  onClick={() => p.onToggleFilter?.(f.key)}
                >{f.label}</DropdownItem>
              ))}
            </Dropdown>
          )}
          {!!p.groups?.length && (
            <Dropdown label="Group By" Icon={Layers}>
              {p.groups.map((g) => (
                <DropdownItem key={g.key} checked={p.activeGroup === g.key} onClick={() => p.onGroup?.(p.activeGroup === g.key ? '' : g.key)}>
                  {g.label}
                </DropdownItem>
              ))}
            </Dropdown>
          )}
        </div>
      )}

      {p.children}
    </div>
  );
}

function Dropdown({ label, Icon, children }: { label: string; Icon: typeof Filter; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 rounded px-2 py-1 text-[13px] text-odoo-dim hover:bg-white/[.08]"
      >
        <Icon size={14} /> {label} <ChevronDown size={13} />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 min-w-[180px] rounded border border-odoo-line bg-odoo-surface py-1 shadow-xl">
          {children}
        </div>
      )}
    </div>
  );
}

function DropdownItem({ checked, onClick, children }: { checked?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-white/[.06]"
    >
      <span className="grid h-4 w-4 place-items-center">{checked && <Check size={13} className="text-odoo-lift" />}</span>
      {children}
    </button>
  );
}

/** Smart button — the counters across the top of an Odoo form view. */
export function SmartButton({
  Icon, label, value, onClick,
}: { Icon: typeof Filter; label: string; value: string | number; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className="flex items-center gap-2 rounded border border-odoo-line px-3 py-2 text-left hover:bg-white/[.06] disabled:cursor-default disabled:hover:bg-transparent"
    >
      <Icon size={17} className="text-odoo-faint" />
      <span>
        <span className="block text-sm font-extrabold leading-4">{value}</span>
        <span className="block text-xs text-odoo-faint">{label}</span>
      </span>
    </button>
  );
}

/**
 * Status bar — the pipeline of stages across the top-right of an Odoo form.
 * Stages before the current one read as completed; the current one is filled.
 *
 * Pass `onSelect` to make it clickable, the way Odoo's `statusbar` widget with
 * `clickable="1"` behaves — the stage IS the control, so there is no separate
 * dropdown to go and find.
 */
export function StatusBar({
  stages, current, onSelect, align = 'end',
}: {
  stages: { key: string; label: string }[];
  current: string;
  onSelect?: (key: string) => void;
  align?: 'start' | 'end' | 'center';
}) {
  const idx = stages.findIndex((s) => s.key === current);
  const justify = align === 'start' ? 'justify-start' : align === 'center' ? 'justify-center' : 'justify-end';

  return (
    <div className={`flex flex-wrap gap-1 ${justify}`}>
      {stages.map((s, i) => {
        const isCurrent = s.key === current;
        const done = idx >= 0 && i < idx;
        const tone = isCurrent
          ? 'bg-odoo-primary text-white'
          : done ? 'bg-odoo-primary/25 text-odoo-lift' : 'bg-odoo-raised text-odoo-faint';

        if (!onSelect) {
          return <span key={s.key} className={`rounded-full px-3 py-1 text-xs font-bold ${tone}`}>{s.label}</span>;
        }
        return (
          <button
            key={s.key}
            type="button"
            onClick={() => !isCurrent && onSelect(s.key)}
            aria-current={isCurrent}
            className={`rounded-full px-3 py-1 text-xs font-bold transition ${tone} ${
              isCurrent ? 'cursor-default' : 'hover:bg-odoo-primary/40 hover:text-odoo-ink'
            }`}
          >{s.label}</button>
        );
      })}
    </div>
  );
}

/** Notebook — the tabbed section at the bottom of an Odoo form. */
export function Notebook({ tabs }: { tabs: { label: string; content: React.ReactNode }[] }) {
  const [active, setActive] = useState(0);
  return (
    <div>
      <div className="flex gap-1 border-b border-odoo-line">
        {tabs.map((t, i) => (
          <button
            key={t.label}
            onClick={() => setActive(i)}
            className={`-mb-px border-b-2 px-4 py-2 text-[13px] font-medium ${i === active ? 'border-odoo-lift text-odoo-ink' : 'border-transparent text-odoo-dim hover:text-odoo-ink'}`}
          >{t.label}</button>
        ))}
      </div>
      <div className="py-4">{tabs[active]?.content}</div>
    </div>
  );
}
