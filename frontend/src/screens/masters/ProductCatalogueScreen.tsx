import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Boxes,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleOff,
  Edit2,
  Eye,
  ImageIcon,
  PackageCheck,
  PackageX,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useErp } from '../../context/ErpContext';
import { StatusChip } from '../../components/common/StatusChip';
import { TextInput, FormField, RequiredLegend } from '../../components/common/FormControls';
import { FileDropZone } from '../../components/common/FileDropZone';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { MasterError, MasterLoading } from './MasterStatus';
import { num } from '../../services/mastersApi';
import { notifyApiError, notifyError, notifyInfo, notifySuccess, parseApiErrorDetails } from '../../services/notify';
import { clearFieldMessage, collectRequired } from '../../services/requiredFields';
import { BrandRow, brandsApi } from '../../services/brandsApi';
import { CategoryRow, categoriesApi } from '../../services/categoriesApi';
import { EntityRow, entitiesApi } from '../../services/entitiesApi';
import {
  PRODUCT_AVAILABILITY,
  PRODUCT_UNITS,
  ProductRow,
  ProductStatus,
  emptyProduct,
  productsApi,
  toProductFormData,
} from '../../services/productsApi';
import { CurrentPriceRow, priceListsApi } from '../../services/priceListsApi';

function nullableDecimal(value: string | number | null | undefined): number | null {
  if (value === '' || value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

const sectionTitle = 'text-[11px] font-mono uppercase tracking-wider text-[var(--erp-gold)] border-b border-[var(--erp-hairline)] pb-1 mb-3';
const selectClass = 'h-10 w-full rounded-md border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] px-3 text-sm text-[var(--erp-text)] focus:border-[var(--erp-gold)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--erp-gold)]/35 disabled:cursor-not-allowed disabled:opacity-50';
const primaryBtn = 'inline-flex h-10 items-center gap-2 rounded-md bg-[var(--erp-gold)] px-4 text-sm font-semibold text-[#1B2430] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--erp-gold)] disabled:cursor-not-allowed disabled:opacity-50';
const quietBtn = 'inline-flex h-10 items-center gap-2 rounded-md border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] px-3 text-sm text-[var(--erp-text)] hover:border-[var(--erp-gold)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--erp-gold)] disabled:cursor-not-allowed disabled:opacity-40';
const PAGE_SIZES = [25, 50, 100] as const;

type SortKey = 'product_code' | 'product_name' | 'brand_name' | 'category_name' | 'rate' | 'frate' | 'trate' | 'availability' | 'status';

function formatInr(value: string | number | null | undefined): string | null {
  if (value === '' || value == null) return null;
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function compareProducts(a: ProductRow, b: ProductRow, key: SortKey, asc: boolean): number {
  const dir = asc ? 1 : -1;
  if (key === 'rate' || key === 'frate' || key === 'trate') {
    const left = a[key];
    const right = b[key];
    const leftMissing = left === '' || left == null || !Number.isFinite(Number(left));
    const rightMissing = right === '' || right == null || !Number.isFinite(Number(right));
    if (leftMissing && rightMissing) return 0;
    if (leftMissing) return 1;
    if (rightMissing) return -1;
    return (Number(left) - Number(right)) * dir;
  }
  return String(a[key] || '').localeCompare(String(b[key] || ''), undefined, { numeric: true, sensitivity: 'base' }) * dir;
}

function shadeView(lines: { quality: string; shades: string[] }[] | undefined) {
  const filled = (lines || []).filter(line => line.shades.length);
  if (!filled.length) return { kind: 'empty' as const };
  const signature = filled[0].shades.join('\u0001');
  if (filled.every(line => line.shades.join('\u0001') === signature)) {
    return { kind: 'shared' as const, shades: filled[0].shades };
  }
  return { kind: 'mixed' as const, lines: filled };
}

function ShadeList({ lines }: { lines: { quality: string; shades: string[] }[] | undefined }) {
  const view = shadeView(lines);
  if (view.kind === 'empty') return <dd className="mt-1 text-[var(--erp-muted)]">No shades listed.</dd>;
  if (view.kind === 'shared') {
    return (
      <dd className="mt-1 flex flex-wrap gap-1">
        {view.shades.map(shade => (
          <span key={shade} className="rounded-md border border-[var(--erp-hairline-strong)] px-2 py-0.5 text-xs text-[var(--erp-text)]">{shade}</span>
        ))}
      </dd>
    );
  }
  return (
    <dd className="mt-1 max-h-40 space-y-1 overflow-auto">
      {view.lines.map(line => (
        <div key={line.quality} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="font-mono text-xs text-[var(--erp-muted)]">{line.quality}</span>
          <span className="text-xs text-[var(--erp-text)]">{line.shades.join(', ')}</span>
        </div>
      ))}
    </dd>
  );
}

function availabilityChip(value: string) {
  if (value === 'In Stock') return <StatusChip status="active" label="In Stock" />;
  if (value === 'Out of Stock') return <StatusChip status="overdue" label="Out of Stock" />;
  return <StatusChip status="inactive" label="Discontinued" />;
}

function ProductThumb({ src, code }: { src?: string; code: string }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => { setBroken(false); }, [src]);
  const mark = (code || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || '—';
  if (!src || broken) {
    return (
      <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface-2)] font-mono text-[11px] font-semibold text-[var(--erp-muted)]">
        {mark}
      </span>
    );
  }
  return (
    <img
      src={src}
      alt=""
      className="h-11 w-11 shrink-0 rounded-md border border-[var(--erp-hairline)] object-cover"
      onError={() => setBroken(true)}
    />
  );
}

function KpiCard({ label, value, icon, tone }: { label: string; value: string; icon: React.ReactNode; tone: 'gold' | 'positive' | 'negative' | 'muted' }) {
  const bar = {
    gold: 'bg-[var(--erp-gold)]',
    positive: 'bg-[var(--erp-positive)]',
    negative: 'bg-[var(--erp-negative)]',
    muted: 'bg-[var(--erp-faint)]',
  }[tone];
  return (
    <div className="relative flex min-h-[96px] flex-col justify-between overflow-hidden rounded-md border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] px-4 py-3 shadow-[0_1px_2px_rgba(27,36,48,0.04)]">
      <span className={`absolute inset-y-0 left-0 w-0.5 ${bar}`} aria-hidden="true" />
      <div className="flex items-center justify-between gap-2 pl-1">
        <span className="text-xs font-medium text-[var(--erp-muted)]">{label}</span>
        <span className="text-[var(--erp-muted)]">{icon}</span>
      </div>
      <span className="pl-1 font-display text-[1.65rem] font-semibold leading-none tracking-tight text-[var(--erp-text)] tabular-nums">{value}</span>
    </div>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      aria-label={`Remove ${label}`}
      className="inline-flex h-7 max-w-full items-center gap-1 rounded-full border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface-2)] px-2.5 text-xs text-[var(--erp-text)] hover:border-[var(--erp-gold)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--erp-gold)]"
    >
      <span className="truncate">{label}</span>
      <X className="h-3 w-3 shrink-0 text-[var(--erp-muted)]" />
    </button>
  );
}

function SortHeader({
  label,
  column,
  sortKey,
  sortAsc,
  onSort,
  align = 'left',
}: {
  label: string;
  column: SortKey;
  sortKey: SortKey | null;
  sortAsc: boolean;
  onSort: (column: SortKey) => void;
  align?: 'left' | 'right';
}) {
  const active = sortKey === column;
  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      className={`inline-flex items-center gap-1 font-mono text-[11px] font-semibold uppercase tracking-wider focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--erp-gold)] ${align === 'right' ? 'ml-auto' : ''} ${active ? 'text-[var(--erp-gold)]' : 'text-[var(--erp-muted)] hover:text-[var(--erp-text)]'}`}
    >
      {label}
      {active ? (sortAsc ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />) : <ChevronDown className="h-3.5 w-3.5 opacity-30" />}
    </button>
  );
}

function SelectAllBox({ checked, indeterminate, onChange }: { checked: boolean; indeterminate: boolean; onChange: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label="Select all products on this page"
      checked={checked}
      onChange={onChange}
      className="h-4 w-4 cursor-pointer accent-[var(--erp-gold)]"
    />
  );
}

export const ProductCatalogueScreen: React.FC = () => {
  const { userRole, selectedEntityId, productCategory } = useErp();
  const canWrite = userRole === 'admin';
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [brands, setBrands] = useState<BrandRow[]>([]);
  const [entities, setEntities] = useState<EntityRow[]>([]);
  const [lookupsReady, setLookupsReady] = useState(false);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [brandFilter, setBrandFilter] = useState<number | ''>('');
  const [parentFilter, setParentFilter] = useState<number | ''>('');
  const [subFilter, setSubFilter] = useState<number | ''>('');
  const [availabilityFilter, setAvailabilityFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | ProductStatus>('');
  const [collectionFilter, setCollectionFilter] = useState('');
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(25);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<Partial<ProductRow>>(emptyProduct());
  const [formParentId, setFormParentId] = useState<number | ''>('');
  const [fieldErrors, setFieldErrors] = useState<string[]>([]);
  const [fieldMessages, setFieldMessages] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState('');
  const [pendingStatus, setPendingStatus] = useState<{ row: ProductRow; next: ProductStatus } | null>(null);
  const [pendingHardDelete, setPendingHardDelete] = useState<ProductRow | null>(null);
  const [hardDeleteBlock, setHardDeleteBlock] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [pendingBulkDelete, setPendingBulkDelete] = useState<ProductRow[] | null>(null);
  const [bulkDeleteBlock, setBulkDeleteBlock] = useState('');
  const [currentPrice, setCurrentPrice] = useState<CurrentPriceRow | null>(null);
  const [viewRow, setViewRow] = useState<ProductRow | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  const loadLookups = useCallback(async () => {
    try {
      const [brandRows, catRows, entityRows] = await Promise.all([
        brandsApi.list(),
        categoriesApi.list(),
        entitiesApi.list({ status: 'Active' }),
      ]);
      setBrands(brandRows);
      setCategories(catRows);
      setEntities(entityRows);
    } catch (e) {
      notifyApiError(e, 'Could not load brands and categories.');
    } finally {
      setLookupsReady(true);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await productsApi.list({
        brand_id: brandFilter || undefined,
        category_id: subFilter || undefined,
        availability: availabilityFilter || undefined,
      }));
    } catch (e) {
      const parsed = notifyApiError(e, 'Could not load products.');
      setError(parsed.message);
    } finally {
      setLoading(false);
    }
  }, [brandFilter, subFilter, availabilityFilter]);

  useEffect(() => { void loadLookups(); }, [loadLookups]);
  useEffect(() => { void load(); }, [load]);

  const selectedEntity = useMemo(
    () => (selectedEntityId === 'all' ? undefined : entities.find(row => row.id === selectedEntityId)),
    [entities, selectedEntityId],
  );
  const branchBrands = useMemo(() => {
    if (!selectedEntity) return brands;
    const allowed = new Set((selectedEntity.brand_ids || []).map(id => Number(id)));
    return brands.filter(brand => allowed.has(Number(brand.id)));
  }, [brands, selectedEntity]);

  useEffect(() => {
    if (!lookupsReady) return;
    if (brandFilter !== '' && !branchBrands.some(brand => brand.id === brandFilter)) {
      setBrandFilter('');
    }
  }, [brandFilter, branchBrands, lookupsReady]);

  const branchRows = useMemo(
    () => rows.filter(row => !selectedEntity || branchBrands.some(brand => brand.id === row.brand_id)),
    [rows, selectedEntity, branchBrands],
  );

  const collectionOptions = useMemo(() => {
    const names = new Set<string>();
    branchRows.forEach(row => {
      const name = (row.collection || '').trim();
      if (name) names.add(name);
    });
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [branchRows]);

  useEffect(() => {
    if (collectionFilter && !collectionOptions.includes(collectionFilter)) setCollectionFilter('');
  }, [collectionFilter, collectionOptions]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return branchRows.filter(row => {
      if (statusFilter && row.status !== statusFilter) return false;
      if (collectionFilter && (row.collection || '').trim() !== collectionFilter) return false;
      if (!q) return true;
      return [
        row.product_code,
        row.product_name,
        row.design,
        row.colour,
        row.quality,
        row.client_item_code,
        row.collection,
        row.brand_name,
        row.brand_code,
      ].some(value => (value || '').toLowerCase().includes(q));
    });
  }, [branchRows, search, statusFilter, collectionFilter]);

  const sorted = useMemo(
    () => (sortKey ? [...filtered].sort((a, b) => compareProducts(a, b, sortKey, sortAsc)) : filtered),
    [filtered, sortKey, sortAsc],
  );

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageStart = sorted.length === 0 ? 0 : (currentPage - 1) * pageSize;
  const pageRows = sorted.slice(pageStart, pageStart + pageSize);

  useEffect(() => {
    setPage(1);
  }, [search, brandFilter, parentFilter, subFilter, availabilityFilter, statusFilter, collectionFilter, pageSize]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const selectedRows = filtered.filter(row => selectedIds.has(row.id));
  const selectedCount = selectedRows.length;
  const pageSelectedCount = pageRows.filter(row => selectedIds.has(row.id)).length;
  const allVisibleSelected = pageRows.length > 0 && pageSelectedCount === pageRows.length;
  const canDeleteSelection = selectedCount > 0 && selectedRows.every(row => row.status === 'Inactive');

  useEffect(() => {
    const live = new Set(rows.map(row => row.id));
    setSelectedIds(prev => {
      const next = new Set([...prev].filter(id => live.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [rows]);

  const toggleOne = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (pageRows.every(row => next.has(row.id))) pageRows.forEach(row => next.delete(row.id));
      else pageRows.forEach(row => next.add(row.id));
      return next;
    });
  };

  const toggleSort = (column: SortKey) => {
    if (sortKey === column) setSortAsc(prev => !prev);
    else {
      setSortKey(column);
      setSortAsc(true);
    }
  };

  const applyStatus = async (status: ProductStatus) => {
    const targets = selectedRows.filter(row => row.status !== status);
    if (!targets.length) {
      notifyInfo(selectedCount ? `Selected products are already ${status}.` : 'Select products in the table.');
      return;
    }
    setBulkBusy(true);
    const outcomes = await Promise.all(targets.map(async row => {
      try {
        await productsApi.setStatus(row.id, status);
        return { ok: true as const, id: row.id };
      } catch (err) {
        return { ok: false as const, id: row.id, message: parseApiErrorDetails(err).message };
      }
    }));
    const done = outcomes.filter(item => item.ok).length;
    const failed = outcomes.filter(item => !item.ok);
    if (done) {
      const failedIds = new Set(failed.map(item => item.id));
      setSelectedIds(prev => new Set([...prev].filter(id => failedIds.has(id))));
      notifySuccess(`${done} product${done === 1 ? '' : 's'} set to ${status}.`);
      await load();
    }
    if (failed.length) notifyError(failed[0].message);
    setBulkBusy(false);
  };

  const askBulkDelete = () => {
    if (!selectedRows.length) return;
    const inactive = selectedRows.filter(row => row.status === 'Inactive');
    setBulkDeleteBlock(inactive.length ? '' : 'Set the selected products to Inactive before deleting them.');
    setPendingBulkDelete(selectedRows);
  };

  const topLevel = useMemo(() => categories.filter(c => !c.parent_category_id), [categories]);
  const subsForFilter = useMemo(
    () => categories.filter(c => parentFilter && c.parent_category_id === parentFilter),
    [categories, parentFilter],
  );
  const subsForForm = useMemo(
    () => categories.filter(c => formParentId && c.parent_category_id === formParentId),
    [categories, formParentId],
  );
  const formBrandOptions = useMemo(
    () => (selectedEntity ? branchBrands : brands).filter(brand => brand.status === 'Active' || brand.id === form.brand_id),
    [selectedEntity, branchBrands, brands, form.brand_id],
  );
  const soleBrand = formBrandOptions.length === 1 ? formBrandOptions[0] : null;

  useEffect(() => {
    if (!modalOpen || !soleBrand || form.brand_id === soleBrand.id) return;
    setForm(current => ({ ...current, brand_id: soleBrand.id }));
  }, [modalOpen, soleBrand, form.brand_id]);

  useEffect(() => {
    if (!viewRow && !modalOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (modalOpen) setModalOpen(false);
      else setViewRow(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [viewRow, modalOpen]);

  const openCreate = () => {
    const initial = emptyProduct();
    const activeBranchBrands = branchBrands.filter(brand => brand.status === 'Active');
    if (selectedEntity && activeBranchBrands.length === 1) {
      initial.brand_id = activeBranchBrands[0].id;
    }
    setForm(initial);
    setFormParentId('');
    setImageFile(null);
    setImagePreview('');
    setFieldErrors([]);
    setFieldMessages({});
    setCurrentPrice(null);
    setModalOpen(true);
  };

  const openEdit = async (id: number) => {
    try {
      const row = await productsApi.retrieve(id);
      setForm(row);
      setFormParentId(row.parent_category_id || '');
      setImageFile(null);
      setImagePreview(row.image_url || '');
      setFieldErrors([]);
      setFieldMessages({});
      try {
        setCurrentPrice(await priceListsApi.currentPrice(row.id));
      } catch {
        setCurrentPrice(null);
      }
      setModalOpen(true);
    } catch (e) {
      notifyApiError(e);
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const messages = collectRequired({
      product_code: form.product_code,
      product_name: form.product_name,
      brand_id: form.brand_id,
      ...(productCategory ? { category_id: form.category_id } : {}),
    });
    if (Object.keys(messages).length) {
      setFieldMessages(messages);
      setFieldErrors(Object.keys(messages));
      if (messages.product_code) requestAnimationFrame(() => codeRef.current?.focus());
      return;
    }
    setFieldMessages({});
    setSaving(true);
    setFieldErrors([]);
    const body = {
      product_code: (form.product_code || '').trim().toUpperCase(),
      client_item_code: (form.client_item_code || '').trim(),
      product_name: (form.product_name || '').trim(),
      brand_id: form.brand_id,
      ...(productCategory || form.category_id ? { category_id: form.category_id } : {}),
      print_name: form.print_name || '',
      description: form.description || '',
      design: form.design || '',
      colour: form.colour || '',
      quality: form.quality || '',
      width_size: form.width_size || '',
      product_type: form.product_type || '',
      group: form.group || '',
      unit: form.unit || 'Meter',
      rate: num(form.rate),
      frate: nullableDecimal(form.frate),
      trate: nullableDecimal(form.trate),
      season: form.season || '',
      collection: form.collection || '',
      availability: form.availability || 'In Stock',
      status: form.status || 'Active',
    };
    try {
      const fd = toProductFormData(body, imageFile);
      if (form.id) await productsApi.update(form.id, fd);
      else await productsApi.create(fd);
      notifySuccess(`Product '${body.product_name}' saved.`);
      setModalOpen(false);
      await load();
    } catch (err) {
      const parsed = notifyApiError(err);
      setFieldErrors(parsed.fields);
      if (parsed.fields.includes('product_code')) {
        requestAnimationFrame(() => codeRef.current?.focus());
      }
    } finally {
      setSaving(false);
    }
  };

  const clearFilters = () => {
    setSearch('');
    setBrandFilter('');
    setParentFilter('');
    setSubFilter('');
    setAvailabilityFilter('');
    setStatusFilter('');
    setCollectionFilter('');
  };

  const listReady = !loading && (selectedEntityId === 'all' || lookupsReady);
  const countLabel = (value: number) => (listReady ? value.toLocaleString('en-IN') : '—');
  const kpis = useMemo(() => {
    let active = 0;
    let inactive = 0;
    let inStock = 0;
    let outOfStock = 0;
    filtered.forEach(row => {
      if (row.status === 'Active') active += 1;
      else if (row.status === 'Inactive') inactive += 1;
      if (row.availability === 'In Stock') inStock += 1;
      else if (row.availability === 'Out of Stock') outOfStock += 1;
    });
    return { total: filtered.length, active, inactive, inStock, outOfStock };
  }, [filtered]);

  const hasListFilter = Boolean(
    search.trim() || brandFilter || parentFilter || subFilter || availabilityFilter || statusFilter || collectionFilter,
  );
  const selectedBrand = branchBrands.find(brand => brand.id === brandFilter);
  const selectedParent = topLevel.find(category => category.id === parentFilter);
  const selectedSub = subsForFilter.find(category => category.id === subFilter);
  const catalogEmpty = branchRows.length === 0 && !brandFilter && !subFilter && !availabilityFilter;
  const noMappedBrands = Boolean(selectedEntity && branchBrands.length === 0);

  const sortProps = { sortKey, sortAsc, onSort: toggleSort };
  const headCell = 'sticky top-0 z-10 bg-[var(--erp-surface-2)] px-3 py-2.5 text-left font-normal';

  return (
    <div className="flex flex-col gap-5 p-4 text-left sm:p-6">
      <header className="flex flex-col gap-4 border-b border-[var(--erp-hairline-strong)] pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-[var(--erp-muted)]">
            <span>Masters</span>
            <span aria-hidden="true">/</span>
            <span className="font-medium text-[var(--erp-text)]">Product Master</span>
          </nav>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="font-display text-2xl font-bold tracking-tight text-[var(--erp-text)] sm:text-3xl">Product Master</h1>
            <p className="font-mono text-sm text-[var(--erp-muted)]" aria-live="polite">
              {listReady ? `${kpis.total.toLocaleString('en-IN')} product${kpis.total === 1 ? '' : 's'}` : 'Loading products…'}
            </p>
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--erp-muted)]">
            Manage product catalog, brand pricing, availability and lifecycle status.
          </p>
        </div>
        {canWrite ? (
          <button type="button" onClick={openCreate} className={primaryBtn}>
            <Plus className="h-4 w-4" /> Add Product
          </button>
        ) : null}
      </header>

      <section aria-label="Product summary" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <KpiCard label="Total Products" value={countLabel(kpis.total)} tone="gold" icon={<Boxes className="h-4 w-4" />} />
        <KpiCard label="Active Products" value={countLabel(kpis.active)} tone="positive" icon={<CheckCircle2 className="h-4 w-4" />} />
        <KpiCard label="Inactive Products" value={countLabel(kpis.inactive)} tone="muted" icon={<CircleOff className="h-4 w-4" />} />
        <KpiCard label="In-Stock Products" value={countLabel(kpis.inStock)} tone="positive" icon={<PackageCheck className="h-4 w-4" />} />
        <KpiCard label="Out-of-Stock Products" value={countLabel(kpis.outOfStock)} tone="negative" icon={<PackageX className="h-4 w-4" />} />
      </section>

      {error ? <MasterError message={error} onRetry={load} /> : null}

      <section className="flex flex-col gap-3 rounded-md border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] p-3 shadow-[0_1px_2px_rgba(27,36,48,0.04)]">
        <div className="flex flex-col gap-2 xl:flex-row xl:items-center">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--erp-muted)]" />
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Search product code, product name, brand or collection..."
              aria-label="Search products"
              autoComplete="off"
              spellCheck={false}
              className="h-10 w-full rounded-md border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] pl-9 pr-9 text-sm text-[var(--erp-text)] placeholder:text-[var(--erp-faint)] focus:border-[var(--erp-gold)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--erp-gold)]/35"
            />
            {search ? (
              <button type="button" aria-label="Clear search" onClick={() => setSearch('')} className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-[var(--erp-muted)] hover:bg-[var(--erp-surface-2)] hover:text-[var(--erp-text)]">
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
          <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-2 xl:flex xl:flex-wrap xl:justify-end">
            {selectedEntityId !== 'all' && !lookupsReady ? (
              <div className={`${selectClass} flex items-center text-[var(--erp-muted)] xl:w-52`}>Loading brands…</div>
            ) : selectedEntity && branchBrands.length === 0 ? (
              <div className={`${selectClass} flex items-center text-[var(--erp-muted)] xl:w-64`}>No brands mapped to this branch</div>
            ) : selectedEntity && branchBrands.length === 1 ? (
              <div className={`${selectClass} flex items-center truncate xl:w-64`} aria-label={`Brand filter: ${branchBrands[0].brand_code} · ${branchBrands[0].brand_name}`}>
                {branchBrands[0].brand_code} · {branchBrands[0].brand_name}
              </div>
            ) : (
              <select aria-label="Brand" value={brandFilter} onChange={event => setBrandFilter(event.target.value ? Number(event.target.value) : '')} className={`${selectClass} xl:w-52`}>
                <option value="">All brands</option>
                {branchBrands.map(brand => <option key={brand.id} value={brand.id}>{brand.brand_code} · {brand.brand_name}</option>)}
              </select>
            )}
            {productCategory ? (
              <select aria-label="Category" value={parentFilter} onChange={event => { setParentFilter(event.target.value ? Number(event.target.value) : ''); setSubFilter(''); }} className={`${selectClass} xl:w-48`}>
                <option value="">All categories</option>
                {topLevel.map(category => <option key={category.id} value={category.id}>{category.category_code} · {category.category_name}</option>)}
              </select>
            ) : null}
            {productCategory ? (
              <select aria-label="Subcategory" value={subFilter} onChange={event => setSubFilter(event.target.value ? Number(event.target.value) : '')} disabled={!parentFilter} className={`${selectClass} xl:w-48`}>
                <option value="">All subcategories</option>
                {subsForFilter.map(category => <option key={category.id} value={category.id}>{category.category_code} · {category.category_name}</option>)}
              </select>
            ) : null}
            {collectionOptions.length > 0 ? (
              <select aria-label="Collection" value={collectionFilter} onChange={event => setCollectionFilter(event.target.value)} className={`${selectClass} xl:w-44`}>
                <option value="">All collections</option>
                {collectionOptions.map(name => <option key={name} value={name}>{name}</option>)}
              </select>
            ) : null}
            <select aria-label="Availability" value={availabilityFilter} onChange={event => setAvailabilityFilter(event.target.value)} className={`${selectClass} xl:w-40`}>
              <option value="">All availability</option>
              {PRODUCT_AVAILABILITY.map(item => <option key={item}>{item}</option>)}
            </select>
            <select aria-label="Product status" value={statusFilter} onChange={event => setStatusFilter(event.target.value as '' | ProductStatus)} className={`${selectClass} xl:w-36`}>
              <option value="">All statuses</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>
        </div>
        {hasListFilter ? (
          <div className="flex flex-wrap items-center gap-2">
            {search.trim() ? <FilterChip label={`Search: ${search.trim()}`} onRemove={() => setSearch('')} /> : null}
            {selectedBrand ? <FilterChip label={`${selectedBrand.brand_code} · ${selectedBrand.brand_name}`} onRemove={() => setBrandFilter('')} /> : null}
            {selectedParent ? <FilterChip label={selectedParent.category_name} onRemove={() => { setParentFilter(''); setSubFilter(''); }} /> : null}
            {selectedSub ? <FilterChip label={selectedSub.category_name} onRemove={() => setSubFilter('')} /> : null}
            {collectionFilter ? <FilterChip label={collectionFilter} onRemove={() => setCollectionFilter('')} /> : null}
            {availabilityFilter ? <FilterChip label={availabilityFilter} onRemove={() => setAvailabilityFilter('')} /> : null}
            {statusFilter ? <FilterChip label={statusFilter} onRemove={() => setStatusFilter('')} /> : null}
            <button type="button" onClick={clearFilters} className="h-7 px-1 text-xs font-medium text-[var(--erp-gold)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--erp-gold)]">
              Clear filters
            </button>
          </div>
        ) : null}
        {canWrite && selectedCount > 0 ? (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--erp-gold)]/40 bg-[var(--erp-gold)]/10 px-3 py-2">
            <span className="text-sm font-medium text-[var(--erp-text)]">{selectedCount} selected</span>
            <button type="button" disabled={bulkBusy} onClick={() => void applyStatus('Active')} className={quietBtn}>Active</button>
            <button type="button" disabled={bulkBusy} onClick={() => void applyStatus('Inactive')} className={quietBtn}>Inactive</button>
            {canDeleteSelection ? (
              <button type="button" disabled={bulkBusy} onClick={askBulkDelete} className="inline-flex h-10 items-center rounded-md border border-[var(--erp-negative)] px-3 text-sm text-[var(--erp-negative)] disabled:cursor-not-allowed disabled:opacity-40">Delete</button>
            ) : null}
            <button type="button" onClick={() => setSelectedIds(new Set())} className="ml-auto text-xs text-[var(--erp-muted)] hover:text-[var(--erp-text)]">Clear selection</button>
          </div>
        ) : null}
      </section>

      {!listReady ? (
        <MasterLoading label="Loading products…" />
      ) : sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] px-6 py-16 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-md border border-[var(--erp-hairline)] bg-[var(--erp-surface-2)] text-[var(--erp-gold)]">
            <Boxes className="h-6 w-6" />
          </span>
          <h2 className="font-display text-xl font-semibold text-[var(--erp-text)]">
            {catalogEmpty ? (noMappedBrands ? 'No brands are mapped to this branch.' : 'No products in the product master yet.') : 'No products found'}
          </h2>
          <p className="max-w-md text-sm text-[var(--erp-muted)]">
            {catalogEmpty
              ? (noMappedBrands ? 'Map a brand to this branch before products can be listed here.' : 'Add a product to start the catalog for this branch.')
              : 'Nothing matches the current search or filters. Clear them to see the full product list.'}
          </p>
          <div className="mt-1 flex flex-wrap justify-center gap-2">
            {!catalogEmpty ? <button type="button" onClick={clearFilters} className={quietBtn}>Clear filters</button> : null}
            {canWrite && !noMappedBrands ? (
              <button type="button" onClick={openCreate} className={primaryBtn}>
                <Plus className="h-4 w-4" /> {catalogEmpty ? 'Add first product' : 'Add Product'}
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] shadow-[0_1px_2px_rgba(27,36,48,0.04)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--erp-hairline-strong)]">
                  {canWrite ? <th className={`${headCell} w-12 text-center`}><SelectAllBox checked={allVisibleSelected} indeterminate={pageSelectedCount > 0 && !allVisibleSelected} onChange={toggleAllVisible} /></th> : null}
                  <th className={`${headCell} w-16`}><span className="sr-only">Image</span></th>
                  <th className={headCell} aria-sort={sortKey === 'product_code' ? (sortAsc ? 'ascending' : 'descending') : 'none'}><SortHeader label="Code" column="product_code" {...sortProps} /></th>
                  <th className={headCell} aria-sort={sortKey === 'product_name' ? (sortAsc ? 'ascending' : 'descending') : 'none'}><SortHeader label="Product" column="product_name" {...sortProps} /></th>
                  <th className={headCell} aria-sort={sortKey === 'brand_name' ? (sortAsc ? 'ascending' : 'descending') : 'none'}><SortHeader label="Brand" column="brand_name" {...sortProps} /></th>
                  {productCategory ? <th className={headCell} aria-sort={sortKey === 'category_name' ? (sortAsc ? 'ascending' : 'descending') : 'none'}><SortHeader label="Category" column="category_name" {...sortProps} /></th> : null}
                  <th className={`${headCell} text-right`} aria-sort={sortKey === 'rate' ? (sortAsc ? 'ascending' : 'descending') : 'none'}><SortHeader label="Ex-Mill" column="rate" align="right" {...sortProps} /></th>
                  <th className={`${headCell} text-right`} aria-sort={sortKey === 'frate' ? (sortAsc ? 'ascending' : 'descending') : 'none'}><SortHeader label="W/S" column="frate" align="right" {...sortProps} /></th>
                  <th className={`${headCell} text-right`} aria-sort={sortKey === 'trate' ? (sortAsc ? 'ascending' : 'descending') : 'none'}><SortHeader label="Retail" column="trate" align="right" {...sortProps} /></th>
                  <th className={headCell} aria-sort={sortKey === 'availability' ? (sortAsc ? 'ascending' : 'descending') : 'none'}><SortHeader label="Availability" column="availability" {...sortProps} /></th>
                  <th className={headCell} aria-sort={sortKey === 'status' ? (sortAsc ? 'ascending' : 'descending') : 'none'}><SortHeader label="Status" column="status" {...sortProps} /></th>
                  <th className={`${headCell} w-28 text-right`}><span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-[var(--erp-muted)]">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map(row => {
                  const price = (value: string | number | null | undefined) => formatInr(value);
                  const exMill = price(row.rate) || '—';
                  const wholesale = price(row.frate) || '—';
                  const retail = price(row.trate) || '—';
                  const meta = [row.collection, row.quality].filter(Boolean).join(' · ');
                  const selected = selectedIds.has(row.id);
                  return (
                    <tr key={row.id} className={`border-b border-[var(--erp-hairline)] last:border-b-0 ${selected ? 'bg-[var(--erp-gold)]/10' : 'hover:bg-[var(--erp-surface-2)]/70'}`}>
                      {canWrite ? (
                        <td className="px-3 py-2 text-center">
                          <input type="checkbox" aria-label={`Select ${row.product_name}`} checked={selected} onChange={() => toggleOne(row.id)} className="h-4 w-4 cursor-pointer accent-[var(--erp-gold)]" />
                        </td>
                      ) : null}
                      <td className="px-3 py-2">
                        <ProductThumb src={row.image_url} code={row.product_code} />
                      </td>
                      <td className="px-3 py-2">
                        <span className="font-mono text-[13px] text-[var(--erp-text)]" title={row.product_code}>{row.product_code}</span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="max-w-[280px]">
                          <div className="truncate font-medium text-[var(--erp-text)]" title={row.product_name}>{row.product_name}</div>
                          {meta ? <div className="truncate text-xs text-[var(--erp-muted)]" title={meta}>{meta}</div> : null}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <span className="block max-w-[180px] truncate text-[var(--erp-text)]" title={row.brand_name}>{row.brand_name}</span>
                      </td>
                      {productCategory ? (
                        <td className="px-3 py-2">
                          <span className="block max-w-[200px] truncate text-xs text-[var(--erp-muted)]" title={`${row.parent_category_name || '—'} › ${row.category_name || '—'}`}>
                            {row.parent_category_name || '—'} <span className="text-[var(--erp-faint)]">›</span> {row.category_name || '—'}
                          </span>
                        </td>
                      ) : null}
                      <td className="px-3 py-2 text-right font-mono text-[13px] tabular-nums text-[var(--erp-text)]">{exMill}</td>
                      <td className={`px-3 py-2 text-right font-mono text-[13px] tabular-nums ${wholesale === '—' ? 'text-[var(--erp-faint)]' : 'text-[var(--erp-text)]'}`}>{wholesale}</td>
                      <td className={`px-3 py-2 text-right font-mono text-[13px] tabular-nums ${retail === '—' ? 'text-[var(--erp-faint)]' : 'text-[var(--erp-text)]'}`}>{retail}</td>
                      <td className="px-3 py-2">{availabilityChip(row.availability)}</td>
                      <td className="px-3 py-2">
                        {canWrite ? (
                          <button
                            type="button"
                            aria-label={`Set ${row.product_name} to ${row.status === 'Active' ? 'Inactive' : 'Active'}`}
                            title={`Set to ${row.status === 'Active' ? 'Inactive' : 'Active'}`}
                            onClick={() => setPendingStatus({ row, next: row.status === 'Active' ? 'Inactive' : 'Active' })}
                            className="cursor-pointer rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--erp-gold)]"
                          >
                            <StatusChip status={row.status === 'Active' ? 'active' : 'inactive'} label={row.status} />
                          </button>
                        ) : (
                          <StatusChip status={row.status === 'Active' ? 'active' : 'inactive'} label={row.status} />
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-1">
                          <button type="button" title="View" aria-label={`View ${row.product_name}`} className="inline-flex h-9 w-9 items-center justify-center rounded-md text-[var(--erp-muted)] hover:bg-[var(--erp-surface-2)] hover:text-[var(--erp-gold)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--erp-gold)]" onClick={() => setViewRow(row)}><Eye className="h-4 w-4" /></button>
                          {canWrite ? (
                            <button type="button" title="Edit" aria-label={`Edit ${row.product_name}`} className="inline-flex h-9 w-9 items-center justify-center rounded-md text-[var(--erp-muted)] hover:bg-[var(--erp-surface-2)] hover:text-[var(--erp-gold)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--erp-gold)]" onClick={() => void openEdit(row.id)}><Edit2 className="h-4 w-4" /></button>
                          ) : null}
                          {canWrite && row.status === 'Inactive' ? (
                            <button type="button" title="Delete" aria-label={`Delete ${row.product_name}`} className="inline-flex h-9 w-9 items-center justify-center rounded-md text-[var(--erp-muted)] hover:bg-[var(--erp-negative)]/10 hover:text-[var(--erp-negative)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--erp-negative)]" onClick={() => { setHardDeleteBlock(''); setPendingHardDelete(row); }}><Trash2 className="h-4 w-4" /></button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col gap-3 border-t border-[var(--erp-hairline)] px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-[var(--erp-muted)]">
              Showing {pageStart + 1}–{Math.min(pageStart + pageSize, sorted.length)} of {sorted.length.toLocaleString('en-IN')}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-xs text-[var(--erp-muted)]">
                Rows
                <select
                  aria-label="Rows per page"
                  value={pageSize}
                  onChange={event => setPageSize(Number(event.target.value) as (typeof PAGE_SIZES)[number])}
                  className="h-9 rounded-md border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] px-2 text-sm text-[var(--erp-text)]"
                >
                  {PAGE_SIZES.map(size => <option key={size} value={size}>{size}</option>)}
                </select>
              </label>
              <button type="button" aria-label="Previous page" disabled={currentPage <= 1} onClick={() => setPage(current => Math.max(1, current - 1))} className={quietBtn}>
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="min-w-16 text-center font-mono text-xs text-[var(--erp-text)]">{currentPage} / {pageCount}</span>
              <button type="button" aria-label="Next page" disabled={currentPage >= pageCount} onClick={() => setPage(current => Math.min(pageCount, current + 1))} className={quietBtn}>
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {viewRow ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-md border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] p-5 shadow-[var(--erp-shadow)]" role="dialog" aria-modal="true" aria-labelledby="product-view-title">
            <div className="mb-4 flex items-start justify-between gap-3 border-b border-[var(--erp-hairline)] pb-3">
              <div className="flex min-w-0 items-start gap-3">
                <ProductThumb src={viewRow.image_url} code={viewRow.product_code} />
                <div className="min-w-0">
                  <p className="font-mono text-xs text-[var(--erp-muted)]">{viewRow.product_code}</p>
                  <h3 id="product-view-title" className="truncate font-display text-lg font-semibold text-[var(--erp-text)]">{viewRow.product_name}</h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {availabilityChip(viewRow.availability)}
                    <StatusChip status={viewRow.status === 'Active' ? 'active' : 'inactive'} label={viewRow.status} />
                  </div>
                </div>
              </div>
              <button type="button" aria-label="Close product details" onClick={() => setViewRow(null)} className="inline-flex h-9 w-9 items-center justify-center rounded-md text-[var(--erp-muted)] hover:bg-[var(--erp-surface-2)] hover:text-[var(--erp-text)]"><X className="h-4 w-4" /></button>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div><dt className="text-xs text-[var(--erp-muted)]">Brand</dt><dd>{viewRow.brand_code} · {viewRow.brand_name}</dd></div>
              <div><dt className="text-xs text-[var(--erp-muted)]">Unit</dt><dd>{viewRow.unit || '—'}</dd></div>
              <div><dt className="text-xs text-[var(--erp-muted)]">Ex-mill</dt><dd className="font-mono tabular-nums">{formatInr(viewRow.rate) || '—'}</dd></div>
              <div><dt className="text-xs text-[var(--erp-muted)]">Wholesale</dt><dd className="font-mono tabular-nums">{formatInr(viewRow.frate) || '—'}</dd></div>
              <div><dt className="text-xs text-[var(--erp-muted)]">Retail</dt><dd className="font-mono tabular-nums">{formatInr(viewRow.trate) || '—'}</dd></div>
              {productCategory ? <div><dt className="text-xs text-[var(--erp-muted)]">Category</dt><dd>{viewRow.parent_category_name || '—'} · {viewRow.category_name || '—'}</dd></div> : null}
              {viewRow.collection ? <div><dt className="text-xs text-[var(--erp-muted)]">Collection</dt><dd>{viewRow.collection}</dd></div> : null}
              {viewRow.quality ? <div><dt className="text-xs text-[var(--erp-muted)]">Quality</dt><dd>{viewRow.quality}</dd></div> : null}
              {viewRow.design ? <div><dt className="text-xs text-[var(--erp-muted)]">Design</dt><dd>{viewRow.design}</dd></div> : null}
              {viewRow.colour ? <div><dt className="text-xs text-[var(--erp-muted)]">Colour</dt><dd>{viewRow.colour}</dd></div> : null}
              <div className="col-span-2">
                <dt className="text-xs text-[var(--erp-muted)]">Shades</dt>
                <ShadeList lines={viewRow.shades} />
              </div>
            </dl>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setViewRow(null)} className={quietBtn}>Close</button>
              {canWrite ? (
                <button type="button" onClick={() => { const id = viewRow.id; setViewRow(null); void openEdit(id); }} className={primaryBtn}>Edit</button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {modalOpen && canWrite ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
          <form noValidate onSubmit={save} role="dialog" aria-modal="true" aria-labelledby="product-form-title" className="max-h-[90vh] w-full max-w-3xl space-y-6 overflow-y-auto rounded-md border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] p-6 shadow-[var(--erp-shadow)]">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-[var(--erp-hairline)] bg-[var(--erp-surface)] pb-3">
              <div>
                <h3 id="product-form-title" className="font-display text-lg font-bold text-[var(--erp-text)]">{form.id ? 'Edit Product' : 'Add Product'}</h3>
                <p className="mt-1 text-xs text-[var(--erp-muted)]">Product code, name, and brand are required before the record can be saved.</p>
              </div>
              <button type="button" aria-label="Close product form" onClick={() => setModalOpen(false)} className="inline-flex h-9 w-9 items-center justify-center rounded-md text-[var(--erp-muted)] hover:bg-[var(--erp-surface-2)] hover:text-[var(--erp-text)]"><X className="h-4 w-4" /></button>
            </div>
            <RequiredLegend />
            {form.id && currentPrice ? (
              <div className="rounded-md border border-[var(--erp-gold)]/35 bg-[var(--erp-gold)]/5 px-4 py-3 text-sm">
                <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--erp-muted)]">Current Price</div>
                <div className="mt-1 font-display font-bold text-[var(--erp-gold)]">₹{num(currentPrice.price).toFixed(2)} / meter</div>
                <div className="text-xs text-[var(--erp-muted)]">Source: {currentPrice.source}{currentPrice.season_label ? ` · ${currentPrice.season_label}` : ''}</div>
              </div>
            ) : null}
            <section className="rounded-md border border-[var(--erp-hairline)] p-4">
              <h4 className={sectionTitle}>Identity</h4>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <TextInput
                  ref={codeRef}
                  label="Product code"
                  mono
                  required
                  error={fieldMessages.product_code}
                  invalid={fieldErrors.includes('product_code')}
                  value={form.product_code || ''}
                  onChange={event => {
                    setForm({ ...form, product_code: event.target.value.toUpperCase() });
                    setFieldErrors(prev => prev.filter(field => field !== 'product_code'));
                    setFieldMessages(prev => clearFieldMessage(prev, 'product_code'));
                  }}
                />
                <TextInput
                  label="Product name"
                  required
                  error={fieldMessages.product_name}
                  invalid={fieldErrors.includes('product_name')}
                  value={form.product_name || ''}
                  onChange={event => {
                    setForm({ ...form, product_name: event.target.value });
                    setFieldErrors(prev => prev.filter(field => field !== 'product_name'));
                    setFieldMessages(prev => clearFieldMessage(prev, 'product_name'));
                  }}
                />
                <TextInput
                  label="Client item code"
                  mono
                  value={form.client_item_code || ''}
                  onChange={event => setForm({ ...form, client_item_code: event.target.value })}
                />
                <div className="sm:col-span-2">
                  <TextInput
                    label="Print name"
                    value={form.print_name || ''}
                    onChange={event => setForm({ ...form, print_name: event.target.value })}
                  />
                </div>
                <FormField label="Brand" required error={fieldMessages.brand_id}>
                  {soleBrand ? (
                    <div className={`${selectClass} flex items-center`} aria-label={`Brand ${soleBrand.brand_code} · ${soleBrand.brand_name}`}>
                      {soleBrand.brand_code} · {soleBrand.brand_name}
                    </div>
                  ) : (
                    <select
                      value={form.brand_id || ''}
                      onChange={event => {
                        setForm({ ...form, brand_id: event.target.value ? Number(event.target.value) : undefined });
                        setFieldErrors(prev => prev.filter(field => field !== 'brand_id'));
                        setFieldMessages(prev => clearFieldMessage(prev, 'brand_id'));
                      }}
                      aria-invalid={!!fieldMessages.brand_id || fieldErrors.includes('brand_id') || undefined}
                      className={`${selectClass} ${fieldMessages.brand_id || fieldErrors.includes('brand_id') ? 'border-[var(--erp-negative)]' : ''}`}
                    >
                      <option value="">Select brand…</option>
                      {formBrandOptions.map(brand => (
                        <option key={brand.id} value={brand.id}>{brand.brand_code} · {brand.brand_name}</option>
                      ))}
                    </select>
                  )}
                </FormField>
                {productCategory ? (
                  <>
                    <FormField label="Category">
                      <select value={formParentId} onChange={event => { const value = event.target.value ? Number(event.target.value) : ''; setFormParentId(value); setForm({ ...form, category_id: undefined }); setFieldMessages(prev => clearFieldMessage(prev, 'category_id')); }} className={selectClass}>
                        <option value="">Select category…</option>
                        {topLevel.filter(category => category.status === 'Active' || category.id === formParentId).map(category => (
                          <option key={category.id} value={category.id}>{category.category_code} · {category.category_name}</option>
                        ))}
                      </select>
                    </FormField>
                    <FormField label="Subcategory" required error={fieldMessages.category_id} className="sm:col-span-2">
                      <select
                        value={form.category_id || ''}
                        onChange={event => {
                          setForm({ ...form, category_id: event.target.value ? Number(event.target.value) : undefined });
                          setFieldErrors(prev => prev.filter(field => field !== 'category_id'));
                          setFieldMessages(prev => clearFieldMessage(prev, 'category_id'));
                        }}
                        disabled={!formParentId}
                        aria-invalid={!!fieldMessages.category_id || fieldErrors.includes('category_id') || undefined}
                        className={`${selectClass} ${fieldMessages.category_id || fieldErrors.includes('category_id') ? 'border-[var(--erp-negative)]' : ''}`}
                      >
                        <option value="">Select subcategory…</option>
                        {subsForForm.filter(category => category.status === 'Active' || category.id === form.category_id).map(category => (
                          <option key={category.id} value={category.id}>{category.category_code} · {category.category_name}</option>
                        ))}
                      </select>
                    </FormField>
                  </>
                ) : null}
              </div>
            </section>

            <section className="rounded-md border border-[var(--erp-hairline)] p-4">
              <h4 className={sectionTitle}>Attributes</h4>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <TextInput label="Design" value={form.design || ''} onChange={event => setForm({ ...form, design: event.target.value })} />
                <TextInput label="Colour" value={form.colour || ''} onChange={event => setForm({ ...form, colour: event.target.value })} />
                <TextInput label="Quality" value={form.quality || ''} onChange={event => setForm({ ...form, quality: event.target.value })} />
                <TextInput label="Width / size" value={form.width_size || ''} onChange={event => setForm({ ...form, width_size: event.target.value })} />
                <label className="flex flex-col gap-1 text-xs text-[var(--erp-muted)]">Unit
                  <select value={form.unit || 'Meter'} onChange={event => setForm({ ...form, unit: event.target.value })} className={selectClass}>
                    {PRODUCT_UNITS.map(unit => <option key={unit}>{unit}</option>)}
                  </select>
                </label>
                <TextInput label="Season" value={form.season || ''} onChange={event => setForm({ ...form, season: event.target.value })} />
                <TextInput label="Collection" value={form.collection || ''} onChange={event => setForm({ ...form, collection: event.target.value })} />
                <TextInput label="Product type" value={form.product_type || ''} onChange={event => setForm({ ...form, product_type: event.target.value })} />
                <TextInput label="Group" value={form.group || ''} onChange={event => setForm({ ...form, group: event.target.value })} />
                <FormField label="Description" className="sm:col-span-2">
                  <textarea
                    value={form.description || ''}
                    onChange={event => setForm({ ...form, description: event.target.value })}
                    rows={3}
                    className="rounded-md border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] px-3 py-2 text-sm text-[var(--erp-text)] focus:border-[var(--erp-gold)] focus:outline-none"
                  />
                </FormField>
              </div>
            </section>

            <section className="rounded-md border border-[var(--erp-hairline)] p-4">
              <h4 className={sectionTitle}>Commercial</h4>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <TextInput label="Ex-Mill (₹)" mono helper="Zero is a real price." value={String(form.rate ?? 0)} onChange={event => setForm({ ...form, rate: event.target.value })} />
                <TextInput label="W/S (₹)" mono helper="Leave blank when wholesale is not set." value={form.frate == null ? '' : String(form.frate)} onChange={event => setForm({ ...form, frate: event.target.value })} />
                <TextInput label="Retail (₹)" mono helper="Leave blank when retail is not set." value={form.trate == null ? '' : String(form.trate)} onChange={event => setForm({ ...form, trate: event.target.value })} />
              </div>
            </section>

            <section className="rounded-md border border-[var(--erp-hairline)] p-4">
              <h4 className={sectionTitle}>Image</h4>
              <div className="flex items-start gap-4">
                <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface-2)]">
                  {imagePreview ? <img src={imagePreview} alt="" className="h-full w-full object-cover" /> : <ImageIcon className="h-6 w-6 text-[var(--erp-muted)]" />}
                </div>
                <FileDropZone
                  className="flex-1"
                  label="Upload image"
                  helper="PNG, JPG, WebP or GIF"
                  accept="image/*"
                  file={imageFile}
                  onChange={next => {
                    setImageFile(next);
                    setImagePreview(next ? URL.createObjectURL(next) : (form.image_url || ''));
                  }}
                />
              </div>
            </section>

            <section className="rounded-md border border-[var(--erp-hairline)] p-4">
              <h4 className={sectionTitle}>Availability</h4>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs text-[var(--erp-muted)]">Availability
                  <select value={form.availability || 'In Stock'} onChange={event => setForm({ ...form, availability: event.target.value })} className={selectClass}>
                    {PRODUCT_AVAILABILITY.map(item => <option key={item}>{item}</option>)}
                  </select>
                </label>
              </div>
            </section>

            <div className="sticky bottom-0 -mx-6 flex justify-end gap-3 border-t border-[var(--erp-hairline)] bg-[var(--erp-surface)] px-6 py-4">
              <button type="button" onClick={() => setModalOpen(false)} disabled={saving} className={quietBtn}>Cancel</button>
              <button type="submit" disabled={saving} className={primaryBtn}>{saving ? 'Saving…' : 'Save Product'}</button>
            </div>
          </form>
        </div>
      ) : null}

      <ConfirmDialog
        open={!!pendingStatus}
        entityType="product"
        entityLabel={pendingStatus ? `${pendingStatus.row.product_name} (${pendingStatus.row.product_code})` : ''}
        title={pendingStatus?.next === 'Inactive' ? 'Set product to Inactive?' : 'Set product to Active?'}
        message={pendingStatus ? `${pendingStatus.row.product_name} (${pendingStatus.row.product_code}) will be set to ${pendingStatus.next}.` : ''}
        confirmLabel={pendingStatus?.next === 'Inactive' ? 'Inactive' : 'Active'}
        busyLabel="Saving…"
        confirmTone={pendingStatus?.next === 'Active' ? 'gold' : 'danger'}
        onCancel={() => setPendingStatus(null)}
        onConfirm={async () => {
          if (!pendingStatus) return;
          try {
            await productsApi.setStatus(pendingStatus.row.id, pendingStatus.next);
            notifySuccess(`${pendingStatus.row.product_name} set to ${pendingStatus.next}.`);
            setPendingStatus(null);
            await load();
          } catch (err) {
            notifyApiError(err);
          }
        }}
      />

      <ConfirmDialog
        open={!!pendingHardDelete}
        entityType="product"
        entityLabel={pendingHardDelete ? `${pendingHardDelete.product_name} (${pendingHardDelete.product_code})` : ''}
        title={hardDeleteBlock ? 'Cannot delete product' : 'Delete product?'}
        message={
          hardDeleteBlock
          || (pendingHardDelete
            ? `Delete ${pendingHardDelete.product_name} (${pendingHardDelete.product_code})? This cannot be undone.`
            : '')
        }
        confirmLabel={hardDeleteBlock ? 'Understood' : 'Delete'}
        busyLabel={hardDeleteBlock ? 'Understood' : 'Deleting…'}
        confirmTone="critical"
        onCancel={() => { setPendingHardDelete(null); setHardDeleteBlock(''); }}
        onConfirm={async () => {
          if (!pendingHardDelete) return;
          if (hardDeleteBlock) {
            setPendingHardDelete(null);
            setHardDeleteBlock('');
            return;
          }
          try {
            await productsApi.removePermanent(pendingHardDelete.id);
            notifySuccess(`${pendingHardDelete.product_name} (${pendingHardDelete.product_code}) deleted.`);
            setPendingHardDelete(null);
            await load();
          } catch (err) {
            const status = (err as { status?: number }).status;
            if (status === 409 || status === 400) {
              setHardDeleteBlock(parseApiErrorDetails(err).message);
              return;
            }
            notifyApiError(err);
          }
        }}
      />

      <ConfirmDialog
        open={!!pendingBulkDelete}
        entityType="product"
        entityLabel={pendingBulkDelete ? `${pendingBulkDelete.length} selected` : ''}
        title={bulkDeleteBlock ? 'Cannot delete products' : 'Delete products?'}
        message={
          bulkDeleteBlock
          || (pendingBulkDelete
            ? (() => {
              const inactive = pendingBulkDelete.filter(row => row.status === 'Inactive');
              const activeCount = pendingBulkDelete.length - inactive.length;
              const names = inactive.map(row => row.product_name).slice(0, 8).join(', ');
              const extra = inactive.length > 8 ? ` and ${inactive.length - 8} more` : '';
              const staying = activeCount
                ? ` ${activeCount} active product${activeCount === 1 ? '' : 's'} in this selection will stay.`
                : '';
              return `Delete ${inactive.length} product${inactive.length === 1 ? '' : 's'} (${names}${extra})? This cannot be undone.${staying}`;
            })()
            : '')
        }
        confirmLabel={bulkDeleteBlock ? 'Understood' : 'Delete'}
        busyLabel={bulkDeleteBlock ? 'Understood' : 'Deleting…'}
        confirmTone="critical"
        onCancel={() => { setPendingBulkDelete(null); setBulkDeleteBlock(''); }}
        onConfirm={async () => {
          if (!pendingBulkDelete) return;
          if (bulkDeleteBlock) {
            setPendingBulkDelete(null);
            setBulkDeleteBlock('');
            return;
          }
          const inactive = pendingBulkDelete.filter(row => row.status === 'Inactive');
          const outcomes = await Promise.all(inactive.map(async row => {
            try {
              await productsApi.removePermanent(row.id);
              return { ok: true as const, id: row.id };
            } catch (err) {
              return { ok: false as const, id: row.id, message: parseApiErrorDetails(err).message };
            }
          }));
          const removedIds = outcomes.filter(item => item.ok).map(item => item.id);
          const failed = outcomes.filter(item => !item.ok);
          if (removedIds.length) {
            const failedIds = new Set(failed.map(item => item.id));
            setSelectedIds(prev => new Set([...prev].filter(id => failedIds.has(id))));
            notifySuccess(`${removedIds.length} product${removedIds.length === 1 ? '' : 's'} deleted.`);
            await load();
          }
          if (failed.length) {
            setBulkDeleteBlock(failed.map(item => item.message).join(' '));
            return;
          }
          setPendingBulkDelete(null);
        }}
      />
    </div>
  );
};
