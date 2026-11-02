/** The state pill on a time off request, shared by Time Off and the employee form. */
export default function LeaveStateBadge({ state }: { state: string }) {
  const styles: Record<string, string> = {
    DRAFT: 'bg-odoo-raised text-odoo-dim',
    TO_APPROVE: 'bg-odoo-warn/20 text-odoo-warn',
    APPROVED: 'bg-odoo-ok/20 text-odoo-ok',
    REFUSED: 'bg-odoo-bad/20 text-odoo-bad',
    CANCELLED: 'bg-odoo-raised text-odoo-faint',
  };
  const labels: Record<string, string> = {
    DRAFT: 'Draft',
    TO_APPROVE: 'To Approve',
    APPROVED: 'Approved',
    REFUSED: 'Refused',
    CANCELLED: 'Cancelled',
  };
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${styles[state] || styles.DRAFT}`}>
      {labels[state] || state}
    </span>
  );
}
