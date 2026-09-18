import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { useErp } from '../../context/ErpContext';
import { PageHeader } from '../../components/common/PageHeader';
import { DataTable, Column } from '../../components/common/DataTable';
import { ReportChart } from '../../components/common/ReportChart';
import { MasterError, MasterLoading, emptyTableProps } from '../masters/MasterStatus';
import { num } from '../../services/mastersApi';
import { notifyApiError } from '../../services/notify';
import {
  BrandPerfRow,
  CustomerPerfRow,
  EntityPerfRow,
  OutstandingRow,
  ReportFilters,
  ReportTab,
  reportsApi,
} from '../../services/reportsApi';

const TABS: { id: ReportTab; label: string }[] = [
  { id: 'purchase-sales', label: 'Purchase/Sales Trend' },
  { id: 'payment', label: 'Payment Trend' },
  { id: 'product', label: 'Product Trend' },
  { id: 'seasonal', label: 'Seasonal Trend' },
  { id: 'bad-debt', label: 'Bad Debt Trend' },
  { id: 'outstanding', label: 'Outstanding Report' },
  { id: 'customer', label: 'Customer Performance' },
  { id: 'brand', label: 'Brand Performance' },
  { id: 'entity', label: 'Entity Performance' },
];

const COLORS = ['var(--erp-gold)', 'var(--erp-positive)', 'var(--erp-muted)', '#7aa2c8', '#c9a24e', '#8f6b4a', '#d9635a', '#6b8f71', '#b07c9e', '#5c7a8a'];

function iso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function defaultRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to);
  from.setFullYear(from.getFullYear() - 1);
  return { from: iso(from), to: iso(to) };
}

function money(value: string | number | null | undefined): string {
  return `₹${num(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const escape = (cell: string | number) => `"${String(cell).replace(/"/g, '""')}"`;
  const body = [headers.map(escape).join(','), ...rows.map(r => r.map(escape).join(','))].join('\n');
  const blob = new Blob([body], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function allZero(values: number[]): boolean {
  return !values.length || values.every(v => v === 0);
}

export const AnalyticsReportsScreen: React.FC = () => {
  const { selectedEntityId, selectedBranch } = useErp();
  const initial = defaultRange();
  const [tab, setTab] = useState<ReportTab>('purchase-sales');
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [payload, setPayload] = useState<unknown>(null);

  const filters: ReportFilters = useMemo(
    () => ({ from, to, entityId: selectedEntityId }),
    [from, to, selectedEntityId],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const loaders: Record<ReportTab, () => Promise<unknown>> = {
        'purchase-sales': () => reportsApi.purchaseSales(filters),
        payment: () => reportsApi.payment(filters),
        product: () => reportsApi.product(filters),
        seasonal: () => reportsApi.seasonal(filters),
        'bad-debt': () => reportsApi.badDebt(filters),
        outstanding: () => reportsApi.outstanding(filters),
        customer: () => reportsApi.customer(filters),
        brand: () => reportsApi.brand(filters),
        entity: () => reportsApi.entity(filters),
      };
      setPayload(await loaders[tab]());
    } catch (e) {
      const parsed = notifyApiError(e, 'Could not load report.');
      setError(parsed.message);
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [filters, tab]);

  useEffect(() => { void load(); }, [load]);

  const tabClass = (id: ReportTab) =>
    `px-2.5 py-1.5 text-[11px] font-mono cursor-pointer border whitespace-nowrap ${
      tab === id
        ? 'bg-[var(--erp-gold)] text-[#0F141B] border-[var(--erp-gold)] font-semibold'
        : 'bg-[var(--erp-surface-2)] text-[var(--erp-text)] border-[var(--erp-hairline)] hover:border-[var(--erp-gold)]'
    }`;

  return (
    <div className="p-6 flex flex-col gap-5 text-left">
      <PageHeader
        moduleNumber="47"
        section="Reports"
        title="Reports & Analytics"
        subtitle={`Trend analysis over time — scoped to ${selectedBranch.name}`}
        actions={
          <button
            type="button"
            onClick={() => exportCurrent(tab, payload)}
            className="px-3 py-1.5 text-xs font-mono border border-[var(--erp-hairline)] hover:border-[var(--erp-gold)] cursor-pointer flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            Export
          </button>
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[11px] font-mono text-[var(--erp-muted)]">
          From
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="px-2 py-1.5 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)]" />
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-mono text-[var(--erp-muted)]">
          To
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className="px-2 py-1.5 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)]" />
        </label>
        <p className="text-[11px] font-mono text-[var(--erp-muted)] pb-1.5">
          Entity: <span className="text-[var(--erp-text)]">{selectedBranch.name}</span>
          <span className="text-[var(--erp-muted)]"> (header)</span>
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {TABS.map(item => (
          <button key={item.id} type="button" className={tabClass(item.id)} onClick={() => setTab(item.id)}>
            {item.label}
          </button>
        ))}
      </div>

      {error && <MasterError message={error} onRetry={() => void load()} />}
      {loading ? <MasterLoading label="Loading report…" /> : <ReportBody tab={tab} payload={payload} />}
    </div>
  );
};

function ReportBody({ tab, payload }: { tab: ReportTab; payload: unknown }) {
  if (!payload || typeof payload !== 'object') {
    return <p className="text-xs font-mono text-[var(--erp-muted)]">No data for this period</p>;
  }
  const data = payload as { rows?: unknown[]; note?: string };

  if (tab === 'bad-debt') {
    return (
      <div className="border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] p-8 text-center">
        <p className="font-display text-sm font-bold mb-2">Bad Debt Trend</p>
        <p className="text-xs font-mono text-[var(--erp-muted)]">{data.note || 'Not tracked yet — no write-off mechanism exists.'}</p>
      </div>
    );
  }

  if (tab === 'purchase-sales') {
    const rows = (data.rows || []) as { month: string; po_value: string; sales_value: string }[];
    const po = rows.map(r => num(r.po_value));
    const sales = rows.map(r => num(r.sales_value));
    return (
      <div className="border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] p-4">
        <ReportChart
          kind="bar"
          labels={rows.map(r => r.month)}
          series={[
            { key: 'po', label: 'PO value', color: COLORS[0], values: po },
            { key: 'sales', label: 'Sales (invoiced)', color: COLORS[1], values: sales },
          ]}
          empty={allZero(po) && allZero(sales)}
        />
      </div>
    );
  }

  if (tab === 'payment') {
    const rows = (data.rows || []) as { month: string; payment_value: string }[];
    const values = rows.map(r => num(r.payment_value));
    return (
      <div className="border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] p-4">
        <ReportChart
          kind="line"
          labels={rows.map(r => r.month)}
          series={[{ key: 'pay', label: 'Collections', color: COLORS[0], values }]}
          empty={allZero(values)}
        />
      </div>
    );
  }

  if (tab === 'product') {
    const rows = (data.rows || []) as { product_id: number; product_name: string; product_code: string; monthly: { month: string; value: string }[] }[];
    if (!rows.length) {
      return <ReportChart kind="line" labels={[]} series={[]} empty />;
    }
    const labels = rows[0].monthly.map(m => m.month);
    return (
      <div className="border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] p-4">
        <ReportChart
          kind="line"
          labels={labels}
          series={rows.map((row, i) => ({
            key: String(row.product_id),
            label: `${row.product_code} · ${row.product_name}`,
            color: COLORS[i % COLORS.length],
            values: row.monthly.map(m => num(m.value)),
          }))}
        />
      </div>
    );
  }

  if (tab === 'seasonal') {
    const rows = (data.rows || []) as { season: string; total_value: string }[];
    return (
      <div className="border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] p-4">
        <ReportChart
          kind="bar"
          labels={rows.map(r => r.season)}
          series={[{ key: 'season', label: 'Invoiced value', color: COLORS[0], values: rows.map(r => num(r.total_value)) }]}
          empty={!rows.length}
        />
      </div>
    );
  }

  if (tab === 'outstanding') {
    const rows = (data.rows || []) as OutstandingRow[];
    const columns: Column<OutstandingRow>[] = [
      { header: 'Code', accessorKey: 'customer_code', mono: true, sortable: true },
      { header: 'Customer', accessorKey: 'customer_name', sortable: true },
      { header: 'Entity', render: r => r.entity_short_code ? `${r.entity_short_code} · ${r.entity_name}` : '—' },
      { header: 'Outstanding', accessorKey: 'outstanding_balance', align: 'right', mono: true, sortable: true, render: r => money(r.outstanding_balance) },
      { header: 'Overdue', accessorKey: 'overdue_amount', align: 'right', mono: true, sortable: true, render: r => money(r.overdue_amount) },
      { header: 'Oldest overdue', accessorKey: 'oldest_overdue_days', align: 'center', mono: true, sortable: true, render: r => r.oldest_overdue_days > 0 ? `${r.oldest_overdue_days}d` : '—' },
    ];
    return (
      <DataTable
        columns={columns}
        data={rows}
        keyExtractor={r => r.customer_id}
        {...emptyTableProps(rows.length, rows.length, 'No data for this period', 'No data for this period', '', () => undefined)}
      />
    );
  }

  if (tab === 'customer') {
    const rows = (data.rows || []) as CustomerPerfRow[];
    const columns: Column<CustomerPerfRow>[] = [
      { header: 'Customer', accessorKey: 'customer_name', sortable: true, render: r => (
        <span>{r.customer_name}<span className="block text-[11px] font-mono text-[var(--erp-muted)]">{r.customer_code}</span></span>
      ) },
      { header: 'Orders', accessorKey: 'total_orders', align: 'center', mono: true, sortable: true },
      { header: 'Invoiced', accessorKey: 'total_invoiced', align: 'right', mono: true, sortable: true, render: r => money(r.total_invoiced) },
      { header: 'Paid', accessorKey: 'total_paid', align: 'right', mono: true, sortable: true, render: r => money(r.total_paid) },
      { header: 'Avg days to pay', accessorKey: 'average_days_to_pay', align: 'center', mono: true, sortable: true, render: r => r.average_days_to_pay ?? '—' },
      { header: 'Outstanding', accessorKey: 'outstanding_balance', align: 'right', mono: true, sortable: true, render: r => money(r.outstanding_balance) },
    ];
    return (
      <DataTable
        columns={columns}
        data={rows}
        keyExtractor={r => r.customer_id}
        {...emptyTableProps(rows.length, rows.length, 'No data for this period', 'No data for this period', '', () => undefined)}
      />
    );
  }

  if (tab === 'brand') {
    const rows = (data.rows || []) as BrandPerfRow[];
    const columns: Column<BrandPerfRow>[] = [
      { header: 'Brand', accessorKey: 'brand_name', sortable: true, render: r => (
        <span>{r.brand_name}<span className="block text-[11px] font-mono text-[var(--erp-muted)]">{r.brand_code}</span></span>
      ) },
      { header: 'POs', accessorKey: 'total_pos', align: 'center', mono: true, sortable: true },
      { header: 'Dispatched value', accessorKey: 'total_dispatched_value', align: 'right', mono: true, sortable: true, render: r => money(r.total_dispatched_value) },
      { header: 'Invoiced value', accessorKey: 'total_invoiced_value', align: 'right', mono: true, sortable: true, render: r => money(r.total_invoiced_value) },
    ];
    return (
      <div className="space-y-2">
        <p className="text-[11px] font-mono text-[var(--erp-muted)]">
          On-time dispatch rate is omitted — purchase orders have no promised dispatch date. Commission is omitted until that module exists.
        </p>
        <DataTable
          columns={columns}
          data={rows}
          keyExtractor={r => r.brand_id}
          {...emptyTableProps(rows.length, rows.length, 'No data for this period', 'No data for this period', '', () => undefined)}
        />
      </div>
    );
  }

  const rows = (data.rows || []) as EntityPerfRow[];
  const columns: Column<EntityPerfRow>[] = [
    { header: 'Entity', accessorKey: 'short_code', sortable: true, render: r => `${r.short_code} · ${r.entity_name}` },
    { header: 'Sales', accessorKey: 'total_sales', align: 'right', mono: true, sortable: true, render: r => money(r.total_sales) },
    { header: 'Orders', accessorKey: 'total_orders', align: 'center', mono: true, sortable: true },
    { header: 'Customers', accessorKey: 'total_customers', align: 'center', mono: true, sortable: true },
    { header: 'Outstanding', accessorKey: 'total_outstanding', align: 'right', mono: true, sortable: true, render: r => money(r.total_outstanding) },
    { header: 'Overdue', accessorKey: 'total_overdue', align: 'right', mono: true, sortable: true, render: r => money(r.total_overdue) },
  ];
  return (
    <DataTable
      columns={columns}
      data={rows}
      keyExtractor={r => r.entity_id}
      {...emptyTableProps(rows.length, rows.length, 'No data for this period', 'No data for this period', '', () => undefined)}
    />
  );
}

function exportCurrent(tab: ReportTab, payload: unknown) {
  if (!payload || typeof payload !== 'object') return;
  const data = payload as { rows?: Record<string, unknown>[]; note?: string };
  const rows = data.rows || [];
  if (tab === 'bad-debt') {
    downloadCsv('bad-debt-trend.csv', ['note'], [[data.note || 'Not tracked yet — no write-off mechanism exists.']]);
    return;
  }
  if (!rows.length) {
    downloadCsv(`${tab}.csv`, ['message'], [['No data for this period']]);
    return;
  }
  if (tab === 'product') {
    const headers = ['product_code', 'product_name', 'month', 'quantity', 'value'];
    const out: (string | number)[][] = [];
    for (const row of rows as { product_code: string; product_name: string; monthly: { month: string; quantity: string; value: string }[] }[]) {
      for (const m of row.monthly) {
        out.push([row.product_code, row.product_name, m.month, m.quantity, m.value]);
      }
    }
    downloadCsv('product-trend.csv', headers, out);
    return;
  }
  const headers = Object.keys(rows[0]);
  downloadCsv(`${tab}.csv`, headers, rows.map(r => headers.map(h => String(r[h] ?? ''))));
}
