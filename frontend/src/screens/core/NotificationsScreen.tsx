import React, { useCallback, useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { useErp } from '../../context/ErpContext';
import { PageHeader } from '../../components/common/PageHeader';
import { DataTable, Column } from '../../components/common/DataTable';
import { StatusChip, StatusChipType } from '../../components/common/StatusChip';
import { TextInput } from '../../components/common/FormControls';
import { MasterError, MasterLoading, emptyTableProps } from '../masters/MasterStatus';
import { notifyApiError, notifySuccess } from '../../services/notify';
import { LEDGER_OPEN_INVOICE_KEY } from '../../services/invoicesApi';
import { LEDGER_OPEN_PAYMENT_KEY } from '../../services/paymentsApi';
import { OPEN_PO_KEY } from '../../services/purchaseOrdersApi';
import { OPEN_DISPATCH_KEY } from '../../services/dispatchesApi';
import {
  NOTIFICATION_STATUSES,
  NOTIFICATION_TYPES,
  NotificationRow,
  notificationsApi,
  relativeTime,
} from '../../services/notificationsApi';

function statusChip(status: string): StatusChipType | string {
  if (status === 'Unread') return 'notice';
  if (status === 'Dismissed') return 'inactive';
  return 'paid';
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

export const NotificationsScreen: React.FC = () => {
  const { navigateTo } = useErp();
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await notificationsApi.list({
        search: search || undefined,
        notification_type: typeFilter || undefined,
        status: statusFilter || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      }));
    } catch (e) {
      const parsed = notifyApiError(e, 'Could not load notifications.');
      setError(parsed.message);
    } finally {
      setLoading(false);
    }
  }, [search, typeFilter, statusFilter, dateFrom, dateTo]);

  useEffect(() => { void load(); }, [load]);

  const openRow = async (row: NotificationRow) => {
    if (row.status === 'Unread') {
      try {
        await notificationsApi.markRead(row.id);
        setRows(prev => prev.map(r => (r.id === row.id ? { ...r, status: 'Read' } : r)));
      } catch (e) {
        notifyApiError(e);
      }
    }
    if (row.reference_type === 'Invoice') {
      sessionStorage.setItem(LEDGER_OPEN_INVOICE_KEY, String(row.reference_id));
      navigateTo(42);
      return;
    }
    if (row.reference_type === 'Payment') {
      sessionStorage.setItem(LEDGER_OPEN_PAYMENT_KEY, String(row.reference_id));
      navigateTo(43);
      return;
    }
    if (row.reference_type === 'PurchaseOrder') {
      sessionStorage.setItem(OPEN_PO_KEY, String(row.reference_id));
      navigateTo(40);
      return;
    }
    if (row.reference_type === 'Dispatch') {
      sessionStorage.setItem(OPEN_DISPATCH_KEY, String(row.reference_id));
      navigateTo(41);
    }
  };

  const markAll = async () => {
    try {
      await notificationsApi.markAllRead();
      notifySuccess('All notifications marked read.');
      await load();
    } catch (e) {
      notifyApiError(e);
    }
  };

  const columns: Column<NotificationRow>[] = [
    { header: 'Date', width: '110px', mono: true, render: r => stampDate(r.created_at) },
    { header: 'When', width: '80px', mono: true, render: r => relativeTime(r.created_at) },
    {
      header: 'Status',
      width: '110px',
      render: r => <StatusChip status={statusChip(r.status)} label={r.status.toUpperCase()} />,
    },
    { header: 'Type', width: '170px', render: r => <span className="text-xs">{r.notification_type}</span> },
    {
      header: 'Title',
      render: r => (
        <button
          type="button"
          className="text-left font-medium text-[var(--erp-gold)] hover:underline cursor-pointer"
          onClick={() => void openRow(r)}
        >
          {r.title}
        </button>
      ),
    },
    { header: 'Customer', render: r => r.customer_name || '—' },
  ];

  return (
    <div className="p-6 flex flex-col gap-6 text-left">
      <PageHeader
        moduleNumber="46"
        section="Accounts"
        title="Notifications"
        subtitle="Invoice due reminders and payment, PO and dispatch events"
        actions={
          <button type="button" onClick={() => void markAll()} className="px-4 py-1.5 border border-[var(--erp-gold)] text-[var(--erp-gold)] font-body text-xs font-semibold cursor-pointer">
            Mark all read
          </button>
        }
      />
      {error && <MasterError message={error} onRetry={() => void load()} />}
      <div className="flex flex-col lg:flex-row items-start lg:items-end justify-between gap-3 bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] p-3">
        <div className="relative w-full lg:w-80">
          <Search className="w-4 h-4 text-[var(--erp-muted)] absolute left-3 top-2.5" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search title or message…"
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)] focus:border-[var(--erp-gold)] focus:outline-none font-mono"
          />
        </div>
        <div className="flex flex-wrap items-end gap-3 w-full lg:w-auto">
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="px-2 py-1 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)] font-mono text-xs min-w-[160px]"
          >
            <option value="">All types</option>
            {NOTIFICATION_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-2 py-1 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)] font-mono text-xs"
          >
            <option value="">All statuses</option>
            {NOTIFICATION_STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
          <TextInput label="From" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          <TextInput label="To" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        </div>
      </div>
      {loading ? (
        <MasterLoading label="Loading notifications…" />
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          keyExtractor={r => r.id}
          {...emptyTableProps(
            rows.length,
            rows.length,
            'No notifications yet.',
            'No notifications match this filter.',
            '',
            () => undefined,
          )}
        />
      )}
    </div>
  );
};
