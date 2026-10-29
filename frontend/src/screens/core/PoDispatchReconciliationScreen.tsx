import React, { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useErp } from '../../context/ErpContext';
import { PageHeader } from '../../components/common/PageHeader';
import { PeriodScope } from '../../components/common/PeriodScope';
import { brandsApi, BrandRow } from '../../services/brandsApi';
import { dispatchesApi, ReconciliationReport, ReconciliationRow } from '../../services/dispatchesApi';
import { OPEN_DISPATCH_KEY } from '../../services/dispatchesApi';
import { OPEN_PO_KEY } from '../../services/purchaseOrdersApi';
import { notifyApiError } from '../../services/notify';

const PAGE_SIZE = 25;

const CARDS: { key: keyof ReconciliationReport['summary']; label: string }[] = [
  { key: 'total', label: 'Total PO lines' },
  { key: 'fully_dispatched', label: 'Fully dispatched' },
  { key: 'partially_dispatched', label: 'Partially dispatched' },
  { key: 'not_dispatched', label: 'Not dispatched' },
  { key: 'excess_dispatched', label: 'Excess dispatched' },
  { key: 'unmatched', label: 'Unmatched' },
  { key: 'rate_mismatches', label: 'Rate mismatches' },
  { key: 'overdue', label: 'Overdue' },
];

export const PoDispatchReconciliationScreen: React.FC = () => {
  const { navigateTo, selectedEntityId, entityReady, getPeriod } = useErp();
  const period = getPeriod();
  const [brands, setBrands] = useState<BrandRow[]>([]);
  const [brandId, setBrandId] = useState<number | ''>('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [kam, setKam] = useState('');
  const [report, setReport] = useState<ReconciliationReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<number | null>(null);

  useEffect(() => {
    void brandsApi.list({ status: 'Active' }).then(rows => {
      setBrands(rows);
      const arvind = rows.find(row => row.brand_code.toUpperCase() === 'AVD');
      if (arvind) setBrandId(arvind.id);
    }).catch(err => notifyApiError(err, 'Could not load brands.'));
  }, []);

  const load = useCallback(async () => {
    if (!entityReady) return;
    setLoading(true);
    setError('');
    try {
      const next = await dispatchesApi.reconciliation({
        brand_id: brandId || undefined,
        entity_id: selectedEntityId,
        date_from: period.from,
        date_to: period.to,
        search,
        status,
        kam,
      });
      setReport(next);
      setPage(1);
    } catch (err) {
      setReport(null);
      setError('Could not load the reconciliation.');
      notifyApiError(err, 'Could not load the reconciliation.');
    } finally {
      setLoading(false);
    }
  }, [entityReady, brandId, selectedEntityId, period.from, period.to, search, status, kam]);

  useEffect(() => { void load(); }, [load]);

  const rows = report?.rows || [];
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const visible = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const openPo = (row: ReconciliationRow) => {
    sessionStorage.setItem(OPEN_PO_KEY, String(row.purchase_order_id));
    navigateTo(40);
  };
  const openDispatch = (dispatchId: number) => {
    sessionStorage.setItem(OPEN_DISPATCH_KEY, String(dispatchId));
    navigateTo(41);
  };

  return (
    <div className="p-6 flex flex-col gap-5 text-left">
      <PageHeader
        moduleNumber="50"
        section="Core Operations"
        title="PO Dispatch Reconciliation"
        subtitle="Pieces ordered against pieces dispatched. Arvind is the brand. The KAM is the person on the purchase order."
      />

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2">
        {CARDS.map(card => (
          <div key={card.key} className="border border-[var(--erp-hairline)] bg-[var(--erp-surface)] px-3 py-2">
            <div className="text-[10px] font-mono uppercase text-[var(--erp-muted)]">{card.label}</div>
            <div className="mt-1 text-lg font-semibold">{report ? report.summary[card.key] : '—'}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-2">
        <label className="text-xs font-mono">Brand
          <select value={brandId} onChange={event => setBrandId(event.target.value ? Number(event.target.value) : '')} className="mt-1 w-full p-2 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)]">
            <option value="">All brands</option>
            {brands.map(brand => <option key={brand.id} value={brand.id}>{brand.brand_code} · {brand.brand_name}</option>)}
          </select>
        </label>
        <label className="text-xs font-mono">Status
          <select value={status} onChange={event => setStatus(event.target.value)} className="mt-1 w-full p-2 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)]">
            <option value="">All statuses</option>
            {(report?.statuses || []).map(item => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label className="text-xs font-mono">PO or party
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="PO number, party, product" className="mt-1 w-full p-2 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)]" />
        </label>
        <label className="text-xs font-mono">KAM
          <input value={kam} onChange={event => setKam(event.target.value)} placeholder="Person, not the brand" className="mt-1 w-full p-2 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)]" />
        </label>
        <div className="md:col-span-2 flex items-end"><PeriodScope /></div>
      </div>

      {report?.notes?.length ? (
        <p className="text-xs text-[var(--erp-muted)]">{report.notes.join(' ')}</p>
      ) : null}
      {error ? <p className="text-sm text-[var(--erp-negative)]">{error}</p> : null}
      {loading ? <p className="text-sm text-[var(--erp-muted)]">Loading reconciliation…</p> : null}

      <div className="overflow-x-auto border border-[var(--erp-hairline)]">
        <table className="w-full text-left text-xs">
          <thead className="bg-[var(--erp-surface-2)] font-mono text-[10px] uppercase text-[var(--erp-muted)]">
            <tr>
              {['', 'PO number', 'Party', 'Brand / trade name', 'Product code', 'Ordered', 'Dispatched', 'Balance', 'PO rate', 'Dispatch rate', 'Delivery', 'Status', 'Actions'].map(header => (
                <th key={header} className="px-2 py-2 whitespace-nowrap">{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && !loading ? (
              <tr><td colSpan={13} className="px-3 py-6 text-[var(--erp-muted)]">No purchase-order lines match these filters.</td></tr>
            ) : visible.map(row => {
              const open = openId === row.purchase_order_line_id;
              const poLabel = row.order_code || row.po_number;
              return (
                <React.Fragment key={row.purchase_order_line_id}>
                  <tr className="border-t border-[var(--erp-hairline)]">
                    <td className="px-2 py-2">
                      <button type="button" aria-expanded={open} aria-label={`${open ? 'Hide' : 'Show'} shipments for ${poLabel} ${row.product_code}`} onClick={() => setOpenId(open ? null : row.purchase_order_line_id)}>
                        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </button>
                    </td>
                    <td className="px-2 py-2 font-mono">{poLabel}</td>
                    <td className="px-2 py-2">{row.customer_name}<span className="block text-[var(--erp-muted)]">{row.customer_code}</span></td>
                    <td className="px-2 py-2">{row.brand_name}<span className="block text-[var(--erp-muted)]">{row.trade_name}</span></td>
                    <td className="px-2 py-2 font-mono">{row.product_code || '—'}</td>
                    <td className="px-2 py-2">{row.ordered_quantity} {row.unit}</td>
                    <td className="px-2 py-2">{row.dispatched_quantity}</td>
                    <td className="px-2 py-2">{row.balance_quantity}{row.excess_quantity !== '0.00' ? <span className="block">Excess {row.excess_quantity}</span> : null}</td>
                    <td className="px-2 py-2">{row.po_rate ?? '—'}</td>
                    <td className="px-2 py-2" title={row.rate_note}>{row.dispatch_rate ?? '—'}{row.rate_mismatch ? <span className="block">Rate mismatch</span> : null}</td>
                    <td className="px-2 py-2">{row.customer_delivery_date || '—'}<span className="block text-[var(--erp-muted)]">{row.delivery_status}</span></td>
                    <td className="px-2 py-2">{row.status}</td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      <button type="button" className="underline" onClick={() => openPo(row)}>Open PO</button>
                    </td>
                  </tr>
                  {open ? (
                    <tr className="border-t border-[var(--erp-hairline)] bg-[var(--erp-surface-2)]">
                      <td colSpan={13} className="px-4 py-3">
                        <p className="text-[var(--erp-muted)]">{row.rate_note} {row.delivery_note}</p>
                        {row.reasons.map(reason => <p key={reason}>{reason}</p>)}
                        <p className="mt-2">Branch {row.branch_code} · {row.branch_name}. Internal PO {row.po_number}. Ex-mill value {row.po_value ?? '—'} · dispatched value {row.dispatched_value ?? '—'}.</p>
                        {row.shipments.length ? (
                          <table className="mt-2 w-full">
                            <thead><tr className="font-mono text-[10px] uppercase text-[var(--erp-muted)]"><th className="py-1 text-left">Invoice</th><th className="text-left">Date</th><th className="text-left">Pieces</th><th className="text-left">Batch metres</th><th className="text-left">SO price</th><th className="text-left">Net rate / m</th><th className="text-left">Counted</th><th /></tr></thead>
                            <tbody>
                              {row.shipments.map(shipment => (
                                <tr key={shipment.dispatch_line_id}>
                                  <td className="py-1 font-mono">{shipment.invoice_number || '—'}</td>
                                  <td>{shipment.dispatch_date}</td>
                                  <td>{shipment.quantity}</td>
                                  <td>{shipment.meters ?? '—'}</td>
                                  <td>{shipment.source_rate ?? '—'}</td>
                                  <td>{shipment.net_rate ?? '—'}</td>
                                  <td>{shipment.counted ? 'Yes' : 'No'}</td>
                                  <td><button type="button" className="underline" onClick={() => openDispatch(shipment.dispatch_id)}>Open dispatch</button></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : <p className="mt-2">No dispatch is linked to this line.</p>}
                      </td>
                    </tr>
                  ) : null}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-xs">
        <span>{rows.length} lines</span>
        <div className="flex items-center gap-2">
          <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-2 py-1 border border-[var(--erp-hairline)] disabled:opacity-40">Previous</button>
          <span>Page {page} of {pageCount}</span>
          <button type="button" disabled={page >= pageCount} onClick={() => setPage(page + 1)} className="px-2 py-1 border border-[var(--erp-hairline)] disabled:opacity-40">Next</button>
        </div>
      </div>
    </div>
  );
};
