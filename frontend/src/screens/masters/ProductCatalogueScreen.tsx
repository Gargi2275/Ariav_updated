import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Edit2, Eye, ImageIcon, Plus, Search, Trash2, X } from 'lucide-react';
import { useErp } from '../../context/ErpContext';
import { PageHeader } from '../../components/common/PageHeader';
import { DataTable, Column } from '../../components/common/DataTable';
import { StatusChip } from '../../components/common/StatusChip';
import { TextInput, FormField, RequiredLegend } from '../../components/common/FormControls';
import { FileDropZone } from '../../components/common/FileDropZone';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { MasterError, MasterLoading, emptyTableProps } from './MasterStatus';
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
  if (value === 'In Stock') return <StatusChip status="active" label="IN STOCK" />;
  if (value === 'Out of Stock') return <StatusChip status="overdue" label="OUT OF STOCK" />;
  return <StatusChip status="inactive" label="DISCONTINUED" />;
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

  const filtered = rows.filter(r => {
    if (selectedEntity && !branchBrands.some(brand => brand.id === r.brand_id)) {
      return false;
    }
    const q = search.toLowerCase().trim();
    return !q
      || r.product_code.toLowerCase().includes(q)
      || r.product_name.toLowerCase().includes(q)
      || r.design.toLowerCase().includes(q)
      || r.colour.toLowerCase().includes(q)
      || (r.quality || '').toLowerCase().includes(q)
      || (r.client_item_code || '').toLowerCase().includes(q)
      || (r.collection || '').toLowerCase().includes(q);
  });

  const selectedRows = filtered.filter(row => selectedIds.has(row.id));
  const selectedCount = selectedRows.length;
  const allVisibleSelected = filtered.length > 0 && selectedCount === filtered.length;
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
      if (filtered.every(row => next.has(row.id))) filtered.forEach(row => next.delete(row.id));
      else filtered.forEach(row => next.add(row.id));
      return next;
    });
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

  const columns: Column<ProductRow>[] = [
    ...(canWrite ? [{
      header: (
        <input
          type="checkbox"
          aria-label="Select all products"
          checked={allVisibleSelected}
          ref={element => { if (element) element.indeterminate = selectedCount > 0 && !allVisibleSelected; }}
          onClick={event => event.stopPropagation()}
          onChange={toggleAllVisible}
          className="cursor-pointer accent-[var(--erp-gold)]"
        />
      ),
      width: '36px',
      align: 'center' as const,
      render: (row: ProductRow) => (
        <input
          type="checkbox"
          aria-label={`Select ${row.product_name}`}
          checked={selectedIds.has(row.id)}
          onClick={event => event.stopPropagation()}
          onChange={() => toggleOne(row.id)}
          className="cursor-pointer accent-[var(--erp-gold)]"
        />
      ),
    }] : []),
    {
      header: '',
      width: '52px',
      render: r => r.image_url ? (
        <img src={r.image_url} alt="" className="w-9 h-9 object-cover border border-[var(--erp-hairline)]" />
      ) : (
        <span className="w-9 h-9 flex items-center justify-center border border-[var(--erp-hairline)] text-[var(--erp-muted)]"><ImageIcon className="w-3.5 h-3.5" /></span>
      ),
    },
    { header: 'Code', accessorKey: 'product_code', mono: true, width: '100px', render: r => <span className="font-mono text-[var(--erp-gold)]">{r.product_code}</span> },
    { header: 'Name', accessorKey: 'product_name', render: r => <span className="font-medium">{r.product_name}</span> },
    { header: 'Brand', accessorKey: 'brand_name', width: '120px' },
    ...(productCategory ? [{
      header: 'Category',
      render: (r: ProductRow) => (
        <span className="font-mono text-[11px] text-[var(--erp-muted)]">
          {r.parent_category_name || '—'} <span className="text-[var(--erp-faint)]">›</span> {r.category_name || '—'}
        </span>
      ),
    }] : []),
    { header: 'Ex-Mill', accessorKey: 'rate', align: 'right', mono: true, width: '90px', render: r => <span>₹{num(r.rate).toFixed(2)}</span> },
    { header: 'W/S', align: 'right', mono: true, width: '90px', render: r => <span>{r.frate == null || r.frate === '' ? '—' : `₹${num(r.frate).toFixed(2)}`}</span> },
    { header: 'Retail', align: 'right', mono: true, width: '90px', render: r => <span>{r.trate == null || r.trate === '' ? '—' : `₹${num(r.trate).toFixed(2)}`}</span> },
    { header: 'Availability', width: '130px', render: r => availabilityChip(r.availability) },
    {
      header: 'Status',
      width: '110px',
      align: 'center',
      render: r => {
        const chip = <StatusChip status={r.status === 'Active' ? 'active' : 'inactive'} label={r.status.toUpperCase()} />;
        if (!canWrite) return chip;
        const next: ProductStatus = r.status === 'Active' ? 'Inactive' : 'Active';
        return (
          <button type="button" aria-label={`Set ${r.product_name} to ${next}`} title={`Set to ${next}`} onClick={() => setPendingStatus({ row: r, next })} className="cursor-pointer">
            {chip}
          </button>
        );
      },
    },
    {
      header: '',
      align: 'right',
      width: '108px',
      render: r => (
        <div className="flex justify-end items-center gap-1">
          <button type="button" title="View" aria-label={`View ${r.product_name}`} className="p-1 text-[var(--erp-muted)] hover:text-[var(--erp-gold)] cursor-pointer" onClick={() => setViewRow(r)}><Eye className="w-3.5 h-3.5" /></button>
          {canWrite ? (
            <button type="button" title="Edit" aria-label={`Edit ${r.product_name}`} className="p-1 text-[var(--erp-muted)] hover:text-[var(--erp-gold)] cursor-pointer" onClick={() => void openEdit(r.id)}><Edit2 className="w-3.5 h-3.5" /></button>
          ) : null}
          {canWrite && r.status === 'Inactive' && (
            <button type="button" title="Delete" aria-label={`Delete ${r.product_name}`} className="p-1 text-[var(--erp-muted)] hover:text-[var(--erp-negative)] cursor-pointer" onClick={() => { setHardDeleteBlock(''); setPendingHardDelete(r); }}><Trash2 className="w-3.5 h-3.5" /></button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="p-6 flex flex-col gap-6 text-left">
      <PageHeader
        moduleNumber="39"
        section="Masters"
        title="Product Catalogue"
        subtitle={productCategory ? 'Brand SKUs under Category → Subcategory, with rate and availability' : 'Brand SKUs with rate and availability'}
        actions={
          canWrite ? (
            <button type="button" onClick={openCreate} className="px-4 py-1.5 bg-[var(--erp-gold)] text-[#0F141B] font-body text-xs font-semibold flex items-center gap-1.5 cursor-pointer">
              <Plus className="w-3.5 h-3.5" /> Add Product
            </button>
          ) : undefined
        }
      />
      {error && <MasterError message={error} onRetry={load} />}
      <div className="flex flex-col gap-3 bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] p-3">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          <div className="relative w-full lg:w-96">
            <Search className="w-4 h-4 text-[var(--erp-muted)] absolute left-3 top-2.5" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder={productCategory ? 'Search code, name, design or colour…' : 'Search code, name, quality or collection…'} className="w-full pl-9 pr-3 py-1.5 text-xs bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)] focus:border-[var(--erp-gold)] focus:outline-none font-mono" />
          </div>
          {canWrite && selectedCount > 0 && (
            <div className="flex flex-wrap items-center justify-end gap-2 font-mono text-xs">
              <span className="text-[var(--erp-muted)]">{selectedCount} selected</span>
              <button type="button" disabled={!selectedCount || bulkBusy} onClick={() => void applyStatus('Active')} className="px-3 py-1 border border-[var(--erp-gold)] text-[var(--erp-gold)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">Active</button>
              <button type="button" disabled={!selectedCount || bulkBusy} onClick={() => void applyStatus('Inactive')} className="px-3 py-1 border border-[var(--erp-hairline-strong)] text-[var(--erp-text)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">Inactive</button>
              {canDeleteSelection && (
                <button type="button" disabled={bulkBusy} onClick={askBulkDelete} className="px-3 py-1 border border-[var(--erp-negative)] text-[var(--erp-negative)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">Delete</button>
              )}
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {selectedEntityId !== 'all' && !lookupsReady ? (
            <div className="px-2 py-1.5 text-xs font-mono bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-muted)]">
              Loading brands…
            </div>
          ) : selectedEntity && branchBrands.length === 0 ? (
            <div className="px-2 py-1.5 text-xs font-mono bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-muted)]">
              No brands mapped to this branch
            </div>
          ) : selectedEntity && branchBrands.length === 1 ? (
            <div
              className="px-2 py-1.5 text-xs font-mono bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)]"
              aria-label={`Brand filter: ${branchBrands[0].brand_code} · ${branchBrands[0].brand_name}`}
            >
              {branchBrands[0].brand_code} · {branchBrands[0].brand_name}
            </div>
          ) : (
            <select value={brandFilter} onChange={e => setBrandFilter(e.target.value ? Number(e.target.value) : '')} className="px-2 py-1.5 text-xs font-mono bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)]">
              <option value="">All brands</option>
              {branchBrands.map(b => <option key={b.id} value={b.id}>{b.brand_code} · {b.brand_name}</option>)}
            </select>
          )}
          {productCategory ? <select value={parentFilter} onChange={e => { setParentFilter(e.target.value ? Number(e.target.value) : ''); setSubFilter(''); }} className="px-2 py-1.5 text-xs font-mono bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)]">
            <option value="">All categories</option>
            {topLevel.map(c => <option key={c.id} value={c.id}>{c.category_code} · {c.category_name}</option>)}
          </select> : null}
          {productCategory ? <select value={subFilter} onChange={e => setSubFilter(e.target.value ? Number(e.target.value) : '')} disabled={!parentFilter} className="px-2 py-1.5 text-xs font-mono bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)] disabled:opacity-50">
            <option value="">All subcategories</option>
            {subsForFilter.map(c => <option key={c.id} value={c.id}>{c.category_code} · {c.category_name}</option>)}
          </select> : null}
          <select value={availabilityFilter} onChange={e => setAvailabilityFilter(e.target.value)} className="px-2 py-1.5 text-xs font-mono bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)]">
            <option value="">All availability</option>
            {PRODUCT_AVAILABILITY.map(a => <option key={a}>{a}</option>)}
          </select>
        </div>
      </div>

      {loading || (selectedEntityId !== 'all' && !lookupsReady) ? (
        <MasterLoading label="Loading products…" />
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          keyExtractor={r => r.id}
          {...emptyTableProps(
            selectedEntity
              ? rows.filter(row => branchBrands.some(brand => brand.id === row.brand_id)).length
              : rows.length,
            filtered.length,
            brandFilter || subFilter || availabilityFilter
              ? 'No products match this filter.'
              : selectedEntity && branchBrands.length === 0
                ? 'No brands are mapped to this branch.'
                : 'No products in the catalogue yet.',
            'No products match this filter.',
            canWrite ? 'Add first product' : '',
            canWrite ? openCreate : () => undefined,
          )}
        />
      )}

      {viewRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] p-5" role="dialog" aria-modal="true" aria-labelledby="product-view-title">
            <div className="mb-4 flex items-start justify-between gap-3 border-b border-[var(--erp-hairline)] pb-3">
              <div>
                <p className="font-mono text-xs text-[var(--erp-gold)]">{viewRow.product_code}</p>
                <h3 id="product-view-title" className="font-display text-lg font-semibold text-[var(--erp-text)]">{viewRow.product_name}</h3>
              </div>
              <button type="button" aria-label="Close product details" onClick={() => setViewRow(null)} className="text-[var(--erp-muted)] hover:text-[var(--erp-text)]"><X className="h-4 w-4" /></button>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div><dt className="text-xs text-[var(--erp-muted)]">Brand</dt><dd>{viewRow.brand_code} · {viewRow.brand_name}</dd></div>
              <div><dt className="text-xs text-[var(--erp-muted)]">Status</dt><dd>{viewRow.status}</dd></div>
              <div><dt className="text-xs text-[var(--erp-muted)]">Ex-mill</dt><dd className="font-mono">₹{num(viewRow.rate).toFixed(2)}</dd></div>
              <div><dt className="text-xs text-[var(--erp-muted)]">Wholesale</dt><dd className="font-mono">{viewRow.frate == null || viewRow.frate === '' ? '—' : `₹${num(viewRow.frate).toFixed(2)}`}</dd></div>
              <div><dt className="text-xs text-[var(--erp-muted)]">Retail</dt><dd className="font-mono">{viewRow.trate == null || viewRow.trate === '' ? '—' : `₹${num(viewRow.trate).toFixed(2)}`}</dd></div>
              <div><dt className="text-xs text-[var(--erp-muted)]">Unit</dt><dd>{viewRow.unit || '—'}</dd></div>
              <div><dt className="text-xs text-[var(--erp-muted)]">Availability</dt><dd>{viewRow.availability || '—'}</dd></div>
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
              <button type="button" onClick={() => setViewRow(null)} className="h-9 border border-[var(--erp-hairline)] px-3 text-xs text-[var(--erp-muted)]">Close</button>
              {canWrite ? (
                <button type="button" onClick={() => { const id = viewRow.id; setViewRow(null); void openEdit(id); }} className="h-9 bg-[var(--erp-gold)] px-3 text-xs font-semibold text-[#1B2430]">Edit</button>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {modalOpen && canWrite && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <form noValidate onSubmit={save} className="w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] p-6 space-y-6">
            <div className="flex justify-between border-b border-[var(--erp-hairline)] pb-3 sticky top-0 bg-[var(--erp-surface)] z-10">
              <h3 className="font-display text-lg font-bold">{form.id ? 'Edit Product' : 'Add Product'}</h3>
              <button type="button" onClick={() => setModalOpen(false)}><X className="w-4 h-4" /></button>
            </div>
            <RequiredLegend />
            {form.id && currentPrice && (
              <div className="border border-[var(--erp-gold)]/35 bg-[var(--erp-gold)]/5 px-4 py-3 text-sm">
                <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--erp-muted)]">Current Price</div>
                <div className="mt-1 font-display font-bold text-[var(--erp-gold)]">₹{num(currentPrice.price).toFixed(2)} / meter</div>
                <div className="text-xs text-[var(--erp-muted)]">Source: {currentPrice.source}{currentPrice.season_label ? ` · ${currentPrice.season_label}` : ''}</div>
              </div>
            )}
            <section>
              <h4 className={sectionTitle}>Identity</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <TextInput
                  ref={codeRef}
                  label="Product code"
                  mono
                  required
                  error={fieldMessages.product_code}
                  invalid={fieldErrors.includes('product_code')}
                  value={form.product_code || ''}
                  onChange={e => {
                    setForm({ ...form, product_code: e.target.value.toUpperCase() });
                    setFieldErrors(prev => prev.filter(f => f !== 'product_code'));
                    setFieldMessages(prev => clearFieldMessage(prev, 'product_code'));
                  }}
                />
                <TextInput
                  label="Product name"
                  required
                  error={fieldMessages.product_name}
                  invalid={fieldErrors.includes('product_name')}
                  value={form.product_name || ''}
                  onChange={e => {
                    setForm({ ...form, product_name: e.target.value });
                    setFieldErrors(prev => prev.filter(f => f !== 'product_name'));
                    setFieldMessages(prev => clearFieldMessage(prev, 'product_name'));
                  }}
                />
                <TextInput
                  label="Client item code"
                  mono
                  value={form.client_item_code || ''}
                  onChange={e => setForm({ ...form, client_item_code: e.target.value })}
                />
                <div className="sm:col-span-2">
                  <TextInput
                    label="Print name"
                    value={form.print_name || ''}
                    onChange={e => setForm({ ...form, print_name: e.target.value })}
                  />
                </div>
                <FormField label="Brand" required error={fieldMessages.brand_id}>
                  {soleBrand ? (
                    <div
                      className="px-3 py-2 text-sm bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] text-[var(--erp-text)]"
                      aria-label={`Brand ${soleBrand.brand_code} · ${soleBrand.brand_name}`}
                    >
                      {soleBrand.brand_code} · {soleBrand.brand_name}
                    </div>
                  ) : (
                    <select
                      value={form.brand_id || ''}
                      onChange={e => {
                        setForm({ ...form, brand_id: e.target.value ? Number(e.target.value) : undefined });
                        setFieldErrors(prev => prev.filter(f => f !== 'brand_id'));
                        setFieldMessages(prev => clearFieldMessage(prev, 'brand_id'));
                      }}
                      aria-invalid={!!fieldMessages.brand_id || fieldErrors.includes('brand_id') || undefined}
                      className={`px-3 py-2 text-sm bg-[var(--erp-surface)] border text-[var(--erp-text)] ${fieldMessages.brand_id || fieldErrors.includes('brand_id') ? 'border-[var(--erp-negative)]' : 'border-[var(--erp-hairline-strong)]'}`}
                    >
                      <option value="">Select brand…</option>
                      {formBrandOptions.map(b => (
                        <option key={b.id} value={b.id}>{b.brand_code} · {b.brand_name}</option>
                      ))}
                    </select>
                  )}
                </FormField>
                {productCategory ? <>
                <FormField label="Category">
                  <select value={formParentId} onChange={e => { const v = e.target.value ? Number(e.target.value) : ''; setFormParentId(v); setForm({ ...form, category_id: undefined }); setFieldMessages(prev => clearFieldMessage(prev, 'category_id')); }} className="px-3 py-2 text-sm bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] text-[var(--erp-text)]">
                    <option value="">Select category…</option>
                    {topLevel.filter(c => c.status === 'Active' || c.id === formParentId).map(c => (
                      <option key={c.id} value={c.id}>{c.category_code} · {c.category_name}</option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Subcategory" required error={fieldMessages.category_id} className="sm:col-span-2">
                  <select
                    value={form.category_id || ''}
                    onChange={e => {
                      setForm({ ...form, category_id: e.target.value ? Number(e.target.value) : undefined });
                      setFieldErrors(prev => prev.filter(f => f !== 'category_id'));
                      setFieldMessages(prev => clearFieldMessage(prev, 'category_id'));
                    }}
                    disabled={!formParentId}
                    aria-invalid={!!fieldMessages.category_id || fieldErrors.includes('category_id') || undefined}
                    className={`px-3 py-2 text-sm bg-[var(--erp-surface)] border text-[var(--erp-text)] disabled:opacity-50 ${fieldMessages.category_id || fieldErrors.includes('category_id') ? 'border-[var(--erp-negative)]' : 'border-[var(--erp-hairline-strong)]'}`}
                  >
                    <option value="">Select subcategory…</option>
                    {subsForForm.filter(c => c.status === 'Active' || c.id === form.category_id).map(c => (
                      <option key={c.id} value={c.id}>{c.category_code} · {c.category_name}</option>
                    ))}
                  </select>
                </FormField>
                </> : null}
              </div>
            </section>

            <section>
              <h4 className={sectionTitle}>Attributes</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <TextInput label="Design" value={form.design || ''} onChange={e => setForm({ ...form, design: e.target.value })} />
                <TextInput label="Colour" value={form.colour || ''} onChange={e => setForm({ ...form, colour: e.target.value })} />
                <TextInput label="Quality" value={form.quality || ''} onChange={e => setForm({ ...form, quality: e.target.value })} />
                <TextInput label="Width / size" value={form.width_size || ''} onChange={e => setForm({ ...form, width_size: e.target.value })} />
                <label className="flex flex-col gap-1 text-xs text-[var(--erp-muted)]">Unit
                  <select value={form.unit || 'Meter'} onChange={e => setForm({ ...form, unit: e.target.value })} className="px-3 py-2 text-sm bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] text-[var(--erp-text)]">
                    {PRODUCT_UNITS.map(u => <option key={u}>{u}</option>)}
                  </select>
                </label>
                <TextInput label="Season" value={form.season || ''} onChange={e => setForm({ ...form, season: e.target.value })} />
                <TextInput label="Collection" value={form.collection || ''} onChange={e => setForm({ ...form, collection: e.target.value })} />
                <TextInput label="Product type" value={form.product_type || ''} onChange={e => setForm({ ...form, product_type: e.target.value })} />
                <TextInput label="Group" value={form.group || ''} onChange={e => setForm({ ...form, group: e.target.value })} />
                <FormField label="Description" className="sm:col-span-2">
                  <textarea
                    value={form.description || ''}
                    onChange={e => setForm({ ...form, description: e.target.value })}
                    rows={3}
                    className="px-3 py-2 text-sm bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] text-[var(--erp-text)] focus:outline-none focus:border-[var(--erp-gold)] rounded-none"
                  />
                </FormField>
              </div>
            </section>

            <section>
              <h4 className={sectionTitle}>Commercial</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <TextInput label="Ex-Mill (₹)" mono value={String(form.rate ?? 0)} onChange={e => setForm({ ...form, rate: e.target.value })} />
                <TextInput label="W/S (₹)" mono value={form.frate == null ? '' : String(form.frate)} onChange={e => setForm({ ...form, frate: e.target.value })} />
                <TextInput label="Retail (₹)" mono value={form.trate == null ? '' : String(form.trate)} onChange={e => setForm({ ...form, trate: e.target.value })} />
              </div>
            </section>

            <section>
              <h4 className={sectionTitle}>Image</h4>
              <div className="flex items-start gap-4">
                <div className="w-24 h-24 shrink-0 border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface-2)] flex items-center justify-center overflow-hidden">
                  {imagePreview ? <img src={imagePreview} alt="" className="w-full h-full object-cover" /> : <ImageIcon className="w-6 h-6 text-[var(--erp-muted)]" />}
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

            <section>
              <h4 className={sectionTitle}>Availability</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="flex flex-col gap-1 text-xs text-[var(--erp-muted)]">Availability
                  <select value={form.availability || 'In Stock'} onChange={e => setForm({ ...form, availability: e.target.value })} className="px-3 py-2 text-sm bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] text-[var(--erp-text)]">
                    {PRODUCT_AVAILABILITY.map(a => <option key={a}>{a}</option>)}
                  </select>
                </label>
              </div>
            </section>

            <div className="flex justify-end gap-3 pt-4 border-t border-[var(--erp-hairline)]">
              <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 border border-[var(--erp-hairline)] text-xs font-mono">Cancel</button>
              <button type="submit" disabled={saving} className="px-5 py-2 bg-[var(--erp-gold)] text-[#0F141B] text-xs font-semibold">{saving ? 'Saving…' : 'Save Product'}</button>
            </div>
          </form>
        </div>
      )}

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
