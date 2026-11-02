'use client';

import { FileDown } from 'lucide-react';
import { downloadInvoice } from '@/lib/invoice';
import { useLang } from './LanguageProvider';
import type { Order } from '@/lib/types';

export default function InvoiceButton({ order, className = 'btn-ghost' }: { order: Order; className?: string }) {
  const { t } = useLang();
  return (
    <button onClick={() => { void downloadInvoice(order); }} className={className}>
      <FileDown size={16} /> {t('Download Invoice')}
    </button>
  );
}
