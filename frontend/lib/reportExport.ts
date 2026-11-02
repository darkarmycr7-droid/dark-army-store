import { formatKD } from './money';

export interface ReportColumn { key: string; label: string; money?: boolean }
export interface SummaryItem { label: string; value: string | number; money?: boolean }
export interface ReportData {
  title: string;
  columns: ReportColumn[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows: Record<string, any>[];
  summary: SummaryItem[];
}

/** Human display value (money → "KD x.xxx"). Used for the table + PDF. */
export function display(value: unknown, money?: boolean): string {
  if (value == null) return '';
  return money ? formatKD(Number(value)) : String(value);
}

function fileBase(title: string) {
  return `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${new Date().toISOString().slice(0, 10)}`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---- CSV ----
export function exportCSV(d: ReportData) {
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [d.columns.map((c) => esc(c.label)).join(',')];
  for (const row of d.rows) lines.push(d.columns.map((c) => esc(row[c.key])).join(','));
  lines.push('');
  for (const s of d.summary) lines.push(`${esc(s.label)},${esc(s.value)}`);
  downloadBlob(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' }), `${fileBase(d.title)}.csv`);
}

// ---- Excel (xlsx, dynamically imported) ----
export async function exportExcel(d: ReportData) {
  const XLSX = await import('xlsx');
  const aoa: (string | number)[][] = [d.columns.map((c) => c.label)];
  for (const row of d.rows) aoa.push(d.columns.map((c) => (row[c.key] ?? '') as string | number));
  aoa.push([]);
  for (const s of d.summary) aoa.push([s.label, s.value as string | number]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = d.columns.map((c) => ({ wch: Math.max(12, c.label.length + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, d.title.slice(0, 31));
  XLSX.writeFile(wb, `${fileBase(d.title)}.xlsx`);
}

// ---- PDF (jspdf + autotable, dynamically imported) ----
export async function exportPDF(d: ReportData, subtitle?: string) {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF({ orientation: d.columns.length > 6 ? 'landscape' : 'portrait' });

  doc.setFontSize(16);
  doc.setTextColor(31, 85, 224);
  doc.text('Dark-Army Store', 14, 16);
  doc.setTextColor(15, 27, 45);
  doc.setFontSize(13);
  doc.text(d.title, 14, 24);
  if (subtitle) {
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(subtitle, 14, 30);
  }

  autoTable(doc, {
    startY: 34,
    head: [d.columns.map((c) => c.label)],
    body: d.rows.map((row) => d.columns.map((c) => display(row[c.key], c.money))),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [31, 85, 224] },
    alternateRowStyles: { fillColor: [245, 248, 255] },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let y = (doc as any).lastAutoTable.finalY + 8;
  doc.setFontSize(11);
  doc.setTextColor(15, 27, 45);
  doc.text('Summary', 14, y);
  doc.setFontSize(10);
  for (const s of d.summary) {
    y += 6;
    doc.setTextColor(71, 85, 105);
    doc.text(`${s.label}:`, 14, y);
    doc.setTextColor(15, 27, 45);
    doc.text(display(s.value, s.money), 60, y);
  }

  doc.save(`${fileBase(d.title)}.pdf`);
}
