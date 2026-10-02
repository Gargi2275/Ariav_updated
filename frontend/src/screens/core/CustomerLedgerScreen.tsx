import React, { useCallback, useEffect, useState } from 'react';
import { BookCopy, Download } from 'lucide-react';
import { useErp } from '../../context/ErpContext';
import { PageHeader } from '../../components/common/PageHeader';
import { DataTable, Column } from '../../components/common/DataTable';
import { LedgerMetricStrip, LedgerMetricItem } from '../../components/common/LedgerMetricStrip';
import { StatusChip, StatusChipType } from '../../components/common/StatusChip';
import { MasterError, MasterLoading, emptyTableProps } from '../masters/MasterStatus';
import { num } from '../../services/mastersApi';
import { notifyApiError } from '../../services/notify';
import {
  CUSTOMER_LEDGER_KEY,
  CustomerLedgerEntry,
  CustomerLedgerPayload,
  CustomerRow,
  customersApi,
} from '../../services/customersApi';
import { LEDGER_OPEN_INVOICE_KEY } from '../../services/invoicesApi';
import { LEDGER_OPEN_PAYMENT_KEY } from '../../services/paymentsApi';

function money(value: string | number | null | undefined): string {
  return `₹${num(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function typeChip(type: string): StatusChipType | string {
  if (type === 'Payment') return 'paid';
  if (type === 'Adjustment') return 'notice';
  return 'pending';
}

const GOLD_BTN =
  'px-4 py-1.5 bg-[var(--erp-gold)] text-[#0F141B] font-body text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer hover:bg-[var(--erp-gold-soft)] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[var(--erp-gold)]';

export const CustomerLedgerScreen: React.FC = () => {
  const { navigateTo } = useErp();
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [customerId, setCustomerId] = useState<number | ''>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [appliedFrom, setAppliedFrom] = useState('');
  const [appliedTo, setAppliedTo] = useState('');
  const [payload, setPayload] = useState<CustomerLedgerPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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

  const loadLedger = useCallback(async (id: number, from?: string, to?: string) => {
    setLoading(true);
    setError('');
    try {
      const data = await customersApi.ledger(id, { from: from || undefined, to: to || undefined });
      setPayload(data);
    } catch (e) {
      const parsed = notifyApiError(e, 'Could not load customer ledger.');
      setError(parsed.message);
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const raw = sessionStorage.getItem(CUSTOMER_LEDGER_KEY);
    if (!raw) return;
    sessionStorage.removeItem(CUSTOMER_LEDGER_KEY);
    const id = Number(raw);
    if (!id) return;
    setCustomerId(id);
    void loadLedger(id);
  }, [loadLedger]);

  const applyRange = () => {
    if (!customerId) return;
    setAppliedFrom(dateFrom);
    setAppliedTo(dateTo);
    void loadLedger(Number(customerId), dateFrom, dateTo);
  };

  const openPdf = async () => {
    if (!customerId) return;
    try {
      const blob = await customersApi.ledgerPdf(Number(customerId), {
        from: appliedFrom || undefined,
        to: appliedTo || undefined,
      });
      window.open(URL.createObjectURL(blob), '_blank', 'noopener');
    } catch (err) {
      notifyApiError(err, 'Could not generate statement PDF.');
    }
  };

  const openReference = (row: CustomerLedgerEntry) => {
    if (row.type === 'Invoice') {
      sessionStorage.setItem(LEDGER_OPEN_INVOICE_KEY, String(row.source_id));
      navigateTo(42);
      return;
    }
    if (row.type === 'Payment') {
      sessionStorage.setItem(LEDGER_OPEN_PAYMENT_KEY, String(row.source_id));
      navigateTo(43);
    }
  };

  const noCustomers = !listLoading && customers.length === 0;
  const summary = payload?.summary;
  const kpiMetrics: LedgerMetricItem[] = summary
    ? [
        { label: 'Total Invoiced', value: money(summary.total_invoiced) },
        { label: 'Total Paid', value: money(summary.total_paid), trend: 'up' },
        { label: 'Outstanding Balance', value: money(summary.outstanding_balance) },
        {
          label: 'Advance/Credit Balance',
          value: money(summary.advance_credit_balance),
          badge: num(summary.advance_credit_balance) > 0 ? 'CREDIT' : undefined,
        },
        {
          label: 'Overdue Amount',
          value: money(summary.overdue_amount),
          trend: num(summary.overdue_amount) > 0 ? 'down' : 'neutral',
        },
      ]
    : [];

  const columns: Column<CustomerLedgerEntry>[] = [
    { header: 'Date', accessorKey: 'date', mono: true, width: '110px' },
    {
      header: 'Type',
      width: '130px',
      render: r => <StatusChip status={typeChip(r.type)} label={String(r.type).toUpperCase()} />,
    },
    {
      header: 'Reference',
      render: r => (
        r.type === 'Adjustment' ? (
          <span className="font-mono">{r.reference}</span>
        ) : (
          <button
            type="button"
            className="font-mono text-[var(--erp-gold)] hover:underline cursor-pointer"
            onClick={() => openReference(r)}
          >
            {r.reference}
          </button>
        )
      ),
    },
    { header: 'Debit', align: 'right', mono: true, width: '120px', render: r => num(r.debit_amount) ? money(r.debit_amount) : '—' },
    { header: 'Credit', align: 'right', mono: true, width: '120px', render: r => num(r.credit_amount) ? money(r.credit_amount) : '—' },
    { header: 'Running Balance', align: 'right', mono: true, width: '140px', render: r => money(r.running_balance) },
  ];

  return (
    <div className="p-6 flex flex-col gap-6 text-left">
      <PageHeader
        moduleNumber="44"
        section="Ledgers"
        title="Customer Ledger"
        subtitle="Running statement of invoices and payments for a customer"
        actions={
          customerId ? (
            <button type="button" onClick={() => void openPdf()} className={GOLD_BTN}>
              <Download className="w-3.5 h-3.5" /> Download Statement PDF
            </button>
          ) : undefined
        }
      />

      <div className="flex flex-col gap-2 bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] p-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
          <label htmlFor="ledger-customer" className="flex flex-col gap-1 text-xs font-normal text-[var(--erp-muted)] font-sans">
            Customer
            <select
              id="ledger-customer"
              value={customerId}
              disabled={noCustomers}
              onChange={e => {
                const id = e.target.value ? Number(e.target.value) : '';
                setCustomerId(id);
                setPayload(null);
                if (id) void loadLedger(id, dateFrom, dateTo);
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
          <label htmlFor="ledger-from" className="flex flex-col gap-1 text-xs font-normal text-[var(--erp-muted)] font-sans">
            From
            <input
              id="ledger-from"
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="w-full px-3 py-1.5 text-xs bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)] font-mono focus:border-[var(--erp-gold)] focus:outline-none"
            />
          </label>
          <label htmlFor="ledger-to" className="flex flex-col gap-1 text-xs font-normal text-[var(--erp-muted)] font-sans">
            To
            <input
              id="ledger-to"
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="w-full px-3 py-1.5 text-xs bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)] font-mono focus:border-[var(--erp-gold)] focus:outline-none"
            />
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
        {noCustomers ? (
          <p className="text-[11px] font-mono text-[var(--erp-muted)]">
            No customers found — add one in{' '}
            <button type="button" onClick={() => navigateTo(23)} className="text-[var(--erp-gold)] hover:underline cursor-pointer">
              Customer Master
            </button>
            .
          </p>
        ) : null}
      </div>

      {error && <MasterError message={error} onRetry={() => customerId && void loadLedger(Number(customerId), appliedFrom, appliedTo)} />}

      {listLoading ? (
        <MasterLoading label="Loading customers…" rows={4} />
      ) : !customerId ? (
        <div className="border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] py-14 px-6 flex flex-col items-center justify-center gap-3">
          <div className="w-12 h-12 border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface-2)] flex items-center justify-center">
            <BookCopy className="w-5 h-5 text-[var(--erp-gold)] stroke-[1.75]" />
          </div>
          <p className="text-xs font-mono text-[var(--erp-muted)] text-center max-w-md">
            {noCustomers
              ? 'No customers found — add one in Customer Master'
              : 'Select a customer to view their ledger.'}
          </p>
          {noCustomers ? (
            <button type="button" onClick={() => navigateTo(23)} className={GOLD_BTN}>
              Open Customer Master
            </button>
          ) : null}
        </div>
      ) : loading ? (
        <MasterLoading label="Loading customer ledger…" />
      ) : payload ? (
        <>
          {payload.customer_code ? (
            <p className="text-xs font-mono text-[var(--erp-muted)]">
              {payload.customer_code} · {payload.customer_name}
              {appliedFrom || appliedTo ? ` · ${appliedFrom || '…'} to ${appliedTo || '…'} · opening ${money(payload.opening_balance)}` : ''}
            </p>
          ) : null}
          {kpiMetrics.length ? (
            <LedgerMetricStrip metrics={kpiMetrics} className="lg:!grid-cols-5" />
          ) : null}
          <DataTable
            columns={columns}
            data={payload.entries}
            keyExtractor={(r, i) => `${r.type}-${r.source_id}-${i}`}
            rowClassName={(_, i) =>
              i % 2 === 1
                ? 'bg-[var(--erp-surface-2)]/35 hover:bg-[var(--erp-surface-2)]/80'
                : 'hover:bg-[var(--erp-surface-2)]/60'
            }
            {...emptyTableProps(
              payload.entries.length,
              payload.entries.length,
              'No transactions yet.',
              'No transactions in this date range.',
              '',
              () => undefined,
            )}
          />
        </>
      ) : null}
    </div>
  );
};
