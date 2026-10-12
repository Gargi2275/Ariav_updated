import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { useErp } from '../../context/ErpContext';
import { PageHeader } from '../../components/common/PageHeader';
import { LedgerMetricStrip, LedgerMetricItem } from '../../components/common/LedgerMetricStrip';
import { DataTable, Column } from '../../components/common/DataTable';
import { StatusChip, StatusChipType } from '../../components/common/StatusChip';
import { MasterError, MasterLoading, emptyTableProps } from '../masters/MasterStatus';
import { num } from '../../services/mastersApi';
import { notifyApiError } from '../../services/notify';
import { CUSTOMER_LEDGER_KEY } from '../../services/customersApi';
import { LEDGER_OPEN_INVOICE_KEY } from '../../services/invoicesApi';
import { LEDGER_OPEN_PAYMENT_KEY } from '../../services/paymentsApi';
import { OPEN_PO_KEY } from '../../services/purchaseOrdersApi';
import { OPEN_DISPATCH_KEY } from '../../services/dispatchesApi';
import {
  DebtorRow,
  SnapshotDashboard,
  StaffDashboard,
  dashboardsApi,
} from '../../services/dashboardsApi';

function money(value: string | number | null | undefined): string {
  return `₹${num(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function riskChip(band: string): StatusChipType {
  if (band === 'Overdue') return 'overdue';
  if (band === 'Due Soon') return 'due soon';
  return 'within limit';
}

function kpiStrip(data: SnapshotDashboard, navigateTo: (id: number) => void): LedgerMetricItem[] {
  const k = data.kpis;
  return [
    { label: 'Total order booking', value: money(k.total_sales), subValue: `${k.total_invoices} issued invoices`, onClick: () => navigateTo(42), hrefLabel: 'Invoices' },
    { label: 'Collections', value: money(k.total_collections), subValue: 'Payment receipts', onClick: () => navigateTo(43), hrefLabel: 'Payments' },
    { label: 'Outstanding', value: money(k.total_outstanding), subValue: 'Unpaid invoice balance', onClick: () => navigateTo(44), hrefLabel: 'Party Ledger' },
    { label: 'Overdue', value: money(k.total_overdue), subValue: 'Past due remaining', onClick: () => navigateTo(44), hrefLabel: 'Party Ledger' },
    { label: 'Advance / Unadjusted', value: money(k.total_advance), subValue: 'Unallocated payments', onClick: () => navigateTo(43), hrefLabel: 'Payments' },
    { label: 'Bad Debt', value: k.bad_debt == null ? '—' : money(k.bad_debt), subValue: k.bad_debt == null ? 'Not available' : 'Write-off balance', badge: k.bad_debt == null ? 'N/A' : undefined },
  ];
}

function opsStrip(
  data: SnapshotDashboard,
  navigateTo: (id: number) => void,
  showEntityCount: boolean,
): LedgerMetricItem[] {
  const k = data.kpis;
  const metrics: LedgerMetricItem[] = [
    { label: 'Purchase Orders', value: k.total_pos, subValue: `${k.pending_pos} pending`, onClick: () => navigateTo(40), hrefLabel: 'Purchase Orders' },
    { label: 'Fully Dispatched', value: k.dispatched_pos, subValue: `${k.partially_dispatched_pos} partial`, onClick: () => navigateTo(40), hrefLabel: 'Purchase Orders' },
    { label: 'PO Balance', value: k.pending_financial_pos, subValue: `${k.clear_pos} clear`, onClick: () => navigateTo(40), hrefLabel: 'Purchase Orders' },
    { label: 'Active Parties', value: k.active_customers, onClick: () => navigateTo(23), hrefLabel: 'Party Master' },
    { label: 'Active Brands', value: k.active_brands, onClick: () => navigateTo(37), hrefLabel: 'Brand Master' },
    { label: 'Active Products', value: k.active_products, onClick: () => navigateTo(39), hrefLabel: 'Product Catalogue' },
  ];
  if (showEntityCount) {
    metrics.push({ label: 'Active Branches', value: k.active_entities, onClick: () => navigateTo(36), hrefLabel: 'Branch Master' });
  }
  return metrics;
}

export const AnalyticsDashboardScreen: React.FC = () => {
  const { navigateTo, userRole, selectedEntityId, selectedBranch, entityReady } = useErp();
  const isAdmin = userRole === 'admin';
  const [snapshot, setSnapshot] = useState<SnapshotDashboard | null>(null);
  const [staff, setStaff] = useState<StaffDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!entityReady) return;
    setLoading(true);
    setError('');
    try {
      if (!isAdmin) {
        setStaff(await dashboardsApi.staff());
        setSnapshot(null);
      } else {
        setSnapshot(await dashboardsApi.admin(selectedEntityId));
        setStaff(null);
      }
    } catch (e) {
      const parsed = notifyApiError(e, 'Could not load dashboard.');
      setError(parsed.message);
      setSnapshot(null);
      setStaff(null);
    } finally {
      setLoading(false);
    }
  }, [selectedEntityId, isAdmin, entityReady]);

  useEffect(() => { void load(); }, [load]);

  const openLedger = (customerId: number) => {
    sessionStorage.setItem(CUSTOMER_LEDGER_KEY, String(customerId));
    navigateTo(44);
  };

  const debtorColumns: Column<DebtorRow>[] = [
    {
      header: 'Party',
      render: r => (
        <button type="button" className="text-left cursor-pointer" onClick={() => openLedger(r.customer_id)}>
          <span className="font-body font-medium text-[var(--erp-gold)] hover:underline">{r.customer_name}</span>
          <span className="text-[11px] font-mono text-[var(--erp-muted)] block">{r.customer_code}</span>
        </button>
      ),
    },
    {
      header: 'Outstanding Amount',
      align: 'right',
      mono: true,
      render: r => money(r.outstanding),
    },
    {
      header: 'Credit Days',
      align: 'center',
      mono: true,
      render: r => <span className="font-mono">{r.credit_days}d</span>,
    },
    {
      header: 'Days Overdue',
      align: 'center',
      mono: true,
      render: r => (
        <span className={`font-mono ${r.days_overdue > 0 ? 'text-[var(--erp-negative)] font-bold' : 'text-[var(--erp-positive)]'}`}>
          {r.days_overdue > 0 ? `+${r.days_overdue} days` : 'Current'}
        </span>
      ),
    },
    {
      header: 'Risk Band',
      align: 'center',
      render: r => <StatusChip status={riskChip(r.risk_band)} label={r.risk_band.toUpperCase()} />,
    },
  ];

  return (
    <div className="p-4 lg:p-5 flex flex-col gap-4 text-left">
      <PageHeader
        moduleNumber="06"
        section={isAdmin ? 'Dashboard' : 'Staff'}
        title={isAdmin ? 'Business Analytics & Position' : 'Staff Activity'}
        compact
        subtitle={
          isAdmin
            ? `Live totals scoped to ${selectedBranch.name} from the header branch dropdown`
            : 'Your purchase orders, invoices, dispatches and payments — records you created'
        }
      />

      {error && <MasterError message={error} onRetry={() => void load()} />}
      {loading ? (
        <MasterLoading label="Loading dashboard…" />
      ) : !isAdmin && staff ? (
        <StaffPanels data={staff} navigateTo={navigateTo} />
      ) : isAdmin && snapshot ? (
        <>
          <LedgerMetricStrip compact metrics={kpiStrip(snapshot, navigateTo)} />
          <LedgerMetricStrip
            compact
            metrics={opsStrip(snapshot, navigateTo, selectedEntityId === 'all')}
            className={selectedEntityId === 'all' ? 'lg:grid-cols-7' : 'lg:grid-cols-6'}
          />
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display text-sm font-bold text-[var(--erp-text)] flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-[var(--erp-negative)]" />
                  Debtor Outstanding & Credit Aging
                </h3>
                <p className="text-[11px] text-[var(--erp-muted)] font-sans">
                  Parties with unpaid issued invoices, sorted by outstanding descending.
                </p>
              </div>
              <button type="button" onClick={() => navigateTo(44)} className="text-xs font-mono text-[var(--erp-gold)] hover:underline cursor-pointer">
                Open Party Ledger →
              </button>
            </div>
            <DataTable
              columns={debtorColumns}
              data={snapshot.debtors}
              keyExtractor={r => r.customer_id}
              density="compact"
              maxHeight="420px"
              {...emptyTableProps(snapshot.debtors.length, snapshot.debtors.length, 'No outstanding parties.', 'No outstanding parties.', '', () => undefined)}
              rowClassName={r =>
                r.risk_band === 'Overdue'
                  ? 'bg-[rgba(217,99,90,0.07)] hover:bg-[rgba(217,99,90,0.13)] border-l-2 border-l-[var(--erp-negative)]'
                  : r.risk_band === 'Due Soon'
                    ? 'bg-[rgba(201,162,78,0.04)] hover:bg-[rgba(201,162,78,0.09)]'
                    : ''
              }
            />
          </div>
        </>
      ) : null}
    </div>
  );
};

function StaffPanels({
  data,
  navigateTo,
}: {
  data: StaffDashboard;
  navigateTo: (id: number) => void;
}) {
  const k = data.kpis;
  const metrics: LedgerMetricItem[] = [
    { label: 'POs created', value: k.purchase_orders_created, subValue: `${k.pending_pos_created} pending` },
    { label: 'Pending invoices', value: k.pending_invoices_created },
    { label: 'Dispatches recorded', value: k.dispatches_recorded },
    { label: 'Payments recorded', value: k.payments_recorded },
  ];
  return (
    <>
      <LedgerMetricStrip metrics={metrics} className="lg:grid-cols-4" />
      <p className="text-[11px] font-mono text-[var(--erp-muted)]">Showing records you created. Party assignment will apply once roles exist.</p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <MiniTable
          title="Recent purchase orders"
          empty="No purchase orders you created."
          rows={data.recent_purchase_orders}
          columns={['PO', 'Party', 'Status']}
          render={row => [row.po_number, row.customer_name, row.status]}
          onOpen={row => {
            sessionStorage.setItem(OPEN_PO_KEY, String(row.id));
            navigateTo(40);
          }}
        />
        <MiniTable
          title="Pending purchase orders"
          empty="No pending POs you created."
          rows={data.pending_purchase_orders}
          columns={['PO', 'Party', 'Status']}
          render={row => [row.po_number, row.customer_name, row.status]}
          onOpen={row => {
            sessionStorage.setItem(OPEN_PO_KEY, String(row.id));
            navigateTo(40);
          }}
        />
        <MiniTable
          title="Pending invoices"
          empty="No pending invoices you created."
          rows={data.pending_invoices}
          columns={['Invoice', 'Date', 'Amount']}
          render={row => [row.invoice_number, row.invoice_date, money(row.net_amount)]}
          onOpen={row => {
            sessionStorage.setItem(LEDGER_OPEN_INVOICE_KEY, String(row.id));
            navigateTo(42);
          }}
        />
        <MiniTable
          title="Recent dispatches"
          empty="No dispatches you recorded."
          rows={data.recent_dispatches}
          columns={['LR', 'PO', 'Date']}
          render={row => [row.lr_number, row.po_number, row.dispatch_date]}
          onOpen={row => {
            sessionStorage.setItem(OPEN_DISPATCH_KEY, String(row.id));
            navigateTo(41);
          }}
        />
        <MiniTable
          title="Recent payments"
          empty="No payments you recorded."
          rows={data.recent_payments}
          columns={['Payment', 'Party', 'Amount']}
          render={row => [row.payment_number, row.customer_name, money(row.amount)]}
          onOpen={row => {
            sessionStorage.setItem(LEDGER_OPEN_PAYMENT_KEY, String(row.id));
            navigateTo(43);
          }}
        />
      </div>
    </>
  );
}

function MiniTable<T extends { id: number }>({
  title,
  empty,
  rows,
  columns,
  render,
  onOpen,
}: {
  title: string;
  empty: string;
  rows: T[];
  columns: string[];
  render: (row: T) => (string | number)[];
  onOpen: (row: T) => void;
}) {
  return (
    <div className="border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] p-4" style={{ boxShadow: 'var(--erp-shadow)' }}>
      <h4 className="font-display text-sm font-bold mb-3">{title}</h4>
      {rows.length ? (
        <table className="w-full text-left text-xs">
          <thead className="font-mono text-[10px] uppercase tracking-wider text-[var(--erp-muted)]">
            <tr>{columns.map(c => <th key={c} className="pb-2">{c}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const cells = render(row);
              return (
                <tr key={row.id} className="border-t border-[var(--erp-hairline)]">
                  <td className="py-2">
                    <button type="button" className="font-mono text-[var(--erp-gold)] hover:underline cursor-pointer" onClick={() => onOpen(row)}>{cells[0]}</button>
                  </td>
                  {cells.slice(1).map((cell, i) => (
                    <td key={i} className="py-2 font-mono">{cell}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p className="text-xs font-mono text-[var(--erp-muted)]">{empty}</p>
      )}
    </div>
  );
}
