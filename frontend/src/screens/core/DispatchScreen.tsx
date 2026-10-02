import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Eye, Plus, Search, Trash2, Truck, Upload, X } from 'lucide-react';
import { useErp } from '../../context/ErpContext';
import { PageHeader } from '../../components/common/PageHeader';
import { DataTable, Column } from '../../components/common/DataTable';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { MasterError, MasterLoading, emptyTableProps } from '../masters/MasterStatus';
import { num } from '../../services/mastersApi';
import { notifyApiError, notifySuccess } from '../../services/notify';
import { DispatchRow, OPEN_DISPATCH_KEY, DispatchImportCommitResult, DispatchImportCreated, dispatchesApi } from '../../services/dispatchesApi';
import { OPEN_PO_KEY } from '../../services/purchaseOrdersApi';
import { DispatchImportModal } from './DispatchImportModal';
import { PoInvoicesList } from './PoInvoicesList';
import { NOT_RECORDED } from '../../services/invoicesApi';
import { openTraceTarget } from '../../services/traceLinks';
import { readCustomerListFilter } from '../../services/customersApi';

export const DispatchScreen: React.FC = () => {
  const { userRole, navigateTo } = useErp();
  const canWrite = userRole === 'admin' || userRole === 'operator';
  const [rows, setRows] = useState<DispatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [customerFilter, setCustomerFilter] = useState<number | ''>(() => readCustomerListFilter());
  const [detail, setDetail] = useState<DispatchRow | null>(null);
  const [pendingDelete, setPendingDelete] = useState<DispatchRow | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importReport, setImportReport] = useState<DispatchImportCommitResult | null>(null);
  const searchTimer = useRef<number | null>(null);

  const load = useCallback(async (term = search) => {
    setLoading(true);
    setError('');
    try {
      setRows(await dispatchesApi.list({
        search: term || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        customer_id: customerFilter || undefined,
      }));
    } catch (e) {
      const parsed = notifyApiError(e, 'Could not load dispatches.');
      setError(parsed.message);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, search, customerFilter]);

  useEffect(() => { void load(); }, [dateFrom, dateTo, customerFilter]);

  useEffect(() => {
    const raw = sessionStorage.getItem(OPEN_DISPATCH_KEY);
    if (!raw) return;
    sessionStorage.removeItem(OPEN_DISPATCH_KEY);
    const id = Number(raw);
    if (!id) return;
    void dispatchesApi.retrieve(id).then(setDetail).catch(notifyApiError);
  }, []);

  useEffect(() => {
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => { void load(search); }, 250);
    return () => { if (searchTimer.current) window.clearTimeout(searchTimer.current); };
  }, [search]);

  const columns: Column<DispatchRow>[] = [
    { header: 'Date', accessorKey: 'dispatch_date', mono: true, width: '110px' },
    { header: 'PO Number', render: r => <span className="font-mono text-[var(--erp-gold)]">{r.po_number}</span> },
    { header: 'LR Number', accessorKey: 'lr_number', mono: true },
    { header: 'Transporter', accessorKey: 'transporter' },
    { header: 'Challan Ref', accessorKey: 'challan_reference', mono: true },
    { header: 'Lines', width: '80px', align: 'right', render: r => <span className="font-mono">{r.lines.length}</span> },
    {
      header: '',
      align: 'right',
      width: '88px',
      render: r => (
        <div className="flex justify-end gap-1">
          <button type="button" className="p-1 text-[var(--erp-muted)] hover:text-[var(--erp-gold)] cursor-pointer" title="View" onClick={() => setDetail(r)}><Eye className="w-3.5 h-3.5" /></button>
          {canWrite && (
            <button type="button" className="p-1 text-[var(--erp-muted)] hover:text-[var(--erp-negative)] cursor-pointer" title="Delete dispatch" onClick={() => setPendingDelete(r)}><Trash2 className="w-3.5 h-3.5" /></button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="p-6 flex flex-col gap-6 text-left">
      <PageHeader
        moduleNumber="41"
        section="Orders"
        title="Dispatches"
        subtitle="Shipments against purchase orders — LR, transporter and challan"
        actions={
          canWrite ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setImportOpen(true)}
                className="px-4 py-1.5 border border-[var(--erp-gold)] text-[var(--erp-gold)] font-body text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" /> Import Dispatch
              </button>
              <button type="button" onClick={() => navigateTo(40)} className="px-4 py-1.5 bg-[var(--erp-gold)] text-[#0F141B] font-body text-xs font-semibold flex items-center gap-1.5 cursor-pointer">
                <Plus className="w-3.5 h-3.5" /> Record from a PO
              </button>
            </div>
          ) : undefined
        }
      />
      {error && <MasterError message={error} onRetry={() => void load()} />}
      {importReport && importReport.created.length > 0 && (
        <ImportedDispatchSummary
          created={importReport.created}
          onDismiss={() => setImportReport(null)}
          onOpenPo={poId => {
            sessionStorage.setItem(OPEN_PO_KEY, String(poId));
            navigateTo(40);
          }}
        />
      )}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] p-3">
        <div className="relative w-full lg:w-80">
          <Search className="w-4 h-4 text-[var(--erp-muted)] absolute left-3 top-2.5" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search LR, challan, PO…" className="w-full pl-9 pr-3 py-1.5 text-xs bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)] focus:border-[var(--erp-gold)] focus:outline-none font-mono" />
        </div>
        <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="px-2 py-1 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)]" />
          <span className="text-[var(--erp-muted)]">to</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="px-2 py-1 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)]" />
          {customerFilter ? (
            <button type="button" onClick={() => setCustomerFilter('')} className="text-[11px] font-mono text-[var(--erp-gold)] hover:underline cursor-pointer">
              Clear customer filter
            </button>
          ) : null}
        </div>
      </div>
      {loading ? (
        <MasterLoading label="Loading dispatches…" />
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          keyExtractor={r => r.id}
          {...emptyTableProps(
            rows.length,
            rows.length,
            'No dispatches recorded yet.',
            'No dispatches match this filter.',
            canWrite ? 'Open Purchase Orders' : '',
            canWrite ? () => navigateTo(40) : () => undefined,
          )}
        />
      )}

      {detail && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-3xl max-h-[92vh] overflow-y-auto bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] p-6 space-y-4">
            <div className="flex justify-between items-start border-b border-[var(--erp-hairline)] pb-3">
              <div>
                <h3 className="font-display text-lg font-bold flex items-center gap-2"><Truck className="w-4 h-4 text-[var(--erp-gold)]" />{detail.lr_number}</h3>
                <p className="text-xs font-mono text-[var(--erp-muted)] mt-1">
                  {detail.dispatch_date} ·{' '}
                  <button
                    type="button"
                    className="text-[var(--erp-gold)] hover:underline cursor-pointer"
                    onClick={() => openTraceTarget('purchase_order', detail.purchase_order_id, navigateTo)}
                  >
                    {detail.po_number}
                  </button>
                  {' '}· {detail.transporter} · {detail.challan_reference}
                </p>
                <p className="text-xs font-mono text-[var(--erp-muted)] mt-1">
                  Recorded by {detail.created_by_name || <span className="italic">{NOT_RECORDED}</span>}
                </p>
              </div>
              <button type="button" onClick={() => setDetail(null)}><X className="w-4 h-4" /></button>
            </div>
            <table className="w-full text-left text-xs border border-[var(--erp-hairline)]">
              <thead className="bg-[var(--erp-surface-2)] font-mono text-[10px] uppercase tracking-wider text-[var(--erp-muted)]">
                <tr>
                  <th className="px-3 py-2">Product</th>
                  <th className="px-3 py-2 text-right">This dispatch</th>
                </tr>
              </thead>
              <tbody>
                {detail.lines.map(line => (
                  <tr key={line.id} className="border-t border-[var(--erp-hairline)]">
                    <td className="px-3 py-2">{line.product_code ? `${line.product_code} · ${line.product_name}` : line.product_name}</td>
                    <td className="px-3 py-2 text-right font-mono">{num(line.dispatched_quantity).toFixed(2)} {line.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <section>
              <h4 className="text-[11px] font-mono uppercase tracking-wider text-[var(--erp-gold)] border-b border-[var(--erp-hairline)] pb-1 mb-2">Invoices on {detail.po_number}</h4>
              <p className="text-xs font-mono text-[var(--erp-muted)] mb-2">Invoices are raised against the PO, not against a specific dispatch.</p>
              <PoInvoicesList purchaseOrderId={detail.purchase_order_id} />
            </section>
          </div>
        </div>
      )}

      {importOpen && (
        <DispatchImportModal
          onClose={() => setImportOpen(false)}
          onImported={async result => {
            setImportOpen(false);
            setImportReport(result);
            await load();
          }}
        />
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        entityType="dispatch"
        entityLabel={pendingDelete ? pendingDelete.lr_number : ''}
        title="Delete dispatch?"
        message={pendingDelete ? `Delete dispatch '${pendingDelete.lr_number}'? Pending quantities on ${pendingDelete.po_number} will be recalculated.` : ''}
        confirmLabel="Delete"
        confirmTone="critical"
        onCancel={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (!pendingDelete) return;
          try {
            await dispatchesApi.remove(pendingDelete.id);
            notifySuccess(`Dispatch '${pendingDelete.lr_number}' deleted.`);
            setPendingDelete(null);
            setDetail(null);
            await load();
          } catch (err) {
            notifyApiError(err);
          }
        }}
      />
    </div>
  );
};

function ImportedDispatchSummary({
  created,
  onDismiss,
  onOpenPo,
}: {
  created: DispatchImportCreated[];
  onDismiss: () => void;
  onOpenPo: (poId: number) => void;
}) {
  const groups: { po_id: number; po_number: string; rows: DispatchImportCreated[] }[] = [];
  const index = new Map<number, number>();
  for (const row of created) {
    const existing = index.get(row.po_id);
    if (existing === undefined) {
      index.set(row.po_id, groups.length);
      groups.push({ po_id: row.po_id, po_number: row.po_number, rows: [row] });
    } else {
      groups[existing].rows.push(row);
    }
  }
  return (
    <div className="border border-[var(--erp-gold)]/40 bg-[var(--erp-gold)]/8 p-3 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-mono uppercase tracking-wider text-[var(--erp-gold)]">
          Imported {created.length} dispatch{created.length === 1 ? '' : 'es'} · by purchase order
        </p>
        <button type="button" onClick={onDismiss} className="text-[var(--erp-muted)]"><X className="w-3.5 h-3.5" /></button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="font-mono text-[10px] uppercase tracking-wider text-[var(--erp-muted)]">
            <tr>
              <th className="px-2 py-1">PO Number</th>
              <th className="px-2 py-1">Dispatches</th>
              <th className="px-2 py-1" />
            </tr>
          </thead>
          <tbody>
            {groups.map(group => (
              <tr key={group.po_id} className="border-t border-[var(--erp-hairline)]">
                <td className="px-2 py-2 font-mono text-[var(--erp-gold)]">{group.po_number}</td>
                <td className="px-2 py-2 font-mono">
                  {group.rows.map(r => r.lr_number).join(', ')}
                  <span className="text-[var(--erp-muted)]"> · {group.rows[group.rows.length - 1].po_status}</span>
                </td>
                <td className="px-2 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => onOpenPo(group.po_id)}
                    className="text-[11px] font-mono text-[var(--erp-gold)] hover:underline cursor-pointer"
                  >
                    View PO
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
