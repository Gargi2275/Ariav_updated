import React, { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '../../components/common/PageHeader';
import { DataTable, Column } from '../../components/common/DataTable';
import { StatusChip } from '../../components/common/StatusChip';
import { MasterError, MasterLoading, emptyTableProps } from './MasterStatus';
import {
  MasterGroup,
  MasterItem,
  MasterTaxSlab,
  mastersApi,
  num,
} from '../../services/mastersApi';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { notifyApiError, notifySuccess } from '../../services/notify';
import { Boxes, Edit2, Plus, Save, Search, Trash2, X } from 'lucide-react';

const emptyItem = (): Partial<MasterItem> => ({
  sku: '',
  description: '',
  category: 'Greige',
  construction: '',
  width_inches: 58,
  hsn: '',
  base_rate: 0,
  packing_unit: 'Meters',
  stock_quantity: 0,
  gst_percent: 5,
  tax_slab: null,
  mill_origin: '',
  is_active: true,
});

export const ItemMasterScreen: React.FC = () => {
  const [rows, setRows] = useState<MasterItem[]>([]);
  const [groups, setGroups] = useState<MasterGroup[]>([]);
  const [slabs, setSlabs] = useState<MasterTaxSlab[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<MasterItem>>(emptyItem());
  const [pendingDelete, setPendingDelete] = useState<MasterItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [items, groupRows, slabRows] = await Promise.all([
        mastersApi.items.list<MasterItem>(),
        mastersApi.groups.list<MasterGroup>(),
        mastersApi.taxSlabs.list<MasterTaxSlab>(),
      ]);
      setRows(items);
      setGroups(groupRows);
      setSlabs(slabRows);
    } catch (e) {
      setError(notifyApiError(e, 'Could not load item catalogue.').message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const categories = ['All', ...Array.from(new Set(rows.map(r => r.category).filter(Boolean)))];
  const filtered = rows.filter(i => {
    const matchCat = categoryFilter === 'All' || i.category === categoryFilter;
    const q = searchTerm.toLowerCase();
    const matchSearch =
      !q ||
      i.sku.toLowerCase().includes(q) ||
      i.description.toLowerCase().includes(q) ||
      i.hsn.includes(searchTerm) ||
      (i.construction || '').toLowerCase().includes(q);
    return matchCat && matchSearch;
  });

  const totalQty = rows.reduce((acc, i) => acc + num(i.stock_quantity), 0);
  const totalVal = rows.reduce((acc, i) => acc + num(i.stock_quantity) * num(i.base_rate), 0);
  const avgRate = rows.length ? rows.reduce((acc, i) => acc + num(i.base_rate), 0) / rows.length : 0;

  const openCreate = () => {
    setForm(emptyItem());
    setIsModalOpen(true);
  };

  const openEdit = (item: MasterItem) => {
    setForm({ ...item });
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const payload = {
      sku: form.sku,
      description: form.description,
      group: form.group || null,
      category: form.category,
      construction: form.construction,
      width_inches: num(form.width_inches),
      hsn: form.hsn,
      base_rate: num(form.base_rate),
      packing_unit: form.packing_unit || 'Meters',
      stock_quantity: num(form.stock_quantity),
      gst_percent: num(form.gst_percent),
      tax_slab: form.tax_slab || null,
      mill_origin: form.mill_origin || '',
      is_active: form.is_active !== false,
    };
    try {
      if (form.id) {
        await mastersApi.items.update(form.id, payload);
        notifySuccess(`SKU '${form.sku}' updated.`);
      } else {
        await mastersApi.items.create(payload);
        notifySuccess(`SKU '${form.sku}' registered.`);
      }
      setIsModalOpen(false);
      await load();
    } catch (err) {
      notifyApiError(err, 'Could not save SKU.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (row: MasterItem) => {
    setPendingDelete(row);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await mastersApi.items.remove(pendingDelete.id);
      notifySuccess(`SKU '${pendingDelete.sku}' deleted.`);
      setPendingDelete(null);
      await load();
    } catch (err) {
      notifyApiError(err, 'Delete failed.');
    }
  };

  const columns: Column<MasterItem>[] = [
    {
      header: 'SKU',
      accessorKey: 'sku',
      mono: true,
      width: '160px',
      render: r => (
        <div>
          <span className="font-mono text-sm font-bold text-[var(--erp-text)]">{r.sku}</span>
          <span className="text-[10px] font-mono text-[var(--erp-gold)] block">{r.category || r.group_name}</span>
        </div>
      ),
    },
    {
      header: 'Description & Construction Specs',
      accessorKey: 'description',
      render: r => (
        <div>
          <span className="font-body font-medium text-[var(--erp-text)]">{r.description}</span>
          <span className="text-[11px] font-mono text-[var(--erp-muted)] block">
            Specs: {r.construction || '—'} • Width: {num(r.width_inches) > 0 ? `${num(r.width_inches)}"` : 'N/A'}
          </span>
        </div>
      ),
    },
    {
      header: 'HSN / GST',
      accessorKey: 'hsn',
      mono: true,
      width: '120px',
      render: r => (
        <div>
          <span className="font-mono text-xs text-[var(--erp-text)]">{r.hsn}</span>
          <span className="text-[10px] font-mono text-[var(--erp-gold)] block">GST: {num(r.gst_percent)}%</span>
        </div>
      ),
    },
    {
      header: 'Base Rate',
      accessorKey: 'base_rate',
      align: 'right',
      mono: true,
      width: '110px',
      render: r => (
        <span className="font-mono font-semibold text-right text-[var(--erp-text)] block">
          ₹{num(r.base_rate).toFixed(2)}/{r.packing_unit === 'Meters' ? 'm' : r.packing_unit.toLowerCase()}
        </span>
      ),
    },
    {
      header: 'Stock Level',
      accessorKey: 'stock_quantity',
      align: 'right',
      mono: true,
      width: '120px',
      render: r => (
        <div className="text-right">
          <span className="font-mono text-xs text-[var(--erp-positive)] font-bold block">
            {num(r.stock_quantity).toLocaleString('en-IN')} {r.packing_unit}
          </span>
        </div>
      ),
    },
    {
      header: 'Status',
      align: 'center',
      width: '90px',
      render: r => <StatusChip status={r.is_active ? 'active' : 'inactive'} label={r.is_active ? 'ACTIVE' : 'INACTIVE'} />,
    },
    {
      header: 'Actions',
      align: 'right',
      width: '90px',
      render: r => (
        <div className="flex items-center justify-end gap-1.5">
          <button onClick={() => openEdit(r)} className="p-1 text-[var(--erp-muted)] hover:text-[var(--erp-gold)] cursor-pointer" title="Edit">
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => handleDelete(r)} className="p-1 text-[var(--erp-muted)] hover:text-[var(--erp-negative)] cursor-pointer" title="Delete">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="p-6 flex flex-col gap-6 text-left">
      <PageHeader
        moduleNumber="21"
        section="Masters"
        title="Item Master Catalogue"
        subtitle="SKU, Description, HSN, Base Price & GST Slab"
        actions={
          <button
            onClick={openCreate}
            className="px-4 py-1.5 bg-[var(--erp-gold)] text-[#0F141B] font-body text-xs font-semibold hover:bg-[var(--erp-gold-soft)] flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> New Fabric SKU
          </button>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-3.5 border border-[var(--erp-hairline)] bg-[var(--erp-surface)]">
          <span className="text-[11px] font-mono text-[var(--erp-muted)] block">ACTIVE FABRIC SKUS</span>
          <span className="font-mono text-lg font-bold text-[var(--erp-text)]">{rows.length} Styles</span>
        </div>
        <div className="p-3.5 border border-[var(--erp-hairline)] bg-[var(--erp-surface)]">
          <span className="text-[11px] font-mono text-[var(--erp-muted)] block">TOTAL STOCK QTY</span>
          <span className="font-mono text-lg font-bold text-[var(--erp-gold)]">{totalQty.toLocaleString('en-IN')}</span>
        </div>
        <div className="p-3.5 border border-[var(--erp-hairline)] bg-[var(--erp-surface)]">
          <span className="text-[11px] font-mono text-[var(--erp-muted)] block">STOCK VALUATION</span>
          <span className="font-mono text-lg font-bold text-[var(--erp-positive)]">₹{(totalVal / 100000).toFixed(2)} Lakh</span>
        </div>
        <div className="p-3.5 border border-[var(--erp-hairline)] bg-[var(--erp-surface)]">
          <span className="text-[11px] font-mono text-[var(--erp-muted)] block">AVERAGE BASE RATE</span>
          <span className="font-mono text-lg font-bold text-[var(--erp-text)]">₹{avgRate.toFixed(2)}</span>
        </div>
      </div>

      {error && <MasterError message={error} onRetry={load} />}

      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] p-3">
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 text-[var(--erp-muted)] absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search SKU, description, HSN or construction..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)] focus:border-[var(--erp-gold)] focus:outline-none font-mono"
          />
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto font-mono text-xs">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1 border whitespace-nowrap cursor-pointer ${
                categoryFilter === cat
                  ? 'bg-[var(--erp-surface-2)] border-[var(--erp-gold)] text-[var(--erp-gold)] font-bold'
                  : 'bg-[var(--erp-surface)] border-[var(--erp-hairline)] text-[var(--erp-muted)]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <MasterLoading label="Loading item catalogue…" />
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          keyExtractor={r => r.id}
          {...emptyTableProps(
            rows.length,
            filtered.length,
            'No fabric SKUs in the item catalogue yet.',
            'No SKUs match this search or category.',
            'Add first SKU',
            openCreate,
          )}
        />
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="w-full max-w-2xl bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] p-6 shadow-2xl text-left">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-[var(--erp-hairline)]">
              <div className="flex items-center gap-2">
                <Boxes className="w-4 h-4 text-[var(--erp-gold)]" />
                <h3 className="font-display text-base font-bold text-[var(--erp-text)]">
                  {form.id ? 'Modify Fabric SKU' : 'Register New Fabric SKU'}
                </h3>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-1 text-[var(--erp-muted)] hover:text-[var(--erp-text)] cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <label className="block text-xs">
                  <span className="font-mono text-[var(--erp-muted)]">SKU *</span>
                  <input required value={form.sku || ''} onChange={e => setForm({ ...form, sku: e.target.value })} className="mt-1 w-full px-3 py-1.5 text-xs font-mono bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)] focus:border-[var(--erp-gold)] focus:outline-none" />
                </label>
                <label className="block text-xs">
                  <span className="font-mono text-[var(--erp-muted)]">Product Group</span>
                  <select value={form.group ?? ''} onChange={e => setForm({ ...form, group: e.target.value ? Number(e.target.value) : null })} className="mt-1 w-full px-3 py-1.5 text-xs font-mono bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)]">
                    <option value="">Unassigned</option>
                    {groups.map(g => (
                      <option key={g.id} value={g.id}>{g.code} · {g.name}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs">
                  <span className="font-mono text-[var(--erp-muted)]">HSN *</span>
                  <input required value={form.hsn || ''} onChange={e => setForm({ ...form, hsn: e.target.value })} className="mt-1 w-full px-3 py-1.5 text-xs font-mono bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)] focus:border-[var(--erp-gold)] focus:outline-none" />
                </label>
              </div>
              <label className="block text-xs">
                <span className="font-mono text-[var(--erp-muted)]">Description *</span>
                <input required value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })} className="mt-1 w-full px-3 py-1.5 text-xs bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)] focus:border-[var(--erp-gold)] focus:outline-none" />
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="block text-xs">
                  <span className="font-mono text-[var(--erp-muted)]">Construction</span>
                  <input value={form.construction || ''} onChange={e => setForm({ ...form, construction: e.target.value })} className="mt-1 w-full px-3 py-1.5 text-xs font-mono bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)]" />
                </label>
                <label className="block text-xs">
                  <span className="font-mono text-[var(--erp-muted)]">Category</span>
                  <input value={form.category || ''} onChange={e => setForm({ ...form, category: e.target.value })} className="mt-1 w-full px-3 py-1.5 text-xs bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)]" />
                </label>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)]">
                <label className="block text-[11px] font-mono text-[var(--erp-muted)]">
                  Base Price (₹)
                  <input type="number" step="0.01" required value={form.base_rate ?? 0} onChange={e => setForm({ ...form, base_rate: e.target.value })} className="mt-1 w-full px-2 py-1 text-xs font-mono bg-[var(--erp-surface)] border border-[var(--erp-hairline)] text-[var(--erp-text)] text-right" />
                </label>
                <label className="block text-[11px] font-mono text-[var(--erp-muted)]">
                  GST Slab
                  <select
                    value={form.tax_slab ?? ''}
                    onChange={e => {
                      const id = e.target.value ? Number(e.target.value) : null;
                      const slab = slabs.find(s => s.id === id);
                      setForm({ ...form, tax_slab: id, gst_percent: slab ? num(slab.gst_percent) : form.gst_percent });
                    }}
                    className="mt-1 w-full px-2 py-1 text-xs font-mono bg-[var(--erp-surface)] border border-[var(--erp-hairline)] text-[var(--erp-text)]"
                  >
                    <option value="">Select slab</option>
                    {slabs.map(s => (
                      <option key={s.id} value={s.id}>{s.code} · {num(s.gst_percent)}%</option>
                    ))}
                  </select>
                </label>
                <label className="block text-[11px] font-mono text-[var(--erp-muted)]">
                  Stock
                  <input type="number" value={form.stock_quantity ?? 0} onChange={e => setForm({ ...form, stock_quantity: e.target.value })} className="mt-1 w-full px-2 py-1 text-xs font-mono bg-[var(--erp-surface)] border border-[var(--erp-hairline)] text-[var(--erp-text)] text-right" />
                </label>
                <label className="block text-[11px] font-mono text-[var(--erp-muted)]">
                  Unit
                  <select value={form.packing_unit || 'Meters'} onChange={e => setForm({ ...form, packing_unit: e.target.value })} className="mt-1 w-full px-2 py-1 text-xs font-mono bg-[var(--erp-surface)] border border-[var(--erp-hairline)] text-[var(--erp-text)]">
                    <option>Meters</option>
                    <option>Kgs</option>
                    <option>Bales</option>
                    <option>Taka</option>
                  </select>
                </label>
              </div>
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--erp-hairline)]">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-1.5 border border-[var(--erp-hairline)] text-xs font-mono text-[var(--erp-muted)] cursor-pointer">Cancel</button>
                <button type="submit" disabled={saving} className="px-4 py-1.5 bg-[var(--erp-gold)] text-[#0F141B] font-body text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50">
                  <Save className="w-3.5 h-3.5" /> {saving ? 'Saving…' : 'Save SKU Record'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={!!pendingDelete}
        entityType="item"
        entityLabel={pendingDelete ? `${pendingDelete.description} (${pendingDelete.sku})` : ''}
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
};
