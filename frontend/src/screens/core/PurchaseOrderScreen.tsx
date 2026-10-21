import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, CheckCircle2, Clock3, Download, Eye, FileText, LayoutDashboard, Plus, Printer, Search, ShoppingCart, Table2, Trash2, Truck, Upload, X, XCircle } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useErp } from '../../context/ErpContext';
import { PageHeader } from '../../components/common/PageHeader';
import { PeriodScope } from '../../components/common/PeriodScope';
import { DataTable, Column } from '../../components/common/DataTable';
import { StatusChip, StatusChipType } from '../../components/common/StatusChip';
import { CustomerPicker } from '../../components/common/CustomerPicker';
import { SelectOption } from '../../components/common/AccessibleSelectModal';
import { TextInput, FormField, RequiredLegend } from '../../components/common/FormControls';
import { FileDropZone } from '../../components/common/FileDropZone';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { InputDialog } from '../../components/common/InputDialog';
import { MasterError, MasterLoading, emptyTableProps } from '../masters/MasterStatus';
import { num } from '../../services/mastersApi';
import { notifyApiError, notifySuccess } from '../../services/notify';
import { acquireSaveLock, releaseSaveLock } from '../../services/saveLock';
import { clearFieldMessage, collectRequired, REQUIRED_MSG } from '../../services/requiredFields';
import { BrandRow, brandsApi } from '../../services/brandsApi';
import { CustomerRow, CustomerStatementSummary, customersApi, readCustomerListFilter } from '../../services/customersApi';
import { EntityRow, entitiesApi } from '../../services/entitiesApi';
import { ProductRow, productsApi } from '../../services/productsApi';
import { priceListsApi } from '../../services/priceListsApi';
import {
  PO_STATUSES,
  OPEN_PO_KEY,
  PurchaseOrderRow,
  PurchaseOrderLineRow,
  emptyPurchaseOrder,
  purchaseOrdersApi,
  PoImportCommitResult,
} from '../../services/purchaseOrdersApi';
import { RateNotSetBadge, rateIsUnset } from '../../components/common/RateNotSetBadge';
import { ImportExcludedReport, PurchaseOrderImportModal } from './PurchaseOrderImportModal';
import {
  DispatchRow,
  canRecordDispatch,
  dispatchesApi,
  todayIso as dispatchToday,
} from '../../services/dispatchesApi';
import { INVOICE_FROM_PO_KEY } from '../../services/invoicesApi';
import { PoInvoicesList } from './PoInvoicesList';
import { LineDraft, PurchaseOrderLineItems } from './PurchaseOrderLineItems';
import { OrderFormView } from './OrderFormView';
import { blocksFromLines, emptyBlock, linesFromBlocks, OrderBlock, OrderLine, validateBlocks } from '../../services/orderForm';
import {
  lineItemsAreReadOnly,
  PurchaseOrderLineImportToggle,
  shouldShowLineItemsGrid,
} from './PurchaseOrderLineImportToggle';
import {
  isDigitalPoBrand,
  MAX_LINE_IMPORT_ROWS,
  parsePurchaseOrderLines,
} from '../../services/purchaseOrderLineImport';

const sectionTitle = 'text-[11px] font-mono uppercase tracking-[0.14em] text-[var(--erp-gold)] border-b border-[var(--erp-gold)]/25 pb-2 mb-4 flex items-center gap-2';
const fieldSelectClass = 'px-3 py-2.5 text-sm bg-[var(--erp-surface-2)] border text-[var(--erp-text)] transition-[border-color,box-shadow] duration-200 focus:outline-none focus:border-[var(--erp-gold)] focus:shadow-[0_0_0_3px_rgba(201,162,39,0.12)]';
function poChipStatus(status: string): StatusChipType | string {
  switch (status) {
    case 'Rejected':
      return 'rejected';
    case 'Cancelled':
      return 'inactive';
    case 'Draft':
      return 'inactive';
    case 'Submitted':
    case 'Sent to Brand':
    case 'On Hold':
      return 'pending';
    case 'Partially Dispatched':
      return 'partially dispatched';
    case 'Brand Accepted':
      return 'approved';
    case 'Fully Dispatched':
      return 'dispatched';
    case 'Closed':
      return 'active';
    default:
      return 'inactive';
  }
}

function money(value: string | number | null | undefined): string {
  return `₹${num(value).toFixed(2)}`;
}

function BrandSelectModal({
  branchLabel,
  brands,
  initialId,
  onCancel,
  onContinue,
}: {
  branchLabel: string;
  brands: BrandRow[];
  initialId?: number;
  onCancel: () => void;
  onContinue: (id: number) => void;
}) {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(initialId ?? null);
  const trimmed = query.trim().toLowerCase();
  const visible = brands.filter(brand => (
    !trimmed || `${brand.brand_code} ${brand.brand_name}`.toLowerCase().includes(trimmed)
  ));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Close brand selection" className="absolute inset-0 bg-black/70 cursor-default" onClick={onCancel} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="po-brand-title"
        className="relative flex w-full max-w-xl max-h-[88vh] flex-col bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
      >
        <div aria-hidden className="h-[2px] bg-gradient-to-r from-transparent via-[var(--erp-gold)] to-transparent" />
        <div className="flex items-start justify-between gap-4 border-b border-[var(--erp-hairline)] px-6 pt-5 pb-4">
          <div>
            <p className="mb-1 text-[10px] font-mono uppercase tracking-[0.18em] text-[var(--erp-muted)]">Step 1 · Brand</p>
            <h3 id="po-brand-title" className="font-display text-xl font-bold text-[var(--erp-text)]">Choose a brand</h3>
            <p className="mt-1 text-xs text-[var(--erp-muted)]">{branchLabel} · {brands.length} brands mapped to this branch</p>
          </div>
          <button type="button" aria-label="Close" onClick={onCancel} className="inline-flex h-8 w-8 items-center justify-center border border-[var(--erp-hairline)] text-[var(--erp-muted)] hover:border-[var(--erp-gold)] hover:text-[var(--erp-text)]">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-4 overflow-y-auto px-6 py-5">
          {brands.length > 4 ? (
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-[var(--erp-muted)]" />
              <input
                aria-label="Search brands"
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Search brand code or name…"
                className="w-full border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface-2)] py-2 pl-9 pr-3 text-sm text-[var(--erp-text)] focus:border-[var(--erp-gold)] focus:outline-none"
              />
            </div>
          ) : null}
          <div role="radiogroup" aria-label="Brands for this branch" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {visible.map(brand => {
              const selected = selectedId === brand.id;
              const manual = isManualOrderBrand(brand);
              return (
                <button
                  key={brand.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setSelectedId(brand.id)}
                  className={`flex min-h-[92px] flex-col items-start gap-1.5 border px-4 py-3 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--erp-gold)] ${selected ? 'border-[var(--erp-gold)] bg-[var(--erp-gold)]/10' : 'border-[var(--erp-hairline)] bg-[var(--erp-surface-2)] hover:border-[var(--erp-gold)]/60'}`}
                >
                  <span className="flex w-full items-center justify-between gap-2">
                    <span className="font-mono text-xs text-[var(--erp-gold)]">{brand.brand_code}</span>
                    <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full ${selected ? 'bg-[var(--erp-gold)]' : 'border border-[var(--erp-muted)]'}`} />
                  </span>
                  <span className="text-sm font-medium text-[var(--erp-text)]">{brand.brand_name}</span>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--erp-muted)]">{manual ? 'Manual / POR' : 'Digital PO'}</span>
                </button>
              );
            })}
          </div>
          {visible.length === 0 ? <p className="text-xs text-[var(--erp-muted)]">No brands match this search.</p> : null}
        </div>
        <div className="flex justify-end gap-3 border-t border-[var(--erp-hairline)] px-6 py-4">
          <button type="button" onClick={onCancel} className="border border-[var(--erp-hairline)] px-4 py-2.5 text-xs font-mono text-[var(--erp-muted)] hover:text-[var(--erp-text)]">Cancel</button>
          <button
            type="button"
            disabled={selectedId == null}
            onClick={() => { if (selectedId != null) onContinue(selectedId); }}
            className="bg-[var(--erp-gold)] px-5 py-2.5 text-xs font-semibold text-[#0F141B] hover:bg-[var(--erp-gold-soft)] disabled:cursor-not-allowed disabled:opacity-45"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

function newLine(manualEntry = false): LineDraft {
  return {
    key: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    category_id: undefined,
    product_id: undefined,
    product_description: '',
    manualEntry,
    quantity: '',
    rate: '',
  };
}

function storedLinesToOrderLines(rows: PurchaseOrderLineRow[]): OrderLine[] {
  return rows.map(line => ({
    product_id: line.product_id,
    product_description: line.product_description || line.product_code || line.product_name || '',
    shade: line.shade || '',
    quantity: String(line.quantity),
    rate: rateIsUnset(line.rate) ? null : String(line.rate),
    quantity_unit: line.quantity_unit === 'Meters' ? 'Meters' : 'Pieces',
    size: line.size || '',
    delivery_from: line.delivery_from || null,
    delivery_to: line.delivery_to || null,
    line_remarks: line.line_remarks || '',
    form_row_no: line.form_row_no ?? null,
  }));
}

type PurchaseOrderViewMode = 'graphical' | 'table';

const PENDING_PO_STATUSES = new Set(['Draft', 'Submitted', 'Sent to Brand']);
const COMPLETED_PO_STATUSES = new Set(['Fully Dispatched', 'Closed']);
const REJECTED_PO_STATUSES = new Set(['Rejected', 'Cancelled']);

function poQuantities(row: PurchaseOrderRow) {
  const ordered = row.lines.reduce((total, line) => total + num(line.quantity), 0);
  const hasDispatchData = row.lines.length > 0 && row.lines.every(line => line.total_dispatched !== undefined && line.total_dispatched !== null);
  const dispatched = hasDispatchData
    ? row.lines.reduce((total, line) => total + num(line.total_dispatched), 0)
    : null;
  const hasRemainingData = row.lines.length > 0 && row.lines.every(line => line.pending_quantity !== undefined && line.pending_quantity !== null);
  const remaining = hasRemainingData
    ? row.lines.reduce((total, line) => total + Math.max(0, num(line.pending_quantity)), 0)
    : dispatched === null ? null : Math.max(0, ordered - dispatched);
  const percentage = dispatched !== null && ordered > 0
    ? Math.min(100, Math.max(0, (dispatched / ordered) * 100))
    : null;
  return { ordered, dispatched, remaining, percentage };
}

function statusTone(status: string): string {
  if (['Closed', 'Fully Dispatched'].includes(status)) return 'var(--erp-positive)';
  if (['Rejected', 'Cancelled'].includes(status)) return 'var(--erp-negative)';
  if (['Partially Dispatched', 'Brand Accepted'].includes(status)) return 'var(--erp-gold)';
  return 'var(--erp-muted)';
}

function ProgressView({ rows, onOpen }: { rows: PurchaseOrderRow[]; onOpen: (id: number) => void }) {
  return (
    <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
      {rows.map(row => {
        const quantities = poQuantities(row);
        return (
          <button key={row.id} type="button" onClick={() => onOpen(row.id)} className="flex min-w-0 h-full flex-col text-left rounded-lg border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] p-4 shadow-[0_2px_10px_rgba(0,0,0,0.08)] hover:border-[var(--erp-gold)]">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-mono text-base font-semibold text-[var(--erp-gold)] truncate">{row.po_number}</div>
                <div className="mt-1 text-xs text-[var(--erp-text)] truncate">{row.customer_name} · {row.brand_name}</div>
              </div>
              <span className="shrink-0"><StatusChip status={poChipStatus(row.status)} label={row.status} /></span>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 text-xs text-[var(--erp-muted)]">
              <span>{row.po_date}</span>
              <span className="font-mono font-semibold text-[var(--erp-text)]">{money(row.total_amount)}</span>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--erp-surface-2)]">
              <div className="h-full" style={{ width: `${quantities.percentage ?? 0}%`, backgroundColor: statusTone(row.status) }} />
            </div>
            <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-3 text-[11px] font-mono text-[var(--erp-muted)]">
              <span>{quantities.ordered.toFixed(2)} ordered · {quantities.dispatched === null ? '—' : quantities.dispatched.toFixed(2)} dispatched</span>
              <span className="text-right">{quantities.percentage === null ? '—' : `${quantities.percentage.toFixed(0)}%`}</span>
            </div>
            <div className="mt-2 border-t border-[var(--erp-hairline)] pt-2 text-[11px] font-mono text-[var(--erp-muted)]">Remaining: {quantities.remaining === null ? '—' : quantities.remaining.toFixed(2)}</div>
          </button>
        );
      })}
    </div>
  );
}

function StatusOverview({ rows, onStatus }: { rows: PurchaseOrderRow[]; onStatus: (status: string) => void }) {
  const summary = PO_STATUSES.map(status => ({
    status,
    count: rows.filter(row => row.status === status).length,
    amount: rows.filter(row => row.status === status).reduce((total, row) => total + num(row.total_amount), 0),
  }));
  const max = Math.max(1, ...summary.map(item => item.count));
  const completed = rows.filter(row => COMPLETED_PO_STATUSES.has(row.status));
  const rejected = rows.filter(row => REJECTED_PO_STATUSES.has(row.status));
  const pending = rows.filter(row => PENDING_PO_STATUSES.has(row.status));
  const kpis = [
    { label: 'Total Purchase Orders', value: rows.length, supporting: money(rows.reduce((total, row) => total + num(row.total_amount), 0)), icon: ShoppingCart, color: 'var(--erp-gold)' },
    { label: 'Pending Orders', value: pending.length, supporting: money(pending.reduce((total, row) => total + num(row.total_amount), 0)), icon: Clock3, color: 'var(--erp-muted)' },
    { label: 'Completed Orders', value: completed.length, supporting: money(completed.reduce((total, row) => total + num(row.total_amount), 0)), icon: CheckCircle2, color: 'var(--erp-positive)' },
    { label: 'Rejected Orders', value: rejected.length, supporting: money(rejected.reduce((total, row) => total + num(row.total_amount), 0)), icon: XCircle, color: 'var(--erp-negative)' },
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {kpis.map(item => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="flex min-h-[138px] flex-col rounded-lg border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] p-4 shadow-[0_2px_12px_rgba(0,0,0,0.07)]" style={{ borderTopColor: item.color, borderTopWidth: 3 }}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 text-sm font-semibold text-[var(--erp-muted)]">{item.label}</div>
                <Icon className="h-4 w-4 shrink-0" style={{ color: item.color }} />
              </div>
              <div className="mt-auto pt-4 font-mono text-3xl font-semibold tracking-tight text-[var(--erp-text)]">{item.value}</div>
              <div className="mt-1 font-mono text-xs text-[var(--erp-muted)]">{item.supporting}</div>
            </div>
          );
        })}
      </div>
      <section className="rounded-lg border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] p-4 sm:p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div><h3 className="font-display text-lg font-bold text-[var(--erp-text)]">Purchase Order Status Distribution</h3><p className="mt-1 text-xs text-[var(--erp-muted)]">Select a status to filter the purchase order list.</p></div>
            <BarChart3 className="h-5 w-5 shrink-0 text-[var(--erp-gold)]" />
          </div>
          <div className="w-full space-y-2">
            {summary.map(item => (
              <button key={item.status} type="button" onClick={() => onStatus(item.status)} title={`Filter by ${item.status}`} className="grid min-w-0 w-full grid-cols-[minmax(150px,0.3fr)_minmax(0,1fr)_40px] items-center gap-3 text-left text-xs">
                <span className="truncate text-[var(--erp-muted)]">{item.status}</span>
                <span className="h-2.5 min-w-0 overflow-hidden rounded-full bg-[var(--erp-surface-2)]"><span className="block h-full rounded-full" style={{ width: `${(item.count / max) * 100}%`, backgroundColor: statusTone(item.status) }} /></span>
                <span className="font-mono text-right text-[var(--erp-text)]">{item.count}</span>
              </button>
            ))}
          </div>
      </section>
    </div>
  );
}

function GraphicalView({ rows, onStatus, onOpen }: { rows: PurchaseOrderRow[]; onStatus: (status: string) => void; onOpen: (id: number) => void }) {
  return (
    <div className="space-y-4">
      <StatusOverview rows={rows} onStatus={onStatus} />
      <div className="rounded-lg border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] p-4 sm:p-5">
        <div className="mb-4"><h3 className="font-display text-lg font-bold text-[var(--erp-text)]">Dispatch Progress</h3><p className="mt-1 text-xs text-[var(--erp-muted)]">Ordered, dispatched, and remaining quantities for the filtered orders.</p></div>
        <ProgressView rows={rows} onOpen={onOpen} />
      </div>
    </div>
  );
}

const ADMIN_STATUS_LABELS: Record<string, string> = {
  'Sent to Brand': 'Mark Sent to Brand',
  'Brand Accepted': 'Mark Brand Accepted',
  'Partially Dispatched': 'Mark Partially Dispatched',
  'Fully Dispatched': 'Mark Fully Dispatched',
  Closed: 'Close',
  Rejected: 'Reject',
  Cancelled: 'Cancel',
  'On Hold': 'Put On Hold',
  Submitted: 'Return to Submitted',
};

function normalizedOrderType(value: string | undefined): 'Manual' | 'Digital' {
  return String(value || '').trim().toLowerCase() === 'manual' ? 'Manual' : 'Digital';
}

function normalizedOrderTypeFilter(value: string): '' | 'Manual' | 'Digital' {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'manual' ? 'Manual' : normalized === 'digital' ? 'Digital' : '';
}

function isManualOrderBrand(brand: BrandRow): boolean {
  return String(brand.order_method || '').trim().toLowerCase() === 'manual/por';
}

export const PurchaseOrderScreen: React.FC = () => {
  const { userRole, sessionUserName, navigateTo, selectedEntityId, entityReady, canEditRecords, canDeleteRecords, getPeriod, productCategory } = useErp();
  const canDraftWrite = userRole === 'admin' || userRole === 'staff';
  const canEdit = userRole === 'admin' || (userRole === 'staff' && canEditRecords);
  const canDelete = userRole === 'admin' || (userRole === 'staff' && canDeleteRecords);
  const canStatusOverride = userRole === 'admin';

  const [rows, setRows] = useState<PurchaseOrderRow[]>([]);
  const [entities, setEntities] = useState<EntityRow[]>([]);
  const [brands, setBrands] = useState<BrandRow[]>([]);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [listCustomers, setListCustomers] = useState<CustomerRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [customerFilter, setCustomerFilter] = useState<number | ''>(() => readCustomerListFilter());
  const [brandFilter, setBrandFilter] = useState<number | ''>('');
  const [unpricedOnly, setUnpricedOnly] = useState(false);
  const [orderTypeFilter, setOrderTypeFilter] = useState(() => (
    normalizedOrderTypeFilter(localStorage.getItem(`po-type:${sessionUserName || userRole}`) || '')
  ));
  const [viewMode, setViewMode] = useState<PurchaseOrderViewMode>(() => {
    const saved = localStorage.getItem(`po-view:${sessionUserName || userRole}`);
    if (saved === 'list') return 'table';
    if (saved === 'pipeline' || saved === 'kanban') return 'table';
    if (saved === 'overview' || saved === 'progress' || saved === 'timeline') return 'graphical';
    return saved === 'graphical' || saved === 'table'
      ? saved
      : 'table';
  });
  const [handyFile, setHandyFile] = useState<File | null>(null);

  const [mode, setMode] = useState<'list' | 'form' | 'detail'>('list');
  const [form, setForm] = useState<Partial<PurchaseOrderRow>>(emptyPurchaseOrder());
  const [customerStatementSummary, setCustomerStatementSummary] = useState<CustomerStatementSummary | null>(null);
  const [lines, setLines] = useState<LineDraft[]>([newLine()]);
  const [lineEntryMode, setLineEntryMode] = useState<'manual' | 'upload'>('manual');
  const [entryView, setEntryView] = useState<'order' | 'list'>('list');
  const [blocks, setBlocks] = useState<OrderBlock[]>([]);
  const [pdfCopy, setPdfCopy] = useState('');
  const [lineImportFile, setLineImportFile] = useState<File | null>(null);
  const [lineImportLoaded, setLineImportLoaded] = useState(false);
  const [lineImportBusy, setLineImportBusy] = useState(false);
  const [lineImportError, setLineImportError] = useState('');
  const [lineImportSkipped, setLineImportSkipped] = useState<Array<{ rowNumber: number; reason: string }>>([]);
  const [detail, setDetail] = useState<PurchaseOrderRow | null>(null);
  const [fieldMessages, setFieldMessages] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PurchaseOrderRow | null>(null);
  const [pendingStatus, setPendingStatus] = useState<{ row: PurchaseOrderRow; next: string } | null>(null);
  const [poDispatches, setPoDispatches] = useState<DispatchRow[]>([]);
  const [showDispatchForm, setShowDispatchForm] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [brandPickerOpen, setBrandPickerOpen] = useState(false);
  const [importReport, setImportReport] = useState<PoImportCommitResult | null>(null);
  const [dispatchForm, setDispatchForm] = useState({
    dispatch_date: dispatchToday(),
    lr_number: '',
    transporter: '',
    challan_reference: '',
  });
  const [dispatchQtys, setDispatchQtys] = useState<Record<number, string>>({});
  const [dispatchMessages, setDispatchMessages] = useState<Record<string, string>>({});
  const [pendingDeleteDispatch, setPendingDeleteDispatch] = useState<DispatchRow | null>(null);
  const [pendingRateLine, setPendingRateLine] = useState<PurchaseOrderLineRow | null>(null);
  const [lineImportConfirmation, setLineImportConfirmation] = useState<'upload' | 'replace' | null>(null);
  const [pendingLineImportFile, setPendingLineImportFile] = useState<File | null>(null);
  const dispatchLock = useRef(false);
  const savingLock = useRef(false);
  const numberRef = useRef<HTMLInputElement>(null);

  const activeBranch = useMemo(
    () => {
      const workflowEntityId = form.id ? form.entity_id : selectedEntityId === 'all' ? undefined : selectedEntityId;
      return workflowEntityId ? entities.find(entity => entity.id === workflowEntityId) : undefined;
    },
    [entities, form.entity_id, form.id, selectedEntityId],
  );
  const headerBranch = useMemo(
    () => selectedEntityId === 'all'
      ? undefined
      : entities.find(entity => entity.id === selectedEntityId),
    [entities, selectedEntityId],
  );
  const headerBrandOptions = useMemo(() => {
    if (!headerBranch) return brands.filter(brand => brand.status === 'Active');
    const allowedIds = new Set((headerBranch.brand_ids || []).map(id => Number(id)));
    return brands.filter(brand => brand.status === 'Active' && allowedIds.has(Number(brand.id)));
  }, [brands, headerBranch]);
  const activeBrands = useMemo(() => {
    const allowed = activeBranch?.brand_ids || [];
    const allowedIds = new Set(allowed.map(id => Number(id)));
    return brands.filter(brand => brand.status === 'Active' && allowedIds.has(Number(brand.id)));
  }, [activeBranch, brands]);
  const manualBrands = useMemo(
    () => activeBrands.filter(isManualOrderBrand),
    [activeBrands],
  );
  const manualCreateAvailable = selectedEntityId === 'all' || manualBrands.length > 0;
  const selectedBrand = activeBrands.find(b => b.id === form.brand_id);
  const isManual = selectedBrand?.order_method === 'Manual/POR';
  const isDigitalPo = isDigitalPoBrand(selectedBrand);

  useEffect(() => {
    if (brandFilter !== '' && !headerBrandOptions.some(brand => brand.id === brandFilter)) {
      setBrandFilter('');
    }
  }, [brandFilter, headerBrandOptions]);

  useEffect(() => {
    if (!isDigitalPo) {
      setLineEntryMode('manual');
      setLineImportFile(null);
      setLineImportLoaded(false);
      setLineImportError('');
      setLineImportSkipped([]);
    }
  }, [isDigitalPo]);

  useEffect(() => {
    if (mode !== 'form' || form.id) return;
    const entityId = selectedEntityId === 'all' ? undefined : selectedEntityId;
    setForm(current => ({
      ...current,
      entity_id: entityId,
      brand_id: current.brand_id && activeBrands.some(brand => brand.id === current.brand_id)
        ? current.brand_id
        : activeBrands.length === 1 ? activeBrands[0].id : undefined,
      customer_id: current.entity_id === entityId ? current.customer_id : undefined,
    }));
  }, [activeBrands, form.id, mode, selectedEntityId]);

  const loadLookups = useCallback(async () => {
    try {
      const [ents, brs] = await Promise.all([
        entitiesApi.list({ status: 'Active' }),
        brandsApi.list({ status: 'Active' }),
      ]);
      setEntities(ents);
      setBrands(brs);
    } catch (e) {
      notifyApiError(e, 'Could not load lookup data.');
    }
  }, []);

  const period = getPeriod();
  const load = useCallback(async () => {
    if (!entityReady) return;
    setLoading(true);
    setError('');
    try {
      setRows(await purchaseOrdersApi.list({
        status: statusFilter || undefined,
        entity_id: selectedEntityId === 'all' ? undefined : selectedEntityId,
        customer_id: customerFilter || undefined,
        brand_id: brandFilter || undefined,
        has_unpriced: unpricedOnly || undefined,
        date_from: period.from,
        date_to: period.to,
      }));
    } catch (e) {
      const parsed = notifyApiError(e, 'Could not load purchase orders.');
      setError(parsed.message);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, selectedEntityId, customerFilter, brandFilter, unpricedOnly, entityReady, period.from, period.to]);

  useEffect(() => { void loadLookups(); }, [loadLookups]);
  useEffect(() => {
    void load();
  }, [load]);

  const setPurchaseOrderView = (next: PurchaseOrderViewMode) => {
    setViewMode(next);
    localStorage.setItem(`po-view:${sessionUserName || userRole}`, next);
  };

  const setPurchaseOrderType = (next: string) => {
    const normalized = normalizedOrderTypeFilter(next);
    setOrderTypeFilter(normalized);
    localStorage.setItem(`po-type:${sessionUserName || userRole}`, normalized);
  };

  useEffect(() => {
    if (!entityReady) return;
    void customersApi.list({
      status: 'Active',
      entity_id: selectedEntityId === 'all' ? undefined : selectedEntityId,
      scope: 'visible',
    }).then(setListCustomers).catch(notifyApiError);
  }, [selectedEntityId, entityReady]);

  const searchedRows = rows.filter(r => {
    const q = search.toLowerCase().trim();
    return !q || r.po_number.toLowerCase().includes(q) || r.customer_name.toLowerCase().includes(q);
  });
  const typeCounts = useMemo(() => searchedRows.reduce<Record<string, number>>((counts, row) => {
    const type = normalizedOrderType(row.order_type);
    counts[type] = (counts[type] || 0) + 1;
    return counts;
  }, {}), [searchedRows]);
  const filtered = searchedRows.filter(row => (
    !orderTypeFilter || normalizedOrderType(row.order_type) === orderTypeFilter
  ));

  useEffect(() => {
    if (!form.entity_id) {
      setCustomers([]);
      return;
    }
    void customersApi.list({ status: 'Active', entity_id: form.entity_id }).then(setCustomers).catch(notifyApiError);
  }, [form.entity_id]);

  useEffect(() => {
    if (!form.brand_id) {
      setProducts([]);
      return;
    }
    void productsApi.list({ status: 'Active', brand_id: form.brand_id, with_usage: 1 }).then(setProducts).catch(notifyApiError);
  }, [form.brand_id]);

  /** When editing a draft, hydrate category from the loaded catalogue product. */
  useEffect(() => {
    if (!products.length) return;
    setLines(prev => {
      let changed = false;
      const next = prev.map(l => {
        if (!l.product_id || l.category_id || l.manualEntry) return l;
        const product = products.find(p => p.id === l.product_id);
        if (!product?.category_id) return l;
        changed = true;
        return { ...l, category_id: product.category_id };
      });
      return changed ? next : prev;
    });
  }, [products]);

  const totals = useMemo(() => {
    let qty = 0;
    let amt = 0;
    for (const line of lines) {
      const q = num(line.quantity);
      const r = num(line.rate);
      qty += q;
      amt += q * r;
    }
    return { qty, amt };
  }, [lines]);

  const beginCreate = (brandId?: number) => {
    const initial = emptyPurchaseOrder();
    if (selectedEntityId !== 'all') initial.entity_id = selectedEntityId;
    if (brandId) initial.brand_id = brandId;
    else if (headerBrandOptions.length === 1) initial.brand_id = headerBrandOptions[0].id;
    const nextBrand = headerBrandOptions.find(brand => brand.id === initial.brand_id);
    setForm(initial);
    setCustomerStatementSummary(null);
    setLines([newLine()]);
    const profile = Boolean(nextBrand?.print_profile);
    setEntryView(profile ? 'order' : 'list');
    setBlocks(profile ? [emptyBlock(1)] : []);
    setLineEntryMode(isDigitalPoBrand(nextBrand) ? 'upload' : 'manual');
    setLineImportFile(null);
    setLineImportLoaded(false);
    setLineImportError('');
    setLineImportSkipped([]);
    setHandyFile(null);
    setFieldMessages({});
    setBrandPickerOpen(false);
    setMode('form');
  };

  const openCreate = () => {
    if (headerBrandOptions.length > 1) {
      setBrandPickerOpen(true);
      return;
    }
    beginCreate();
  };

  useEffect(() => {
    if (mode !== 'form' || !form.entity_id || !form.customer_id) {
      setCustomerStatementSummary(null);
      return;
    }
    let cancelled = false;
    void customersApi.statementSummary(form.customer_id, { entity_id: form.entity_id })
      .then(summary => { if (!cancelled) setCustomerStatementSummary(summary); })
      .catch(error => {
        if (cancelled) return;
        if ((error as { status?: number }).status === 404) {
          setCustomerStatementSummary(null);
        } else {
          notifyApiError(error, 'Could not load party statement.');
        }
      });
    return () => { cancelled = true; };
  }, [mode, form.entity_id, form.customer_id]);

  const openDetail = async (id: number) => {
    try {
      const row = await purchaseOrdersApi.retrieve(id);
      setDetail(row);
      setPdfCopy('');
      setPoDispatches(await dispatchesApi.list({ purchase_order_id: id }));
      setShowDispatchForm(false);
      setMode('detail');
    } catch (e) {
      notifyApiError(e);
    }
  };

  useEffect(() => {
    const raw = sessionStorage.getItem(OPEN_PO_KEY);
    if (!raw) return;
    sessionStorage.removeItem(OPEN_PO_KEY);
    const id = Number(raw);
    if (id) void openDetail(id);
  }, []);

  const openEdit = async (id: number) => {
    try {
      const row = await purchaseOrdersApi.retrieve(id);
      if (row.status !== 'Draft') {
        setDetail(row);
        setMode('detail');
        return;
      }
      setForm(row);
      setHandyFile(null);
      setEntryView(row.print_profile ? 'order' : 'list');
      setBlocks(row.print_profile ? blocksFromLines(storedLinesToOrderLines(row.lines)) : []);
      setLineEntryMode('manual');
      setLineImportFile(null);
      setLineImportLoaded(false);
      setLineImportError('');
      setLineImportSkipped([]);
      setLines(row.lines.length
        ? row.lines.map(l => ({
          key: String(l.id ?? `${l.product_id || l.product_description}`),
          category_id: undefined,
          product_id: l.product_id || undefined,
          product_description: l.product_description || '',
          manualEntry: !l.product_id,
          quantity: String(l.quantity),
          rate: rateIsUnset(l.rate) ? '' : String(l.rate),
          shade: l.shade || '',
          size: l.size || '',
          quantity_unit: l.quantity_unit === 'Meters' ? 'Meters' as const : 'Pieces' as const,
          delivery_from: l.delivery_from || '',
          delivery_to: l.delivery_to || '',
          line_remarks: l.line_remarks || '',
          form_row_no: l.form_row_no ?? null,
        }))
        : [newLine()]);
      setFieldMessages({});
      setMode('form');
    } catch (e) {
      notifyApiError(e);
    }
  };

  const buildPayload = () => {
    const orderLines = entryView === 'order' ? linesFromBlocks(blocks) : null;
    return {
      po_number: (form.po_number || '').trim(),
      brand_order_code: (form.brand_order_code || '').trim() || null,
      entity_id: form.entity_id,
      customer_id: form.customer_id,
      brand_id: form.brand_id,
      po_date: form.po_date,
      place: form.place || '',
      mode_of_despatch: form.mode_of_despatch || '',
      destination: form.destination || '',
      documents_through: form.documents_through || '',
      special_instructions: form.special_instructions || '',
      remarks: form.remarks || '',
      lines: orderLines
        ? orderLines.map(line => ({
          product_id: line.product_id,
          product_description: line.product_description,
          quantity: line.quantity,
          rate: line.rate,
          shade: line.shade,
          size: line.size,
          quantity_unit: line.quantity_unit,
          delivery_from: line.delivery_from,
          delivery_to: line.delivery_to,
          line_remarks: line.line_remarks,
          form_row_no: line.form_row_no,
        }))
        : lines
          .filter(l => l.product_id || l.product_description.trim())
          .map(l => ({
            product_id: l.manualEntry ? null : (l.product_id || null),
            product_description: l.manualEntry || l.shade ? l.product_description.trim() : '',
            quantity: num(l.quantity).toFixed(2),
            rate: l.rate.trim() === '' ? null : num(l.rate).toFixed(2),
            shade: l.shade || '',
            size: l.size || '',
            quantity_unit: l.quantity_unit || 'Pieces',
            delivery_from: l.delivery_from || null,
            delivery_to: l.delivery_to || null,
            line_remarks: l.line_remarks || '',
            form_row_no: l.form_row_no ?? null,
          })),
    };
  };

  const brandCategories = useMemo(() => {
    const map = new Map<number, SelectOption & { usage: number }>();
    for (const p of products) {
      if (!p.category_id) continue;
      const existing = map.get(p.category_id);
      if (existing) {
        existing.usage += p.usage_count ?? 0;
        continue;
      }
      map.set(p.category_id, {
        id: p.category_id,
        label: p.category_name,
        detail: p.parent_category_name || undefined,
        usage: p.usage_count ?? 0,
      });
    }
    return [...map.values()].sort(
      (a, b) => (a.detail ?? '').localeCompare(b.detail ?? '') || a.label.localeCompare(b.label),
    );
  }, [products]);

  const productOptionsByCategory = useMemo(() => {
    const map = new Map<number, SelectOption[]>();
    for (const p of products) {
      if (!p.category_id) continue;
      const list = map.get(p.category_id) ?? [];
      list.push({
        id: p.id,
        label: p.product_name,
        detail: [`Code: ${p.product_code}`, p.unit].filter(Boolean).join(' · '),
        usage: p.usage_count ?? 0,
      });
      map.set(p.category_id, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.label.localeCompare(b.label));
    return map;
  }, [products]);

  const validateForm = (): boolean => {
    const messages = collectRequired({
      po_number: form.po_number,
      entity_id: form.entity_id,
      brand_id: form.brand_id,
      customer_id: form.customer_id,
      po_date: form.po_date,
    });
    if (entryView === 'order') {
      Object.assign(messages, validateBlocks(blocks));
      setFieldMessages(messages);
      if (messages.po_number) requestAnimationFrame(() => numberRef.current?.focus());
      return Object.keys(messages).length === 0;
    }
    const filled = lines.filter(l => l.product_id || l.product_description.trim());
    if (lineImportError) messages.lines = 'Resolve the Excel upload errors before submitting.';
    if (!filled.length) messages.lines = 'Add at least one line item.';
    lines.forEach((l, i) => {
      const hasItem = !!(l.product_id || l.product_description.trim());
      if (!productCategory) {
        if (!hasItem && lines.length === 1) return;
        if (l.manualEntry) {
          if (!l.product_description.trim()) messages[`line_${i}_desc`] = REQUIRED_MSG;
        } else if (!l.product_id) {
          messages[`line_${i}_product`] = REQUIRED_MSG;
        }
        if (hasItem && !num(l.quantity)) messages[`line_${i}_qty`] = REQUIRED_MSG;
        return;
      }
      if (!hasItem && !l.category_id && lines.length === 1) return;
      if (l.manualEntry) {
        if (!l.product_description.trim()) messages[`line_${i}_desc`] = REQUIRED_MSG;
      } else {
        if (hasItem || l.category_id || lines.length === 1) {
          if (!l.category_id) messages[`line_${i}_category`] = REQUIRED_MSG;
          if (!l.product_id) messages[`line_${i}_product`] = REQUIRED_MSG;
        }
      }
      if ((hasItem || l.category_id) && !num(l.quantity)) messages[`line_${i}_qty`] = REQUIRED_MSG;
    });
    setFieldMessages(messages);
    if (Object.keys(messages).length) {
      if (messages.po_number) requestAnimationFrame(() => numberRef.current?.focus());
      return false;
    }
    return true;
  };

  const persist = async (submitAfter: boolean) => {
    if (!validateForm()) return;
    if (!acquireSaveLock(savingLock)) return;
    setSaving(true);
    try {
      const payload = buildPayload();
      const saved = form.id
        ? await purchaseOrdersApi.update(form.id, payload, handyFile)
        : await purchaseOrdersApi.create(payload, handyFile);
      notifySuccess(`Purchase Order '${saved.po_number}' ${form.id ? 'updated' : 'created'}.`);
      if (submitAfter) {
        const submitted = await purchaseOrdersApi.submit(saved.id);
        notifySuccess('Purchase Order submitted.');
        setDetail(submitted);
        setMode('detail');
      } else {
        setMode('list');
      }
      await load();
    } catch (err) {
      notifyApiError(err);
    } finally {
      setSaving(false);
      releaseSaveLock(savingLock);
    }
  };

  const applyStatus = async (row: PurchaseOrderRow, next: string) => {
    try {
      if (next === 'Submitted' && row.status === 'Draft') {
        const submitted = await purchaseOrdersApi.submit(row.id);
        notifySuccess('Purchase Order submitted.');
        setDetail(submitted);
      } else {
        const updated = await purchaseOrdersApi.changeStatus(row.id, next);
        notifySuccess(`Status updated to ${updated.status}.`);
        setDetail(updated);
      }
      setPendingStatus(null);
      await load();
    } catch (err) {
      notifyApiError(err);
    }
  };

  const openPdf = async (id: number, params?: { form?: boolean; copy?: string }) => {
    try {
      const blob = await purchaseOrdersApi.pdf(id, params);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
    } catch (err) {
      notifyApiError(err, 'Could not generate PDF.');
    }
  };

  const downloadPdf = async (id: number, params?: { form?: boolean; copy?: string }) => {
    try {
      const blob = await purchaseOrdersApi.pdf(id, params);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${detail?.po_number || id}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      notifyApiError(err, 'Could not generate PDF.');
    }
  };

  const downloadDispatchExcel = async (id: number) => {
    try {
      const blob = await purchaseOrdersApi.dispatchExcel(id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `dispatch-${detail?.po_number || id}.xlsx`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      notifyApiError(err, 'Could not generate dispatch Excel.');
    }
  };

  const openDispatchForm = () => {
    setDispatchForm({
      dispatch_date: dispatchToday(),
      lr_number: '',
      transporter: '',
      challan_reference: '',
    });
    setDispatchQtys({});
    setDispatchMessages({});
    setShowDispatchForm(true);
  };

  const persistDispatch = async () => {
    if (!detail) return;
    const pendingLines = detail.lines.filter(l => l.id && num(l.pending_quantity) > 0);
    const messages = collectRequired({
      dispatch_date: dispatchForm.dispatch_date,
      lr_number: dispatchForm.lr_number,
      transporter: dispatchForm.transporter,
      challan_reference: dispatchForm.challan_reference,
    });
    const filled = pendingLines.filter(l => num(dispatchQtys[l.id as number]) > 0);
    if (!filled.length) messages.lines = 'Enter a dispatch quantity for at least one pending line.';
    filled.forEach(l => {
      const qty = num(dispatchQtys[l.id as number]);
      const pending = num(l.pending_quantity);
      if (qty > pending) messages[`qty_${l.id}`] = `Cannot exceed pending ${pending.toFixed(2)}.`;
    });
    setDispatchMessages(messages);
    if (Object.keys(messages).length) return;
    if (!acquireSaveLock(dispatchLock)) return;
    setSaving(true);
    try {
      const saved = await dispatchesApi.create({
        purchase_order_id: detail.id,
        dispatch_date: dispatchForm.dispatch_date,
        lr_number: dispatchForm.lr_number.trim(),
        transporter: dispatchForm.transporter.trim(),
        challan_reference: dispatchForm.challan_reference.trim(),
        lines: filled.map(l => ({
          purchase_order_line_id: l.id,
          dispatched_quantity: num(dispatchQtys[l.id as number]).toFixed(2),
        })),
      });
      notifySuccess(`Dispatch recorded. PO status: ${saved.purchase_order_status}.`);
      setShowDispatchForm(false);
      await openDetail(detail.id);
      await load();
    } catch (err) {
      notifyApiError(err);
    } finally {
      setSaving(false);
      releaseSaveLock(dispatchLock);
    }
  };

  const setLineRate = async (line: PurchaseOrderLineRow) => {
    if (!detail?.id || !line.id) return;
    setPendingRateLine(line);
  };

  const saveLineRate = async (value: string) => {
    if (!detail?.id || !pendingRateLine?.id) return;
    try {
      const updated = await purchaseOrdersApi.setRate(detail.id, pendingRateLine.id, value);
      setDetail(updated);
      notifySuccess('Rate set.');
      setPendingRateLine(null);
    } catch (e) {
      notifyApiError(e, 'Could not set rate.');
    }
  };

  const setLineCategory = (key: string, categoryId: number | undefined, index: number) => {
    setLines(prev => prev.map(l => l.key === key
      ? {
        ...l,
        category_id: categoryId,
        product_id: undefined,
        product_description: '',
        rate: '',
      }
      : l));
    setFieldMessages(prev => clearFieldMessage(
      clearFieldMessage(prev, `line_${index}_category`),
      `line_${index}_product`,
    ));
  };

  const setLineProduct = async (key: string, productId: number, index: number, picked?: { id: number; product_code: string; product_name: string; rate: string | number; category_id?: number | null }) => {
    const product = picked ?? products.find(p => p.id === productId);
    let rate = product ? String(product.rate) : '';
    try {
      if (product) {
        const current = await priceListsApi.currentPrice(product.id, form.po_date || undefined);
        rate = String(current.price);
      }
    } catch {
      // Product rate remains the fallback when the optional price lookup is unavailable.
    }
    setLines(prev => prev.map(l => l.key === key
      ? {
        ...l,
        product_id: productId,
        product_code: product?.product_code,
        product_name: product?.product_name,
        category_id: product ? (product.category_id ?? undefined) : l.category_id,
        product_description: '',
        rate: product ? rate : l.rate,
      }
      : l));
    setFieldMessages(prev => clearFieldMessage(prev, `line_${index}_product`));
  };

  const importLineFile = async (file: File) => {
    setLineImportFile(file);
    setLineImportLoaded(false);
    setLineImportBusy(true);
    setLineImportError('');
    setLineImportSkipped([]);
    try {
      const result = await parsePurchaseOrderLines(file, products);
      if (result.rows.length) {
        setLines(result.rows.map(row => ({
          key: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          category_id: row.product.category_id,
          product_id: row.product.id,
          product_description: '',
          manualEntry: false,
          quantity: row.quantity,
          rate: row.rate,
        })));
      }
      setLineImportLoaded(result.rows.length > 0);
      setLineImportSkipped(result.skipped);
      if (result.skipped.length) {
        setLineImportError('Some rows were not loaded. Correct the file and replace it, or remove the upload before submitting.');
      }
    } catch (error) {
      setLineImportError(error instanceof Error ? error.message : 'The upload could not be read.');
      setLineImportSkipped([]);
    } finally {
      setLineImportBusy(false);
    }
  };

  const handleLineImport = async (file: File | null) => {
    if (!file) {
      setLineImportFile(null);
      setLineImportLoaded(false);
      setLines([newLine()]);
      setLineImportError('');
      setLineImportSkipped([]);
      return;
    }
    const existingLines = lines.some(line => line.product_id || line.product_description.trim());
    if (existingLines) {
      setPendingLineImportFile(file);
      setLineImportConfirmation('upload');
      return;
    }
    await importLineFile(file);
  };

  const removeLineImport = () => {
    setLineImportFile(null);
    setLineImportLoaded(false);
    setLines([newLine()]);
    setLineImportError('');
    setLineImportSkipped([]);
  };

  const replaceLineImport = () => {
    setLineImportConfirmation('replace');
  };

  const downloadLineTemplate = () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([['Product', 'Qty', 'Rate'], ['SKU-1', 1, 0]]),
      'Lines',
    );
    const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
    const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'purchase-order-line-items-template.xlsx';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const columns: Column<PurchaseOrderRow>[] = [
    { header: 'PO Number', accessorKey: 'po_number', sortable: true, mono: true, width: '140px', render: r => <span className="font-mono text-[var(--erp-gold)]">{r.po_number}</span> },
    {
      header: 'Type',
      width: '100px',
      render: r => (
        <StatusChip
          status={normalizedOrderType(r.order_type) === 'Manual' ? 'notice' : 'active'}
          label={normalizedOrderType(r.order_type).toUpperCase()}
        />
      ),
    },
    { header: 'Branch', render: r => <span className="font-mono text-xs">{r.entity_code} · {r.entity_name}</span> },
    { header: 'Party', render: r => <span>{r.customer_name}</span> },
    { header: 'Brand', render: r => <span>{r.brand_name}</span> },
    { header: 'PO Date', accessorKey: 'po_date', sortable: true, mono: true, width: '110px' },
    { header: 'Total', align: 'right', mono: true, width: '110px', render: r => money(r.total_amount) },
    {
      header: 'Status',
      accessorKey: 'status',
      sortable: true,
      width: '160px',
      render: r => <StatusChip status={poChipStatus(r.status)} label={r.status.toUpperCase()} />,
    },
    {
      header: '',
      align: 'right',
      width: '88px',
      render: r => (
        <div className="flex justify-end gap-1">
          <button type="button" className="p-1 text-[var(--erp-muted)] hover:text-[var(--erp-gold)] cursor-pointer" title="View" onClick={() => void openDetail(r.id)}><Eye className="w-3.5 h-3.5" /></button>
          {canDelete && ['Draft', 'Cancelled'].includes(r.status) && (
            <button type="button" className="p-1 text-[var(--erp-muted)] hover:text-[var(--erp-negative)] cursor-pointer" title={`Delete ${r.status.toLowerCase()} purchase order`} onClick={() => setPendingDelete(r)}><Trash2 className="w-3.5 h-3.5" /></button>
          )}
        </div>
      ),
    },
  ];

  const formParties = customers.filter(c => c.status === 'Active' || c.id === form.customer_id);
  const statusActions = detail?.allowed_transitions || [];
  const formParty = formParties.find(row => row.id === form.customer_id);

  useEffect(() => {
    if (mode !== 'form' || !form.customer_id || form.place) return;
    const party = customers.find(row => row.id === form.customer_id);
    if (!party?.city) return;
    setForm(prev => (prev.place ? prev : { ...prev, place: party.city }));
  }, [mode, form.customer_id, form.place, customers]);

  return (
    <div className="min-h-full p-3 flex flex-col gap-3 text-left">
      <PeriodScope />
      <PageHeader
        moduleNumber="40"
        section="Orders"
        title="Purchase Orders"
        compact
        actions={
          canDraftWrite ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setImportOpen(true)}
                className="h-8 px-2.5 border border-[var(--erp-gold)] text-[var(--erp-gold)] font-body text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" /> Import from file
              </button>
              <button
                type="button"
                onClick={openCreate}
                disabled={!manualCreateAvailable}
                title={!manualCreateAvailable ? 'Manual PO creation is unavailable because this branch has no active Manual/POR brand.' : undefined}
                aria-disabled={!manualCreateAvailable}
                className="h-8 px-2.5 bg-[var(--erp-gold)] text-[#0F141B] font-body text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Plus className="w-3.5 h-3.5" /> Create PO
              </button>
            </div>
          ) : undefined
        }
      />
      {error && <MasterError message={error} onRetry={load} />}
      {importReport && importReport.excluded.length > 0 && mode === 'list' && (
        <ImportExcludedReport excluded={importReport.excluded} onDismiss={() => setImportReport(null)} />
      )}
      <div className="grid min-w-0 items-center gap-2 rounded-lg border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] p-2 sm:flex sm:flex-wrap xl:grid xl:grid-cols-[minmax(220px,2fr)_auto_auto_minmax(150px,1.35fr)_minmax(120px,1fr)_minmax(120px,1fr)_auto] xl:flex-nowrap">
        <div className="relative min-w-0 sm:flex-1 sm:basis-[240px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-[var(--erp-muted)]" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search PO number…" className="box-border h-9 w-full min-w-0 pl-9 pr-3 text-xs bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)] focus:border-[var(--erp-gold)] focus:outline-none font-mono" />
        </div>
        <div className="flex h-9 shrink-0 items-stretch border border-[var(--erp-hairline)] font-mono text-xs">
            {([
              ['table', Table2, 'Table'],
              ['graphical', LayoutDashboard, 'Analytics'],
            ] as const).map(([value, Icon, label]) => (
              <button key={value} type="button" onClick={() => setPurchaseOrderView(value)} className={`box-border min-w-[92px] whitespace-nowrap px-3 flex items-center justify-center gap-1.5 ${viewMode === value ? 'bg-[var(--erp-gold)] text-[#0F141B]' : 'text-[var(--erp-muted)] hover:text-[var(--erp-text)]'}`}><Icon className="w-3.5 h-3.5" /> {label}</button>
            ))}
        </div>
        <div className="flex h-9 shrink-0 items-center gap-1 border border-[var(--erp-hairline)] p-0.5 font-mono text-xs" aria-label="Purchase order type">
            {[
              ['', `All ${(typeCounts.Digital || 0) + (typeCounts.Manual || 0)}`],
              ['Digital', `Digital ${typeCounts.Digital || 0}`],
              ['Manual', `Manual ${typeCounts.Manual || 0}`],
            ].map(([value, label]) => (
              <button
                key={value || 'all'}
                type="button"
                onClick={() => setPurchaseOrderType(value)}
                aria-pressed={orderTypeFilter === value}
                className={`box-border h-7 whitespace-nowrap px-2 ${orderTypeFilter === value ? 'bg-[var(--erp-gold)] text-[#0F141B]' : 'text-[var(--erp-muted)] hover:text-[var(--erp-text)]'}`}
              >
                {label}
              </button>
            ))}
        </div>
          <CustomerPicker
            compact
            allowAll
            customers={listCustomers}
            value={customerFilter}
            onChange={setCustomerFilter}
            allLabel="All parties"
            placeholder="All parties"
            className="w-full sm:flex-1 sm:basis-[180px] xl:min-w-0"
          />
          {headerBrandOptions.length === 1 ? (
            <div
              className="flex h-9 min-w-[140px] max-w-full items-center border border-[var(--erp-hairline)] bg-[var(--erp-surface-2)] px-2 text-xs text-[var(--erp-text)]"
              aria-label={`Brand filter: ${headerBrandOptions[0].brand_code} · ${headerBrandOptions[0].brand_name}`}
            >
              {headerBrandOptions[0].brand_code} · {headerBrandOptions[0].brand_name}
            </div>
          ) : (
            <select value={brandFilter} onChange={e => setBrandFilter(e.target.value ? Number(e.target.value) : '')} className="box-border h-9 min-w-[140px] max-w-full bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] px-2 text-[var(--erp-text)]">
              <option value="">All brands</option>
              {headerBrandOptions.map(b => <option key={b.id} value={b.id}>{b.brand_code} · {b.brand_name}</option>)}
            </select>
          )}
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="box-border h-9 min-w-[140px] max-w-full bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] px-2 text-[var(--erp-text)]">
            <option value="">All statuses</option>
            {PO_STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
          <button type="button" onClick={() => setUnpricedOnly(value => !value)} aria-pressed={unpricedOnly} className={`box-border h-9 shrink-0 whitespace-nowrap border border-[var(--erp-hairline)] px-3 ${unpricedOnly ? 'bg-[var(--erp-gold)] text-[#0F141B]' : 'text-[var(--erp-muted)]'}`}>Unpriced</button>
      </div>

      {loading ? (
        <MasterLoading label="Loading purchase orders…" />
      ) : filtered.length === 0 ? (
        <div className="border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] py-14 text-center text-xs text-[var(--erp-muted)]">No purchase orders match the active filters.</div>
      ) : viewMode === 'graphical' ? (
        <GraphicalView rows={filtered} onStatus={setStatusFilter} onOpen={id => void openDetail(id)} />
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          keyExtractor={r => r.id}
          {...emptyTableProps(
            rows.length,
            filtered.length,
            'No purchase orders yet.',
            'No purchase orders match this filter.',
            canDraftWrite ? 'Create first PO' : '',
            canDraftWrite ? openCreate : () => undefined,
          )}
          density="compact"
        />
      )}

      {brandPickerOpen && (
        <BrandSelectModal
          branchLabel={headerBranch ? `${headerBranch.short_code} · ${headerBranch.entity_name}` : 'All branches'}
          brands={headerBrandOptions}
          onCancel={() => setBrandPickerOpen(false)}
          onContinue={beginCreate}
        />
      )}

      {mode === 'form' && (form.id ? canEdit : canDraftWrite) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <button
            type="button"
            aria-label="Close form"
            className="absolute inset-0 bg-black/70 cursor-default"
            onClick={() => setMode('list')}
          />
          <form
            noValidate
            onSubmit={e => { e.preventDefault(); void persist(false); }}
            className={`relative flex w-full max-h-[92vh] flex-col overflow-hidden bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] shadow-[0_24px_64px_rgba(15,20,27,0.28)] ${entryView === 'order' ? 'max-w-[1120px] rounded-lg' : 'max-w-5xl'}`}
          >
            <div
              aria-hidden
              className="h-px shrink-0 bg-[var(--erp-gold)]"
            />

            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--erp-hairline)] bg-[var(--erp-surface)] px-5 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--erp-gold)]/40 bg-[var(--erp-gold)]/10">
                  <FileText className="w-4 h-4 text-[var(--erp-gold)]" />
                </span>
                <div className="min-w-0">
                  <h3 className="font-display text-lg font-semibold leading-tight text-[var(--erp-text)]">
                    {form.id ? 'Edit Purchase Order' : 'Create Purchase Order'}
                  </h3>
                  <p className="truncate text-xs text-[var(--erp-muted)]">
                    {entryView === 'order'
                      ? 'Enter order details and product assortments.'
                      : (form.id ? 'Draft edit' : 'New document')}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMode('list')}
                aria-label="Close"
                className="h-8 w-8 inline-flex shrink-0 items-center justify-center rounded-md border border-[var(--erp-hairline)] text-[var(--erp-muted)] hover:text-[var(--erp-text)] hover:border-[var(--erp-gold)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className={`@container min-h-0 flex-1 overflow-y-auto px-5 py-4 ${entryView === 'order' ? 'space-y-4' : 'space-y-7'}`}>
              <RequiredLegend />

              <section
                className={entryView === 'order'
                  ? 'rounded-lg border border-[var(--erp-hairline)] bg-[var(--erp-surface)] p-3'
                  : 'rounded-none border border-[var(--erp-hairline)] bg-[var(--erp-surface-2)]/40 p-4 sm:p-5'}
              >
                <h4 className={entryView === 'order' ? 'mb-2 text-xs font-medium text-[var(--erp-text)]' : sectionTitle}>
                  {entryView === 'order' ? null : <span className="h-1.5 w-1.5 rounded-full bg-[var(--erp-gold)]" />}
                  {entryView === 'order' ? 'Document' : 'Header'}
                </h4>
                <div className={entryView === 'order' ? 'grid grid-cols-1 gap-2.5 @md:grid-cols-2 @4xl:grid-cols-4' : 'grid grid-cols-1 sm:grid-cols-2 gap-4'}>
                  <TextInput
                    ref={numberRef}
                    label="PO number"
                    mono
                    required
                    className={entryView === 'order' ? '!h-9 !rounded-md !py-0' : ''}
                    error={fieldMessages.po_number}
                    value={form.po_number || ''}
                    onChange={e => {
                      setForm({ ...form, po_number: e.target.value });
                      setFieldMessages(prev => clearFieldMessage(prev, 'po_number'));
                    }}
                  />
                  <TextInput
                    label="Brand order code"
                    mono
                    className={entryView === 'order' ? '!h-9 !rounded-md !py-0' : ''}
                    value={form.brand_order_code || ''}
                    onChange={e => setForm({ ...form, brand_order_code: e.target.value })}
                  />
                  <TextInput
                    label="PO date"
                    type="date"
                    required
                    className={entryView === 'order' ? '!h-9 !rounded-md !py-0' : ''}
                    error={fieldMessages.po_date}
                    value={form.po_date || ''}
                    onChange={e => {
                      setForm({ ...form, po_date: e.target.value });
                      setFieldMessages(prev => clearFieldMessage(prev, 'po_date'));
                    }}
                  />
                  <FormField label="Brand" required error={fieldMessages.brand_id}>
                    {selectedBrand ? (
                      <div className={`border border-[var(--erp-gold)]/45 bg-[var(--erp-gold)]/10 text-sm text-[var(--erp-text)] ${entryView === 'order' ? 'flex h-9 items-center gap-2 rounded-md px-2.5' : 'px-3 py-2.5'}`} aria-label={`Selected brand ${selectedBrand.brand_name}`}>
                        <div className="min-w-0 flex-1 truncate">
                          <span className="font-mono text-[var(--erp-gold)]">{selectedBrand.brand_code}</span>
                          <span className="mx-2 text-[var(--erp-muted)]">·</span>
                          {selectedBrand.brand_name}
                        </div>
                        <p className={`inline-flex items-center gap-1.5 border border-[var(--erp-gold)]/35 bg-[var(--erp-gold)]/10 text-[10px] font-mono uppercase tracking-wider text-[var(--erp-gold)] ${entryView === 'order' ? 'shrink-0 px-1.5 py-0.5' : 'mt-2 px-2 py-1'}`}>
                          <span className="h-1.5 w-1.5 rounded-full bg-[var(--erp-gold)]" />
                          {entryView === 'order' ? (isManual ? 'Manual' : 'Digital') : `Order type · ${isManual ? 'Manual / POR' : 'Digital PO'}`}
                        </p>
                      </div>
                    ) : (
                      <div className="px-3 py-2.5 border border-[var(--erp-negative)]/60 text-xs text-[var(--erp-negative)]">
                        <p>No active brands are mapped to this branch.</p>
                        <button type="button" onClick={() => { setMode('list'); navigateTo(36); }} className="mt-2 underline text-[var(--erp-gold)]">
                          Configure Allowed Brands in Branch Master
                        </button>
                      </div>
                    )}
                  </FormField>
                  <FormField label="Party" required error={fieldMessages.customer_id} className={entryView === 'order' ? '@md:col-span-2' : 'sm:col-span-2'}>
                    <CustomerPicker
                      customers={formParties}
                      value={form.customer_id || ''}
                      disabled={!form.entity_id}
                      error={!!fieldMessages.customer_id}
                      placeholder={form.entity_id ? 'Search party…' : 'Select a party…'}
                      onChange={id => {
                        setForm({ ...form, customer_id: id || undefined });
                        setCustomerStatementSummary(null);
                        setFieldMessages(prev => clearFieldMessage(prev, 'customer_id'));
                      }}
                    />
                    {customerStatementSummary ? (
                      <span className="mt-1 inline-flex w-fit items-center border border-[var(--erp-hairline)] bg-[var(--erp-surface-2)] px-2 py-1 text-[11px] font-mono text-[var(--erp-muted)]">
                        Outstanding: {money(customerStatementSummary.closing_amount)} {customerStatementSummary.closing_dc} as of {new Date(`${customerStatementSummary.period_to}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </span>
                    ) : null}
                  </FormField>
                </div>
              </section>

              <section
                className={entryView === 'order' ? '' : 'rounded-none border border-[var(--erp-hairline)] bg-[var(--erp-surface-2)]/40 p-4 sm:p-5'}
              >
                {entryView === 'order' ? null : (
                  <h4 className={sectionTitle}>
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--erp-gold)]" />
                    Line items
                  </h4>
                )}
                {entryView === 'order' ? (
                  <OrderFormView
                    blocks={blocks}
                    brandId={form.brand_id || undefined}
                    partyCode={formParty?.customer_code || ''}
                    indent={form.po_number || ''}
                    date={form.po_date || ''}
                    place={form.place || ''}
                    footer={{
                      mode: form.mode_of_despatch || '',
                      destination: form.destination || '',
                      documents: form.documents_through || '',
                      instructions: form.special_instructions || '',
                    }}
                    messages={fieldMessages}
                    onChange={setBlocks}
                    onPlace={value => setForm(prev => ({ ...prev, place: value }))}
                    onFooter={footer => setForm(prev => ({
                      ...prev,
                      mode_of_despatch: footer.mode,
                      destination: footer.destination,
                      documents_through: footer.documents,
                      special_instructions: footer.instructions,
                    }))}
                  />
                ) : isDigitalPo ? (
                  <div className="mb-4 space-y-3">
                    <PurchaseOrderLineImportToggle
                      isDigitalPo={isDigitalPo}
                      mode={lineEntryMode}
                      onModeChange={setLineEntryMode}
                    />
                    {lineEntryMode === 'upload' ? (
                      <div className="space-y-3">
                        {lineImportLoaded && lineImportFile ? (
                          <div className="flex flex-wrap items-center gap-3 px-3 py-3 border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)]">
                            <FileText className="w-5 h-5 text-[var(--erp-gold)] shrink-0" />
                            <span className="min-w-0 flex-1 text-sm font-medium truncate">
                              {lineImportFile.name} · {lines.length} row{lines.length === 1 ? '' : 's'}
                            </span>
                            <button
                              type="button"
                              onClick={replaceLineImport}
                              className="text-xs font-mono text-[var(--erp-gold)] hover:underline"
                            >
                              Replace file
                            </button>
                            <button
                              type="button"
                              onClick={removeLineImport}
                              className="text-xs font-mono text-[var(--erp-muted)] hover:text-[var(--erp-negative)] hover:underline"
                            >
                              Remove
                            </button>
                          </div>
                        ) : (
                          <FileDropZone
                            id="po-line-items-file"
                            label="Line items file"
                            helper={`Excel only (.xlsx, .xls) · max 2 MB · max ${MAX_LINE_IMPORT_ROWS} rows`}
                            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                            file={lineImportFile}
                            disabled={lineImportBusy}
                            onFileRejected={message => setLineImportError(message)}
                            rejectionMessage="Only Excel files (.xlsx, .xls) are allowed."
                            onChange={file => { void handleLineImport(file); }}
                          />
                        )}
                        <button
                          type="button"
                          onClick={downloadLineTemplate}
                          className="text-xs font-mono text-[var(--erp-gold)] hover:underline"
                        >
                          Download template
                        </button>
                        {lineImportBusy ? <p role="status" className="text-xs text-[var(--erp-muted)]">Parsing file…</p> : null}
                        {lineImportError ? (
                          <div role="alert" className="border border-[var(--erp-negative)]/40 bg-[var(--erp-negative)]/10 p-3 text-sm text-[var(--erp-negative)]">
                            <p>{lineImportError}</p>
                            {lineImportSkipped.length ? (
                              <ul className="mt-2 space-y-1 text-xs">
                                {lineImportSkipped.map(item => <li key={item.rowNumber}>Row {item.rowNumber}: {item.reason}</li>)}
                              </ul>
                            ) : null}
                          </div>
                        ) : null}
                        {!lineImportError && lineImportFile ? (
                          <p className="text-xs text-[var(--erp-muted)]">
                            Rows loaded into the grid. Switch to Enter manually to edit them. Amounts are calculated as Qty × Rate.
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {entryView !== 'order' && shouldShowLineItemsGrid(lineEntryMode, lineImportLoaded) ? (
                  <PurchaseOrderLineItems
                    lines={lines}
                    setLines={setLines}
                    onAddLine={() => setLines(prev => [...prev, newLine()])}
                    onCategoryChange={setLineCategory}
                    onProductChange={setLineProduct}
                    categories={brandCategories}
                    productOptionsByCategory={productOptionsByCategory}
                    products={products}
                    brandSelected={!!form.brand_id}
                    brandId={form.brand_id || undefined}
                    brandCode={selectedBrand?.brand_code}
                    entityId={form.entity_id || undefined}
                    productCategory={productCategory}
                    brandName={selectedBrand?.brand_name}
                    isManual={isManual}
                    readOnly={lineItemsAreReadOnly(lineEntryMode, lineImportLoaded)}
                    fieldMessages={fieldMessages}
                    totals={totals}
                  />
                ) : null}
              </section>

              <section
                className={entryView === 'order'
                  ? ''
                  : 'rounded-none border border-[var(--erp-hairline)] bg-[var(--erp-surface-2)]/40 p-4 sm:p-5'}
              >
                <h4 className={entryView === 'order' ? 'mb-2 text-xs font-medium text-[var(--erp-text)]' : sectionTitle}>
                  {entryView === 'order' ? null : <span className="h-1.5 w-1.5 rounded-full bg-[var(--erp-gold)]" />}
                  Remarks
                </h4>
                <textarea
                  value={form.remarks || ''}
                  onChange={e => setForm({ ...form, remarks: e.target.value })}
                  rows={entryView === 'order' ? 2 : 3}
                  placeholder="Optional notes for this purchase order…"
                  className="w-full px-3 py-2.5 text-sm bg-[var(--erp-surface-2)] border border-[var(--erp-hairline-strong)] text-[var(--erp-text)] focus:outline-none focus:border-[var(--erp-gold)] focus:shadow-[0_0_0_3px_rgba(201,162,39,0.12)] transition-[border-color,box-shadow] duration-200 rounded-none placeholder:text-[var(--erp-faint)]"
                />
              </section>
            </div>

            <div className="flex shrink-0 justify-end gap-2 border-t border-[var(--erp-hairline)] bg-[var(--erp-surface)] px-5 py-3">
              <button
                type="button"
                onClick={() => setMode('list')}
                className="h-9 px-3.5 border border-[var(--erp-hairline)] rounded-md text-xs text-[var(--erp-muted)] hover:text-[var(--erp-text)] hover:border-[var(--erp-hairline-strong)]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="h-9 px-3.5 border border-[var(--erp-gold)] rounded-md text-[var(--erp-gold)] text-xs font-medium hover:bg-[var(--erp-gold)]/10 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save as Draft'}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void persist(true)}
                className="h-9 px-4 bg-[var(--erp-gold)] rounded-md text-[#1B2430] text-xs font-semibold hover:bg-[var(--erp-gold-soft)] disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Submit'}
              </button>
            </div>
          </form>
        </div>
      )}

      {mode === 'detail' && detail && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-4xl max-h-[92vh] overflow-y-auto bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] p-6 space-y-5">
            <div className="flex justify-between items-start border-b border-[var(--erp-hairline)] pb-3">
              <div>
                <h3 className="font-display text-lg font-bold">{detail.po_number}</h3>
                <p className="text-xs font-mono text-[var(--erp-muted)] mt-1">{detail.po_date} · {detail.entity_code} · {detail.customer_name} · {detail.brand_name}</p>
              </div>
              <div className="flex items-center gap-2">
                <StatusChip
                  status={normalizedOrderType(detail.order_type) === 'Manual' ? 'notice' : 'active'}
                  label={normalizedOrderType(detail.order_type).toUpperCase()}
                />
                <StatusChip status={poChipStatus(detail.status)} label={detail.status.toUpperCase()} />
                <button type="button" onClick={() => setMode('list')}><X className="w-4 h-4" /></button>
              </div>
            </div>
            <div className="overflow-x-auto border border-[var(--erp-hairline)]">
              <table className="w-full text-left text-xs">
                <thead className="bg-[var(--erp-surface-2)] font-mono text-[10px] uppercase tracking-wider text-[var(--erp-muted)]">
                  <tr>
                    <th className="px-3 py-2">Code</th>
                    <th className="px-3 py-2">Product</th>
                    <th className="px-3 py-2">Qty</th>
                    <th className="px-3 py-2">Unit</th>
                    <th className="px-3 py-2 text-right">Rate</th>
                    <th className="px-3 py-2 text-right">Line total</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.lines.map(line => (
                    <tr key={line.id} className="border-t border-[var(--erp-hairline)]">
                      <td className="px-3 py-2 font-mono text-[var(--erp-gold)]">{line.product_code || '—'}</td>
                      <td className="px-3 py-2">{line.product_name || line.product_description}</td>
                      <td className="px-3 py-2 font-mono">{num(line.quantity).toFixed(2)}</td>
                      <td className="px-3 py-2">{line.unit}</td>
                      <td className="px-3 py-2 text-right font-mono">
                        {rateIsUnset(line.rate) ? (
                          <div className="flex flex-col items-end gap-1">
                            <span>—</span>
                            {canStatusOverride && !['Closed', 'Rejected', 'Cancelled'].includes(detail.status) ? (
                              <button type="button" onClick={() => void setLineRate(line)} className="text-[10px] text-[var(--erp-gold)] hover:underline">Set rate</button>
                            ) : <RateNotSetBadge />}
                          </div>
                        ) : money(line.rate)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">{money(line.line_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-8 font-mono text-sm">
              <div>Qty {num(detail.total_quantity).toFixed(2)}</div>
              <div className="text-[var(--erp-gold)]">
                {detail.priced_lines ? money(detail.total_amount) : '—'}
                {detail.unpriced_lines ? <span className="ml-2 text-xs text-[var(--erp-muted)]">({detail.unpriced_lines} unpriced)</span> : null}
              </div>
            </div>
            {detail.remarks ? <p className="text-sm text-[var(--erp-muted)]"><span className="font-mono text-[10px] uppercase">Remarks</span><br />{detail.remarks}</p> : null}
            {normalizedOrderType(detail.order_type) === 'Manual' && detail.handy_form_url ? (
              <div className="border border-[var(--erp-hairline)] p-3">
                <p className="font-mono text-[10px] uppercase text-[var(--erp-muted)] mb-2">Handy form</p>
                {/\.(png|jpe?g|webp|gif)(\?|$)/i.test(detail.handy_form_url) ? (
                  <a href={detail.handy_form_url} target="_blank" rel="noreferrer">
                    <img src={detail.handy_form_url} alt="Handy form" className="max-h-40 border border-[var(--erp-hairline)]" />
                  </a>
                ) : (
                  <a href={detail.handy_form_url} target="_blank" rel="noreferrer" className="text-xs font-mono text-[var(--erp-gold)]">View uploaded handy form</a>
                )}
              </div>
            ) : null}
            <section>
              <div className="flex items-center justify-between border-b border-[var(--erp-hairline)] pb-1 mb-3">
                <h4 className="text-[11px] font-mono uppercase tracking-wider text-[var(--erp-gold)]">Dispatches</h4>
                {canDraftWrite && canRecordDispatch(detail.status, detail.lines.reduce((sum, l) => sum + num(l.pending_quantity), 0)) && (
                  <button type="button" onClick={openDispatchForm} className="px-3 py-1 text-[11px] font-mono border border-[var(--erp-gold)] text-[var(--erp-gold)]">Record Dispatch</button>
                )}
              </div>
              <div className="overflow-x-auto border border-[var(--erp-hairline)] mb-3">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[var(--erp-surface-2)] font-mono text-[10px] uppercase tracking-wider text-[var(--erp-muted)]">
                    <tr>
                      <th className="px-3 py-2">Product</th>
                      <th className="px-3 py-2 text-right">Ordered</th>
                      <th className="px-3 py-2 text-right">Dispatched</th>
                      <th className="px-3 py-2 text-right">Pending</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.lines.map(line => (
                      <tr key={line.id} className="border-t border-[var(--erp-hairline)]">
                        <td className="px-3 py-2">{line.product_code ? `${line.product_code} · ${line.product_name}` : line.product_name}</td>
                        <td className="px-3 py-2 text-right font-mono">{num(line.quantity).toFixed(2)}</td>
                        <td className="px-3 py-2 text-right font-mono">{num(line.total_dispatched).toFixed(2)}</td>
                        <td className="px-3 py-2 text-right font-mono text-[var(--erp-gold)]">{num(line.pending_quantity).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {poDispatches.length ? (
                <div className="overflow-x-auto border border-[var(--erp-hairline)]">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[var(--erp-surface-2)] font-mono text-[10px] uppercase tracking-wider text-[var(--erp-muted)]">
                      <tr>
                        <th className="px-3 py-2">Date</th>
                        <th className="px-3 py-2">LR Number</th>
                        <th className="px-3 py-2">Transporter</th>
                        <th className="px-3 py-2">Challan Ref</th>
                        <th className="px-3 py-2">Lines</th>
                        <th className="px-3 py-2 w-10" />
                      </tr>
                    </thead>
                    <tbody>
                      {poDispatches.map(row => (
                        <tr key={row.id} className="border-t border-[var(--erp-hairline)]">
                          <td className="px-3 py-2 font-mono">{row.dispatch_date}</td>
                          <td className="px-3 py-2 font-mono text-[var(--erp-gold)]">{row.lr_number}</td>
                          <td className="px-3 py-2">{row.transporter}</td>
                          <td className="px-3 py-2 font-mono">{row.challan_reference}</td>
                          <td className="px-3 py-2 font-mono">{row.lines.map(l => `${l.product_name} ${num(l.dispatched_quantity).toFixed(2)}`).join(', ')}</td>
                          <td className="px-3 py-2">
                            {canDelete && (
                              <button type="button" className="text-[var(--erp-muted)] hover:text-[var(--erp-negative)]" title="Delete dispatch" onClick={() => setPendingDeleteDispatch(row)}><Trash2 className="w-3.5 h-3.5" /></button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs font-mono text-[var(--erp-muted)]">No dispatches recorded yet.</p>
              )}
            </section>
            <section>
              <h4 className={sectionTitle}>Invoices on this PO</h4>
              <PoInvoicesList purchaseOrderId={detail.id} />
            </section>
            <div className="flex flex-wrap justify-between gap-3 pt-3 border-t border-[var(--erp-hairline)]">
              <div className="flex flex-wrap gap-2">
                {detail.status === 'Draft' && canEdit && (
                  <button type="button" onClick={() => void openEdit(detail.id)} className="px-4 py-2 border border-[var(--erp-hairline)] text-xs font-mono">Edit</button>
                )}
                {detail.status === 'Draft' && canDraftWrite && (
                  <button type="button" onClick={() => void applyStatus(detail, 'Submitted')} className="px-4 py-2 bg-[var(--erp-gold)] text-[#0F141B] text-xs font-semibold">Submit</button>
                )}
                {['Draft', 'Cancelled'].includes(detail.status) && canDelete && (
                  <button type="button" onClick={() => setPendingDelete(detail)} className="px-4 py-2 border border-[var(--erp-negative)]/40 text-[var(--erp-negative)] text-xs font-mono">{detail.status === 'Cancelled' ? 'Delete cancelled' : 'Delete draft'}</button>
                )}
                {canStatusOverride && statusActions.filter(s => s !== 'Submitted').map(next => (
                  <button
                    key={next}
                    type="button"
                    onClick={() => setPendingStatus({ row: detail, next })}
                    className={`px-4 py-2 text-xs font-mono border ${next === 'Rejected' || next === 'Cancelled' ? 'border-[var(--erp-negative)]/40 text-[var(--erp-negative)]' : 'border-[var(--erp-hairline)] text-[var(--erp-text)]'}`}
                  >
                    {ADMIN_STATUS_LABELS[next] || next}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                {canDraftWrite && detail.lines.some(l => num(l.invoiceable_quantity) > 0) && (
                  <button
                    type="button"
                    onClick={() => {
                      sessionStorage.setItem(INVOICE_FROM_PO_KEY, String(detail.id));
                      navigateTo(42);
                    }}
                    className="px-4 py-2 border border-[var(--erp-gold)] text-[var(--erp-gold)] text-xs font-semibold"
                  >
                    Create Invoice
                  </button>
                )}
                {detail.print_copies && detail.print_copies.length > 0 ? (
                  <>
                    <label className="text-[11px] font-mono text-[var(--erp-muted)]">
                      Copy
                      <select
                        aria-label="PDF copy"
                        value={pdfCopy}
                        onChange={event => setPdfCopy(event.target.value)}
                        className="ml-2 h-9 border border-[var(--erp-hairline)] bg-[var(--erp-surface)] px-2 text-xs"
                      >
                        <option value="">Choose copy</option>
                        {detail.print_copies.map(copy => (
                          <option key={copy.id} value={copy.id}>{copy.label}</option>
                        ))}
                      </select>
                    </label>
                    <button type="button" disabled={!pdfCopy} onClick={() => void openPdf(detail.id, { form: true, copy: pdfCopy })} className="px-4 py-2 border border-[var(--erp-gold)] text-[var(--erp-gold)] text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40">
                      <Printer className="w-3.5 h-3.5" /> Print
                    </button>
                    <button type="button" disabled={!pdfCopy} onClick={() => void downloadPdf(detail.id, { form: true, copy: pdfCopy })} className="px-4 py-2 border border-[var(--erp-gold)] text-[var(--erp-gold)] text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40">
                      <Download className="w-3.5 h-3.5" /> Download PDF
                    </button>
                  </>
                ) : (
                  <button type="button" onClick={() => void openPdf(detail.id)} className="px-4 py-2 border border-[var(--erp-gold)] text-[var(--erp-gold)] text-xs font-semibold flex items-center gap-1.5">
                    <Download className="w-3.5 h-3.5" /> Download PDF
                  </button>
                )}
                <button type="button" onClick={() => void downloadDispatchExcel(detail.id)} className="px-4 py-2 border border-[var(--erp-gold)] text-[var(--erp-gold)] text-xs font-semibold flex items-center gap-1.5">
                  <Download className="w-3.5 h-3.5" /> Client Dispatch Excel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showDispatchForm && detail && (
        <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4">
          <form
            noValidate
            onSubmit={e => { e.preventDefault(); void persistDispatch(); }}
            className="w-full max-w-3xl max-h-[92vh] overflow-y-auto bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] p-6 space-y-5"
          >
            <div className="flex justify-between border-b border-[var(--erp-hairline)] pb-3">
              <h3 className="font-display text-lg font-bold flex items-center gap-2"><Truck className="w-4 h-4 text-[var(--erp-gold)]" />Record Dispatch · {detail.po_number}</h3>
              <button type="button" onClick={() => setShowDispatchForm(false)}><X className="w-4 h-4" /></button>
            </div>
            <RequiredLegend />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <TextInput
                label="Dispatch date"
                type="date"
                required
                error={dispatchMessages.dispatch_date}
                value={dispatchForm.dispatch_date}
                onChange={e => {
                  setDispatchForm({ ...dispatchForm, dispatch_date: e.target.value });
                  setDispatchMessages(prev => clearFieldMessage(prev, 'dispatch_date'));
                }}
              />
              <TextInput
                label="LR number"
                required
                error={dispatchMessages.lr_number}
                value={dispatchForm.lr_number}
                onChange={e => {
                  setDispatchForm({ ...dispatchForm, lr_number: e.target.value });
                  setDispatchMessages(prev => clearFieldMessage(prev, 'lr_number'));
                }}
              />
              <TextInput
                label="Transporter"
                required
                error={dispatchMessages.transporter}
                value={dispatchForm.transporter}
                onChange={e => {
                  setDispatchForm({ ...dispatchForm, transporter: e.target.value });
                  setDispatchMessages(prev => clearFieldMessage(prev, 'transporter'));
                }}
              />
              <TextInput
                label="Challan / reference"
                required
                error={dispatchMessages.challan_reference}
                value={dispatchForm.challan_reference}
                onChange={e => {
                  setDispatchForm({ ...dispatchForm, challan_reference: e.target.value });
                  setDispatchMessages(prev => clearFieldMessage(prev, 'challan_reference'));
                }}
              />
            </div>
            {dispatchMessages.lines && <p className="text-xs font-mono text-[var(--erp-negative)]">{dispatchMessages.lines}</p>}
            <div className="overflow-x-auto border border-[var(--erp-hairline)]">
              <table className="w-full text-left text-xs">
                <thead className="bg-[var(--erp-surface-2)] font-mono text-[10px] uppercase tracking-wider text-[var(--erp-muted)]">
                  <tr>
                    <th className="px-3 py-2">Product</th>
                    <th className="px-3 py-2 text-right">Pending</th>
                    <th className="px-3 py-2 w-36">Dispatch qty this time *</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.lines.filter(l => l.id && num(l.pending_quantity) > 0).map(line => (
                    <tr key={line.id} className="border-t border-[var(--erp-hairline)]">
                      <td className="px-3 py-2">{line.product_code ? `${line.product_code} · ${line.product_name}` : line.product_name}</td>
                      <td className="px-3 py-2 text-right font-mono">{num(line.pending_quantity).toFixed(2)}</td>
                      <td className="px-3 py-2">
                        <input
                          value={dispatchQtys[line.id as number] || ''}
                          onChange={e => setDispatchQtys(prev => ({ ...prev, [line.id as number]: e.target.value }))}
                          className={`w-full px-2 py-1.5 font-mono bg-[var(--erp-surface)] border text-[var(--erp-text)] ${dispatchMessages[`qty_${line.id}`] ? 'border-[var(--erp-negative)]' : 'border-[var(--erp-hairline-strong)]'}`}
                        />
                        {dispatchMessages[`qty_${line.id}`] && <p className="text-[10px] font-mono text-[var(--erp-negative)] mt-1">{dispatchMessages[`qty_${line.id}`]}</p>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-3 pt-2 border-t border-[var(--erp-hairline)]">
              <button type="button" onClick={() => setShowDispatchForm(false)} className="px-4 py-2 border border-[var(--erp-hairline)] text-xs font-mono">Cancel</button>
              <button type="submit" disabled={saving} className="px-5 py-2 bg-[var(--erp-gold)] text-[#0F141B] text-xs font-semibold">{saving ? 'Saving…' : 'Save dispatch'}</button>
            </div>
          </form>
        </div>
      )}

      {importOpen && (
        <PurchaseOrderImportModal
          entities={entities.filter(e => e.status === 'Active')}
          brands={brands}
          selectedEntityId={selectedEntityId}
          initialBrandId={typeof brandFilter === 'number' ? brandFilter : ''}
          onConfigureBranch={() => { setImportOpen(false); navigateTo(36); }}
          onClose={() => setImportOpen(false)}
          onImported={async result => {
            setImportOpen(false);
            setImportReport(result);
            setMode('list');
            await load();
          }}
        />
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        entityType="purchase order"
        entityLabel={pendingDelete ? pendingDelete.po_number : ''}
        title={pendingDelete?.status === 'Cancelled' ? 'Delete cancelled purchase order?' : 'Delete draft purchase order?'}
        message={pendingDelete ? `Delete ${pendingDelete.status.toLowerCase()} '${pendingDelete.po_number}'? This cannot be undone.` : ''}
        confirmLabel="Delete"
        confirmTone="critical"
        onCancel={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (!pendingDelete) return;
          try {
            await purchaseOrdersApi.remove(pendingDelete.id);
            notifySuccess(`Purchase Order '${pendingDelete.po_number}' deleted.`);
            setPendingDelete(null);
            setMode('list');
            await load();
          } catch (err) {
            notifyApiError(err);
          }
        }}
      />

      <ConfirmDialog
        open={!!pendingStatus}
        entityType="purchase order"
        entityLabel={pendingStatus ? pendingStatus.row.po_number : ''}
        title={pendingStatus ? `${ADMIN_STATUS_LABELS[pendingStatus.next] || pendingStatus.next}?` : ''}
        message={pendingStatus ? `Change '${pendingStatus.row.po_number}' from ${pendingStatus.row.status} to ${pendingStatus.next}?` : ''}
        confirmLabel={pendingStatus ? (ADMIN_STATUS_LABELS[pendingStatus.next] || 'Update') : 'Update'}
        confirmTone={pendingStatus && (pendingStatus.next === 'Rejected' || pendingStatus.next === 'Cancelled') ? 'critical' : 'gold'}
        onCancel={() => setPendingStatus(null)}
        onConfirm={async () => {
          if (!pendingStatus) return;
          await applyStatus(pendingStatus.row, pendingStatus.next);
        }}
      />

      <ConfirmDialog
        open={!!pendingDeleteDispatch}
        entityType="dispatch"
        entityLabel={pendingDeleteDispatch ? pendingDeleteDispatch.lr_number : ''}
        title="Delete dispatch?"
        message={pendingDeleteDispatch ? `Delete dispatch '${pendingDeleteDispatch.lr_number}'? Pending quantities will be recalculated.` : ''}
        confirmLabel="Delete"
        confirmTone="critical"
        onCancel={() => setPendingDeleteDispatch(null)}
        onConfirm={async () => {
          if (!pendingDeleteDispatch || !detail) return;
          try {
            await dispatchesApi.remove(pendingDeleteDispatch.id);
            notifySuccess(`Dispatch '${pendingDeleteDispatch.lr_number}' deleted.`);
            setPendingDeleteDispatch(null);
            await openDetail(detail.id);
            await load();
          } catch (err) {
            notifyApiError(err);
          }
        }}
      />

      <InputDialog
        open={!!pendingRateLine}
        title="Set line rate"
        message="Enter the rate for this Purchase Order line."
        label="Rate"
        type="number"
        initialValue={pendingRateLine?.rate ? String(pendingRateLine.rate) : ''}
        confirmLabel="Set rate"
        busyLabel="Saving…"
        onCancel={() => setPendingRateLine(null)}
        onConfirm={saveLineRate}
      />

      <ConfirmDialog
        open={lineImportConfirmation !== null}
        entityType="line items"
        entityLabel="the current line items"
        title="Replace line items?"
        message={lineImportConfirmation === 'upload'
          ? 'The uploaded file will replace the existing line items.'
          : 'The current uploaded line items will be cleared so you can choose a new file.'}
        confirmLabel="Replace"
        confirmTone="gold"
        onCancel={() => {
          setLineImportConfirmation(null);
          setPendingLineImportFile(null);
        }}
        onConfirm={async () => {
          const file = pendingLineImportFile;
          setLineImportConfirmation(null);
          setPendingLineImportFile(null);
          if (file) await importLineFile(file);
          else removeLineImport();
        }}
      />
    </div>
  );
};
