import React, { useCallback, useEffect, useState } from 'react';
import { BookCopy, ScanSearch } from 'lucide-react';
import { useErp } from '../../context/ErpContext';
import { PageHeader } from '../../components/common/PageHeader';
import { DataTable, Column } from '../../components/common/DataTable';
import { LedgerMetricStrip, LedgerMetricItem } from '../../components/common/LedgerMetricStrip';
import { StatusChip, StatusChipType } from '../../components/common/StatusChip';
import { ReportChart } from '../../components/common/ReportChart';
import { MasterError, MasterLoading, emptyTableProps } from '../masters/MasterStatus';
import { num } from '../../services/mastersApi';
import { notifyApiError } from '../../services/notify';
import {
  CUSTOMER_360_KEY,
  CUSTOMER_LEDGER_KEY,
  Customer360DispatchRow,
  Customer360InvoiceRow,
  Customer360Payload,
  Customer360PaymentRow,
  Customer360PurchaseRow,
  Customer360TrendRow,
  CustomerLedgerEntry,
  CustomerRow,
  customersApi,
  writeCustomerListFilter,
} from '../../services/customersApi';
import { LEDGER_OPEN_INVOICE_KEY } from '../../services/invoicesApi';
import { LEDGER_OPEN_PAYMENT_KEY } from '../../services/paymentsApi';
import { OPEN_PO_KEY } from '../../services/purchaseOrdersApi';
import { OPEN_DISPATCH_KEY } from '../../services/dispatchesApi';

type TabId = 'basic' | 'purchases' | 'dispatches' | 'invoices' | 'payments' | 'ledger' | 'trends' | 'behaviour';

const TABS: { id: TabId; label: string }[] = [
  { id: 'basic', label: 'Basic Info' },
  { id: 'purchases', label: 'Purchase History' },
  { id: 'dispatches', label: 'Dispatch History' },
  { id: 'invoices', label: 'Invoice History' },
  { id: 'payments', label: 'Payment History' },
  { id: 'ledger', label: 'Ledger' },
  { id: 'trends', label: 'Product Trends' },
  { id: 'behaviour', label: 'Payment Behaviour' },
];

const GOLD_BTN =
  'px-4 py-1.5 bg-[var(--erp-gold)] text-[#0F141B] font-body text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer hover:bg-[var(--erp-gold-soft)] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[var(--erp-gold)]';

const LINK_BTN = 'text-[11px] font-mono text-[var(--erp-gold)] hover:underline cursor-pointer';

function money(value: string | number | null | undefined): string {
  return `₹${num(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function invoiceChip(status: string, isOverdue?: boolean): StatusChipType | string {
  if (isOverdue || status === 'Overdue') return 'overdue';
  if (status === 'Paid') return 'paid';
  if (status === 'Partially Paid') return 'notice';
  if (status === 'Cancelled') return 'rejected';
  if (status === 'Issued') return 'pending';
  return 'inactive';
}

function typeChip(type: string): StatusChipType | string {
  if (type === 'Payment') return 'paid';
  if (type === 'Adjustment') return 'notice';
  return 'pending';
}

export const Customer360Screen: React.FC = () => {
  const { navigateTo } = useErp();
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [customerId, setCustomerId] = useState<number | ''>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [appliedFrom, setAppliedFrom] = useState('');
  const [appliedTo, setAppliedTo] = useState('');
  const [payload, setPayload] = useState<Customer360Payload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<TabId>('basic');

  const loadCustomers = useCallback(async () => {
    setListLoading(true);
    try {
      const rows = await customersApi.list({ status: 'Active', scope: 'visible' });
      setCustomers(Array.isArray(rows) ? rows : []);
    } catch (e) {
      notifyApiError(e, 'Could not load customers.');
      setCustomers([]);
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => { void loadCustomers(); }, [loadCustomers]);

  const loadProfile = useCallback(async (id: number, from?: string, to?: string) => {
    setLoading(true);
    setError('');
    try {
      setPayload(await customersApi.profile360(id, { from: from || undefined, to: to || undefined }));
    } catch (e) {
      const parsed = notifyApiError(e, 'Could not load customer 360.');
      setError(parsed.message);
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const raw = sessionStorage.getItem(CUSTOMER_360_KEY);
    if (!raw) return;
    sessionStorage.removeItem(CUSTOMER_360_KEY);
    const id = Number(raw);
    if (!id) return;
    setCustomerId(id);
    void loadProfile(id);
  }, [loadProfile]);

  const applyRange = () => {
    if (!customerId) return;
    setAppliedFrom(dateFrom);
    setAppliedTo(dateTo);
    void loadProfile(Number(customerId), dateFrom, dateTo);
  };

  const openLedger = () => {
    if (!customerId) return;
    sessionStorage.setItem(CUSTOMER_LEDGER_KEY, String(customerId));
    navigateTo(44);
  };

  const viewAll = (screenId: number) => {
    if (!customerId) return;
    writeCustomerListFilter(Number(customerId));
    navigateTo(screenId);
  };

  const info = payload?.basic_info;
  const kpiMetrics: LedgerMetricItem[] = payload
    ? [
        { label: 'Outstanding', value: money(payload.outstanding) },
        {
          label: 'Advance / Credit',
          value: money(payload.advance),
          badge: num(payload.advance) > 0 ? 'CREDIT' : undefined,
        },
        {
          label: 'Overdue',
          value: money(payload.overdue),
          trend: num(payload.overdue) > 0 ? 'down' : 'neutral',
        },
      ]
    : [];

  const purchaseCols: Column<Customer360PurchaseRow>[] = [
    { header: 'PO', render: r => (
      <button type="button" className="font-mono text-[var(--erp-gold)] hover:underline cursor-pointer" onClick={() => { sessionStorage.setItem(OPEN_PO_KEY, String(r.id)); navigateTo(40); }}>{r.po_number}</button>
    ) },
    { header: 'Date', accessorKey: 'po_date', mono: true, width: '110px' },
    { header: 'Status', width: '150px', render: r => <StatusChip status={r.status === 'Cancelled' || r.status === 'Rejected' ? 'rejected' : 'pending'} label={r.status.toUpperCase()} /> },
    { header: 'Brand', accessorKey: 'brand_name' },
    { header: 'Amount', align: 'right', mono: true, width: '120px', render: r => money(r.total_amount) },
  ];

  const dispatchCols: Column<Customer360DispatchRow>[] = [
    { header: 'Date', accessorKey: 'dispatch_date', mono: true, width: '110px' },
    { header: 'LR', render: r => (
      <button type="button" className="font-mono text-[var(--erp-gold)] hover:underline cursor-pointer" onClick={() => { sessionStorage.setItem(OPEN_DISPATCH_KEY, String(r.id)); navigateTo(41); }}>{r.lr_number || '—'}</button>
    ) },
    { header: 'Transporter', accessorKey: 'transporter' },
    { header: 'PO', accessorKey: 'po_number', mono: true },
  ];

  const invoiceCols: Column<Customer360InvoiceRow>[] = [
    { header: 'Invoice', render: r => (
      <button type="button" className="font-mono text-[var(--erp-gold)] hover:underline cursor-pointer" onClick={() => { sessionStorage.setItem(LEDGER_OPEN_INVOICE_KEY, String(r.id)); navigateTo(42); }}>{r.invoice_number}</button>
    ) },
    { header: 'Date', accessorKey: 'invoice_date', mono: true, width: '110px' },
    { header: 'Status', width: '140px', render: r => <StatusChip status={invoiceChip(r.display_status, r.is_overdue)} label={r.display_status.toUpperCase()} /> },
    { header: 'Net', align: 'right', mono: true, width: '120px', render: r => money(r.net_amount) },
    { header: 'Outstanding', align: 'right', mono: true, width: '120px', render: r => money(r.remaining_balance) },
  ];

  const paymentCols: Column<Customer360PaymentRow>[] = [
    { header: 'Payment', render: r => (
      <button type="button" className="font-mono text-[var(--erp-gold)] hover:underline cursor-pointer" onClick={() => { sessionStorage.setItem(LEDGER_OPEN_PAYMENT_KEY, String(r.id)); navigateTo(43); }}>{r.payment_number}</button>
    ) },
    { header: 'Date', accessorKey: 'payment_date', mono: true, width: '110px' },
    { header: 'Mode', accessorKey: 'payment_mode', width: '120px' },
    { header: 'Amount', align: 'right', mono: true, width: '120px', render: r => money(r.amount) },
    { header: 'Unallocated', align: 'right', mono: true, width: '120px', render: r => money(r.unallocated_amount) },
  ];

  const ledgerCols: Column<CustomerLedgerEntry>[] = [
    { header: 'Date', accessorKey: 'date', mono: true, width: '110px' },
    { header: 'Type', width: '120px', render: r => <StatusChip status={typeChip(String(r.type))} label={String(r.type).toUpperCase()} /> },
    { header: 'Reference', accessorKey: 'reference', mono: true },
    { header: 'Debit', align: 'right', mono: true, width: '110px', render: r => num(r.debit_amount) ? money(r.debit_amount) : '—' },
    { header: 'Credit', align: 'right', mono: true, width: '110px', render: r => num(r.credit_amount) ? money(r.credit_amount) : '—' },
    { header: 'Balance', align: 'right', mono: true, width: '120px', render: r => money(r.running_balance) },
  ];

  const noCustomers = !listLoading && customers.length === 0;
  const behaviour = payload?.payment_behaviour;
  const trends = payload?.product_purchase_trends || [];

  return (
    <div className="p-6 flex flex-col gap-6 text-left">
      <PageHeader
        moduleNumber="48"
        section="Ledgers"
        title="Customer 360°"
        subtitle="Aggregated profile — purchases, invoices, payments and ledger KPIs"
        actions={
          customerId ? (
            <button type="button" onClick={openLedger} className={GOLD_BTN}>
              <BookCopy className="w-3.5 h-3.5" /> View Full Ledger
            </button>
          ) : undefined
        }
      />

      <div className="flex flex-col gap-2 bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] p-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
          <label htmlFor="c360-customer" className="flex flex-col gap-1 text-xs font-normal text-[var(--erp-muted)] font-sans">
            Customer
            <select
              id="c360-customer"
              value={customerId}
              disabled={noCustomers}
              onChange={e => {
                const id = e.target.value ? Number(e.target.value) : '';
                setCustomerId(id);
                setPayload(null);
                if (id) void loadProfile(id, dateFrom, dateTo);
              }}
              className="w-full px-3 py-1.5 text-xs bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)] font-mono focus:border-[var(--erp-gold)] focus:outline-none disabled:opacity-60"
            >
              {noCustomers ? (
                <option value="">No customers found — add one in Customer Master</option>
              ) : (
                <>
                  <option value="">Select customer…</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.customer_code} · {c.customer_name}</option>
                  ))}
                </>
              )}
            </select>
          </label>
          <label htmlFor="c360-from" className="flex flex-col gap-1 text-xs font-normal text-[var(--erp-muted)] font-sans">
            From
            <input id="c360-from" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-full px-3 py-1.5 text-xs bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)] font-mono focus:border-[var(--erp-gold)] focus:outline-none" />
          </label>
          <label htmlFor="c360-to" className="flex flex-col gap-1 text-xs font-normal text-[var(--erp-muted)] font-sans">
            To
            <input id="c360-to" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-full px-3 py-1.5 text-xs bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)] font-mono focus:border-[var(--erp-gold)] focus:outline-none" />
          </label>
          <button
            type="button"
            disabled={!customerId}
            onClick={applyRange}
            className={
              customerId
                ? `${GOLD_BTN} h-[34px]`
                : 'h-[34px] px-4 py-1.5 border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface-2)] text-[var(--erp-muted)] font-body text-xs font-semibold flex items-center justify-center cursor-not-allowed'
            }
          >
            Apply dates
          </button>
        </div>
        <p className="text-[11px] font-mono text-[var(--erp-muted)]">
          Date range scopes history, product trends and payment behaviour. Outstanding / advance / overdue stay current.
        </p>
      </div>

      {error && <MasterError message={error} onRetry={() => customerId && void loadProfile(Number(customerId), appliedFrom, appliedTo)} />}

      {listLoading ? (
        <MasterLoading label="Loading customers…" rows={4} />
      ) : !customerId ? (
        <div className="border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] py-14 px-6 flex flex-col items-center justify-center gap-3">
          <div className="w-12 h-12 border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface-2)] flex items-center justify-center">
            <ScanSearch className="w-5 h-5 text-[var(--erp-gold)] stroke-[1.75]" />
          </div>
          <p className="text-xs font-mono text-[var(--erp-muted)] text-center max-w-md">
            {noCustomers
              ? 'No customers found — add one in Customer Master'
              : 'Select a customer to open their 360° profile.'}
          </p>
          {noCustomers ? (
            <button type="button" onClick={() => navigateTo(23)} className={GOLD_BTN}>Open Customer Master</button>
          ) : null}
        </div>
      ) : loading ? (
        <MasterLoading label="Loading customer 360…" />
      ) : payload && info ? (
        <>
          <div className="border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] p-4 flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-display text-xl font-bold text-[var(--erp-text)]">{info.customer_name}</h2>
              <span className="font-mono text-xs text-[var(--erp-gold)]">{info.customer_code}</span>
              <StatusChip status={info.status === 'Active' ? 'active' : 'inactive'} label={info.status.toUpperCase()} />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {info.entities.map(ent => (
                <span
                  key={ent.entity_id}
                  className={`px-2 py-0.5 text-[10px] font-mono border ${ent.primary_entity ? 'border-[var(--erp-gold)] text-[var(--erp-gold)]' : 'border-[var(--erp-hairline)] text-[var(--erp-muted)]'}`}
                >
                  {ent.short_code} · {ent.entity_name}{ent.primary_entity ? ' · PRIMARY' : ''}
                </span>
              ))}
            </div>
          </div>

          {kpiMetrics.length ? <LedgerMetricStrip metrics={kpiMetrics} className="lg:!grid-cols-3" /> : null}

          <div className="flex flex-wrap gap-1 border-b border-[var(--erp-hairline-strong)]">
            {TABS.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`px-3 py-2 text-[11px] font-mono uppercase tracking-wide cursor-pointer ${
                  tab === item.id
                    ? 'text-[var(--erp-gold)] border-b-2 border-[var(--erp-gold)]'
                    : 'text-[var(--erp-muted)] hover:text-[var(--erp-text)]'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {tab === 'basic' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] p-4 text-xs">
              {[
                ['Type', info.customer_type],
                ['Contact', info.contact_person || '—'],
                ['Phone', info.phone || '—'],
                ['Mobile', info.mobile || '—'],
                ['Email', info.email || '—'],
                ['City', [info.city, info.state].filter(Boolean).join(', ') || '—'],
                ['GSTIN', info.gst_no || '—'],
                ['PAN', info.pan_no || '—'],
                ['Credit days', String(info.credit_days)],
                ['Credit limit', money(info.credit_limit)],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4 border-b border-[var(--erp-hairline)] pb-2">
                  <span className="font-mono text-[var(--erp-muted)] uppercase tracking-wide">{label}</span>
                  <span className="font-mono text-[var(--erp-text)]">{value}</span>
                </div>
              ))}
            </div>
          )}

          {tab === 'purchases' && (
            <section className="flex flex-col gap-3">
              <div className="flex justify-end"><button type="button" className={LINK_BTN} onClick={() => viewAll(40)}>View all purchase orders</button></div>
              <DataTable
                columns={purchaseCols}
                data={payload.purchase_history.rows}
                keyExtractor={r => r.id}
                {...emptyTableProps(payload.purchase_history.total_count, payload.purchase_history.rows.length, 'No purchase orders yet.', 'No purchase orders in this date range.', '', () => undefined)}
              />
            </section>
          )}

          {tab === 'dispatches' && (
            <section className="flex flex-col gap-3">
              <div className="flex justify-end"><button type="button" className={LINK_BTN} onClick={() => viewAll(41)}>View all dispatches</button></div>
              <DataTable
                columns={dispatchCols}
                data={payload.dispatch_history.rows}
                keyExtractor={r => r.id}
                {...emptyTableProps(payload.dispatch_history.total_count, payload.dispatch_history.rows.length, 'No dispatches yet.', 'No dispatches in this date range.', '', () => undefined)}
              />
            </section>
          )}

          {tab === 'invoices' && (
            <section className="flex flex-col gap-3">
              <div className="flex justify-end"><button type="button" className={LINK_BTN} onClick={() => viewAll(42)}>View all invoices</button></div>
              <DataTable
                columns={invoiceCols}
                data={payload.invoice_history.rows}
                keyExtractor={r => r.id}
                {...emptyTableProps(payload.invoice_history.total_count, payload.invoice_history.rows.length, 'No invoices yet.', 'No invoices in this date range.', '', () => undefined)}
              />
            </section>
          )}

          {tab === 'payments' && (
            <section className="flex flex-col gap-3">
              <div className="flex justify-end"><button type="button" className={LINK_BTN} onClick={() => viewAll(43)}>View all payments</button></div>
              <DataTable
                columns={paymentCols}
                data={payload.payment_history.rows}
                keyExtractor={r => r.id}
                {...emptyTableProps(payload.payment_history.total_count, payload.payment_history.rows.length, 'No payments yet.', 'No payments in this date range.', '', () => undefined)}
              />
            </section>
          )}

          {tab === 'ledger' && (
            <section className="flex flex-col gap-3">
              <div className="flex justify-end"><button type="button" className={LINK_BTN} onClick={openLedger}>View Full Ledger</button></div>
              <DataTable
                columns={ledgerCols}
                data={payload.ledger_preview}
                keyExtractor={(r, i) => `${r.type}-${r.source_id}-${i}`}
                {...emptyTableProps(payload.ledger_preview.length, payload.ledger_preview.length, 'No ledger entries yet.', 'No ledger entries in this date range.', '', () => undefined)}
              />
            </section>
          )}

          {tab === 'trends' && (
            <section className="flex flex-col gap-4">
              <ReportChart
                kind="bar"
                labels={trends.map(r => r.product_code)}
                series={[{ key: 'value', label: 'Value', color: 'var(--erp-gold)', values: trends.map(r => num(r.total_value)) }]}
                empty={!trends.length}
                emptyMessage="No invoiced products yet."
              />
              <DataTable
                columns={[
                  { header: '#', accessorKey: 'rank', mono: true, width: '48px' },
                  { header: 'Product', render: r => <span><span className="font-mono text-[var(--erp-gold)]">{r.product_code}</span> · {r.product_name}</span> },
                  { header: 'Qty', align: 'right', mono: true, width: '100px', render: r => num(r.total_qty).toLocaleString('en-IN') },
                  { header: 'Value', align: 'right', mono: true, width: '120px', render: r => money(r.total_value) },
                ] as Column<Customer360TrendRow>[]}
                data={trends}
                keyExtractor={r => r.product_id}
                {...emptyTableProps(trends.length, trends.length, 'No invoiced products yet.', 'No invoiced products in this date range.', '', () => undefined)}
              />
            </section>
          )}

          {tab === 'behaviour' && behaviour && (
            <section className="flex flex-col gap-4">
              <LedgerMetricStrip
                metrics={[
                  {
                    label: 'Avg days to pay',
                    value: behaviour.average_days_to_pay == null ? '—' : String(behaviour.average_days_to_pay),
                    subValue: behaviour.average_days_to_pay != null && num(behaviour.average_days_to_pay) < 0 ? 'Pays early on average' : 'Vs invoice due date',
                  },
                  {
                    label: 'On-time rate',
                    value: behaviour.on_time_payment_rate == null ? '—' : `${behaviour.on_time_payment_rate}%`,
                    trend: num(behaviour.on_time_payment_rate) >= 80 ? 'up' : 'neutral',
                  },
                  { label: 'Payments', value: String(behaviour.total_payment_count) },
                ]}
                className="lg:!grid-cols-3"
              />
              {behaviour.paid_invoice_count === 0 ? (
                <p className="text-xs font-mono text-[var(--erp-muted)] py-8 text-center border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)]">
                  No fully paid invoices to measure payment behaviour.
                </p>
              ) : null}
            </section>
          )}
        </>
      ) : null}
    </div>
  );
};
