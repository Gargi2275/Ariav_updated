import React, { useCallback, useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { useErp } from '../../context/ErpContext';
import { PageHeader } from '../../components/common/PageHeader';
import { DataTable, Column } from '../../components/common/DataTable';
import { TextInput } from '../../components/common/FormControls';
import { MasterError, MasterLoading, emptyTableProps } from '../masters/MasterStatus';
import { num } from '../../services/mastersApi';
import { notifyApiError } from '../../services/notify';
import { CustomerRow, customersApi } from '../../services/customersApi';
import {
  LEDGER_OPEN_PAYMENT_KEY,
  PaymentAdjustmentRow,
  paymentAdjustmentsApi,
} from '../../services/paymentsApi';

function money(value: string | number | null | undefined): string {
  return `₹${num(value).toFixed(2)}`;
}

function stampDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export const PaymentAdjustmentsScreen: React.FC = () => {
  const { navigateTo } = useErp();
  const [rows, setRows] = useState<PaymentAdjustmentRow[]>([]);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [customerId, setCustomerId] = useState<number | ''>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await paymentAdjustmentsApi.list({
        search: search || undefined,
        customer_id: customerId || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      }));
    } catch (e) {
      const parsed = notifyApiError(e, 'Could not load payment adjustments.');
      setError(parsed.message);
    } finally {
      setLoading(false);
    }
  }, [search, customerId, dateFrom, dateTo]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    void customersApi.list({ scope: 'visible' }).then(setCustomers).catch(notifyApiError);
  }, []);

  const openPayment = (paymentId: number) => {
    sessionStorage.setItem(LEDGER_OPEN_PAYMENT_KEY, String(paymentId));
    navigateTo(43);
  };

  const columns: Column<PaymentAdjustmentRow>[] = [
    { header: 'Date', width: '110px', mono: true, render: r => stampDate(r.created_at) },
    {
      header: 'Payment Number',
      render: r => (
        <button
          type="button"
          className="font-mono text-[var(--erp-gold)] hover:underline cursor-pointer"
          onClick={() => openPayment(r.payment_id)}
        >
          {r.payment_number}
        </button>
      ),
    },
    { header: 'Customer', render: r => <span>{r.customer_name}</span> },
    { header: 'Invoice', mono: true, render: r => r.invoice_number },
    { header: 'Amount', align: 'right', mono: true, width: '110px', render: r => money(r.amount) },
    { header: 'Reason', render: r => <span>{r.reason}</span> },
    { header: 'Created By', width: '140px', mono: true, render: r => r.created_by_name || '—' },
  ];

  return (
    <div className="p-6 flex flex-col gap-6 text-left">
      <PageHeader
        moduleNumber="45"
        section="Accounts"
        title="Payment Adjustments"
        subtitle="Audit trail of unallocated advances applied to invoices after receipt"
      />
      {error && <MasterError message={error} onRetry={() => void load()} />}
      <div className="flex flex-col lg:flex-row items-start lg:items-end justify-between gap-3 bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] p-3">
        <div className="relative w-full lg:w-80">
          <Search className="w-4 h-4 text-[var(--erp-muted)] absolute left-3 top-2.5" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search reason, reference, payment, invoice…"
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)] focus:border-[var(--erp-gold)] focus:outline-none font-mono"
          />
        </div>
        <div className="flex flex-wrap items-end gap-3 w-full lg:w-auto">
          <label className="flex flex-col gap-1 text-xs text-[var(--erp-muted)]">
            Customer
            <select
              value={customerId}
              onChange={e => setCustomerId(e.target.value ? Number(e.target.value) : '')}
              className="px-2 py-1 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)] font-mono text-xs min-w-[180px]"
            >
              <option value="">All customers</option>
              {customers.map(c => (
                <option key={c.id} value={c.id}>{c.customer_code} · {c.customer_name}</option>
              ))}
            </select>
          </label>
          <TextInput label="From" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          <TextInput label="To" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        </div>
      </div>
      {loading ? (
        <MasterLoading label="Loading payment adjustments…" />
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          keyExtractor={r => r.id}
          {...emptyTableProps(
            rows.length,
            rows.length,
            'No payment adjustments yet.',
            'No payment adjustments match this filter.',
            '',
            () => undefined,
          )}
        />
      )}
    </div>
  );
};
