import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Edit2, ImageIcon, Plus, Search, Trash2, X } from 'lucide-react';
import { useErp } from '../../context/ErpContext';
import { PageHeader } from '../../components/common/PageHeader';
import { DataTable, Column } from '../../components/common/DataTable';
import { StatusChip } from '../../components/common/StatusChip';
import { TextInput, FormField, RequiredLegend } from '../../components/common/FormControls';
import { FileDropZone } from '../../components/common/FileDropZone';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { MasterError, MasterLoading, emptyTableProps } from './MasterStatus';
import { num } from '../../services/mastersApi';
import { notifyApiError, notifySuccess } from '../../services/notify';
import { clearFieldMessage, collectRequired } from '../../services/requiredFields';
import { BrandRow, brandsApi } from '../../services/brandsApi';
import { CategoryRow, categoriesApi } from '../../services/categoriesApi';
import {
  PRODUCT_AVAILABILITY,
  PRODUCT_UNITS,
  ProductRow,
  emptyProduct,
  productsApi,
  toProductFormData,
} from '../../services/productsApi';

function nullableDecimal(value: string | number | null | undefined): number | null {
  if (value === '' || value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

const sectionTitle = 'text-[11px] font-mono uppercase tracking-wider text-[var(--erp-gold)] border-b border-[var(--erp-hairline)] pb-1 mb-3';

function availabilityChip(value: string) {
  if (value === 'In Stock') return <StatusChip status="active" label="IN STOCK" />;
  if (value === 'Out of Stock') return <StatusChip status="overdue" label="OUT OF STOCK" />;
  return <StatusChip status="inactive" label="DISCONTINUED" />;
}

export const ProductCatalogueScreen: React.FC = () => {
  const { userRole } = useErp();
  const canWrite = userRole === 'admin';
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [brands, setBrands] = useState<BrandRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Active' | 'Inactive'>('All');
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
  const [pendingDelete, setPendingDelete] = useState<ProductRow | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  const loadLookups = useCallback(async () => {
    try {
      const [brandRows, catRows] = await Promise.all([
        brandsApi.list(),
        categoriesApi.list(),
      ]);
      setBrands(brandRows);
      setCategories(catRows);
    } catch (e) {
      notifyApiError(e, 'Could not load brands and categories.');
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await productsApi.list({
        status: statusFilter === 'All' ? undefined : statusFilter,
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
  }, [statusFilter, brandFilter, subFilter, availabilityFilter]);

  useEffect(() => { void loadLookups(); }, [loadLookups]);
  useEffect(() => { void load(); }, [load]);

  const filtered = rows.filter(r => {
    const q = search.toLowerCase().trim();
    return !q
      || r.product_code.toLowerCase().includes(q)
      || r.product_name.toLowerCase().includes(q)
      || r.design.toLowerCase().includes(q)
      || r.colour.toLowerCase().includes(q);
  });

  const topLevel = useMemo(() => categories.filter(c => !c.parent_category_id), [categories]);
  const subsForFilter = useMemo(
    () => categories.filter(c => parentFilter && c.parent_category_id === parentFilter),
    [categories, parentFilter],
  );
  const subsForForm = useMemo(
    () => categories.filter(c => formParentId && c.parent_category_id === formParentId),
    [categories, formParentId],
  );

  const openCreate = () => {
    setForm(emptyProduct());
    setFormParentId('');
    setImageFile(null);
    setImagePreview('');
    setFieldErrors([]);
    setFieldMessages({});
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
      category_id: form.category_id,
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
      product_name: (form.product_name || '').trim(),
      brand_id: form.brand_id,
      category_id: form.category_id,
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
    {
      header: 'Category',
      render: r => (
        <span className="font-mono text-[11px] text-[var(--erp-muted)]">
          {r.parent_category_name || '—'} <span className="text-[var(--erp-faint)]">›</span> {r.category_name}
        </span>
      ),
    },
    { header: 'Rate', accessorKey: 'rate', align: 'right', mono: true, width: '90px', render: r => <span>₹{num(r.rate).toFixed(2)}</span> },
    { header: 'Availability', width: '130px', render: r => availabilityChip(r.availability) },
    {
      header: 'Status',
      width: '90px',
      align: 'center',
      render: r => <StatusChip status={r.status === 'Active' ? 'active' : 'inactive'} label={r.status.toUpperCase()} />,
    },
    {
      header: '',
      align: 'right',
      width: '72px',
      render: r => canWrite ? (
        <div className="flex justify-end gap-1">
          <button type="button" className="p-1 text-[var(--erp-muted)] hover:text-[var(--erp-gold)] cursor-pointer" onClick={() => void openEdit(r.id)}><Edit2 className="w-3.5 h-3.5" /></button>
          {r.status === 'Active' && (
            <button type="button" className="p-1 text-[var(--erp-muted)] hover:text-[var(--erp-negative)] cursor-pointer" onClick={() => setPendingDelete(r)}><Trash2 className="w-3.5 h-3.5" /></button>
          )}
        </div>
      ) : null,
    },
  ];

  return (
    <div className="p-6 flex flex-col gap-6 text-left">
      <PageHeader
        moduleNumber="39"
        section="Masters"
        title="Product Catalogue"
        subtitle="Brand SKUs under Category → Subcategory, with rate and availability"
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
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search code, name, design or colour…" className="w-full pl-9 pr-3 py-1.5 text-xs bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)] focus:border-[var(--erp-gold)] focus:outline-none font-mono" />
          </div>
          <div className="flex items-center gap-2 font-mono text-xs">
            {(['All', 'Active', 'Inactive'] as const).map(s => (
              <button key={s} type="button" onClick={() => setStatusFilter(s)} className={`px-3 py-1 border ${statusFilter === s ? 'border-[var(--erp-gold)] text-[var(--erp-gold)] bg-[var(--erp-surface-2)]' : 'border-[var(--erp-hairline)] text-[var(--erp-muted)]'}`}>{s}</button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <select value={brandFilter} onChange={e => setBrandFilter(e.target.value ? Number(e.target.value) : '')} className="px-2 py-1.5 text-xs font-mono bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)]">
            <option value="">All brands</option>
            {brands.map(b => <option key={b.id} value={b.id}>{b.brand_code} · {b.brand_name}</option>)}
          </select>
          <select value={parentFilter} onChange={e => { setParentFilter(e.target.value ? Number(e.target.value) : ''); setSubFilter(''); }} className="px-2 py-1.5 text-xs font-mono bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)]">
            <option value="">All categories</option>
            {topLevel.map(c => <option key={c.id} value={c.id}>{c.category_code} · {c.category_name}</option>)}
          </select>
          <select value={subFilter} onChange={e => setSubFilter(e.target.value ? Number(e.target.value) : '')} disabled={!parentFilter} className="px-2 py-1.5 text-xs font-mono bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)] disabled:opacity-50">
            <option value="">All subcategories</option>
            {subsForFilter.map(c => <option key={c.id} value={c.id}>{c.category_code} · {c.category_name}</option>)}
          </select>
          <select value={availabilityFilter} onChange={e => setAvailabilityFilter(e.target.value)} className="px-2 py-1.5 text-xs font-mono bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)]">
            <option value="">All availability</option>
            {PRODUCT_AVAILABILITY.map(a => <option key={a}>{a}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <MasterLoading label="Loading products…" />
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          keyExtractor={r => r.id}
          {...emptyTableProps(
            rows.length,
            filtered.length,
            statusFilter !== 'All' || brandFilter || subFilter || availabilityFilter
              ? 'No products match this filter.'
              : 'No products in the catalogue yet.',
            'No products match this filter.',
            canWrite ? 'Add first product' : '',
            canWrite ? openCreate : () => undefined,
          )}
        />
      )}

      {modalOpen && canWrite && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <form noValidate onSubmit={save} className="w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] p-6 space-y-6">
            <div className="flex justify-between border-b border-[var(--erp-hairline)] pb-3 sticky top-0 bg-[var(--erp-surface)] z-10">
              <h3 className="font-display text-lg font-bold">{form.id ? 'Edit Product' : 'Add Product'}</h3>
              <button type="button" onClick={() => setModalOpen(false)}><X className="w-4 h-4" /></button>
            </div>
            <RequiredLegend />
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
                <div className="sm:col-span-2">
                  <TextInput
                    label="Print name"
                    value={form.print_name || ''}
                    onChange={e => setForm({ ...form, print_name: e.target.value })}
                  />
                </div>
                <FormField label="Brand" required error={fieldMessages.brand_id}>
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
                    {brands.filter(b => b.status === 'Active' || b.id === form.brand_id).map(b => (
                      <option key={b.id} value={b.id}>{b.brand_code} · {b.brand_name}</option>
                    ))}
                  </select>
                </FormField>
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
                <TextInput label="Rate (₹)" mono value={String(form.rate ?? 0)} onChange={e => setForm({ ...form, rate: e.target.value })} />
                <TextInput label="FRate (₹)" mono value={form.frate == null ? '' : String(form.frate)} onChange={e => setForm({ ...form, frate: e.target.value })} />
                <TextInput label="TRate (₹)" mono value={form.trate == null ? '' : String(form.trate)} onChange={e => setForm({ ...form, trate: e.target.value })} />
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
              <h4 className={sectionTitle}>Availability & Status</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="flex flex-col gap-1 text-xs text-[var(--erp-muted)]">Availability
                  <select value={form.availability || 'In Stock'} onChange={e => setForm({ ...form, availability: e.target.value })} className="px-3 py-2 text-sm bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] text-[var(--erp-text)]">
                    {PRODUCT_AVAILABILITY.map(a => <option key={a}>{a}</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-[var(--erp-muted)]">Status
                  <select value={form.status || 'Active'} onChange={e => setForm({ ...form, status: e.target.value as ProductRow['status'] })} className="px-3 py-2 text-sm bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] text-[var(--erp-text)]">
                    <option>Active</option>
                    <option>Inactive</option>
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
        open={!!pendingDelete}
        entityType="product"
        entityLabel={pendingDelete ? `${pendingDelete.product_name} (${pendingDelete.product_code})` : ''}
        title="Deactivate product?"
        message={
          pendingDelete
            ? `${pendingDelete.product_name} (${pendingDelete.product_code}) will be set to Inactive. This does not delete any records — it can be reactivated later from the Inactive filter.`
            : ''
        }
        confirmLabel="Deactivate"
        busyLabel="Deactivating…"
        onCancel={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (!pendingDelete) return;
          try {
            await productsApi.deactivate(pendingDelete.id);
            notifySuccess(`${pendingDelete.product_name} (${pendingDelete.product_code}) deactivated.`);
            setPendingDelete(null);
            await load();
          } catch (err) {
            notifyApiError(err);
          }
        }}
      />
    </div>
  );
};
