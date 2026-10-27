import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Boxes,
  ClipboardList,
  IndianRupee,
  PackageCheck,
  RefreshCw,
  Truck,
  Users,
  Wallet,
} from 'lucide-react';
import { useErp } from '../../context/ErpContext';
import { usePreferences } from '../../context/PreferencesContext';
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
import { periodLabel } from '../../utils/dateFilters';

function money(value: string | number | null | undefined): string {
  return `₹${num(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function riskChip(band: string): StatusChipType {
  if (band === 'Overdue') return 'overdue';
  if (band === 'Due Soon') return 'due soon';
  return 'within limit';
}

function formatAsOf(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export const AnalyticsDashboardScreen: React.FC = () => {
  const {
    navigateTo,
    userRole,
    selectedEntityId,
    selectedBranch,
    entityReady,
    getPeriod,
    financialYear,
    periodMonth,
    setSelectedEntityId,
    approvalQueue,
    approvalQueueLoaded,
  } = useErp();
  const { preferences } = usePreferences();
  const period = getPeriod();
  const isAdmin = userRole === 'admin';
  const scopeKey = `${isAdmin ? 'admin' : 'staff'}|${selectedEntityId}|${period.from}|${period.to}`;
  const [snapshot, setSnapshot] = useState<SnapshotDashboard | null>(null);
  const [staff, setStaff] = useState<StaffDashboard | null>(null);
  const [shownKey, setShownKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);
  const compact = preferences.density === 'compact';

  const load = useCallback(async () => {
    if (!entityReady) return;
    setLoading(true);
    setError('');
    try {
      if (!isAdmin) {
        setStaff(await dashboardsApi.staff());
        setSnapshot(null);
      } else {
        setSnapshot(await dashboardsApi.admin(selectedEntityId, { from: period.from, to: period.to }));
        setStaff(null);
      }
      setShownKey(scopeKey);
      setRefreshedAt(new Date());
    } catch (e) {
      const parsed = notifyApiError(e, 'Could not load dashboard.');
      setError(parsed.message);
    } finally {
      setLoading(false);
    }
  }, [selectedEntityId, isAdmin, entityReady, period.from, period.to, scopeKey]);

  useEffect(() => { void load(); }, [load]);

  const openLedger = (customerId: number) => {
    sessionStorage.setItem(CUSTOMER_LEDGER_KEY, String(customerId));
    navigateTo(44);
  };

  const currentSnapshot = shownKey === scopeKey ? snapshot : null;
  const currentStaff = shownKey === scopeKey ? staff : null;
  const showSkeleton = loading && !currentSnapshot && !currentStaff;

  return (
    <div className={`dashboard-page flex flex-col text-left ${compact ? 'gap-3 p-3 lg:p-4' : 'gap-5 p-4 lg:p-6'}`}>
      <header className="flex flex-col gap-3 border-b border-[var(--erp-hairline-strong)] pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs text-[var(--erp-muted)]">{isAdmin ? 'Dashboard' : 'Staff'}</p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-[var(--erp-text)] sm:text-3xl">
            {isAdmin ? 'Business Analytics & Position' : 'Staff Activity'}
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-[var(--erp-muted)]">
            {isAdmin
              ? `${selectedBranch.name} · ${periodLabel(financialYear, periodMonth)}. Booking, collections, and purchase orders follow this period. Outstanding balances are live.`
              : 'Purchase orders, invoices, dispatches, and payments you created.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {currentSnapshot ? (
            <p className="font-mono text-xs text-[var(--erp-muted)]">
              Position as of {formatAsOf(currentSnapshot.as_of)}
              {refreshedAt ? ` · Refreshed ${refreshedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : ''}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading || !entityReady}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] px-3 text-sm text-[var(--erp-text)] hover:border-[var(--erp-gold)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--erp-gold)] disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            {loading && (currentSnapshot || currentStaff) ? 'Refreshing' : 'Refresh'}
          </button>
        </div>
      </header>

      {error ? <MasterError message={error} onRetry={() => void load()} /> : null}
      {showSkeleton ? <MasterLoading label="Loading dashboard…" /> : null}
      {!showSkeleton && !isAdmin && currentStaff ? <StaffPanels data={currentStaff} navigateTo={navigateTo} /> : null}
      {!showSkeleton && isAdmin && currentSnapshot ? (
        <AdminPosition
          data={currentSnapshot}
          compact={compact}
          navigateTo={navigateTo}
          openLedger={openLedger}
          onBranch={id => setSelectedEntityId(id)}
          pendingApprovals={approvalQueueLoaded ? approvalQueue.filter(row => row.status === 'pending').length : null}
        />
      ) : null}
    </div>
  );
};

function AdminPosition({
  data,
  compact,
  navigateTo,
  openLedger,
  onBranch,
  pendingApprovals,
}: {
  data: SnapshotDashboard;
  compact: boolean;
  navigateTo: (id: number) => void;
  openLedger: (customerId: number) => void;
  onBranch: (id: number) => void;
  pendingApprovals: number | null;
}) {
  const k = data.kpis;
  const debtorColumns: Column<DebtorRow>[] = [
    {
      header: 'Party',
      render: row => (
        <button type="button" className="cursor-pointer text-left" onClick={() => openLedger(row.customer_id)}>
          <span className="font-medium text-[var(--erp-gold)] hover:underline">{row.customer_name}</span>
          <span className="block font-mono text-xs text-[var(--erp-muted)]">{row.customer_code}</span>
        </button>
      ),
    },
    { header: 'Outstanding Amount', align: 'right', mono: true, render: row => money(row.outstanding) },
    { header: 'Credit Days', align: 'center', mono: true, render: row => <span className="font-mono">{row.credit_days}d</span> },
    {
      header: 'Days Overdue',
      align: 'center',
      mono: true,
      render: row => (
        <span className={`font-mono ${row.days_overdue > 0 ? 'font-bold text-[var(--erp-negative)]' : 'text-[var(--erp-positive)]'}`}>
          {row.days_overdue > 0 ? `+${row.days_overdue} days` : 'Current'}
        </span>
      ),
    },
    { header: 'Risk Band', align: 'center', render: row => <StatusChip status={riskChip(row.risk_band)} label={row.risk_band} /> },
  ];

  const bands = useMemo(() => {
    const order = ['Overdue', 'Due Soon', 'Current'];
    const totals = new Map(order.map(name => [name, { count: 0, amount: 0 }]));
    data.debtors.forEach(row => {
      const bucket = totals.get(row.risk_band) || { count: 0, amount: 0 };
      bucket.count += 1;
      bucket.amount += num(row.outstanding);
      totals.set(row.risk_band, bucket);
    });
    return order.map(name => ({ name, ...totals.get(name)! }));
  }, [data.debtors]);

  const attention = [
    pendingApprovals != null && pendingApprovals > 0 ? {
      title: 'Pending approvals',
      detail: `${pendingApprovals} sign-in ${pendingApprovals === 1 ? 'request is' : 'requests are'} waiting.`,
      action: 'Open approval queue',
      onClick: () => navigateTo(5),
      tone: 'gold' as const,
    } : null,
    num(k.total_overdue) > 0 ? {
      title: 'Overdue receivables',
      detail: `${money(k.total_overdue)} is past due on issued invoices.`,
      action: 'Open party ledger',
      onClick: () => navigateTo(44),
      tone: 'negative' as const,
    } : null,
    k.pending_pos > 0 ? {
      title: 'Purchase orders not yet dispatched',
      detail: `${k.pending_pos} ${k.pending_pos === 1 ? 'is' : 'are'} draft, submitted, or sent to brand.`,
      action: 'Open purchase orders',
      onClick: () => navigateTo(40),
      tone: 'gold' as const,
    } : null,
    (k.unpriced_po_lines || 0) > 0 ? {
      title: 'Purchase-order lines without a rate',
      detail: `${k.unpriced_po_lines} ${k.unpriced_po_lines === 1 ? 'line has' : 'lines have'} no rate in this period.`,
      action: 'Open purchase orders',
      onClick: () => navigateTo(40),
      tone: 'gold' as const,
    } : null,
  ].filter(Boolean) as { title: string; detail: string; action: string; onClick: () => void; tone: 'gold' | 'negative' }[];

  return (
    <>
      <section aria-label="Primary position" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Kpi icon={<IndianRupee className="h-4 w-4" />} label="Total order booking" value={k.order_booking == null ? '—' : money(k.order_booking)} detail={k.order_booking == null ? 'Not available from this response' : 'Purchase-order line value in this period, excluding cancelled and rejected orders'} onClick={() => navigateTo(40)} action="Purchase orders" />
        <Kpi icon={<Wallet className="h-4 w-4" />} label="Collections" value={money(k.total_collections)} detail="Payment receipts in this period" onClick={() => navigateTo(43)} action="Payments" />
        <Kpi icon={<Users className="h-4 w-4" />} label="Outstanding receivables" value={money(k.total_outstanding)} detail="Live unpaid invoice balance" onClick={() => navigateTo(44)} action="Party ledger" />
        <Kpi icon={<AlertCircle className="h-4 w-4" />} label="Overdue receivables" value={money(k.total_overdue)} detail="Live balance past the due date" onClick={() => navigateTo(44)} action="Party ledger" warn={num(k.total_overdue) > 0} />
        <Kpi icon={<ClipboardList className="h-4 w-4" />} label="Purchase orders" value={k.total_pos} detail={`${k.pending_pos} pending in this period`} onClick={() => navigateTo(40)} action="Purchase orders" />
        <Kpi icon={<Truck className="h-4 w-4" />} label="Fully dispatched" value={k.dispatched_pos} detail={`${k.partially_dispatched_pos} partially dispatched · ${k.clear_pos} financially clear`} onClick={() => navigateTo(40)} action="Purchase orders" />
      </section>

      <section aria-label="Supporting counts" className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        <Mini label="Advance / unadjusted" value={money(k.total_advance)} onClick={() => navigateTo(43)} />
        <Mini label="Bad debt" value={k.bad_debt == null ? '—' : money(k.bad_debt)} hint={k.bad_debt == null ? 'Not available' : 'Write-off balance'} />
        <Mini label="Issued invoices" value={money(k.total_sales)} hint={`${k.total_invoices} in this period`} onClick={() => navigateTo(42)} />
        <Mini label="Active parties" value={k.active_customers} onClick={() => navigateTo(23)} />
        <Mini label="Active brands" value={k.active_brands} onClick={() => navigateTo(37)} />
        <Mini label="Active products" value={k.active_products} onClick={() => navigateTo(39)} />
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel title="Period flows" note="Order booking is purchase-order line value. Collections are payment receipts. Issued invoice value is shown separately and is not added into booking.">
          <BarList
            rows={[
              ...(k.order_booking == null ? [] : [{ key: 'booking', label: 'Order booking', value: num(k.order_booking), display: money(k.order_booking), color: 'var(--erp-gold)', onClick: () => navigateTo(40) }]),
              { key: 'collections', label: 'Collections', value: num(k.total_collections), display: money(k.total_collections), color: 'var(--erp-positive)', onClick: () => navigateTo(43) },
            ]}
            empty="No data for this period."
          />
        </Panel>
        <Panel title="Live receivables" note="Outstanding and overdue are current invoice balances. They are not limited to the selected month.">
          <BarList
            rows={[
              { key: 'outstanding', label: 'Outstanding', value: num(k.total_outstanding), display: money(k.total_outstanding), color: 'var(--erp-gold)', onClick: () => navigateTo(44) },
              { key: 'overdue', label: 'Overdue', value: num(k.total_overdue), display: money(k.total_overdue), color: 'var(--erp-negative)', onClick: () => navigateTo(44) },
            ]}
            empty="No unpaid invoice balance."
          />
        </Panel>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel title="Purchase-order close" note="Cancelled and rejected orders are left out. Every remaining purchase order in the period is either financially clear or still in the PO balance. Clear means every line is dispatched and the invoiced amount is paid.">
          <SplitFigure
            parts={[
              { label: 'Clear', value: k.clear_pos, color: 'var(--erp-positive)' },
              { label: 'PO balance', value: k.pending_financial_pos, color: 'var(--erp-gold)' },
            ]}
            onOpen={() => navigateTo(40)}
          />
        </Panel>
        <Panel title="Dispatch status counts" note="Pending means draft, submitted, or sent to brand. Partial and full counts use dispatch quantities on the purchase-order lines, not the header status alone.">
          <BarList
            rows={[
              { key: 'pending', label: 'Pending', value: k.pending_pos, display: String(k.pending_pos), color: 'var(--erp-gold)', onClick: () => navigateTo(40) },
              { key: 'partial', label: 'Partially dispatched', value: k.partially_dispatched_pos, display: String(k.partially_dispatched_pos), color: 'var(--erp-muted)', onClick: () => navigateTo(40) },
              { key: 'full', label: 'Fully dispatched', value: k.dispatched_pos, display: String(k.dispatched_pos), color: 'var(--erp-positive)', onClick: () => navigateTo(40) },
            ]}
            empty="No purchase-order status counts in this period."
          />
        </Panel>
      </section>

      {data.entity_turnover.length || data.top_products.length || data.category_share.length ? (
        <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {data.entity_turnover.length ? (
            <Panel title="Booking by branch" note="Issued invoice value in the selected period.">
              <BarList
                rows={data.entity_turnover.map(row => ({
                  key: String(row.entity_id),
                  label: `${row.short_code} · ${row.entity_name}`,
                  value: num(row.total_sales),
                  display: money(row.total_sales),
                  color: 'var(--erp-gold)',
                  onClick: () => onBranch(row.entity_id),
                }))}
                empty="No branch booking in this period."
              />
            </Panel>
          ) : null}
          {data.top_products.length ? (
            <Panel title="Top products by quantity" note="Issued invoice lines in the selected period. Limited to the five highest quantities.">
              <BarList
                rows={data.top_products.map(row => ({
                  key: String(row.product_id),
                  label: `${row.product_code} · ${row.product_name}`,
                  value: num(row.quantity),
                  display: num(row.quantity).toLocaleString('en-IN', { maximumFractionDigits: 2 }),
                  color: 'var(--erp-positive)',
                  onClick: () => navigateTo(39),
                }))}
                empty="No invoiced product quantity in this period."
              />
            </Panel>
          ) : null}
          {data.category_share.length ? (
            <Panel title="Quantity by category" note="Share of invoiced quantity in the selected period.">
              <BarList
                rows={data.category_share.map(row => ({
                  key: row.category_name,
                  label: row.category_name,
                  value: num(row.quantity),
                  display: `${num(row.quantity).toLocaleString('en-IN', { maximumFractionDigits: 2 })} · ${row.percent}%`,
                  color: 'var(--erp-gold)',
                  onClick: () => navigateTo(38),
                }))}
                empty="No category quantity in this period."
              />
            </Panel>
          ) : null}
        </section>
      ) : null}

      <section className="rounded-md border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] p-4">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold text-[var(--erp-text)]">Needs your attention</h2>
            <p className="mt-1 text-xs text-[var(--erp-muted)]">Items the current snapshot can act on. Empty means none of these checks found a record.</p>
          </div>
        </div>
        {attention.length ? (
          <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {attention.map(item => (
              <li key={item.title} className="flex items-start justify-between gap-3 rounded-md border border-[var(--erp-hairline)] px-3 py-3">
                <div>
                  <p className="text-sm font-medium text-[var(--erp-text)]">{item.title}</p>
                  <p className="mt-1 text-xs text-[var(--erp-muted)]">{item.detail}</p>
                </div>
                <button type="button" onClick={item.onClick} className={`shrink-0 text-xs font-medium hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--erp-gold)] ${item.tone === 'negative' ? 'text-[var(--erp-negative)]' : 'text-[var(--erp-gold)]'}`}>
                  {item.action}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="flex items-center gap-2 text-sm text-[var(--erp-muted)]"><PackageCheck className="h-4 w-4 text-[var(--erp-positive)]" /> Nothing in this scope needs attention.</p>
        )}
      </section>

      <section className="rounded-md border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] p-4">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
            <h2 className="font-display text-lg font-semibold text-[var(--erp-text)]">Debtor outstanding and credit aging</h2>
            <p className="mt-1 text-xs text-[var(--erp-muted)]">Parties with a live unpaid balance, using the existing risk bands. This list is not cut to the selected month.</p>
          </div>
          <button type="button" onClick={() => navigateTo(44)} className="text-sm font-medium text-[var(--erp-gold)] hover:underline">Open party ledger</button>
        </div>
        <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {bands.map(band => (
            <div key={band.name} className="rounded-md border border-[var(--erp-hairline)] px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <StatusChip status={riskChip(band.name)} label={band.name} />
                <span className="font-mono text-xs text-[var(--erp-muted)]">{band.count}</span>
              </div>
              <p className="mt-2 font-mono text-sm text-[var(--erp-text)]">{money(band.amount)}</p>
            </div>
          ))}
        </div>
        <BarList
          rows={data.debtors.slice(0, 8).map(row => ({
            key: String(row.customer_id),
            label: row.customer_name,
            value: num(row.outstanding),
            display: money(row.outstanding),
            color: row.risk_band === 'Overdue' ? 'var(--erp-negative)' : row.risk_band === 'Due Soon' ? 'var(--erp-gold)' : 'var(--erp-positive)',
            onClick: () => openLedger(row.customer_id),
          }))}
          empty="No outstanding parties."
        />
        <div className="mt-4">
            <DataTable
              columns={debtorColumns}
            data={data.debtors}
            keyExtractor={row => row.customer_id}
            density={compact ? 'compact' : 'comfortable'}
              maxHeight="420px"
            {...emptyTableProps(data.debtors.length, data.debtors.length, 'No outstanding parties.', 'No outstanding parties.', '', () => undefined)}
            />
          </div>
      </section>

      <section aria-label="Open a module">
        <h2 className="mb-2 font-display text-lg font-semibold text-[var(--erp-text)]">Open a module</h2>
        <div className="flex flex-wrap gap-2">
          <Quick label="Purchase orders" icon={<ClipboardList className="h-4 w-4" />} onClick={() => navigateTo(40)} />
          <Quick label="Dispatch" icon={<Truck className="h-4 w-4" />} onClick={() => navigateTo(41)} />
          <Quick label="Invoices" icon={<IndianRupee className="h-4 w-4" />} onClick={() => navigateTo(42)} />
          <Quick label="Payments" icon={<Wallet className="h-4 w-4" />} onClick={() => navigateTo(43)} />
          <Quick label="Product Master" icon={<Boxes className="h-4 w-4" />} onClick={() => navigateTo(39)} />
          <Quick label="Reports" icon={<PackageCheck className="h-4 w-4" />} onClick={() => navigateTo(47)} />
        </div>
      </section>
    </>
  );
}

function Kpi({ icon, label, value, detail, onClick, action, warn }: { icon: React.ReactNode; label: string; value: string | number; detail: string; onClick: () => void; action: string; warn?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={`flex min-h-[108px] flex-col justify-between rounded-md border bg-[var(--erp-surface)] p-4 text-left shadow-[0_1px_2px_rgba(27,36,48,0.04)] hover:border-[var(--erp-gold)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--erp-gold)] ${warn ? 'border-[var(--erp-negative)]/40' : 'border-[var(--erp-hairline-strong)]'}`}>
      <span className="flex items-center justify-between gap-2 text-xs font-medium text-[var(--erp-muted)]">{label}<span className={warn ? 'text-[var(--erp-negative)]' : 'text-[var(--erp-gold)]'}>{icon}</span></span>
      <span className="font-display text-2xl font-semibold tracking-tight text-[var(--erp-text)] tabular-nums" title={String(value)}>{value}</span>
      <span className="text-xs text-[var(--erp-muted)]">{detail} · {action}</span>
    </button>
  );
}

function Mini({ label, value, hint, onClick }: { label: string; value: string | number; hint?: string; onClick?: () => void }) {
  const className = 'rounded-md border border-[var(--erp-hairline)] bg-[var(--erp-surface)] px-3 py-2 text-left';
  const body = (
    <>
      <span className="block text-[11px] text-[var(--erp-muted)]">{label}</span>
      <span className="mt-1 block font-mono text-sm text-[var(--erp-text)]" title={String(value)}>{value}</span>
      {hint ? <span className="block text-[11px] text-[var(--erp-faint)]">{hint}</span> : null}
    </>
  );
  if (!onClick) return <div className={className}>{body}</div>;
  return <button type="button" onClick={onClick} className={`${className} hover:border-[var(--erp-gold)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--erp-gold)]`}>{body}</button>;
}

function Panel({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] p-4">
      <h2 className="font-display text-lg font-semibold text-[var(--erp-text)]">{title}</h2>
      <p className="mb-3 mt-1 text-xs leading-relaxed text-[var(--erp-muted)]">{note}</p>
      {children}
    </div>
  );
}

function BarList({ rows, empty }: { rows: { key: string; label: string; value: number; display: string; color: string; onClick: () => void }[]; empty: string }) {
  const max = Math.max(0, ...rows.map(row => row.value));
  if (max <= 0) return <p className="text-sm text-[var(--erp-muted)]">{empty}</p>;
  return (
    <div>
      <ul className="space-y-2">
        {rows.map(row => (
          <li key={row.key}>
            <button type="button" onClick={row.onClick} title={`${row.label}: ${row.display}`} className="w-full rounded-md px-1 py-1 text-left hover:bg-[var(--erp-surface-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--erp-gold)]">
              <span className="flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate text-[var(--erp-text)]">{row.label}</span>
                <span className="shrink-0 font-mono text-xs tabular-nums text-[var(--erp-text)]">{row.display}</span>
              </span>
              <span className="mt-1 block h-2 overflow-hidden rounded-full bg-[var(--erp-surface-2)]">
                <span className="block h-full rounded-full" style={{ width: `${Math.max(2, (row.value / max) * 100)}%`, background: row.color }} />
              </span>
            </button>
          </li>
        ))}
      </ul>
      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-[var(--erp-muted)]">View as a table</summary>
        <table className="mt-2 w-full text-left text-xs">
          <thead><tr className="text-[var(--erp-muted)]"><th className="py-1 font-medium">Item</th><th className="py-1 text-right font-medium">Value</th></tr></thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.key} className="border-t border-[var(--erp-hairline)]">
                <td className="py-1">{row.label}</td>
                <td className="py-1 text-right font-mono">{row.display}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

function SplitFigure({ parts, onOpen }: { parts: { label: string; value: number; color: string }[]; onOpen: () => void }) {
  const total = parts.reduce((sum, part) => sum + part.value, 0);
  if (total <= 0) return <p className="text-sm text-[var(--erp-muted)]">No purchase orders in this period.</p>;
  const radius = 42;
  const circ = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <svg viewBox="0 0 120 120" className="h-36 w-36" role="img" aria-label={parts.map(part => `${part.label} ${part.value}`).join(', ')}>
        <circle cx="60" cy="60" r={radius} fill="none" stroke="var(--erp-surface-2)" strokeWidth="14" />
        {parts.map(part => {
          const length = (part.value / total) * circ;
          const dash = `${length} ${circ - length}`;
          const element = (
            <circle key={part.label} cx="60" cy="60" r={radius} fill="none" stroke={part.color} strokeWidth="14" strokeDasharray={dash} strokeDashoffset={-offset} transform="rotate(-90 60 60)" />
          );
          offset += length;
          return element;
        })}
        <text x="60" y="58" textAnchor="middle" fill="var(--erp-text)" fontSize="16" fontFamily="var(--font-display, serif)">{total}</text>
        <text x="60" y="74" textAnchor="middle" fill="var(--erp-muted)" fontSize="8">orders</text>
      </svg>
      <ul className="w-full space-y-2">
        {parts.map(part => (
          <li key={part.label}>
            <button type="button" onClick={onOpen} className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1 text-left hover:bg-[var(--erp-surface-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--erp-gold)]">
              <span className="flex items-center gap-2 text-sm text-[var(--erp-text)]"><span className="h-2.5 w-2.5 rounded-full" style={{ background: part.color }} />{part.label}</span>
              <span className="font-mono text-xs">{part.value} · {total ? Math.round((part.value / total) * 100) : 0}%</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Quick({ label, icon, onClick }: { label: string; icon: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex h-10 items-center gap-2 rounded-md border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] px-3 text-sm text-[var(--erp-text)] hover:border-[var(--erp-gold)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--erp-gold)]">
      <span className="text-[var(--erp-gold)]">{icon}</span>{label}
    </button>
  );
}

function StaffPanels({ data, navigateTo }: { data: StaffDashboard; navigateTo: (id: number) => void }) {
  const k = data.kpis;
  return (
    <>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Mini label="POs created" value={k.purchase_orders_created} hint={`${k.pending_pos_created} pending`} />
        <Mini label="Pending invoices" value={k.pending_invoices_created} />
        <Mini label="Dispatches recorded" value={k.dispatches_recorded} />
        <Mini label="Payments recorded" value={k.payments_recorded} />
      </section>
      <p className="text-xs text-[var(--erp-muted)]">Showing records you created.</p>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <MiniTable title="Recent purchase orders" empty="No purchase orders you created." rows={data.recent_purchase_orders} columns={['PO', 'Party', 'Status']} render={row => [row.po_number, row.customer_name, row.status]} onOpen={row => { sessionStorage.setItem(OPEN_PO_KEY, String(row.id)); navigateTo(40); }} />
        <MiniTable title="Pending purchase orders" empty="No pending POs you created." rows={data.pending_purchase_orders} columns={['PO', 'Party', 'Status']} render={row => [row.po_number, row.customer_name, row.status]} onOpen={row => { sessionStorage.setItem(OPEN_PO_KEY, String(row.id)); navigateTo(40); }} />
        <MiniTable title="Pending invoices" empty="No pending invoices you created." rows={data.pending_invoices} columns={['Invoice', 'Date', 'Amount']} render={row => [row.invoice_number, row.invoice_date, money(row.net_amount)]} onOpen={row => { sessionStorage.setItem(LEDGER_OPEN_INVOICE_KEY, String(row.id)); navigateTo(42); }} />
        <MiniTable title="Recent dispatches" empty="No dispatches you recorded." rows={data.recent_dispatches} columns={['LR', 'PO', 'Date']} render={row => [row.lr_number, row.po_number, row.dispatch_date]} onOpen={row => { sessionStorage.setItem(OPEN_DISPATCH_KEY, String(row.id)); navigateTo(41); }} />
        <MiniTable title="Recent payments" empty="No payments you recorded." rows={data.recent_payments} columns={['Payment', 'Party', 'Amount']} render={row => [row.payment_number, row.customer_name, money(row.amount)]} onOpen={row => { sessionStorage.setItem(LEDGER_OPEN_PAYMENT_KEY, String(row.id)); navigateTo(43); }} />
      </div>
    </>
  );
}

function MiniTable<T extends { id: number }>({ title, empty, rows, columns, render, onOpen }: { title: string; empty: string; rows: T[]; columns: string[]; render: (row: T) => (string | number)[]; onOpen: (row: T) => void }) {
  return (
    <div className="rounded-md border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] p-4">
      <h2 className="mb-3 font-display text-base font-semibold">{title}</h2>
      {rows.length ? (
        <table className="w-full text-left text-xs">
          <thead className="font-mono text-[11px] uppercase tracking-wider text-[var(--erp-muted)]">
            <tr>{columns.map(column => <th key={column} className="pb-2 font-medium">{column}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const cells = render(row);
              return (
                <tr key={row.id} className="border-t border-[var(--erp-hairline)]">
                  <td className="py-2"><button type="button" className="font-mono text-[var(--erp-gold)] hover:underline" onClick={() => onOpen(row)}>{cells[0]}</button></td>
                  {cells.slice(1).map((cell, index) => <td key={index} className="py-2 font-mono text-[13px]">{cell}</td>)}
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : <p className="text-sm text-[var(--erp-muted)]">{empty}</p>}
    </div>
  );
}
