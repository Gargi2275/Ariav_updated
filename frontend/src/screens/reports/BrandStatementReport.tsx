import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, RefreshCw, Search, SlidersHorizontal, Users, X } from 'lucide-react';
import { useErp } from '../../context/ErpContext';
import { EntitySelector } from '../../components/common/EntitySelector';
import { DataTable, Column } from '../../components/common/DataTable';
import { LedgerMetricStrip, LedgerMetricItem } from '../../components/common/LedgerMetricStrip';
import { MasterLoading, emptyTableProps } from '../masters/MasterStatus';
import { num } from '../../services/mastersApi';
import { notifyApiError } from '../../services/notify';
import { BrandStatementReportRow, customersApi } from '../../services/customersApi';

function money(value: string | number | null | undefined): string {
  return `₹${num(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export const BrandStatementReport: React.FC = () => {
  const { selectedEntityId } = useErp();
  const [entityId, setEntityId] = useState<number | null>(
    selectedEntityId === 'all' ? null : selectedEntityId,
  );
  const [rows, setRows] = useState<BrandStatementReportRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [filter, setFilter] = useState<'all' | 'nonzero' | 'zero' | 'opening_debit' | 'opening_credit'>('all');

  useEffect(() => {
    setEntityId(selectedEntityId === 'all' ? null : selectedEntityId);
  }, [selectedEntityId]);

  const load = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);
    try {
      const response = await customersApi.statementReport({
        entity_id: entityId,
        customer_code: code || undefined,
        customer_name: name || undefined,
        period_from: from || undefined,
        period_to: to || undefined,
      });
      setRows(response.rows);
      setLoaded(true);
    } catch (error) {
      notifyApiError(error, 'Could not load party balances.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [code, entityId, from, name, to]);

  useEffect(() => {
    setLoaded(false);
    setRows([]);
  }, [entityId]);

  const visibleRows = useMemo(() => rows.filter(row => {
    const openingDebit = num(row.opening_debit);
    const openingCredit = num(row.opening_credit);
    const closingDebit = num(row.closing_debit);
    const closingCredit = num(row.closing_credit);
    if (filter === 'nonzero') return openingDebit || openingCredit || closingDebit || closingCredit;
    if (filter === 'zero') return !(openingDebit || openingCredit || closingDebit || closingCredit);
    if (filter === 'opening_debit') return openingDebit > 0;
    if (filter === 'opening_credit') return openingCredit > 0;
    return true;
  }), [filter, rows]);

  const total = (key: keyof BrandStatementReportRow) =>
    rows.reduce((sum, row) => sum + num(row[key] as string | number), 0);
  const metrics: LedgerMetricItem[] = rows.length ? [
    { label: 'Parties', value: String(rows.length) },
    { label: 'Opening debit', value: money(total('opening_debit')) },
    { label: 'Opening credit', value: money(total('opening_credit')) },
    { label: 'Period debit', value: money(total('period_debit')) },
    { label: 'Period credit', value: money(total('period_credit')) },
    { label: 'Closing debit', value: money(total('closing_debit')) },
    { label: 'Closing credit', value: money(total('closing_credit')) },
  ] : [];

  const columns: Column<BrandStatementReportRow>[] = [
    { header: 'Party Code', accessorKey: 'customer_code', mono: true, width: '120px' },
    { header: 'Party Name', accessorKey: 'customer_name', render: r => <span className="block max-w-[240px] truncate" title={r.customer_name}>{r.customer_name}</span> },
    { header: 'Opening debit', align: 'right', mono: true, render: r => money(r.opening_debit) },
    { header: 'Opening credit', align: 'right', mono: true, render: r => money(r.opening_credit) },
    { header: 'As of', accessorKey: 'period_from', mono: true },
    { header: 'Period debit', align: 'right', mono: true, render: r => money(r.period_debit) },
    { header: 'Period credit', align: 'right', mono: true, render: r => money(r.period_credit) },
    { header: 'Closing debit', align: 'right', mono: true, render: r => money(r.closing_debit) },
    { header: 'Closing credit', align: 'right', mono: true, render: r => money(r.closing_credit) },
    { header: 'As of', accessorKey: 'period_to', mono: true },
  ];

  const resetFilters = () => {
    setCode('');
    setName('');
    setFrom('');
    setTo('');
    setFilter('all');
    setRows([]);
    setLoaded(false);
  };

  const exportCsv = () => {
    if (!visibleRows.length) return;
    const headers = ['Party Code', 'Party Name', 'Opening Debit', 'Opening Credit', 'Period Debit', 'Period Credit', 'Closing Debit', 'Closing Credit', 'Period From', 'Period To'];
    const values = visibleRows.map(row => [
      row.customer_code,
      row.customer_name,
      row.opening_debit,
      row.opening_credit,
      row.period_debit,
      row.period_credit,
      row.closing_debit,
      row.closing_credit,
      row.period_from,
      row.period_to,
    ]);
    const escape = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
    const blob = new Blob(
      [headers.map(escape).join(',') + '\n' + values.map(row => row.map(escape).join(',')).join('\n')],
      { type: 'text/csv;charset=utf-8;' },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'party-balance.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <div className="hidden h-7 w-7 items-center justify-center border border-[var(--erp-gold)]/40 bg-[var(--erp-gold)]/10 text-[var(--erp-gold)] sm:flex">
              <Users className="h-4 w-4" />
            </div>
            <div>
              <h2 className="font-display text-xl font-bold leading-none text-[var(--erp-text)]">Party Balance</h2>
              <p className="hidden text-[10px] font-mono text-[var(--erp-muted)] sm:block">Opening, movement and closing balances by customer</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={resetFilters} className="inline-flex h-8 items-center gap-1.5 border border-[var(--erp-hairline-strong)] px-2.5 text-[11px] font-mono text-[var(--erp-muted)] hover:border-[var(--erp-gold)] hover:text-[var(--erp-text)]">
            <X className="h-3.5 w-3.5" /> Reset
          </button>
          <button type="button" disabled={!visibleRows.length} onClick={exportCsv} className="inline-flex h-8 items-center gap-1.5 border border-[var(--erp-hairline-strong)] px-2.5 text-[11px] font-mono text-[var(--erp-muted)] hover:border-[var(--erp-gold)] hover:text-[var(--erp-text)] disabled:cursor-not-allowed disabled:opacity-40">
            <Download className="h-3.5 w-3.5" /> Export CSV
          </button>
        </div>
      </div>

      <div className="border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)]">
        <div className="flex items-center gap-2 border-b border-[var(--erp-hairline)] px-3 py-1.5">
          <SlidersHorizontal className="h-3.5 w-3.5 text-[var(--erp-gold)]" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--erp-muted)]">Report filters</span>
          {loaded && <span className="ml-auto text-[10px] font-mono text-[var(--erp-muted)]">{visibleRows.length} of {rows.length} parties</span>}
        </div>
        <div className="grid grid-cols-1 items-end gap-2 p-2 sm:grid-cols-2 lg:grid-cols-[minmax(170px,1.2fr)_minmax(130px,.8fr)_minmax(180px,1.2fr)_minmax(135px,.8fr)_minmax(135px,.8fr)_auto]">
          <div><EntitySelector compact value={entityId} onChange={setEntityId} allowEmpty={false} label="Branch" emptyLabel="Select branch…" /></div>
          <label className="flex flex-col gap-1 text-[10px] font-mono text-[var(--erp-muted)]">Party code<input value={code} onChange={e => setCode(e.target.value)} placeholder="Search code…" className="h-8 w-full px-2 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-xs text-[var(--erp-text)] focus:border-[var(--erp-gold)] focus:outline-none" /></label>
          <label className="flex flex-col gap-1 text-[10px] font-mono text-[var(--erp-muted)]">Party name<input value={name} onChange={e => setName(e.target.value)} placeholder="Search name…" className="h-8 w-full px-2 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-xs text-[var(--erp-text)] focus:border-[var(--erp-gold)] focus:outline-none" /></label>
          <label className="flex flex-col gap-1 text-[10px] font-mono text-[var(--erp-muted)]">Date from<input type="date" value={from} onChange={e => setFrom(e.target.value)} className="h-8 w-full px-2 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-xs text-[var(--erp-text)] focus:border-[var(--erp-gold)] focus:outline-none" /></label>
          <label className="flex flex-col gap-1 text-[10px] font-mono text-[var(--erp-muted)]">Date to<input type="date" value={to} onChange={e => setTo(e.target.value)} className="h-8 w-full px-2 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-xs text-[var(--erp-text)] focus:border-[var(--erp-gold)] focus:outline-none" /></label>
          <button type="button" disabled={!entityId || loading} onClick={() => void load()} className="inline-flex h-[34px] items-center gap-2 bg-[var(--erp-gold)] px-4 text-xs font-semibold text-[#0F141B] hover:bg-[var(--erp-gold-soft)] disabled:cursor-not-allowed disabled:opacity-50">
            {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />} {loading ? 'Loading…' : 'Load balances'}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[var(--erp-hairline)] bg-[var(--erp-surface-2)]/40 px-3 py-1.5 text-[10px] font-mono text-[var(--erp-muted)]">
          <span className="uppercase tracking-wider text-[10px] text-[var(--erp-faint)]">Show</span>
          {([
            ['all', 'All balances'], ['nonzero', 'Hide zero balances'], ['zero', 'Show only zero balances'],
            ['opening_debit', 'Opening debit party'], ['opening_credit', 'Opening credit party'],
          ] as const).map(([value, label]) => (
            <label key={value} className="flex cursor-pointer items-center gap-1.5"><input type="radio" className="accent-[var(--erp-gold)]" checked={filter === value} onChange={() => setFilter(value)} />{label}</label>
          ))}
        </div>
      </div>
      {loading ? <MasterLoading label="Loading party balances…" /> : !loaded ? (
        <div className="border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] py-12 text-center text-xs font-mono text-[var(--erp-muted)]">Select a branch and click Load balances.</div>
      ) : (
        <>
          <LedgerMetricStrip metrics={metrics} compact className="lg:!grid-cols-7" />
          <div className="flex min-h-0 flex-1 flex-col border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--erp-hairline)] px-3 py-1.5">
              <div>
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--erp-gold)]">Balance register</span>
                <p className="mt-0.5 text-[10px] font-mono text-[var(--erp-muted)]">DR = receivable · CR = credit balance</p>
              </div>
              <span className="border border-[var(--erp-hairline)] bg-[var(--erp-surface-2)] px-2 py-1 text-[10px] font-mono text-[var(--erp-muted)]">{visibleRows.length} parties shown</span>
            </div>
            <DataTable density="compact" className="min-h-0 flex-1 border-0" maxHeight="calc(100vh - 325px)" columns={columns} data={visibleRows} keyExtractor={r => String(r.customer_id)} rowClassName={(_, index) => index % 2 ? 'bg-[var(--erp-surface-2)]/35' : ''} {...emptyTableProps(visibleRows.length, visibleRows.length, 'No balances found.', 'No balances match these filters.', '', () => undefined)} />
          </div>
        </>
      )}
    </div>
  );
};
