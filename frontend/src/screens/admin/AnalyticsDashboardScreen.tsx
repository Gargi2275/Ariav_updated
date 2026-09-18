import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Building, Boxes, FileText } from 'lucide-react';
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

function kpiStrip(data: SnapshotDashboard): LedgerMetricItem[] {
  const k = data.kpis;
  return [
    { label: 'Total Sales', value: money(k.total_sales), subValue: `${k.total_invoices} issued invoices` },
    { label: 'Collections', value: money(k.total_collections), subValue: 'Payment receipts' },
    { label: 'Outstanding', value: money(k.total_outstanding), subValue: 'Unpaid invoice balance' },
    { label: 'Overdue', value: money(k.total_overdue), subValue: 'Past due remaining' },
    { label: 'Advance / Unadjusted', value: money(k.total_advance), subValue: 'Unallocated payments' },
    { label: 'Bad Debt', value: money(k.bad_debt), subValue: 'Not tracked yet', badge: 'N/A' },
  ];
}

function opsStrip(data: SnapshotDashboard): LedgerMetricItem[] {
  const k = data.kpis;
  return [
    { label: 'Purchase Orders', value: k.total_pos, subValue: `${k.pending_pos} pending` },
    { label: 'Fully Dispatched', value: k.dispatched_pos, subValue: `${k.partially_dispatched_pos} partial` },
    { label: 'Active Customers', value: k.active_customers },
    { label: 'Active Brands', value: k.active_brands },
    { label: 'Active Products', value: k.active_products },
    { label: 'Active Entities', value: k.active_entities },
  ];
}

const barColors = ['var(--erp-gold)', 'var(--erp-positive)', 'var(--erp-muted)', 'var(--erp-text)'];

export const AnalyticsDashboardScreen: React.FC = () => {
  const { navigateTo, userRole, selectedEntityId, selectedBranch } = useErp();
  const isAdmin = userRole === 'admin';
  const [snapshot, setSnapshot] = useState<SnapshotDashboard | null>(null);
  const [staff, setStaff] = useState<StaffDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
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
  }, [selectedEntityId, isAdmin]);

  useEffect(() => { void load(); }, [load]);

  const openLedger = (customerId: number) => {
    sessionStorage.setItem(CUSTOMER_LEDGER_KEY, String(customerId));
    navigateTo(44);
  };

  const debtorColumns: Column<DebtorRow>[] = [
    {
      header: 'Customer',
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
    <div className="p-6 flex flex-col gap-6 text-left">
      <PageHeader
        moduleNumber="06"
        section={isAdmin ? 'Dashboard' : 'Staff'}
        title={isAdmin ? 'Business Analytics & Position' : 'Staff Activity'}
        subtitle={
          isAdmin
            ? `Live totals scoped to ${selectedBranch.name} from the header entity dropdown`
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
          <LedgerMetricStrip metrics={kpiStrip(snapshot)} />
          <LedgerMetricStrip metrics={opsStrip(snapshot)} />
          <div className={`grid grid-cols-1 gap-6 ${selectedEntityId === 'all' ? 'lg:grid-cols-3' : 'lg:grid-cols-2'}`}>
            {selectedEntityId === 'all' ? (
            <div className="border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] p-5 rounded-[14px]" style={{ boxShadow: 'var(--erp-shadow)' }}>
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-[var(--erp-hairline)]">
                <span className="font-display text-sm font-bold text-[var(--erp-text)] flex items-center gap-2">
                  <Building className="w-4 h-4 stroke-[1.75] text-[var(--erp-gold)]" />
                  Entity Turnover Distribution
                </span>
                <span className="erp-badge erp-badge-gold text-[10px]">{snapshot.entity_turnover.length} entities</span>
              </div>
              {snapshot.entity_turnover.length ? (
                <div className="space-y-4 font-mono text-xs">
                  {snapshot.entity_turnover.map((row, idx) => (
                    <div key={row.entity_id}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-body text-[var(--erp-text)]">{row.short_code} · {row.entity_name}</span>
                        <span className="font-mono text-[var(--erp-gold)] font-semibold">{money(row.total_sales)} ({num(row.percent).toFixed(1)}%)</span>
                      </div>
                      <div className="w-full h-2 bg-[var(--erp-surface-2)] overflow-hidden">
                        <div className="h-full" style={{ width: `${Math.min(100, num(row.percent))}%`, background: barColors[idx % barColors.length] }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs font-mono text-[var(--erp-muted)]">No issued invoices yet.</p>
              )}
            </div>
            ) : null}

            <div className="border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] p-5 rounded-[14px]" style={{ boxShadow: 'var(--erp-shadow)' }}>
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-[var(--erp-hairline)]">
                <span className="font-display text-sm font-bold text-[var(--erp-text)] flex items-center gap-2">
                  <Boxes className="w-4 h-4 stroke-[1.75] text-[var(--erp-gold)]" />
                  Category Share
                </span>
                <span className="erp-badge erp-badge-neutral text-[10px]">Invoiced qty</span>
              </div>
              {snapshot.category_share.length ? (
                <div className="space-y-2.5 font-mono text-xs">
                  {snapshot.category_share.map(row => (
                    <div key={row.category_name} className="flex items-center justify-between">
                      <span className="font-body text-[var(--erp-text)]">{row.category_name}</span>
                      <span className="font-mono text-[var(--erp-text)] font-semibold">{num(row.percent).toFixed(1)}% · {num(row.quantity).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs font-mono text-[var(--erp-muted)]">No invoiced product quantities yet.</p>
              )}
            </div>

            <div className="border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] p-5 rounded-[14px]" style={{ boxShadow: 'var(--erp-shadow)' }}>
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-[var(--erp-hairline)]">
                <span className="font-display text-sm font-bold text-[var(--erp-text)] flex items-center gap-2">
                  <FileText className="w-4 h-4 stroke-[1.75] text-[var(--erp-gold)]" />
                  Top 5 Products
                </span>
                <span className="erp-badge erp-badge-neutral text-[10px]">By quantity</span>
              </div>
              {snapshot.top_products.length ? (
                <div className="space-y-2.5 font-mono text-xs">
                  {snapshot.top_products.map(row => (
                    <div key={row.product_id} className="flex items-center justify-between">
                      <span className="font-body text-[var(--erp-text)]">{row.product_code} · {row.product_name}</span>
                      <span className="font-mono font-semibold">{num(row.quantity).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs font-mono text-[var(--erp-muted)]">No invoiced products yet.</p>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-serif text-lg font-bold text-[var(--erp-text)] flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-[var(--erp-negative)]" />
                  Debtor Outstanding & Credit Aging
                </h3>
                <p className="text-xs text-[var(--erp-muted)] font-sans">
                  Customers with unpaid issued invoices, sorted by outstanding descending.
                </p>
              </div>
              <button type="button" onClick={() => navigateTo(44)} className="text-xs font-mono text-[var(--erp-gold)] hover:underline cursor-pointer">
                Open Customer Ledger →
              </button>
            </div>
            <DataTable
              columns={debtorColumns}
              data={snapshot.debtors}
              keyExtractor={r => r.customer_id}
              {...emptyTableProps(snapshot.debtors.length, snapshot.debtors.length, 'No outstanding customers.', 'No outstanding customers.', '', () => undefined)}
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
      <p className="text-[11px] font-mono text-[var(--erp-muted)]">Showing records you created. Customer assignment will apply once roles exist.</p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <MiniTable
          title="Recent purchase orders"
          empty="No purchase orders you created."
          rows={data.recent_purchase_orders}
          columns={['PO', 'Customer', 'Status']}
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
          columns={['PO', 'Customer', 'Status']}
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
          columns={['Payment', 'Customer', 'Amount']}
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
