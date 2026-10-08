import React, { useCallback, useEffect, useState } from 'react';
import { useErp } from '../../context/ErpContext';
import { MasterError, MasterLoading } from '../masters/MasterStatus';
import { num } from '../../services/mastersApi';
import { notifyApiError } from '../../services/notify';
import {
  InvoiceTrace,
  NOT_RECORDED,
  TraceLinkType,
  TraceUser,
  invoicesApi,
  traceStamp,
} from '../../services/invoicesApi';
import { openTraceTarget } from '../../services/traceLinks';

const sectionTitle = 'text-[11px] font-mono uppercase tracking-wider text-[var(--erp-gold)] border-b border-[var(--erp-hairline)] pb-1 mb-3';
const tableHead = 'bg-[var(--erp-surface-2)] font-mono text-[10px] uppercase tracking-wider text-[var(--erp-muted)]';
const linkClass = 'font-mono text-[var(--erp-gold)] hover:underline cursor-pointer text-left';
const emptyNote = 'text-xs font-mono text-[var(--erp-muted)]';

const SOURCE_LABELS: Record<string, string> = {
  manual: 'Manual',
  dispatch_auto: 'Dispatch (automatic)',
  import: 'Import',
};

const WITHHELD = 'Not available';

function money(value: string | number | null | undefined): string {
  return `₹${num(value).toFixed(2)}`;
}

const NotRecorded: React.FC = () => (
  <span className="italic text-[var(--erp-muted)]">{NOT_RECORDED}</span>
);

const Actor: React.FC<{ user: TraceUser | null | undefined }> = ({ user }) =>
  user?.name ? <span>{user.name}</span> : <NotRecorded />;

const Stamp: React.FC<{ at: string | null | undefined }> = ({ at }) =>
  at ? <span className="font-mono">{traceStamp(at)}</span> : <NotRecorded />;

const RefLink: React.FC<{ type: TraceLinkType; id: number; children: React.ReactNode }> = ({ type, id, children }) => {
  const { navigateTo } = useErp();
  return (
    <button type="button" className={linkClass} onClick={() => openTraceTarget(type, id, navigateTo)}>
      {children}
    </button>
  );
};

export const InvoiceTraceabilityPanel: React.FC<{ invoiceId: number }> = ({ invoiceId }) => {
  const [trace, setTrace] = useState<InvoiceTrace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setTrace(await invoicesApi.trace(invoiceId));
    } catch (e) {
      setError(notifyApiError(e, 'Could not load traceability.').message);
    } finally {
      setLoading(false);
    }
  }, [invoiceId]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <MasterLoading label="Loading traceability…" />;
  if (error || !trace) return <MasterError message={error || 'Traceability unavailable.'} onRetry={() => void load()} />;

  const { invoice, customer, entity, brand, purchase_order: po } = trace;

  return (
    <div className="space-y-5 text-left">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-[var(--erp-hairline)] border border-[var(--erp-hairline)]">
        <div className="bg-[var(--erp-surface)] p-3">
          <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--erp-muted)]">Customer</p>
          <RefLink type="customer" id={customer.id}>{customer.customer_code}</RefLink>
          <p className="text-xs truncate">{customer.customer_name}</p>
        </div>
        <div className="bg-[var(--erp-surface)] p-3">
          <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--erp-muted)]">Entity</p>
          <p className="font-mono">{entity.short_code}</p>
          <p className="text-xs truncate">{entity.entity_name}</p>
        </div>
        <div className="bg-[var(--erp-surface)] p-3">
          <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--erp-muted)]">Brand</p>
          <p className="font-mono">{brand.brand_code}</p>
          <p className="text-xs truncate">{brand.brand_name}</p>
        </div>
        <div className="bg-[var(--erp-surface)] p-3">
          <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--erp-muted)]">Purchase Order</p>
          {po ? (
            <>
              <RefLink type="purchase_order" id={po.id}>{po.po_number}</RefLink>
              <p className="text-xs">{po.po_date} · {po.order_type} · {po.status}</p>
            </>
          ) : (
            <p className={emptyNote}>{WITHHELD}</p>
          )}
        </div>
      </div>

      <section>
        <h4 className={sectionTitle}>Record trail</h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div>
            <p className="text-[10px] font-mono uppercase text-[var(--erp-muted)]">Created</p>
            <p><Actor user={invoice.created_by} /></p>
            <p><Stamp at={invoice.created_at} /></p>
          </div>
          <div>
            <p className="text-[10px] font-mono uppercase text-[var(--erp-muted)]">Issued</p>
            {invoice.status === 'Draft' && !invoice.issued_at ? (
              <p className={emptyNote}>Not issued yet</p>
            ) : (
              <>
                <p><Actor user={invoice.issued_by} /></p>
                <p><Stamp at={invoice.issued_at} /></p>
              </>
            )}
          </div>
          <div>
            <p className="text-[10px] font-mono uppercase text-[var(--erp-muted)]">Cancelled</p>
            {invoice.status === 'Cancelled' || invoice.cancelled_at ? (
              <>
                <p><Actor user={invoice.cancelled_by} /></p>
                <p><Stamp at={invoice.cancelled_at} /></p>
              </>
            ) : (
              <p className={emptyNote}>Not cancelled</p>
            )}
          </div>
        </div>
      </section>

      <section>
        <h4 className={sectionTitle}>Quantities per line</h4>
        <div className="overflow-x-auto border border-[var(--erp-hairline)]">
          <table className="w-full text-left text-xs">
            <thead className={tableHead}>
              <tr>
                <th className="px-3 py-2">Product</th>
                <th className="px-3 py-2 text-right">Ordered</th>
                <th className="px-3 py-2 text-right">Dispatched (PO line)</th>
                <th className="px-3 py-2 text-right">This invoice</th>
                <th className="px-3 py-2 text-right">Invoiced (all)</th>
                <th className="px-3 py-2 text-right">Undispatched</th>
                <th className="px-3 py-2 text-right">Uninvoiced</th>
              </tr>
            </thead>
            <tbody>
              {trace.lines.map(line => (
                <tr key={line.invoice_line_id} className="border-t border-[var(--erp-hairline)]">
                  <td className="px-3 py-2">{line.product}</td>
                  <td className="px-3 py-2 text-right font-mono">{line.ordered_quantity ?? '—'}</td>
                  <td className="px-3 py-2 text-right font-mono">{line.dispatched_on_po_line ?? '—'}</td>
                  <td className="px-3 py-2 text-right font-mono text-[var(--erp-gold)]">{line.quantity_on_this_invoice}</td>
                  <td className="px-3 py-2 text-right font-mono">{line.invoiced_across_invoices ?? '—'}</td>
                  <td className="px-3 py-2 text-right font-mono">{line.remaining_undispatched ?? '—'}</td>
                  <td className="px-3 py-2 text-right font-mono">{line.remaining_uninvoiced ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={`${emptyNote} mt-1`}>
          {po ? 'Invoiced (all) excludes cancelled invoices.' : `Purchase Order figures: ${WITHHELD}.`}
        </p>
      </section>

      <section>
        <h4 className={sectionTitle}>Dispatches on this PO</h4>
        <p className={`${emptyNote} mb-2`}>{trace.dispatches_note}</p>
        {trace.dispatches.length ? (
          <div className="overflow-x-auto border border-[var(--erp-hairline)]">
            <table className="w-full text-left text-xs">
              <thead className={tableHead}>
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">LR</th>
                  <th className="px-3 py-2">Transporter</th>
                  <th className="px-3 py-2">Challan</th>
                  <th className="px-3 py-2">Quantities</th>
                  <th className="px-3 py-2">Recorded by</th>
                </tr>
              </thead>
              <tbody>
                {trace.dispatches.map(row => (
                  <tr key={row.id} className="border-t border-[var(--erp-hairline)] align-top">
                    <td className="px-3 py-2 font-mono">{row.dispatch_date}</td>
                    <td className="px-3 py-2"><RefLink type="dispatch" id={row.id}>{row.lr_number || '—'}</RefLink></td>
                    <td className="px-3 py-2">{row.transporter || '—'}</td>
                    <td className="px-3 py-2 font-mono">{row.challan_reference || '—'}</td>
                    <td className="px-3 py-2">
                      {row.lines.map(l => (
                        <div key={l.purchase_order_line_id}>{l.product} <span className="font-mono">× {l.quantity}</span></div>
                      ))}
                    </td>
                    <td className="px-3 py-2"><Actor user={row.created_by} /><div><Stamp at={row.created_at} /></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={emptyNote}>No dispatches recorded on this PO.</p>
        )}
      </section>

      <section>
        <h4 className={sectionTitle}>Payments</h4>
        {trace.payments.allocations.length ? (
          <div className="overflow-x-auto border border-[var(--erp-hairline)]">
            <table className="w-full text-left text-xs">
              <thead className={tableHead}>
                <tr>
                  <th className="px-3 py-2">Payment</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Mode</th>
                  <th className="px-3 py-2 text-right">Allocated</th>
                  <th className="px-3 py-2">Recorded by</th>
                </tr>
              </thead>
              <tbody>
                {trace.payments.allocations.map(row => (
                  <tr key={row.allocation_id} className="border-t border-[var(--erp-hairline)]">
                    <td className="px-3 py-2"><RefLink type="payment" id={row.payment_id}>{row.payment_number}</RefLink></td>
                    <td className="px-3 py-2 font-mono">{row.payment_date}</td>
                    <td className="px-3 py-2">{row.payment_mode}</td>
                    <td className="px-3 py-2 text-right font-mono">{money(row.allocated_amount)}</td>
                    <td className="px-3 py-2"><Actor user={row.created_by} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={emptyNote}>No payments allocated.</p>
        )}
        {trace.payments.adjustments.length ? (
          <div className="overflow-x-auto border border-[var(--erp-hairline)] mt-3">
            <table className="w-full text-left text-xs">
              <thead className={tableHead}>
                <tr>
                  <th className="px-3 py-2">Payment adjustment</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Created by</th>
                  <th className="px-3 py-2">Approved by</th>
                </tr>
              </thead>
              <tbody>
                {trace.payments.adjustments.map(row => (
                  <tr key={row.id} className="border-t border-[var(--erp-hairline)] align-top">
                    <td className="px-3 py-2">
                      <RefLink type="payment" id={row.payment_id}>{row.payment_number}</RefLink>
                      {row.reason ? <div className="text-[var(--erp-muted)]">{row.reason}</div> : null}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{money(row.amount)}</td>
                    <td className="px-3 py-2">{row.status}</td>
                    <td className="px-3 py-2"><Actor user={row.created_by} /><div><Stamp at={row.created_at} /></div></td>
                    <td className="px-3 py-2"><Actor user={row.approved_by} /><div><Stamp at={row.approved_at} /></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        <div className="mt-3 flex flex-wrap justify-end gap-6 font-mono text-sm">
          <div>Net {money(trace.financials.net_amount)}</div>
          <div>Paid {money(trace.financials.total_paid)}</div>
          <div className="text-[var(--erp-gold)]">Outstanding {money(trace.financials.outstanding_balance)}</div>
        </div>
      </section>

      <section>
        <h4 className={sectionTitle}>Invoice adjustments</h4>
        <p className={emptyNote}>{trace.adjustments_note || 'No invoice adjustments.'}</p>
      </section>

      <section>
        <h4 className={sectionTitle}>PO status history</h4>
        {!po ? (
          <p className={emptyNote}>{WITHHELD}</p>
        ) : po.status_history.length ? (
          <div className="overflow-x-auto border border-[var(--erp-hairline)]">
            <table className="w-full text-left text-xs">
              <thead className={tableHead}>
                <tr>
                  <th className="px-3 py-2">When</th>
                  <th className="px-3 py-2">Change</th>
                  <th className="px-3 py-2">Source</th>
                  <th className="px-3 py-2">By</th>
                </tr>
              </thead>
              <tbody>
                {po.status_history.map((row, i) => (
                  <tr key={i} className="border-t border-[var(--erp-hairline)]">
                    <td className="px-3 py-2"><Stamp at={row.changed_at} /></td>
                    <td className="px-3 py-2">{row.from_status} → {row.to_status}</td>
                    <td className="px-3 py-2">{SOURCE_LABELS[row.source] || row.source}</td>
                    <td className="px-3 py-2"><Actor user={row.changed_by} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={emptyNote}>{NOT_RECORDED} — status changes before traceability was enabled are not tracked.</p>
        )}
      </section>

      <section>
        <h4 className={sectionTitle}>Timeline</h4>
        <ol className="border-l border-[var(--erp-hairline-strong)] ml-2 space-y-3">
          {trace.timeline.map((event, i) => {
            const selfLink = event.link.type === 'invoice' && event.link.id === invoice.id;
            return (
              <li key={i} className="pl-4 relative text-xs">
                <span className="absolute -left-[4px] top-1.5 w-2 h-2 bg-[var(--erp-gold)]" />
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <Stamp at={event.at} />
                  {selfLink ? (
                    <span>{event.label}</span>
                  ) : (
                    <RefLink type={event.link.type} id={event.link.id}>{event.label}</RefLink>
                  )}
                </div>
                <div className="text-[var(--erp-muted)]">
                  by <Actor user={event.actor} />
                  {event.source ? ` · ${SOURCE_LABELS[event.source] || event.source}` : ''}
                  {event.kind === 'payment_adjustment' ? <> · approved by <Actor user={event.approved_by} /></> : null}
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
};
