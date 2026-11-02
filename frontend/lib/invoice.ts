import type { Order } from './types';

const kd = (n: number) => `KD ${Number(n || 0).toFixed(3)}`;

/** Build and download a clean PDF invoice for an order (client-side only).
 *  jsPDF is imported dynamically so it never loads during SSR. */
export async function downloadInvoice(order: Order, storeName = 'Dark-Army Store') {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF();
  const W = doc.internal.pageSize.getWidth();
  const M = 14;
  let y = 18;

  // Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(31, 85, 224);
  doc.text(storeName, M, y);
  doc.setTextColor(15, 27, 45);
  doc.setFontSize(22);
  doc.text('INVOICE', W - M, y, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  y += 7;
  doc.text('All-in-One Online Store · Kuwait', M, y);
  doc.text(`#${order.orderNumber}`, W - M, y, { align: 'right' });
  y += 5;
  doc.text(new Date(order.placedAt).toLocaleString(), W - M, y, { align: 'right' });

  // Divider
  y += 6;
  doc.setDrawColor(226, 232, 240);
  doc.line(M, y, W - M, y);

  // Bill-to + meta
  y += 8;
  doc.setTextColor(15, 27, 45);
  doc.setFont('helvetica', 'bold');
  doc.text('Bill To', M, y);
  doc.text('Details', W / 2, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  y += 6;
  doc.text(order.contactName, M, y);
  doc.text(`Tracking: ${order.trackingNumber}`, W / 2, y);
  y += 5;
  doc.text(order.contactEmail, M, y);
  doc.text(`Payment: ${order.payMethod}`, W / 2, y);
  y += 5;
  doc.text(order.contactPhone, M, y);
  doc.text(`Status: ${order.status}`, W / 2, y);
  y += 5;
  const addr = [order.shipArea, order.shipBlock && `Block ${order.shipBlock}`].filter(Boolean).join(', ');
  doc.text(addr, M, y);

  // Items table header
  y += 12;
  doc.setFillColor(238, 245, 255);
  doc.rect(M, y - 5, W - 2 * M, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 27, 45);
  doc.text('Item', M + 2, y);
  doc.text('Qty', W - 70, y, { align: 'right' });
  doc.text('Unit', W - 45, y, { align: 'right' });
  doc.text('Total', W - M - 2, y, { align: 'right' });

  // Items
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 65, 85);
  y += 8;
  order.items.forEach((it) => {
    doc.text(doc.splitTextToSize(it.name, 95)[0], M + 2, y);
    doc.text(String(it.quantity), W - 70, y, { align: 'right' });
    doc.text(kd(it.unitPrice), W - 45, y, { align: 'right' });
    doc.text(kd(it.lineTotal), W - M - 2, y, { align: 'right' });
    y += 7;
  });

  // Totals
  y += 2;
  doc.setDrawColor(226, 232, 240);
  doc.line(W / 2, y, W - M, y);
  y += 6;
  const row = (label: string, value: string, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setTextColor(bold ? 15 : 71, bold ? 27 : 85, bold ? 45 : 105);
    doc.text(label, W - 70, y);
    doc.text(value, W - M - 2, y, { align: 'right' });
    y += 6;
  };
  row('Subtotal', kd(order.subtotal));
  if (order.discount > 0) row(`Discount${order.couponCode ? ` (${order.couponCode})` : ''}`, `- ${kd(order.discount)}`);
  row('Delivery', order.shipping === 0 ? 'FREE' : kd(order.shipping));
  if (order.tax > 0) row('Tax', kd(order.tax));
  y += 1;
  doc.setFontSize(12);
  row('TOTAL', kd(order.total), true);

  // Footer
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(148, 163, 184);
  doc.text('Thank you for shopping with Dark-Army Store!', M, 285);
  doc.text('This is a computer-generated invoice.', W - M, 285, { align: 'right' });

  doc.save(`invoice-${order.orderNumber}.pdf`);
}
