import type { PosOrder } from './adminApi';

const kd = (n: number) => `KD ${Number(n || 0).toFixed(3)}`;

/** 80mm thermal-style receipt for a counter sale.
 *  jsPDF is imported dynamically — a static import crashes the Next SSR worker. */
export async function printReceipt(order: PosOrder, change = 0, storeName = 'Dark-Army Store') {
  const { jsPDF } = await import('jspdf');

  const W = 80; // mm — standard thermal roll
  const M = 5;
  // Grow the page with the ticket so nothing is cut off.
  const height = 90 + order.items.length * 9 + order.tenders.length * 5;
  const doc = new jsPDF({ unit: 'mm', format: [W, height] });
  let y = 10;

  const center = (text: string, size: number, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.text(text, W / 2, y, { align: 'center' });
    y += size * 0.45 + 1.5;
  };
  const row = (left: string, right: string, bold = false, size = 8) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.text(left, M, y);
    doc.text(right, W - M, y, { align: 'right' });
    y += size * 0.45 + 1.2;
  };
  const rule = () => {
    doc.setDrawColor(180);
    doc.line(M, y, W - M, y);
    y += 3;
  };

  center(storeName, 12, true);
  center('Kuwait', 8);
  y += 1;
  rule();

  row(order.orderNumber, new Date(order.placedAt).toLocaleDateString(), true);
  row(order.contactName, new Date(order.placedAt).toLocaleTimeString());
  rule();

  for (const it of order.items) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    // Long names wrap rather than run off the roll.
    for (const line of doc.splitTextToSize(it.name, W - M * 2) as string[]) {
      doc.text(line, M, y);
      y += 3.6;
    }
    row(`  ${it.quantity} x ${kd(it.unitPrice)}`, kd(it.lineTotal));
  }

  rule();
  row('Subtotal', kd(order.subtotal));
  if (order.discount > 0) row('Discount', `- ${kd(order.discount)}`);
  row('TOTAL', kd(order.total), true, 11);
  y += 1;

  for (const t of order.tenders) row(t.method, kd(t.amount));
  if (change > 0) row('Change', kd(change), true);

  y += 3;
  rule();
  center('Thank you!', 9, true);
  center('Goods exchangeable within 7 days', 7);
  center('with this receipt', 7);

  doc.save(`${order.orderNumber}.pdf`);
}
