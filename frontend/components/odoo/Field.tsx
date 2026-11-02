'use client';

import type { LucideIcon } from 'lucide-react';

/**
 * Form fields for the Odoo-style form views.
 *
 * A label above a control, at the reference's metrics (12px label, 33px
 * control, 4px radius) — the same shape whether the control is text, a date, a
 * dropdown or a checkbox, so a form reads as one grid rather than a pile of
 * differently sized inputs.
 */

export function Field({
  label, value, onChange, type = 'text', placeholder, Icon, dir, hint, disabled, required,
}: {
  label: string;
  value: string | null | undefined;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  Icon?: LucideIcon;
  dir?: 'rtl' | 'ltr';
  hint?: string;
  disabled?: boolean;
  required?: boolean;
}) {
  return (
    <div>
      <span className="label">
        {label}
        {required && <span className="ml-0.5 text-odoo-bad">*</span>}
      </span>
      <div className="relative">
        {Icon && <Icon size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-odoo-faint" />}
        <input
          type={type}
          dir={dir}
          disabled={disabled}
          value={value ?? ''}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={`input ${Icon ? 'pl-8' : ''}`}
        />
      </div>
      {hint && <p className="mt-1 text-[11px] text-odoo-faint">{hint}</p>}
    </div>
  );
}

export function NumberField({
  label, value, onChange, step = '0.001', min, suffix, hint,
}: {
  label: string;
  value: number | null | undefined;
  onChange: (v: number) => void;
  step?: string;
  min?: number;
  suffix?: string;
  hint?: string;
}) {
  return (
    <div>
      <span className="label">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="number"
          step={step}
          min={min}
          value={value ?? 0}
          onChange={(e) => onChange(Number(e.target.value))}
          className="input tabular-nums"
        />
        {suffix && <span className="shrink-0 text-[13px] text-odoo-dim">{suffix}</span>}
      </div>
      {hint && <p className="mt-1 text-[11px] text-odoo-faint">{hint}</p>}
    </div>
  );
}

export function SelectField<T extends string | number>({
  label, value, onChange, options, placeholder = '—', hint, required,
}: {
  label: string;
  value: T | null | undefined;
  onChange: (v: T | null) => void;
  options: { value: T; label: string }[];
  placeholder?: string;
  hint?: string;
  required?: boolean;
}) {
  return (
    <div>
      <span className="label">
        {label}
        {required && <span className="ml-0.5 text-odoo-bad">*</span>}
      </span>
      <select
        value={value ?? ''}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '') return onChange(null);
          // Keep the option's original type — numeric ids must come back as numbers.
          const match = options.find((o) => String(o.value) === raw);
          onChange((match ? match.value : (raw as T)) as T);
        }}
        className="input"
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>{o.label}</option>
        ))}
      </select>
      {hint && <p className="mt-1 text-[11px] text-odoo-faint">{hint}</p>}
    </div>
  );
}

export function CheckField({
  label, checked, onChange, hint,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2 pt-5">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4" />
      <span>
        <span className="text-[13px] font-medium">{label}</span>
        {hint && <span className="block text-[11px] text-odoo-faint">{hint}</span>}
      </span>
    </label>
  );
}

/** A read-only label/value pair, for facts the form displays but cannot edit. */
export function ReadField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="label">{label}</span>
      <div className="pt-0.5 text-[13px]">{children}</div>
    </div>
  );
}
