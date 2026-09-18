import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Eye, FileText, Plus, Search, Trash2, Truck, Upload, X } from 'lucide-react';
import { useErp } from '../../context/ErpContext';
import { PageHeader } from '../../components/common/PageHeader';
import { DataTable, Column } from '../../components/common/DataTable';
import { StatusChip, StatusChipType } from '../../components/common/StatusChip';
import { CustomerPicker } from '../../components/common/CustomerPicker';
import { TextInput, FormField, RequiredLegend } from '../../components/common/FormControls';
import { FileDropZone } from '../../components/common/FileDropZone';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { MasterError, MasterLoading, emptyTableProps } from '../masters/MasterStatus';
import { num } from '../../services/mastersApi';
import { notifyApiError, notifyError, notifySuccess } from '../../services/notify';
import { acquireSaveLock, releaseSaveLock } from '../../services/saveLock';
import { clearFieldMessage, collectRequired, REQUIRED_MSG } from '../../services/requiredFields';
import { BrandRow, brandsApi } from '../../services/brandsApi';
import { CustomerRow, customersApi, readCustomerListFilter } from '../../services/customersApi';
import { EntityRow, entitiesApi } from '../../services/entitiesApi';
import { ProductRow, productsApi } from '../../services/productsApi';
import {
  PO_STATUSES,
  PO_TRANSITIONS,
  OPEN_PO_KEY,
  PurchaseOrderRow,
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

const sectionTitle = 'text-[11px] font-mono uppercase tracking-wider text-[var(--erp-gold)] border-b border-[var(--erp-hairline)] pb-1 mb-3';

type LineDraft = {
  key: string;
  product_id?: number;
  product_description: string;
  manualEntry: boolean;
  quantity: string;
  rate: string;
};

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

function newLine(manualEntry = false): LineDraft {
  return { key: `${Date.now()}-${Math.random().toString(16).slice(2)}`, product_description: '', manualEntry, quantity: '', rate: '' };
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

export const PurchaseOrderScreen: React.FC = () => {
  const { userRole, navigateTo } = useErp();
  const canDraftWrite = userRole === 'admin' || userRole === 'operator';
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
  const [entityFilter, setEntityFilter] = useState<number | ''>('');
  const [customerFilter, setCustomerFilter] = useState<number | ''>(() => readCustomerListFilter());
  const [brandFilter, setBrandFilter] = useState<number | ''>('');
  const [orderTypeFilter, setOrderTypeFilter] = useState('');
  const [handyFile, setHandyFile] = useState<File | null>(null);

  const [mode, setMode] = useState<'list' | 'form' | 'detail'>('list');
  const [form, setForm] = useState<Partial<PurchaseOrderRow>>(emptyPurchaseOrder());
  const [lines, setLines] = useState<LineDraft[]>([newLine()]);
  const [detail, setDetail] = useState<PurchaseOrderRow | null>(null);
  const [fieldMessages, setFieldMessages] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PurchaseOrderRow | null>(null);
  const [pendingStatus, setPendingStatus] = useState<{ row: PurchaseOrderRow; next: string } | null>(null);
  const [poDispatches, setPoDispatches] = useState<DispatchRow[]>([]);
  const [showDispatchForm, setShowDispatchForm] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
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
  const dispatchLock = useRef(false);
  const savingLock = useRef(false);
  const numberRef = useRef<HTMLInputElement>(null);

  const activeBrands = useMemo(
    () => brands.filter(b => b.status === 'Active' || b.id === form.brand_id || b.id === brandFilter),
    [brands, form.brand_id, brandFilter],
  );
  const selectedBrand = activeBrands.find(b => b.id === form.brand_id);
  const isManual = selectedBrand?.order_method === 'Manual/POR';

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

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await purchaseOrdersApi.list({
        status: statusFilter || undefined,
        entity_id: entityFilter || undefined,
        customer_id: customerFilter || undefined,
        brand_id: brandFilter || undefined,
        order_type: orderTypeFilter || undefined,
      }));
    } catch (e) {
      const parsed = notifyApiError(e, 'Could not load purchase orders.');
      setError(parsed.message);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, entityFilter, customerFilter, brandFilter, orderTypeFilter]);

  useEffect(() => { void loadLookups(); }, [loadLookups]);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    void customersApi.list({
      status: 'Active',
      entity_id: entityFilter || undefined,
    }).then(setListCustomers).catch(notifyApiError);
  }, [entityFilter]);

  const filtered = rows.filter(r => {
    const q = search.toLowerCase().trim();
    return !q || r.po_number.toLowerCase().includes(q) || r.customer_name.toLowerCase().includes(q);
  });

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
    void productsApi.list({ status: 'Active', brand_id: form.brand_id }).then(setProducts).catch(notifyApiError);
  }, [form.brand_id]);

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

  const openCreate = () => {
    setForm(emptyPurchaseOrder());
    setLines([newLine()]);
    setHandyFile(null);
    setFieldMessages({});
    setMode('form');
  };

  const openDetail = async (id: number) => {
    try {
      const row = await purchaseOrdersApi.retrieve(id);
      setDetail(row);
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
      setLines(row.lines.length
        ? row.lines.map(l => ({
          key: String(l.id ?? `${l.product_id || l.product_description}`),
          product_id: l.product_id || undefined,
          product_description: l.product_description || '',
          manualEntry: !l.product_id,
          quantity: String(l.quantity),
          rate: rateIsUnset(l.rate) ? '' : String(l.rate),
        }))
        : [newLine()]);
      setFieldMessages({});
      setMode('form');
    } catch (e) {
      notifyApiError(e);
    }
  };

  const buildPayload = () => ({
    po_number: (form.po_number || '').trim(),
    entity_id: form.entity_id,
    customer_id: form.customer_id,
    brand_id: form.brand_id,
    po_date: form.po_date,
    remarks: form.remarks || '',
    lines: lines
      .filter(l => l.product_id || l.product_description.trim())
      .map(l => ({
        product_id: l.manualEntry ? null : (l.product_id || null),
        product_description: l.manualEntry ? l.product_description.trim() : '',
        quantity: num(l.quantity).toFixed(2),
        rate: l.rate.trim() === '' ? null : num(l.rate).toFixed(2),
      })),
  });

  const validateForm = (requireRates = false): boolean => {
    const messages = collectRequired({
      po_number: form.po_number,
      entity_id: form.entity_id,
      customer_id: form.customer_id,
      brand_id: form.brand_id,
      po_date: form.po_date,
    });
    const filled = lines.filter(l => l.product_id || l.product_description.trim());
    if (!filled.length) messages.lines = 'Add at least one line item.';
    lines.forEach((l, i) => {
      const hasItem = !!(l.product_id || l.product_description.trim());
      if (!hasItem && lines.length === 1) return;
      if (hasItem && !num(l.quantity)) messages[`line_${i}_qty`] = REQUIRED_MSG;
      if (l.manualEntry && !l.product_description.trim()) messages[`line_${i}_desc`] = REQUIRED_MSG;
      if (!l.manualEntry && hasItem && !l.product_id) messages[`line_${i}_product`] = REQUIRED_MSG;
      if (hasItem && requireRates && l.rate.trim() === '') {
        messages[`line_${i}_rate`] = 'Rate is required before submit.';
      }
    });
    setFieldMessages(messages);
    if (Object.keys(messages).length) {
      if (messages.po_number) requestAnimationFrame(() => numberRef.current?.focus());
      return false;
    }
    return true;
  };

  const persist = async (submitAfter: boolean) => {
    if (!validateForm(submitAfter)) return;
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
        if (row.lines.some(l => rateIsUnset(l.rate))) {
          notifyError('Every line must have a rate before the purchase order can be submitted. Rate is not set on one or more lines.');
          setPendingStatus(null);
          return;
        }
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

  const openPdf = async (id: number) => {
    try {
      const blob = await purchaseOrdersApi.pdf(id);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
    } catch (err) {
      notifyApiError(err, 'Could not generate PDF.');
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

  const setLineProduct = (key: string, productId: number) => {
    const product = products.find(p => p.id === productId);
    setLines(prev => prev.map(l => l.key === key
      ? { ...l, product_id: productId, product_description: '', rate: product ? String(product.rate) : l.rate }
      : l));
  };

  const columns: Column<PurchaseOrderRow>[] = [
    { header: 'PO Number', accessorKey: 'po_number', mono: true, width: '140px', render: r => <span className="font-mono text-[var(--erp-gold)]">{r.po_number}</span> },
    {
      header: 'Type',
      width: '100px',
      render: r => (
        <StatusChip
          status={r.order_type === 'Manual' ? 'notice' : 'active'}
          label={r.order_type === 'Manual' ? 'MANUAL' : 'DIGITAL'}
        />
      ),
    },
    { header: 'Entity', render: r => <span className="font-mono text-xs">{r.entity_code} · {r.entity_name}</span> },
    { header: 'Customer', render: r => <span>{r.customer_name}</span> },
    { header: 'Brand', render: r => <span>{r.brand_name}</span> },
    { header: 'PO Date', accessorKey: 'po_date', mono: true, width: '110px' },
    { header: 'Total', align: 'right', mono: true, width: '110px', render: r => money(r.total_amount) },
    {
      header: 'Status',
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
          {canDraftWrite && r.status === 'Draft' && (
            <button type="button" className="p-1 text-[var(--erp-muted)] hover:text-[var(--erp-negative)] cursor-pointer" title="Delete draft" onClick={() => setPendingDelete(r)}><Trash2 className="w-3.5 h-3.5" /></button>
          )}
        </div>
      ),
    },
  ];

  const filterCustomers = customers.filter(c => c.status === 'Active' || c.id === form.customer_id);
  const statusActions = detail ? (PO_TRANSITIONS[detail.status] || []) : [];

  return (
    <div className="p-6 flex flex-col gap-6 text-left">
      <PageHeader
        moduleNumber="40"
        section="Orders"
        title="Purchase Orders"
        subtitle="Digital PO and Manual/POR — entity, customer, brand and line items"
        actions={
          canDraftWrite ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setImportOpen(true)}
                className="px-4 py-1.5 border border-[var(--erp-gold)] text-[var(--erp-gold)] font-body text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" /> Import from file
              </button>
              <button type="button" onClick={openCreate} className="px-4 py-1.5 bg-[var(--erp-gold)] text-[#0F141B] font-body text-xs font-semibold flex items-center gap-1.5 cursor-pointer">
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
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] p-3">
        <div className="relative w-full lg:w-80">
          <Search className="w-4 h-4 text-[var(--erp-muted)] absolute left-3 top-2.5" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search PO number…" className="w-full pl-9 pr-3 py-1.5 text-xs bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)] focus:border-[var(--erp-gold)] focus:outline-none font-mono" />
        </div>
        <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
          <select value={entityFilter} onChange={e => { setEntityFilter(e.target.value ? Number(e.target.value) : ''); setCustomerFilter(''); }} className="px-2 py-1 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)]">
            <option value="">All entities</option>
            {entities.map(ent => <option key={ent.id} value={ent.id}>{ent.short_code} · {ent.entity_name}</option>)}
          </select>
          <CustomerPicker
            compact
            allowAll
            customers={listCustomers}
            value={customerFilter}
            onChange={setCustomerFilter}
            allLabel="All customers"
            placeholder="All customers"
          />
          <select value={brandFilter} onChange={e => setBrandFilter(e.target.value ? Number(e.target.value) : '')} className="px-2 py-1 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)]">
            <option value="">All brands</option>
            {activeBrands.map(b => <option key={b.id} value={b.id}>{b.brand_code} · {b.brand_name}</option>)}
          </select>
          <select value={orderTypeFilter} onChange={e => setOrderTypeFilter(e.target.value)} className="px-2 py-1 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)]">
            <option value="">All types</option>
            <option value="Digital">Digital</option>
            <option value="Manual">Manual</option>
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-2 py-1 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)]">
            <option value="">All statuses</option>
            {PO_STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <MasterLoading label="Loading purchase orders…" />
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
        />
      )}

      {mode === 'form' && canDraftWrite && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <form noValidate onSubmit={e => { e.preventDefault(); void persist(false); }} className="w-full max-w-5xl max-h-[92vh] overflow-y-auto bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] p-6 space-y-6">
            <div className="flex justify-between border-b border-[var(--erp-hairline)] pb-3 sticky top-0 bg-[var(--erp-surface)] z-10">
              <h3 className="font-display text-lg font-bold flex items-center gap-2"><FileText className="w-4 h-4 text-[var(--erp-gold)]" />{form.id ? 'Edit Purchase Order' : 'Create Purchase Order'}</h3>
              <button type="button" onClick={() => setMode('list')}><X className="w-4 h-4" /></button>
            </div>
            <RequiredLegend />
            <section>
              <h4 className={sectionTitle}>Header</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <TextInput
                  ref={numberRef}
                  label="PO number"
                  mono
                  required
                  error={fieldMessages.po_number}
                  value={form.po_number || ''}
                  onChange={e => {
                    setForm({ ...form, po_number: e.target.value });
                    setFieldMessages(prev => clearFieldMessage(prev, 'po_number'));
                  }}
                />
                <TextInput
                  label="PO date"
                  type="date"
                  required
                  error={fieldMessages.po_date}
                  value={form.po_date || ''}
                  onChange={e => {
                    setForm({ ...form, po_date: e.target.value });
                    setFieldMessages(prev => clearFieldMessage(prev, 'po_date'));
                  }}
                />
                <FormField label="Entity" required error={fieldMessages.entity_id}>
                  <select
                    value={form.entity_id || ''}
                    onChange={e => {
                      const id = e.target.value ? Number(e.target.value) : undefined;
                      setForm({ ...form, entity_id: id, customer_id: undefined });
                      setFieldMessages(prev => clearFieldMessage(clearFieldMessage(prev, 'entity_id'), 'customer_id'));
                    }}
                    className={`px-3 py-2 text-sm bg-[var(--erp-surface)] border text-[var(--erp-text)] ${fieldMessages.entity_id ? 'border-[var(--erp-negative)]' : 'border-[var(--erp-hairline-strong)]'}`}
                  >
                    <option value="">Select entity…</option>
                    {entities.map(ent => <option key={ent.id} value={ent.id}>{ent.short_code} · {ent.entity_name}</option>)}
                  </select>
                </FormField>
                <FormField label="Customer" required error={fieldMessages.customer_id}>
                  <CustomerPicker
                    customers={filterCustomers}
                    value={form.customer_id || ''}
                    disabled={!form.entity_id}
                    error={!!fieldMessages.customer_id}
                    placeholder={form.entity_id ? 'Search customer…' : 'Select entity first'}
                    onChange={id => {
                      setForm({ ...form, customer_id: id || undefined });
                      setFieldMessages(prev => clearFieldMessage(prev, 'customer_id'));
                    }}
                  />
                </FormField>
                <FormField label="Brand" required error={fieldMessages.brand_id} className="sm:col-span-2">
                  <select
                    value={form.brand_id || ''}
                    onChange={e => {
                      const id = e.target.value ? Number(e.target.value) : undefined;
                      setForm({ ...form, brand_id: id });
                      setLines([newLine()]);
                      setHandyFile(null);
                      setFieldMessages(prev => clearFieldMessage(prev, 'brand_id'));
                    }}
                    className={`px-3 py-2 text-sm bg-[var(--erp-surface)] border text-[var(--erp-text)] ${fieldMessages.brand_id ? 'border-[var(--erp-negative)]' : 'border-[var(--erp-hairline-strong)]'}`}
                  >
                    <option value="">Select brand…</option>
                    {activeBrands.map(b => (
                      <option key={b.id} value={b.id}>{b.brand_code} · {b.brand_name} ({b.order_method})</option>
                    ))}
                  </select>
                  {selectedBrand && (
                    <p className="mt-1 text-[11px] font-mono text-[var(--erp-muted)]">
                      Order type: {isManual ? 'Manual / POR' : 'Digital PO'} (from brand order method)
                    </p>
                  )}
                </FormField>
                {isManual && (
                  <FileDropZone
                    className="sm:col-span-2"
                    label="Upload handy form"
                    helper="Optional — one image or PDF"
                    accept="image/*,.pdf,application/pdf"
                    file={handyFile}
                    onChange={setHandyFile}
                    existingHint={form.handy_form_url ? (
                      <a href={form.handy_form_url} target="_blank" rel="noreferrer" className="text-[11px] font-mono text-[var(--erp-gold)]">
                        View current handy form
                      </a>
                    ) : null}
                  />
                )}
              </div>
            </section>

            <section>
              <h4 className={sectionTitle}>Line items</h4>
              {fieldMessages.lines && <p className="text-xs font-mono text-[var(--erp-negative)] mb-2">{fieldMessages.lines}</p>}
              <div className="overflow-x-auto border border-[var(--erp-hairline)]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[var(--erp-surface-2)] font-mono text-[10px] uppercase tracking-wider text-[var(--erp-muted)]">
                    <tr>
                      <th className="px-3 py-2">Product *</th>
                      <th className="px-3 py-2 w-28">Qty *</th>
                      <th className="px-3 py-2 w-28">Rate</th>
                      <th className="px-3 py-2 w-32 text-right">Line total</th>
                      <th className="px-3 py-2 w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line, index) => {
                      const product = products.find(p => p.id === line.product_id);
                      const lineTotal = num(line.quantity) * num(line.rate);
                      const freeText = isManual && line.manualEntry;
                      return (
                        <tr key={line.key} className="border-t border-[var(--erp-hairline)]">
                          <td className="px-3 py-2">
                            {freeText ? (
                              <input
                                value={line.product_description}
                                placeholder="Item from handy form…"
                                onChange={e => setLines(prev => prev.map(l => l.key === line.key ? { ...l, product_description: e.target.value } : l))}
                                className={`w-full px-2 py-1.5 bg-[var(--erp-surface)] border text-[var(--erp-text)] ${fieldMessages[`line_${index}_desc`] ? 'border-[var(--erp-negative)]' : 'border-[var(--erp-hairline-strong)]'}`}
                              />
                            ) : (
                              <select
                                disabled={!form.brand_id}
                                value={line.product_id || ''}
                                onChange={e => setLineProduct(line.key, Number(e.target.value))}
                                className={`w-full px-2 py-1.5 bg-[var(--erp-surface)] border text-[var(--erp-text)] disabled:opacity-50 ${fieldMessages[`line_${index}_product`] ? 'border-[var(--erp-negative)]' : 'border-[var(--erp-hairline-strong)]'}`}
                              >
                                <option value="">Select product…</option>
                                {products.map(p => <option key={p.id} value={p.id}>{p.product_code} · {p.product_name}</option>)}
                              </select>
                            )}
                            {isManual && (
                              <button
                                type="button"
                                className="mt-1 text-[10px] font-mono text-[var(--erp-gold)] hover:underline"
                                onClick={() => setLines(prev => prev.map(l => l.key === line.key
                                  ? { ...l, manualEntry: !freeText, product_id: undefined, product_description: '', rate: '' }
                                  : l))}
                              >
                                {freeText ? 'Pick from catalogue' : 'Product not in catalogue? Enter manually'}
                              </button>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <input
                              value={line.quantity}
                              onChange={e => setLines(prev => prev.map(l => l.key === line.key ? { ...l, quantity: e.target.value } : l))}
                              className={`w-full px-2 py-1.5 font-mono bg-[var(--erp-surface)] border text-[var(--erp-text)] ${fieldMessages[`line_${index}_qty`] ? 'border-[var(--erp-negative)]' : 'border-[var(--erp-hairline-strong)]'}`}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              value={line.rate}
                              placeholder={freeText ? 'Enter rate' : ''}
                              onChange={e => setLines(prev => prev.map(l => l.key === line.key ? { ...l, rate: e.target.value } : l))}
                              className={`w-full px-2 py-1.5 font-mono bg-[var(--erp-surface)] border text-[var(--erp-text)] ${fieldMessages[`line_${index}_rate`] ? 'border-[var(--erp-negative)]' : 'border-[var(--erp-hairline-strong)]'}`}
                            />
                            {!!(line.product_id || line.product_description.trim()) && rateIsUnset(line.rate) ? (
                              <div className="mt-1"><RateNotSetBadge /></div>
                            ) : null}
                          </td>
                          <td className="px-3 py-2 text-right font-mono">{money(lineTotal)}{product ? <span className="block text-[10px] text-[var(--erp-muted)]">{product.unit}</span> : null}</td>
                          <td className="px-3 py-2">
                            {lines.length > 1 && (
                              <button type="button" className="text-[var(--erp-muted)] hover:text-[var(--erp-negative)]" onClick={() => setLines(prev => prev.filter(l => l.key !== line.key))}><Trash2 className="w-3.5 h-3.5" /></button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <button type="button" disabled={!form.brand_id} onClick={() => setLines(prev => [...prev, newLine()])} className="mt-3 px-3 py-1.5 text-[11px] font-mono border border-[var(--erp-hairline)] text-[var(--erp-muted)] hover:text-[var(--erp-gold)] disabled:opacity-40">+ Add line</button>
              <div className="mt-4 flex justify-end gap-8 font-mono text-sm border-t border-[var(--erp-hairline)] pt-3">
                <div>Qty <span className="text-[var(--erp-text)]">{totals.qty.toFixed(2)}</span></div>
                <div>Amount <span className="text-[var(--erp-gold)]">{money(totals.amt)}</span></div>
              </div>
            </section>

            <section>
              <h4 className={sectionTitle}>Remarks</h4>
              <textarea value={form.remarks || ''} onChange={e => setForm({ ...form, remarks: e.target.value })} rows={3} className="w-full px-3 py-2 text-sm bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] text-[var(--erp-text)] focus:outline-none focus:border-[var(--erp-gold)] rounded-none" />
            </section>

            <div className="flex justify-end gap-3 pt-2 border-t border-[var(--erp-hairline)]">
              <button type="button" onClick={() => setMode('list')} className="px-4 py-2 border border-[var(--erp-hairline)] text-xs font-mono">Cancel</button>
              <button type="submit" disabled={saving} className="px-5 py-2 border border-[var(--erp-gold)] text-[var(--erp-gold)] text-xs font-semibold">{saving ? 'Saving…' : 'Save as Draft'}</button>
              <button type="button" disabled={saving} onClick={() => void persist(true)} className="px-5 py-2 bg-[var(--erp-gold)] text-[#0F141B] text-xs font-semibold">{saving ? 'Saving…' : 'Submit'}</button>
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
                  status={detail.order_type === 'Manual' ? 'notice' : 'active'}
                  label={detail.order_type === 'Manual' ? 'MANUAL' : 'DIGITAL'}
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
                            <RateNotSetBadge />
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
              <div className="text-[var(--erp-gold)]">{money(detail.total_amount)}</div>
            </div>
            {detail.remarks ? <p className="text-sm text-[var(--erp-muted)]"><span className="font-mono text-[10px] uppercase">Remarks</span><br />{detail.remarks}</p> : null}
            {detail.order_type === 'Manual' && detail.handy_form_url ? (
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
                            {canDraftWrite && (
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
            <div className="flex flex-wrap justify-between gap-3 pt-3 border-t border-[var(--erp-hairline)]">
              <div className="flex flex-wrap gap-2">
                {detail.status === 'Draft' && canDraftWrite && (
                  <>
                    <button type="button" onClick={() => void openEdit(detail.id)} className="px-4 py-2 border border-[var(--erp-hairline)] text-xs font-mono">Edit</button>
                    <button type="button" onClick={() => void applyStatus(detail, 'Submitted')} className="px-4 py-2 bg-[var(--erp-gold)] text-[#0F141B] text-xs font-semibold">Submit</button>
                    <button type="button" onClick={() => setPendingDelete(detail)} className="px-4 py-2 border border-[var(--erp-negative)]/40 text-[var(--erp-negative)] text-xs font-mono">Delete draft</button>
                  </>
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
                <button type="button" onClick={() => void openPdf(detail.id)} className="px-4 py-2 border border-[var(--erp-gold)] text-[var(--erp-gold)] text-xs font-semibold flex items-center gap-1.5">
                  <Download className="w-3.5 h-3.5" /> Download PDF
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
        title="Delete draft purchase order?"
        message={pendingDelete ? `Delete draft '${pendingDelete.po_number}'? This cannot be undone.` : ''}
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
    </div>
  );
};
