import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Edit2, Eye, Plus, Trash2, Upload, X } from 'lucide-react';
import { useErp } from '../../context/ErpContext';
import { PageHeader } from '../../components/common/PageHeader';
import { DataTable, Column } from '../../components/common/DataTable';
import { StatusChip } from '../../components/common/StatusChip';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { MasterError, MasterLoading, emptyTableProps } from './MasterStatus';
import { BrandRow, brandsApi } from '../../services/brandsApi';
import { ProductRow, productsApi } from '../../services/productsApi';
import { PriceBasis, PriceListEntryRow, PriceListRow, priceListsApi } from '../../services/priceListsApi';
import { notifyApiError, notifySuccess } from '../../services/notify';
import { num } from '../../services/mastersApi';
import { PriceListImportModal } from './PriceListImportModal';

const emptyEntry = (): Partial<PriceListEntryRow> => ({ product_id: 0, taka_length_meters: '', price_basis: 'Per Meter', price_value: '', taka_quantity: null, status: 'Active' });

export const PriceListScreen: React.FC = () => {
  const { userRole } = useErp();
  const canWrite = userRole === 'admin';
  const [rows, setRows] = useState<PriceListRow[]>([]);
  const [brands, setBrands] = useState<BrandRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [brandFilter, setBrandFilter] = useState<number | ''>('');
  const [statusFilter, setStatusFilter] = useState('');
  const [mode, setMode] = useState<'list' | 'form' | 'detail'>('list');
  const [form, setForm] = useState<Partial<PriceListRow>>({ status: 'Draft', season_label: '', valid_from: '', valid_to: '', brand_id: undefined, entries: [] });
  const [detail, setDetail] = useState<PriceListRow | null>(null);
  const [entry, setEntry] = useState<Partial<PriceListEntryRow>>(emptyEntry());
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PriceListRow | null>(null);
  const [formError, setFormError] = useState('');
  const [importOpen, setImportOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows(await priceListsApi.list({ brand_id: brandFilter || undefined, status: statusFilter || undefined })); }
    catch (e) { setError(notifyApiError(e, 'Could not load price lists.').message); }
    finally { setLoading(false); }
  }, [brandFilter, statusFilter]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void brandsApi.list({ status: 'Active' }).then(setBrands).catch(notifyApiError); }, []);
  useEffect(() => {
    if (!form.brand_id) { setProducts([]); return; }
    void productsApi.list({ brand_id: form.brand_id, status: 'Active' }).then(setProducts).catch(notifyApiError);
  }, [form.brand_id]);

  const openCreate = () => { setForm({ status: 'Draft', season_label: '', valid_from: '', valid_to: '', brand_id: undefined, entries: [] }); setEntry(emptyEntry()); setFormError(''); setMode('form'); };
  const openEdit = async (id: number) => { try { setForm(await priceListsApi.retrieve(id)); setEntry(emptyEntry()); setFormError(''); setMode('form'); } catch (e) { notifyApiError(e); } };
  const openView = async (id: number) => { try { setDetail(await priceListsApi.retrieve(id)); setMode('detail'); } catch (e) { notifyApiError(e); } };
  const selectedProduct = products.find(product => product.id === entry.product_id);
  const calculated = useMemo(() => {
    const length = num(entry.taka_length_meters);
    const value = num(entry.price_value);
    if (!length || !value) return { meter: 0, taka: 0 };
    return entry.price_basis === 'Per Taka' ? { meter: value / length, taka: value } : { meter: value, taka: value * length };
  }, [entry.taka_length_meters, entry.price_basis, entry.price_value]);

  const addEntry = () => {
    if (!entry.product_id || !entry.taka_length_meters || !entry.price_value || num(entry.taka_length_meters) <= 0) { setFormError('Product, Taka length, and price are required.'); return; }
    if ((form.entries || []).some(item => item.product_id === entry.product_id)) { setFormError('That product is already in this Price List.'); return; }
    const product = products.find(item => item.id === entry.product_id);
    if (!product) return;
    setForm({ ...form, entries: [...(form.entries || []), { ...entry, product_id: product.id, product_code: product.product_code, product_name: product.product_name, brand_name: product.brand_name, category_name: product.category_name, price_per_meter: calculated.meter, price_per_taka: calculated.taka } as PriceListEntryRow] });
    setEntry(emptyEntry()); setFormError('');
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.brand_id || !form.season_label || !form.valid_from || !form.valid_to) { setFormError('Brand, season label, valid from, and valid to are required.'); return; }
    if (form.valid_to <= form.valid_from) { setFormError('Valid to must be after valid from.'); return; }
    setSaving(true); setFormError('');
    try {
      const body = { brand_id: form.brand_id, season_label: form.season_label.trim(), valid_from: form.valid_from, valid_to: form.valid_to, status: form.status || 'Draft' };
      const saved = form.id ? await priceListsApi.update(form.id, body) : await priceListsApi.create(body);
      let warning = saved.warning || '';
      for (const item of form.entries || []) {
        const itemBody = { product_id: item.product_id, taka_length_meters: item.taka_length_meters, price_basis: item.price_basis, price_value: item.price_value, taka_quantity: item.taka_quantity, status: item.status || 'Active' };
        if (item.id) await priceListsApi.updateEntry(saved.id, item.id, itemBody);
        else warning = (await priceListsApi.addEntry(saved.id, itemBody)).warning || warning;
      }
      if (warning) notifySuccess(warning);
      else notifySuccess(`Price List '${body.season_label}' saved.`);
      setMode('list'); await load();
    } catch (e) { setFormError(notifyApiError(e).message); }
    finally { setSaving(false); }
  };

  const columns: Column<PriceListRow>[] = [
    { header: 'Brand', accessorKey: 'brand_name' },
    { header: 'Season Label', accessorKey: 'season_label', render: row => <span className="font-medium">{row.season_label}</span> },
    { header: 'Valid From - To', render: row => <span className="font-mono text-xs">{row.valid_from} → {row.valid_to}</span> },
    { header: 'Entries', accessorKey: 'entry_count', align: 'right' },
    { header: 'Status', render: row => <StatusChip status={row.status === 'Active' ? 'active' : row.status === 'Draft' ? 'pending' : 'inactive'} label={row.status.toUpperCase()} /> },
    { header: '', align: 'right', render: row => <div className="flex justify-end gap-2"><button type="button" title="View" aria-label={`View ${row.season_label}`} onClick={() => void openView(row.id)}><Eye className="w-4 h-4" /></button>{canWrite ? <><button type="button" title="Edit" onClick={() => void openEdit(row.id)}><Edit2 className="w-4 h-4" /></button>{row.status === 'Draft' && <button type="button" title="Delete" onClick={() => setPendingDelete(row)}><Trash2 className="w-4 h-4 text-[var(--erp-negative)]" /></button>}</> : null}</div> },
  ];

  if (mode === 'detail' && detail) return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <section role="dialog" aria-modal="true" aria-labelledby="price-list-detail-title" className="w-full max-w-6xl max-h-[90vh] overflow-y-auto bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] p-6">
        <div className="flex items-start justify-between gap-4 border-b border-[var(--erp-hairline)] pb-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--erp-gold)]">Price List Details</p>
            <h2 id="price-list-detail-title" className="mt-1 font-display text-xl font-bold">{detail.brand_name} · {detail.season_label}</h2>
          </div>
          <button type="button" title="Close" aria-label="Close price list details" onClick={() => setMode('list')}><X className="w-5 h-5" /></button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-5 border-b border-[var(--erp-hairline)]">
          <div><div className="text-[10px] font-mono uppercase text-[var(--erp-muted)]">Brand</div><div className="mt-1 text-sm">{detail.brand_name}</div></div>
          <div><div className="text-[10px] font-mono uppercase text-[var(--erp-muted)]">Season Label</div><div className="mt-1 text-sm">{detail.season_label}</div></div>
          <div><div className="text-[10px] font-mono uppercase text-[var(--erp-muted)]">Valid From - To</div><div className="mt-1 text-sm font-mono">{detail.valid_from} → {detail.valid_to}</div></div>
          <div><div className="text-[10px] font-mono uppercase text-[var(--erp-muted)]">Status</div><div className="mt-1"><StatusChip status={detail.status === 'Active' ? 'active' : detail.status === 'Draft' ? 'pending' : 'inactive'} label={detail.status.toUpperCase()} /></div></div>
        </div>
        <div className="pt-5 overflow-x-auto">
          <h3 className="font-display font-bold mb-3">Entries ({detail.entries.length})</h3>
          <table className="w-full min-w-[900px] text-sm">
            <thead><tr className="border-b border-[var(--erp-hairline-strong)] text-left text-[10px] font-mono uppercase text-[var(--erp-muted)]"><th className="py-2 pr-4">Product</th><th className="py-2 pr-4 text-right">Taka Length</th><th className="py-2 pr-4">Basis</th><th className="py-2 pr-4 text-right">Price Entered</th><th className="py-2 pr-4 text-right">Per Meter</th><th className="py-2 pr-4 text-right">Per Taka</th><th className="py-2 pr-4 text-right">Taka Quantity</th><th className="py-2">Status</th></tr></thead>
            <tbody>{detail.entries.map(item => <tr key={item.id} className="border-b border-[var(--erp-hairline)]"><td className="py-3 pr-4"><div className="font-medium">{item.product_name}</div><div className="font-mono text-[10px] text-[var(--erp-muted)]">{item.product_code}</div></td><td className="py-3 pr-4 text-right font-mono">{num(item.taka_length_meters).toFixed(3)} m</td><td className="py-3 pr-4">{item.price_basis}</td><td className="py-3 pr-4 text-right font-mono">₹{num(item.price_value).toFixed(2)}</td><td className="py-3 pr-4 text-right font-mono">₹{num(item.price_per_meter).toFixed(2)}</td><td className="py-3 pr-4 text-right font-mono">₹{num(item.price_per_taka).toFixed(2)}</td><td className="py-3 pr-4 text-right font-mono">{item.taka_quantity ?? '—'}</td><td className="py-3"><StatusChip status={item.status === 'Active' ? 'active' : 'inactive'} label={item.status.toUpperCase()} /></td></tr>)}</tbody>
          </table>
          {!detail.entries.length && <p className="py-8 text-center text-sm text-[var(--erp-muted)]">No entries in this Price List.</p>}
        </div>
        <div className="flex justify-end gap-2 pt-5 mt-5 border-t border-[var(--erp-hairline)]"><button type="button" onClick={() => setMode('list')} className="px-4 py-2 border border-[var(--erp-hairline)]">Close</button>{canWrite && <button type="button" onClick={() => void openEdit(detail.id)} className="px-4 py-2 bg-[var(--erp-gold)] text-black font-semibold"><Edit2 className="w-4 h-4 inline mr-1" /> Edit</button>}</div>
      </section>
    </div>
  );

  if (mode === 'form') return <div className="p-6 text-left"><PageHeader moduleNumber="49" section="Masters" title={form.id ? 'Edit Price List' : 'Create Price List'} subtitle="Seasonal brand pricing with stored meter and Taka equivalents" actions={<button type="button" onClick={() => setMode('list')}><X className="w-5 h-5" /></button>} />
    <form onSubmit={save} className="mt-6 flex flex-col gap-5">
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3 bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] p-4">
        <label className="text-xs font-mono">Brand *<select value={form.brand_id || ''} onChange={e => setForm({ ...form, brand_id: e.target.value ? Number(e.target.value) : undefined, entries: [] })} className="mt-1 w-full p-2 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)]"><option value="">Select brand</option>{brands.map(brand => <option key={brand.id} value={brand.id}>{brand.brand_code} · {brand.brand_name}</option>)}</select></label>
        <label className="text-xs font-mono">Season Label *<input value={form.season_label || ''} onChange={e => setForm({ ...form, season_label: e.target.value })} className="mt-1 w-full p-2 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)]" /></label>
        <label className="text-xs font-mono">Valid From *<input type="date" value={form.valid_from || ''} onChange={e => setForm({ ...form, valid_from: e.target.value })} className="mt-1 w-full p-2 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)]" /></label>
        <label className="text-xs font-mono">Valid To *<input type="date" value={form.valid_to || ''} onChange={e => setForm({ ...form, valid_to: e.target.value })} className="mt-1 w-full p-2 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)]" /></label>
        <label className="text-xs font-mono">Status<select value={form.status || 'Draft'} onChange={e => setForm({ ...form, status: e.target.value as PriceListRow['status'] })} className="mt-1 w-full p-2 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)]"><option>Draft</option><option>Active</option><option>Expired</option></select></label>
      </div>
      <div className="bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] p-4 overflow-x-auto"><h3 className="font-display font-bold mb-3">Line Items</h3><div className="grid grid-cols-7 gap-2 items-end min-w-[900px]">
        <label className="text-xs font-mono col-span-2">Product *<select value={entry.product_id || ''} onChange={e => setEntry({ ...entry, product_id: Number(e.target.value) || 0 })} className="mt-1 w-full p-2 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)]"><option value="">Select product</option>{products.map(product => <option key={product.id} value={product.id}>{product.product_code} · {product.product_name}</option>)}</select></label>
        <label className="text-xs font-mono">Taka Length *<input type="number" step="0.001" value={entry.taka_length_meters || ''} onChange={e => setEntry({ ...entry, taka_length_meters: e.target.value })} className="mt-1 w-full p-2 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)]" /></label>
        <label className="text-xs font-mono">Basis<select value={entry.price_basis || 'Per Meter'} onChange={e => setEntry({ ...entry, price_basis: e.target.value as PriceBasis })} className="mt-1 w-full p-2 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)]"><option>Per Meter</option><option>Per Taka</option></select></label>
        <label className="text-xs font-mono">Price *<input type="number" step="0.01" value={entry.price_value || ''} onChange={e => setEntry({ ...entry, price_value: e.target.value })} className="mt-1 w-full p-2 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)]" /></label>
        <label className="text-xs font-mono">Taka Qty<input type="number" min="0" value={entry.taka_quantity ?? ''} onChange={e => setEntry({ ...entry, taka_quantity: e.target.value ? Number(e.target.value) : null })} className="mt-1 w-full p-2 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)]" /></label>
        <button type="button" onClick={addEntry} className="p-2 bg-[var(--erp-gold)] text-black text-xs font-semibold"><Plus className="w-4 h-4 inline" /> Add</button>
      </div><div className="mt-3 text-xs font-mono text-[var(--erp-muted)]">Preview: ₹{calculated.meter.toFixed(2)} / meter · ₹{calculated.taka.toFixed(2)} / Taka{selectedProduct ? ` · ${selectedProduct.product_code}` : ''}</div>
      <table className="mt-5 w-full text-sm"><thead><tr className="text-left text-xs font-mono text-[var(--erp-muted)]"><th>Product</th><th>Basis / Entered</th><th>Per Meter</th><th>Per Taka</th><th /></tr></thead><tbody>{(form.entries || []).map((item, index) => <tr key={item.id || `${item.product_id}-${index}`} className="border-t border-[var(--erp-hairline)]"><td className="py-2">{item.product_code} · {item.product_name}</td><td>{item.price_basis} · ₹{num(item.price_value).toFixed(2)}</td><td>₹{num(item.price_per_meter).toFixed(2)}</td><td>₹{num(item.price_per_taka).toFixed(2)}</td><td className="text-right"><button type="button" onClick={() => setForm({ ...form, entries: (form.entries || []).filter((_, i) => i !== index) })}><Trash2 className="w-4 h-4 text-[var(--erp-negative)]" /></button></td></tr>)}</tbody></table></div>
      {formError && <p className="text-sm text-[var(--erp-negative)]" role="alert">{formError}</p>}<div className="flex justify-end gap-2"><button type="button" onClick={() => setMode('list')} className="px-4 py-2 border border-[var(--erp-hairline)]">Cancel</button><button disabled={saving} className="px-4 py-2 bg-[var(--erp-gold)] text-black font-semibold">{saving ? 'Saving…' : 'Save Price List'}</button></div>
    </form></div>;

  return <div className="p-6 flex flex-col gap-6 text-left"><PageHeader moduleNumber="49" section="Masters" title="Price Lists" subtitle="Seasonal Brand pricing and product price history" actions={canWrite ? <div className="flex items-center gap-2"><button type="button" onClick={() => setImportOpen(true)} className="px-4 py-2 border border-[var(--erp-gold)] text-[var(--erp-gold)] text-xs font-semibold"><Upload className="w-4 h-4 inline mr-1" /> Import from file</button><button type="button" onClick={openCreate} className="px-4 py-2 bg-[var(--erp-gold)] text-black text-xs font-semibold"><Plus className="w-4 h-4 inline" /> Add Price List</button></div> : undefined} />
    {error && <MasterError message={error} onRetry={load} />}<div className="flex gap-2 bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] p-3"><select value={brandFilter} onChange={e => setBrandFilter(e.target.value ? Number(e.target.value) : '')} className="p-2 text-xs bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)]"><option value="">All brands</option>{brands.map(brand => <option key={brand.id} value={brand.id}>{brand.brand_name}</option>)}</select><select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="p-2 text-xs bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)]"><option value="">All statuses</option><option>Draft</option><option>Active</option><option>Expired</option></select></div>
    {loading ? <MasterLoading label="Loading price lists…" /> : <DataTable columns={columns} data={rows} keyExtractor={row => row.id} {...emptyTableProps(rows.length, rows.length, 'No price lists found.', 'No price lists match these filters.', canWrite ? 'Add first price list' : '', canWrite ? openCreate : () => undefined)} />}
    {pendingDelete && <ConfirmDialog title="Delete Draft Price List?" message={`Delete ${pendingDelete.season_label}? This cannot be undone.`} confirmLabel="Delete" onConfirm={async () => { try { await priceListsApi.remove(pendingDelete.id); notifySuccess('Price List deleted.'); setPendingDelete(null); await load(); } catch (e) { notifyApiError(e); } }} onCancel={() => setPendingDelete(null)} />}
    {importOpen && <PriceListImportModal onClose={() => setImportOpen(false)} onImported={() => { setImportOpen(false); void load(); }} />}
  </div>;
};
