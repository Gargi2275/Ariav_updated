import React, { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '../../components/common/PageHeader';
import { DataTable, Column } from '../../components/common/DataTable';
import { StatusChip } from '../../components/common/StatusChip';
import { MasterError, MasterLoading, emptyTableProps } from './MasterStatus';
import { MasterGroup, mastersApi, num } from '../../services/mastersApi';
import { notifyApiError, notifySuccess } from '../../services/notify';
import { Plus, Filter, Search, Save, X, Edit2, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';

const emptyGroup = (): Partial<MasterGroup> => ({
  code: '',
  name: '',
  category: 'Greige',
  hsn_chapter: '',
  construction: '',
  gsm_range: '',
  avg_rate: 0,
  is_active: true,
});

export const GroupProductScreen: React.FC = () => {
  const [rows, setRows] = useState<MasterGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<MasterGroup>>(emptyGroup());
  const [pendingDelete, setPendingDelete] = useState<MasterGroup | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await mastersApi.groups.list<MasterGroup>());
    } catch (e) {
      setError(notifyApiError(e, 'Could not load product groups.').message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = rows.filter(g => {
    const matchCat = filterCategory === 'all' || g.category === filterCategory;
    const q = searchQuery.toLowerCase();
    return matchCat && (!q || g.name.toLowerCase().includes(q) || g.code.toLowerCase().includes(q) || (g.construction || '').toLowerCase().includes(q));
  });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const payload = {
      code: form.code,
      name: form.name,
      category: form.category,
      hsn_chapter: form.hsn_chapter,
      construction: form.construction,
      gsm_range: form.gsm_range,
      avg_rate: num(form.avg_rate),
      is_active: form.is_active !== false,
    };
    try {
      if (form.id) {
        await mastersApi.groups.update(form.id, payload);
        notifySuccess(`Group '${form.name}' updated.`);
      } else {
        await mastersApi.groups.create(payload);
        notifySuccess(`Group '${form.name}' created.`);
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      notifyApiError(err);
    } finally {
      setSaving(false);
    }
  };

  const columns: Column<MasterGroup>[] = [
    { header: 'Group Code', accessorKey: 'code', mono: true, render: g => <span className="font-semibold text-[var(--erp-gold)]">{g.code}</span> },
    {
      header: 'Category',
      accessorKey: 'category',
      render: g => <span className="px-2 py-0.5 border border-[var(--erp-hairline)] bg-[var(--erp-surface-2)] text-[11px] font-mono text-[var(--erp-muted)]">{g.category}</span>,
    },
    {
      header: 'Group Name & Weave Spec',
      accessorKey: 'name',
      render: g => (
        <div>
          <span className="font-semibold text-[var(--erp-text)]">{g.name}</span>
          <span className="text-[11px] text-[var(--erp-muted)] block font-mono">{g.construction}</span>
        </div>
      ),
    },
    { header: 'HSN Chapter', accessorKey: 'hsn_chapter', mono: true, align: 'center' },
    { header: 'GSM Band', accessorKey: 'gsm_range', mono: true, align: 'center' },
    { header: 'Linked SKUs', accessorKey: 'sku_count', mono: true, align: 'right', render: g => <span>{g.sku_count} items</span> },
    {
      header: 'Base Rate / Mtr',
      accessorKey: 'avg_rate',
      mono: true,
      align: 'right',
      render: g => <span className="font-mono font-medium block">₹{num(g.avg_rate).toFixed(2)}</span>,
    },
    { header: 'Status', accessorKey: 'is_active', align: 'center', render: g => <StatusChip status={g.is_active ? 'active' : 'inactive'} /> },
    {
      header: 'Actions',
      align: 'right',
      render: g => (
        <div className="flex justify-end gap-1">
          <button className="p-1 text-[var(--erp-muted)] hover:text-[var(--erp-gold)] cursor-pointer" onClick={() => { setForm(g); setModalOpen(true); }}><Edit2 className="w-3.5 h-3.5" /></button>
          <button className="p-1 text-[var(--erp-muted)] hover:text-[var(--erp-negative)] cursor-pointer" onClick={() => setPendingDelete(g)}><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      ),
    },
  ];

  const cats = ['all', ...Array.from(new Set(rows.map(r => r.category).filter(Boolean)))];

  return (
    <div className="p-6 flex flex-col gap-6 text-left">
      <PageHeader
        moduleNumber="22"
        section="Masters"
        title="Group Product Master"
        subtitle="Yarn, Greige Weaves, GSM Bands & Classification"
        actions={
          <button onClick={() => { setForm(emptyGroup()); setModalOpen(true); }} className="px-4 py-1.5 bg-[var(--erp-gold)] text-[#0F141B] font-body text-xs font-semibold flex items-center gap-1.5 cursor-pointer">
            <Plus className="w-3.5 h-3.5" /> New Product Group
          </button>
        }
      />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 border border-[var(--erp-hairline)] bg-[var(--erp-surface)]">
          <span className="text-xs font-mono text-[var(--erp-muted)] block">Total Defined Groups</span>
          <span className="font-mono text-xl font-bold">{rows.length}</span>
        </div>
        <div className="p-4 border border-[var(--erp-hairline)] bg-[var(--erp-surface)]">
          <span className="text-xs font-mono text-[var(--erp-muted)] block">Greige Groups</span>
          <span className="font-mono text-xl font-bold text-[var(--erp-gold)]">{rows.filter(g => g.category === 'Greige').length}</span>
        </div>
        <div className="p-4 border border-[var(--erp-hairline)] bg-[var(--erp-surface)]">
          <span className="text-xs font-mono text-[var(--erp-muted)] block">Linked SKUs</span>
          <span className="font-mono text-xl font-bold text-[var(--erp-positive)]">{rows.reduce((a, g) => a + g.sku_count, 0)}</span>
        </div>
        <div className="p-4 border border-[var(--erp-hairline)] bg-[var(--erp-surface)]">
          <span className="text-xs font-mono text-[var(--erp-muted)] block">Yarn Groups</span>
          <span className="font-mono text-xl font-bold">{rows.filter(g => g.category === 'Yarn').length}</span>
        </div>
      </div>
      {error && <MasterError message={error} onRetry={load} />}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-[var(--erp-surface)] border border-[var(--erp-hairline)]">
        <div className="flex items-center gap-2 overflow-x-auto">
          <Filter className="w-4 h-4 text-[var(--erp-muted)] shrink-0" />
          {cats.map(cat => (
            <button key={cat} onClick={() => setFilterCategory(cat)} className={`px-2.5 py-1 text-xs font-mono ${filterCategory === cat ? 'bg-[var(--erp-gold)] text-[var(--erp-base)] font-bold' : 'bg-[var(--erp-surface-2)] text-[var(--erp-muted)]'}`}>
              {cat === 'all' ? 'All Categories' : cat}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-[var(--erp-muted)] absolute left-2.5 top-2.5" />
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search group, code or weave..." className="pl-8 pr-3 py-1.5 text-xs font-mono bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)] focus:outline-none focus:border-[var(--erp-gold)] w-64" />
        </div>
      </div>
      {loading ? (
        <MasterLoading label="Loading product groups…" />
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          keyExtractor={g => g.id}
          {...emptyTableProps(
            rows.length,
            filtered.length,
            'No product groups configured yet.',
            'No product groups match this search or category.',
            'Add first product group',
            () => { setForm(emptyGroup()); setModalOpen(true); },
          )}
        />
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <form onSubmit={save} className="w-full max-w-lg bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] p-6 space-y-4">
            <div className="flex justify-between border-b border-[var(--erp-hairline)] pb-3">
              <h3 className="font-serif text-lg font-bold">{form.id ? 'Edit Product Group' : 'Create Product Group'}</h3>
              <button type="button" onClick={() => setModalOpen(false)}><X className="w-4 h-4 text-[var(--erp-muted)]" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs font-mono">
              <label>Code<input required value={form.code || ''} onChange={e => setForm({ ...form, code: e.target.value })} className="mt-1 w-full p-2 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)]" /></label>
              <label>Category
                <select value={form.category || 'Greige'} onChange={e => setForm({ ...form, category: e.target.value })} className="mt-1 w-full p-2 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)]">
                  <option>Greige</option>
                  <option>Yarn</option>
                  <option>Finished Fabric</option>
                  <option>Processing</option>
                </select>
              </label>
            </div>
            <label className="block text-xs font-mono">Name<input required value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} className="mt-1 w-full p-2 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)]" /></label>
            <label className="block text-xs font-mono">Construction / Weave<input value={form.construction || ''} onChange={e => setForm({ ...form, construction: e.target.value })} className="mt-1 w-full p-2 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)]" /></label>
            <div className="grid grid-cols-3 gap-3 text-xs font-mono">
              <label>HSN<input value={form.hsn_chapter || ''} onChange={e => setForm({ ...form, hsn_chapter: e.target.value })} className="mt-1 w-full p-2 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)]" /></label>
              <label>GSM Band<input value={form.gsm_range || ''} onChange={e => setForm({ ...form, gsm_range: e.target.value })} className="mt-1 w-full p-2 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)]" /></label>
              <label>Base Rate<input type="number" step="0.01" value={form.avg_rate ?? 0} onChange={e => setForm({ ...form, avg_rate: e.target.value })} className="mt-1 w-full p-2 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)] text-right" /></label>
            </div>
            <div className="flex justify-end gap-3 pt-3 border-t border-[var(--erp-hairline)]">
              <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 border border-[var(--erp-hairline)] text-xs">Cancel</button>
              <button type="submit" disabled={saving} className="px-4 py-2 bg-[var(--erp-gold)] text-[var(--erp-base)] text-xs font-bold flex items-center gap-1"><Save className="w-3.5 h-3.5" />{saving ? 'Saving…' : 'Save Group'}</button>
            </div>
          </form>
        </div>
      )}
      <ConfirmDialog
        open={!!pendingDelete}
        entityType="product group"
        entityLabel={pendingDelete ? `${pendingDelete.name} (${pendingDelete.code})` : ''}
        onCancel={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (!pendingDelete) return;
          try {
            await mastersApi.groups.remove(pendingDelete.id);
            notifySuccess('Group deleted.');
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
