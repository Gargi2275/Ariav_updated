import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, FileSpreadsheet, RefreshCw, Search, Trash2, Upload } from 'lucide-react';
import { purchaseOrdersApi } from '../../services/purchaseOrdersApi';
import { notifyApiError, notifyError, notifySuccess } from '../../services/notify';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { FileDropZone } from '../../components/common/FileDropZone';
import { StatusChip } from '../../components/common/StatusChip';
import { MasterError, MasterLoading } from '../masters/MasterStatus';
import { useErp } from '../../context/ErpContext';

type LineRow = {
  official_line_id: number | null;
  row_number: number | null;
  internal_product: string;
  internal_code: string;
  ocm_identity: string;
  template: string;
  size: string;
  internal_qty: string;
  official_qty: string;
  difference: string;
  internal_rate: string;
  official_rate: string;
  internal_delivery: string;
  official_delivery: string;
  delivery_start: string;
  delivery_end: string;
  code1: string;
  code2: string;
  code3: string;
  code4: string;
  code5: string;
  code6: string;
  status: string;
  reason: string;
};

type Detail = {
  order: {
    id: number;
    order_number: string;
    status: string;
    filename: string;
    imported_at: string;
    customer_name: string;
    customer_code?: string;
  };
  internal_po_number: string;
  internal_po_id: number | null;
  brand: string;
  candidates: { id: number; po_number: string }[];
  lines: LineRow[];
  blockers: string[];
  differences: LineRow[];
  audit: { action: string; reason: string; at: string }[];
};

type Summary = {
  id: number;
  order_number: string;
  status: string;
  customer_code: string;
  customer_name: string;
  filename: string;
  imported_at: string;
  purchase_order_number: string;
  brand: string;
  line_count: number;
  matched_line_count: number;
  unmatched_line_count: number;
};

type ImportResult = {
  duplicate_file: boolean;
  orders: { id?: number; order_number?: string }[];
  row_errors: { row: number; reason: string }[];
};

const PAGE_SIZES = [25, 50, 100, 200] as const;
const STATUSES = ['Awaiting Review', 'Ready for Approval', 'Approved', 'Needs Review'] as const;

function statusTone(status: string): string {
  if (status === 'Exact Match' || status === 'Approved' || status === 'Ready for Approval') return 'approved';
  if (status === 'Awaiting Review') return 'pending';
  return 'notice';
}

function formatWhen(value: string): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

function blank(value: string | number | null | undefined): string {
  const text = value == null ? '' : String(value).trim();
  return text || '—';
}

export const OcmOfficialPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { userRole, canEditRecords, canDeleteRecords } = useErp();
  const canEdit = userRole === 'admin' || (userRole === 'staff' && canEditRecords);
  const canDelete = userRole === 'admin' || (userRole === 'staff' && canDeleteRecords);
  const [rows, setRows] = useState<Summary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [unresolved, setUnresolved] = useState(false);
  const [mismatchesOnly, setMismatchesOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [reason, setReason] = useState('');
  const [approveOpen, setApproveOpen] = useState(false);
  const [approving, setApproving] = useState(false);
  const [actionMessage, setActionMessage] = useState('');
  const [mapLine, setMapLine] = useState<LineRow | null>(null);
  const [mapQuality, setMapQuality] = useState('');
  const [mapShade, setMapShade] = useState('');
  const [mapReason, setMapReason] = useState('');
  const [mapConfirm, setMapConfirm] = useState(false);
  const [savingMap, setSavingMap] = useState(false);
  const [storedTotal, setStoredTotal] = useState(0);
  const [selected, setSelected] = useState<number[]>([]);
  const [pendingDelete, setPendingDelete] = useState<{ id: number; order_number: string }[]>([]);
  const [pendingDeleteAll, setPendingDeleteAll] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    purchaseOrdersApi.ocmOfficialList()
      .then((body) => {
        setRows(body.orders as unknown as Summary[]);
        setStoredTotal(body.total);
      })
      .catch((loadError) => {
        const parsed = notifyApiError(loadError, 'Could not load official OCM orders');
        setError(parsed.message);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const ids = new Set(rows.map((row) => row.id));
    setSelected((current) => current.filter((id) => ids.has(id)));
  }, [rows]);

  const counts = useMemo(() => ({
    total: storedTotal,
    awaiting: rows.filter((row) => row.status === 'Awaiting Review').length,
    mismatches: rows.filter((row) => row.unmatched_line_count > 0).length,
    ready: rows.filter((row) => row.status === 'Ready for Approval').length,
    approved: rows.filter((row) => row.status === 'Approved').length,
  }), [rows, storedTotal]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (query) {
        const haystack = [row.order_number, row.customer_name, row.customer_code, row.purchase_order_number]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      if (status && row.status !== status) return false;
      if (unresolved && row.status === 'Approved') return false;
      if (mismatchesOnly && row.unmatched_line_count <= 0) return false;
      return true;
    });
  }, [rows, search, status, unresolved, mismatchesOnly]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const visible = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const openOrder = (id: number) => {
    setDetailLoading(true);
    setDetailError('');
    setActionMessage('');
    setReason('');
    purchaseOrdersApi.ocmOfficialDetail(id)
      .then((body) => setDetail(body as unknown as Detail))
      .catch((openError) => {
        const parsed = notifyApiError(openError, 'Could not open the comparison');
        setDetailError(parsed.message);
      })
      .finally(() => setDetailLoading(false));
  };

  const submitImport = async () => {
    if (!importFile) {
      setImportError('Choose an .xlsx or .xlsb file first.');
      return;
    }
    setImporting(true);
    setImportError('');
    setImportResult(null);
    try {
      const result = await purchaseOrdersApi.ocmOfficialImport(importFile);
      setImportResult(result);
      if (result.duplicate_file) {
        notifySuccess('This file was already imported. No duplicate orders were created.');
      } else if (result.row_errors.length && result.orders.length === 0) {
        setImportError('The file was read, but no official order was created.');
      } else {
        notifySuccess(result.row_errors.length ? 'Imported with row warnings' : 'Official OCM order imported');
      }
      load();
    } catch (importFailure) {
      const parsed = notifyApiError(importFailure, 'Could not import the official OCM file');
      setImportError(parsed.message);
    } finally {
      setImporting(false);
    }
  };

  const approve = async () => {
    if (!detail) return;
    setApproving(true);
    setActionMessage('');
    try {
      const body = await purchaseOrdersApi.ocmOfficialApprove(detail.order.id, reason);
      const next = body as unknown as Detail;
      setDetail(next);
      setApproveOpen(false);
      const message = `Official order ${next.order.order_number} was approved. Internal PO ${next.internal_po_number || 'number'} was kept.`;
      setActionMessage(message);
      notifySuccess(message);
      load();
    } catch (approveError) {
      const parsed = notifyApiError(approveError, 'Approval was not saved');
      setActionMessage(parsed.message);
      setApproveOpen(false);
    } finally {
      setApproving(false);
    }
  };

  const saveMapping = async () => {
    if (!detail || !mapLine?.official_line_id) return;
    setSavingMap(true);
    try {
      const body = await purchaseOrdersApi.ocmOfficialMapping(detail.order.id, {
        line_id: mapLine.official_line_id,
        quality_label: mapQuality,
        shade: mapShade,
        reason: mapReason,
      });
      setDetail(body as unknown as Detail);
      setMapConfirm(false);
      setMapLine(null);
      setMapQuality('');
      setMapShade('');
      setMapReason('');
      notifySuccess('Product mapping saved');
      load();
    } catch (mapError) {
      notifyApiError(mapError, 'Could not save the mapping');
    } finally {
      setSavingMap(false);
    }
  };

  const removable = (row: Summary) => row.status !== 'Approved' && !row.purchase_order_number;

  const confirmDelete = async () => {
    const ids = pendingDelete.map((row) => row.id);
    const all = pendingDeleteAll;
    try {
      const result = await purchaseOrdersApi.ocmOfficialDelete(ids, all);
      const removed = new Set(result.deleted.map((row) => row.id));
      setSelected((current) => current.filter((id) => !removed.has(id)));
      if (detail && (all || removed.has(detail.order.id))) {
        setDetail(null);
        setDetailError('');
      }
      setPendingDelete([]);
      setPendingDeleteAll(false);
      const count = result.deleted_count ?? result.deleted.length;
      if (count) {
        const more = result.remaining > 0
          ? ` ${result.remaining} official orders are still stored, so the next ones are now showing.`
          : '';
        notifySuccess(`${count} official order${count === 1 ? '' : 's'} deleted.${more}`);
      }
      if (result.blocked.length) {
        notifyError(result.blocked.map((row) => `${row.order_number}: ${row.reason}`).join(' '));
      }
      load();
    } catch (deleteError) {
      notifyApiError(deleteError, 'Could not delete the official order');
      throw deleteError;
    }
  };

  const applyStatusCard = (next: string) => {
    setMismatchesOnly(false);
    setUnresolved(false);
    setStatus(next);
    setPage(1);
  };

  return (
    <div className="min-h-full p-3 flex flex-col gap-3 text-left">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="font-body text-xs text-[var(--erp-muted)]">
            <span>Purchase Orders</span>
            <span className="px-1.5 text-[var(--erp-hairline-strong)]">/</span>
            <span className="text-[var(--erp-text)]">OCM Official Reconciliation</span>
          </p>
          <h1 className="font-display text-lg font-bold tracking-tight text-[var(--erp-text)]">OCM Official Reconciliation</h1>
          <p className="font-body text-xs text-[var(--erp-muted)] mt-1 max-w-3xl">
            Compare an internal purchase order with the official OCM order, resolve the lines, then approve. The internal PO number stays as it is.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="h-8 px-2.5 border border-[var(--erp-hairline-strong)] text-[var(--erp-text)] font-body text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--erp-gold)]"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Purchase Orders
          </button>
          <button
            type="button"
            onClick={() => { setImportOpen(true); setImportError(''); setImportResult(null); }}
            className="h-8 px-2.5 bg-[var(--erp-gold)] text-[#0F141B] font-body text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--erp-gold)]"
          >
            <Upload className="w-3.5 h-3.5" /> Import Official OCM File
          </button>
        </div>
      </div>

      {detail || detailLoading ? (
        <ComparisonWorkspace
          detail={detail}
          loading={detailLoading}
          error={detailError}
          canEdit={canEdit}
          reason={reason}
          actionMessage={actionMessage}
          approving={approving}
          onBack={() => { setDetail(null); setDetailError(''); }}
          onRetry={() => detail && openOrder(detail.order.id)}
          onReason={setReason}
          onSelectPo={(purchaseOrderId) => {
            if (!detail) return;
            purchaseOrdersApi.ocmOfficialSelect(detail.order.id, purchaseOrderId)
              .then((body) => setDetail(body as unknown as Detail))
              .catch((selectError) => notifyApiError(selectError, 'Could not select the purchase order'));
          }}
          onApprove={() => setApproveOpen(true)}
          onDelete={canDelete && detail && detail.order.status !== 'Approved' && !detail.internal_po_number
            ? () => { setPendingDeleteAll(false); setPendingDelete([{ id: detail.order.id, order_number: detail.order.order_number }]); }
            : undefined}
          onStartMap={(line) => {
            setMapLine(line);
            setMapQuality('');
            setMapShade('');
            setMapReason('');
          }}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <SummaryCard label="Total official orders" value={loading ? '—' : counts.total} active={!status && !unresolved && !mismatchesOnly} onClick={() => applyStatusCard('')} />
            <SummaryCard label="Awaiting review" value={loading ? '—' : counts.awaiting} active={status === 'Awaiting Review'} onClick={() => applyStatusCard('Awaiting Review')} />
            <SummaryCard label="Orders with mismatches" value={loading ? '—' : counts.mismatches} active={mismatchesOnly} onClick={() => { setStatus(''); setUnresolved(false); setMismatchesOnly(true); setPage(1); }} />
            <SummaryCard label="Ready for approval" value={loading ? '—' : counts.ready} active={status === 'Ready for Approval'} onClick={() => applyStatusCard('Ready for Approval')} />
            <SummaryCard label="Approved orders" value={loading ? '—' : counts.approved} active={status === 'Approved'} onClick={() => applyStatusCard('Approved')} />
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-[var(--erp-muted)] min-w-[16rem] flex-1">
              Search
              <span className="mt-1 flex items-center gap-1.5 h-8 border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] px-2">
                <Search className="w-3.5 h-3.5 shrink-0" />
                <input
                  aria-label="Search by official order, party, or internal PO"
                  value={search}
                  onChange={(event) => { setSearch(event.target.value); setPage(1); }}
                  placeholder="Official order, party, or internal PO"
                  className="w-full bg-transparent text-xs text-[var(--erp-text)] outline-none"
                />
              </span>
            </label>
            <label className="text-xs text-[var(--erp-muted)]">
              Status
              <select
                aria-label="Filter by status"
                value={status}
                onChange={(event) => { setStatus(event.target.value); setMismatchesOnly(false); setPage(1); }}
                className="block h-8 mt-1 border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] px-2 text-xs text-[var(--erp-text)]"
              >
                <option value="">All statuses</option>
                {STATUSES.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label className="h-8 mb-0.5 inline-flex items-center gap-2 text-xs text-[var(--erp-text)]">
              <input
                type="checkbox"
                checked={unresolved}
                onChange={(event) => { setUnresolved(event.target.checked); setPage(1); }}
              />
              Unresolved only
            </label>
            <button type="button" onClick={load} className="h-8 px-2 border border-[var(--erp-hairline-strong)] text-xs inline-flex items-center gap-1 cursor-pointer">
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
            {canDelete && selected.length > 0 ? (
              <button
                type="button"
                onClick={() => { setPendingDeleteAll(false); setPendingDelete(rows.filter((row) => selected.includes(row.id)).map((row) => ({ id: row.id, order_number: row.order_number }))); }}
                className="h-8 px-2 border border-[var(--erp-negative)] text-[var(--erp-negative)] text-xs inline-flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete selected ({selected.length})
              </button>
            ) : null}
            {canDelete && storedTotal > rows.length ? (
              <button
                type="button"
                onClick={() => { setPendingDelete([]); setPendingDeleteAll(true); }}
                className="h-8 px-2 border border-[var(--erp-negative)] text-[var(--erp-negative)] text-xs inline-flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete all unapproved
              </button>
            ) : null}
          </div>

          {error ? <MasterError message={error} onRetry={load} /> : null}
          {loading ? <MasterLoading label="Loading official OCM orders" rows={6} /> : null}
          {!loading && !error && rows.length === 0 ? (
            <div className="border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] px-4 py-8 text-center">
              <FileSpreadsheet className="w-5 h-5 mx-auto text-[var(--erp-gold)]" />
              <p className="mt-2 font-display text-base text-[var(--erp-text)]">No official OCM orders yet</p>
              <p className="mt-1 text-xs text-[var(--erp-muted)] max-w-md mx-auto">
                Import an official OCM workbook in .xlsx or .xlsb format. The file is checked before any order is stored, and the same file cannot be imported twice.
              </p>
              <button type="button" onClick={() => setImportOpen(true)} className="mt-3 h-8 px-3 bg-[var(--erp-gold)] text-[#0F141B] text-xs font-semibold cursor-pointer">
                Import Official OCM File
              </button>
            </div>
          ) : null}
          {!loading && !error && rows.length > 0 ? (
            <div className="border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] overflow-x-auto">
              {storedTotal > rows.length ? (
                <p className="px-3 py-2 text-[11px] text-[var(--erp-muted)] border-b border-[var(--erp-hairline)]">
                  Showing {rows.length} of {storedTotal} official orders. Deleting this page removes only these rows. The next orders then appear.
                </p>
              ) : null}
              <table className="w-full min-w-[880px] text-xs border-collapse">
                <thead>
                  <tr className="text-left text-[var(--erp-muted)] bg-[var(--erp-surface-2)]">
                    {canDelete ? (
                      <th className="px-3 py-2 w-8">
                        <input
                          type="checkbox"
                          aria-label="Select official orders on this page"
                          checked={visible.filter(removable).length > 0 && visible.filter(removable).every((row) => selected.includes(row.id))}
                          onChange={(event) => {
                            const pageIds = visible.filter(removable).map((row) => row.id);
                            setSelected((current) => event.target.checked
                              ? [...new Set([...current, ...pageIds])]
                              : current.filter((id) => !pageIds.includes(id)));
                          }}
                        />
                      </th>
                    ) : null}
                    <th className="px-3 py-2 font-medium">Official Order No.</th>
                    <th className="px-3 py-2 font-medium">Party</th>
                    <th className="px-3 py-2 font-medium">Internal PO No.</th>
                    <th className="px-3 py-2 font-medium text-right">Lines</th>
                    <th className="px-3 py-2 font-medium text-right">Matched</th>
                    <th className="px-3 py-2 font-medium text-right">Unmatched</th>
                    <th className="px-3 py-2 font-medium">Imported</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.length === 0 ? (
                    <tr>
                      <td colSpan={canDelete ? 10 : 9} className="px-3 py-6 text-center text-[var(--erp-muted)]">No orders match this search or filter.</td>
                    </tr>
                  ) : visible.map((row) => (
                    <tr key={row.id} className="border-t border-[var(--erp-hairline)]">
                      {canDelete ? (
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            aria-label={`Select ${row.order_number}`}
                            disabled={!removable(row)}
                            checked={selected.includes(row.id)}
                            onChange={(event) => {
                              setSelected((current) => event.target.checked
                                ? [...current, row.id]
                                : current.filter((id) => id !== row.id));
                            }}
                          />
                        </td>
                      ) : null}
                      <td className="px-3 py-2 font-medium text-[var(--erp-text)]">{row.order_number}</td>
                      <td className="px-3 py-2">
                        <span className="block text-[var(--erp-text)]">{blank(row.customer_name)}</span>
                        <span className="block text-[10px] text-[var(--erp-muted)]">{blank(row.customer_code)}</span>
                      </td>
                      <td className="px-3 py-2">{blank(row.purchase_order_number)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.line_count}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.matched_line_count}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.unmatched_line_count}</td>
                      <td className="px-3 py-2">
                        <span className="block">{formatWhen(row.imported_at)}</span>
                        <span className="block text-[10px] text-[var(--erp-muted)]">{row.filename}</span>
                      </td>
                      <td className="px-3 py-2"><StatusChip status={statusTone(row.status)} label={row.status} /></td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <button type="button" onClick={() => openOrder(row.id)} className="h-7 px-2 border border-[var(--erp-gold)] text-[var(--erp-gold)] text-[11px] font-semibold cursor-pointer">
                            Review
                          </button>
                          {canDelete && removable(row) ? (
                            <button
                              type="button"
                              onClick={() => { setPendingDeleteAll(false); setPendingDelete([{ id: row.id, order_number: row.order_number }]); }}
                              className="h-7 px-2 border border-[var(--erp-negative)] text-[var(--erp-negative)] text-[11px] font-semibold cursor-pointer"
                            >
                              Delete
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {canDelete && visible.filter(removable).length > 0 && visible.filter(removable).every((row) => selected.includes(row.id)) && filtered.filter(removable).some((row) => !selected.includes(row.id)) ? (
                <div className="px-3 py-2 border-t border-[var(--erp-hairline)] text-xs">
                  <button
                    type="button"
                    onClick={() => setSelected(filtered.filter(removable).map((row) => row.id))}
                    className="text-[var(--erp-gold)] cursor-pointer"
                  >
                    Select all {filtered.filter(removable).length} orders in this list
                  </button>
                </div>
              ) : null}
              {filtered.length > 0 ? (
                <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-t border-[var(--erp-hairline)] text-xs">
                  <span className="text-[var(--erp-muted)]">{filtered.length} orders</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex items-center gap-1.5 text-[var(--erp-muted)]">
                      Show
                      <select
                        aria-label="Orders per page"
                        value={pageSize}
                        onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}
                        className="h-7 border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] px-1 text-xs text-[var(--erp-text)]"
                      >
                        {PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
                      </select>
                    </label>
                    <button type="button" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)} className="h-7 px-2 border border-[var(--erp-hairline-strong)] disabled:opacity-40 cursor-pointer">Previous</button>
                    <span>Page {safePage} of {pageCount}</span>
                    <button type="button" disabled={safePage >= pageCount} onClick={() => setPage(safePage + 1)} className="h-7 px-2 border border-[var(--erp-hairline-strong)] disabled:opacity-40 cursor-pointer">Next</button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      )}

      {importOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-black/40 p-4" role="presentation" onClick={() => { if (!importing) setImportOpen(false); }}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="ocm-import-title"
            className="flex max-h-[min(40rem,calc(100vh-2rem))] w-full max-w-lg flex-col bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] p-4 text-left"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="ocm-import-title" className="font-display text-base font-bold text-[var(--erp-text)]">Import official OCM file</h2>
            <p className="mt-1 text-xs text-[var(--erp-muted)]">
              Use an .xlsx or .xlsb workbook. Legacy .xls files are not read. Required columns include Customer Code, Order No, Code1, and Ord.Qty. Title rows above the headings are skipped.
            </p>
            <div className="mt-3">
              <FileDropZone
                accept=".xlsx,.xlsb"
                file={importFile}
                onChange={(file) => { setImportFile(file); setImportError(''); setImportResult(null); }}
                emptyTitle="Drop the .xlsx or .xlsb file here"
                emptyHint="or browse"
                rejectionMessage="Only .xlsx and .xlsb files can be imported."
                onFileRejected={setImportError}
                disabled={importing}
              />
            </div>
            {importing ? <p role="status" className="mt-2 text-xs text-[var(--erp-gold)]">Importing and checking the workbook…</p> : null}
            {importError ? <p role="alert" className="mt-2 text-xs text-[var(--erp-negative)]">{importError}</p> : null}
            {importResult ? (
              <div role="status" className="mt-3 min-h-0 overflow-y-auto border border-[var(--erp-hairline)] bg-[var(--erp-surface-2)] p-2 text-xs">
                {importResult.duplicate_file ? <p>This file was already imported. No duplicate official orders were created.</p> : null}
                {!importResult.duplicate_file ? (
                  <p>{importResult.orders.length} official order{importResult.orders.length === 1 ? '' : 's'} stored. They are in the list behind this dialog.</p>
                ) : null}
                {importResult.row_errors.length ? (
                  <>
                    <p className="mt-2">{importResult.row_errors.length} row{importResult.row_errors.length === 1 ? '' : 's'} could not be stored.</p>
                    <ul className="mt-1 list-disc pl-4">
                      {importResult.row_errors.slice(0, 30).map((row) => <li key={`${row.row}-${row.reason}`}>Row {row.row}: {row.reason}</li>)}
                    </ul>
                    {importResult.row_errors.length > 30 ? <p className="mt-1 text-[var(--erp-muted)]">Showing the first 30 warnings.</p> : null}
                  </>
                ) : null}
              </div>
            ) : null}
            <div className="mt-4 flex shrink-0 justify-end gap-2">
              <button type="button" disabled={importing} onClick={() => setImportOpen(false)} className="h-8 px-3 border border-[var(--erp-hairline-strong)] text-xs cursor-pointer">Close</button>
              <button type="button" disabled={importing || !importFile} onClick={submitImport} className="h-8 px-3 bg-[var(--erp-gold)] text-[#0F141B] text-xs font-semibold disabled:opacity-45 cursor-pointer">
                {importing ? 'Importing…' : 'Import file'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={pendingDelete.length > 0 || pendingDeleteAll}
        entityType={pendingDeleteAll ? 'official orders' : pendingDelete.length === 1 ? 'official order' : 'official orders'}
        entityLabel={pendingDeleteAll ? 'every unapproved official order' : pendingDelete.length === 1 ? pendingDelete[0].order_number : `${pendingDelete.length} official orders`}
        title={pendingDeleteAll ? 'Delete all unapproved official orders?' : pendingDelete.length === 1 ? `Delete ${pendingDelete[0].order_number}?` : `Delete ${pendingDelete.length} official orders?`}
        message={pendingDeleteAll
          ? 'This removes every official order that is not approved, including orders that are not on this page. Internal purchase orders, their numbers, and dispatch records stay as they are.'
          : 'The official order is removed from reconciliation. The internal purchase order, its number, and dispatch records stay as they are.'}
        onCancel={() => { setPendingDelete([]); setPendingDeleteAll(false); }}
        onConfirm={confirmDelete}
      />
      <ConfirmDialog
        open={approveOpen}
        entityType="official OCM order"
        entityLabel={detail?.order.order_number || ''}
        title="Approve official OCM order?"
        message="The official order number is stored on the selected internal purchase order. The internal number and its lines stay as they are."
        confirmLabel={approving ? 'Approving…' : 'Approve'}
        confirmTone="gold"
        onCancel={() => { if (!approving) setApproveOpen(false); }}
        onConfirm={approve}
      />
      <ConfirmDialog
        open={mapConfirm}
        entityType="product mapping"
        entityLabel={mapLine?.ocm_identity || 'this OCM identity'}
        title="Save this product mapping?"
        message="The mapping is stored for this full OCM identity. It does not create or change a product."
        confirmLabel={savingMap ? 'Saving…' : 'Save mapping'}
        confirmTone="gold"
        onCancel={() => { if (!savingMap) setMapConfirm(false); }}
        onConfirm={saveMapping}
      />
      {mapLine && canEdit ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" role="presentation">
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="ocm-map-title"
            className="w-full max-w-md bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] p-4"
            onSubmit={(event) => { event.preventDefault(); setMapConfirm(true); }}
          >
            <h2 id="ocm-map-title" className="font-display text-base font-bold">Map OCM identity</h2>
            <p className="mt-1 text-xs text-[var(--erp-muted)]">{mapLine.ocm_identity || 'Official line'} did not match an internal line. Enter the internal quality that should be used, and a reason.</p>
            <label className="mt-3 block text-xs">Internal quality
              <input required aria-label="Internal quality label" value={mapQuality} onChange={(event) => setMapQuality(event.target.value)} className="mt-1 block h-8 w-full border border-[var(--erp-hairline-strong)] bg-transparent px-2" />
            </label>
            <label className="mt-2 block text-xs">Shade
              <input aria-label="Shade" value={mapShade} onChange={(event) => setMapShade(event.target.value)} className="mt-1 block h-8 w-full border border-[var(--erp-hairline-strong)] bg-transparent px-2" />
            </label>
            <label className="mt-2 block text-xs">Reason
              <input required aria-label="Mapping reason" value={mapReason} onChange={(event) => setMapReason(event.target.value)} className="mt-1 block h-8 w-full border border-[var(--erp-hairline-strong)] bg-transparent px-2" />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setMapLine(null)} className="h-8 px-3 border text-xs cursor-pointer">Cancel</button>
              <button type="submit" className="h-8 px-3 bg-[var(--erp-gold)] text-[#0F141B] text-xs font-semibold cursor-pointer">Review mapping</button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
};

const SummaryCard: React.FC<{ label: string; value: number | string; active: boolean; onClick: () => void }> = ({ label, value, active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={`border px-3 py-2 text-left cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--erp-gold)] ${active ? 'border-[var(--erp-gold)] bg-[var(--erp-surface)]' : 'border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)]'}`}
  >
    <span className="block font-body text-[10px] uppercase tracking-wide text-[var(--erp-muted)]">{label}</span>
    <span className="block font-display text-xl leading-tight text-[var(--erp-text)] tabular-nums">{value}</span>
  </button>
);

const ComparisonWorkspace: React.FC<{
  detail: Detail | null;
  loading: boolean;
  error: string;
  canEdit: boolean;
  reason: string;
  actionMessage: string;
  approving: boolean;
  onBack: () => void;
  onRetry: () => void;
  onReason: (value: string) => void;
  onSelectPo: (id: number) => void;
  onApprove: () => void;
  onDelete?: () => void;
  onStartMap: (line: LineRow) => void;
}> = ({ detail, loading, error, canEdit, reason, actionMessage, approving, onBack, onRetry, onReason, onSelectPo, onApprove, onDelete, onStartMap }) => {
  if (loading && !detail) return <MasterLoading label="Loading comparison" rows={5} />;
  if (error && !detail) return <MasterError message={error} onRetry={onRetry} />;
  if (!detail) return null;
  const differences = detail.differences || [];
  const blocked = detail.blockers.length > 0 || detail.order.status === 'Approved';
  const needsReason = differences.length > 0 && !reason.trim();
  const mappingLines = detail.lines.filter((line) => line.status === 'Unmatched' || line.status === 'Needs Review');
  return (
    <section className="flex flex-col gap-3" role="region" aria-label="Order comparison">
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={onBack} className="h-8 w-fit px-2 text-xs text-[var(--erp-gold)] inline-flex items-center gap-1 cursor-pointer">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to official orders
        </button>
        {onDelete ? (
          <button type="button" onClick={onDelete} className="h-8 px-2 border border-[var(--erp-negative)] text-[var(--erp-negative)] text-xs inline-flex items-center gap-1 cursor-pointer">
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
        ) : null}
      </div>
      <div className="border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] p-3 grid gap-3 md:grid-cols-3">
        <Fact label="Official order" value={detail.order.order_number} />
        <Fact label="Party" value={detail.order.customer_name || '—'} />
        <Fact label="Internal PO" value={detail.internal_po_number || 'Not selected'} />
        <Fact label="Status" value={detail.order.status} />
        <Fact label="File" value={detail.order.filename || '—'} />
        <Fact label="Imported" value={formatWhen(detail.order.imported_at)} />
      </div>
      {detail.candidates.length > 1 ? (
        <label className="text-xs text-[var(--erp-muted)] max-w-sm">
          Internal purchase order
          <select
            aria-label="Select internal purchase order"
            className="mt-1 block h-8 w-full border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] px-2 text-xs text-[var(--erp-text)]"
            defaultValue=""
            onChange={(event) => { if (event.target.value) onSelectPo(Number(event.target.value)); }}
          >
            <option value="">Select one internal PO</option>
            {detail.candidates.map((item) => <option key={item.id} value={item.id}>{item.po_number}</option>)}
          </select>
        </label>
      ) : null}
      {detail.blockers.length ? (
        <div className="border border-[var(--erp-negative)]/40 bg-[var(--erp-surface)] px-3 py-2 text-xs">
          <p className="font-semibold text-[var(--erp-text)]">Approval is blocked</p>
          <ul className="mt-1 list-disc pl-4 text-[var(--erp-muted)]">
            {detail.blockers.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      ) : null}
      <div className="flex flex-col gap-2">
        {detail.lines.map((line, index) => (
          <article key={`${line.official_line_id ?? 'internal'}-${index}`} className="border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)]">
            <header className="flex items-center justify-between gap-2 px-3 py-2 border-b border-[var(--erp-hairline)]">
              <span className="text-xs font-medium text-[var(--erp-text)]">Line {line.row_number || index + 1}</span>
              <StatusChip status={statusTone(line.status)} label={line.status} />
            </header>
            <div className="grid md:grid-cols-2">
              <div className="p-3 md:border-r border-[var(--erp-hairline)]">
                <h3 className="text-[10px] uppercase tracking-wide text-[var(--erp-muted)]">Internal PO</h3>
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <dt className="text-[var(--erp-muted)]">Product</dt><dd>{blank(line.internal_product)}</dd>
                  <dt className="text-[var(--erp-muted)]">Code</dt><dd>{blank(line.internal_code)}</dd>
                  <dt className="text-[var(--erp-muted)]">Quantity</dt><dd className="tabular-nums">{blank(line.internal_qty)}</dd>
                  <dt className="text-[var(--erp-muted)]">Price</dt><dd>{line.internal_rate ? line.internal_rate : 'Not on the line'}</dd>
                  <dt className="text-[var(--erp-muted)]">Delivery</dt><dd>{blank(line.internal_delivery)}</dd>
                </dl>
              </div>
              <div className="p-3">
                <h3 className="text-[10px] uppercase tracking-wide text-[var(--erp-muted)]">Official OCM order</h3>
                <dl className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1 text-xs">
                  {(['code1', 'code2', 'code3', 'code4', 'code5', 'code6'] as const).map((code, codeIndex) => (
                    <React.Fragment key={code}>
                      <dt className="text-[var(--erp-muted)]">Code{codeIndex + 1}</dt>
                      <dd className="col-span-2">{blank(line[code])}</dd>
                    </React.Fragment>
                  ))}
                  <dt className="text-[var(--erp-muted)]">Template</dt><dd className="col-span-2">{blank(line.template)}</dd>
                  <dt className="text-[var(--erp-muted)]">Size</dt><dd className="col-span-2">{blank(line.size)}</dd>
                  <dt className="text-[var(--erp-muted)]">Ord.Qty</dt><dd className="col-span-2 tabular-nums">{blank(line.official_qty)}</dd>
                  <dt className="text-[var(--erp-muted)]">Price</dt><dd className="col-span-2">{line.official_rate ? line.official_rate : 'Not in file'}</dd>
                  <dt className="text-[var(--erp-muted)]">Delivery start</dt><dd className="col-span-2">{blank(line.delivery_start)}</dd>
                  <dt className="text-[var(--erp-muted)]">Delivery end</dt><dd className="col-span-2">{blank(line.delivery_end)}</dd>
                </dl>
              </div>
            </div>
            <p className="px-3 py-2 border-t border-[var(--erp-hairline)] text-xs text-[var(--erp-text)]">
              {line.status === 'Exact Match' ? 'No difference. ' : `Difference ${blank(line.difference)}. `}
              {line.reason}
            </p>
            {canEdit && line.official_line_id && (line.status === 'Unmatched' || line.status === 'Needs Review') ? (
              <div className="px-3 pb-3">
                <button type="button" onClick={() => onStartMap(line)} className="h-7 px-2 border border-[var(--erp-gold)] text-[var(--erp-gold)] text-[11px] cursor-pointer">
                  Map this identity
                </button>
              </div>
            ) : null}
          </article>
        ))}
      </div>
      <div className="border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] p-3">
        <h2 className="text-sm font-semibold text-[var(--erp-text)]">Approval</h2>
        <ul className="mt-2 text-xs text-[var(--erp-muted)] grid gap-1">
          <li>Unresolved lines: {differences.length}</li>
          <li>Quantity or date differences: {differences.filter((line) => line.status === 'Quantity Difference' || line.status === 'Delivery Date Difference').length}</li>
          <li>Lines that still need a product mapping: {mappingLines.length}</li>
          <li>Duplicate or ambiguous lines: {detail.lines.filter((line) => line.status === 'Duplicate Candidate' || line.status === 'Needs Review').length}</li>
          <li>Blocking issues from the server: {detail.blockers.length}</li>
        </ul>
        <label className="mt-3 block text-xs text-[var(--erp-muted)]">
          Reason {needsReason ? '(required while differences remain)' : '(optional when every line matches)'}
          <input
            aria-label="Approval reason"
            value={reason}
            onChange={(event) => onReason(event.target.value)}
            disabled={detail.order.status === 'Approved'}
            className="mt-1 block h-8 w-full max-w-md border border-[var(--erp-hairline-strong)] bg-transparent px-2 text-[var(--erp-text)]"
          />
        </label>
        <button
          type="button"
          onClick={onApprove}
          disabled={blocked || needsReason || approving}
          className="mt-3 h-8 px-3 bg-[var(--erp-gold)] text-[#0F141B] text-xs font-semibold disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer"
        >
          {detail.order.status === 'Approved' ? 'Already approved' : 'Approve official order'}
        </button>
        {actionMessage ? <p role="status" className="mt-2 text-xs text-[var(--erp-text)]">{actionMessage}</p> : null}
      </div>
      <div>
        <h2 className="text-xs font-semibold text-[var(--erp-text)]">Audit history</h2>
        {detail.audit.length === 0 ? <p className="mt-1 text-xs text-[var(--erp-muted)]">No approval or mapping actions yet.</p> : (
          <ul className="mt-1 text-xs text-[var(--erp-muted)]">
            {detail.audit.map((event, index) => (
              <li key={`${event.at}-${index}`}>{formatWhen(event.at)} · {event.action}{event.reason ? ` · ${event.reason}` : ''}</li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
};

const Fact: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <p className="text-[10px] uppercase tracking-wide text-[var(--erp-muted)]">{label}</p>
    <p className="text-sm text-[var(--erp-text)]">{value}</p>
  </div>
);
