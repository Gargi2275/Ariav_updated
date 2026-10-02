import React, { useEffect, useState } from 'react';
import { useErp } from '../../context/ErpContext';
import { num } from '../../services/mastersApi';
import { notifyApiError } from '../../services/notify';
import { InvoiceRow, invoicesApi } from '../../services/invoicesApi';
import { openTraceTarget } from '../../services/traceLinks';

const tableHead = 'bg-[var(--erp-surface-2)] font-mono text-[10px] uppercase tracking-wider text-[var(--erp-muted)]';

export const PoInvoicesList: React.FC<{ purchaseOrderId: number }> = ({ purchaseOrderId }) => {
  const { navigateTo } = useErp();
  const [rows, setRows] = useState<InvoiceRow[] | null>(null);

  useEffect(() => {
    let alive = true;
    setRows(null);
    invoicesApi
      .list({ purchase_order_id: purchaseOrderId })
      .then(data => { if (alive) setRows(data); })
      .catch(e => { if (alive) { setRows([]); notifyApiError(e, 'Could not load invoices for this PO.'); } });
    return () => { alive = false; };
  }, [purchaseOrderId]);

  if (rows === null) return <p className="text-xs font-mono text-[var(--erp-muted)]">Loading invoices…</p>;
  if (!rows.length) return <p className="text-xs font-mono text-[var(--erp-muted)]">No invoices raised on this PO yet.</p>;

  return (
    <div className="overflow-x-auto border border-[var(--erp-hairline)]">
      <table className="w-full text-left text-xs">
        <thead className={tableHead}>
          <tr>
            <th className="px-3 py-2">Invoice</th>
            <th className="px-3 py-2">Date</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2 text-right">Net</th>
            <th className="px-3 py-2 text-right">Balance</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.id} className="border-t border-[var(--erp-hairline)]">
              <td className="px-3 py-2">
                <button
                  type="button"
                  className="font-mono text-[var(--erp-gold)] hover:underline cursor-pointer"
                  onClick={() => openTraceTarget('invoice', row.id, navigateTo)}
                >
                  {row.invoice_number}
                </button>
              </td>
              <td className="px-3 py-2 font-mono">{row.invoice_date}</td>
              <td className="px-3 py-2">{row.display_status || row.status}</td>
              <td className="px-3 py-2 text-right font-mono">₹{num(row.net_amount).toFixed(2)}</td>
              <td className="px-3 py-2 text-right font-mono">
                {row.status === 'Cancelled' ? '—' : `₹${num(row.remaining_balance ?? row.net_amount).toFixed(2)}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
