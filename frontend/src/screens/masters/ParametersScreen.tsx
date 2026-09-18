import React, { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '../../components/common/PageHeader';
import { DataTable, Column } from '../../components/common/DataTable';
import { StatusChip } from '../../components/common/StatusChip';
import { MasterError, MasterLoading } from './MasterStatus';
import { MasterParameter, mastersApi } from '../../services/mastersApi';
import { notifyApiError, notifySuccess } from '../../services/notify';
import { Plus, Search, Save, X, Edit2, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';

const CATEGORIES = ['All', 'City', 'State', 'Zone', 'Vehicle', 'Driver', 'Rate', 'Grade', 'Shade', 'Size', 'Commission'];

const emptyParam = (category: string): Partial<MasterParameter> => ({
  category: category === 'All' ? 'Zone' : category,
  code: '',
  name: '',
  value: '',
  notes: '',
  is_active: true,
});

export const ParametersScreen: React.FC = () => {
  const [rows, setRows] = useState<MasterParameter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('All');
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<Partial<MasterParameter>>(emptyParam('Zone'));
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<MasterParameter | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await mastersApi.parameters.list<MasterParameter>());
    } catch (e) {
      setError(notifyApiError(e, 'Could not load parameters.').message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = rows.filter(p => {
    const matchTab = tab === 'All' || p.category === tab;
    const q = search.toLowerCase();
    return matchTab && (!q || p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q) || p.value.toLowerCase().includes(q));
  });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, is_active: form.is_active !== false };
      if (form.id) await mastersApi.parameters.update(form.id, payload);
      else await mastersApi.parameters.create(payload);
      notifySuccess(`Parameter '${form.code}' saved.`);
      setModalOpen(false);
      await load();
    } catch (err) {
      notifyApiError(err);
    } finally {
      setSaving(false);
    }
  };

  const columns: Column<MasterParameter>[] = [
    { header: 'Category', accessorKey: 'category', mono: true, width: '110px', render: r => <span className="text-[var(--erp-gold)]">{r.category}</span> },
    { header: 'Code', accessorKey: 'code', mono: true, width: '140px' },
    { header: 'Name', accessorKey: 'name' },
    { header: 'Value / Rate', accessorKey: 'value', mono: true },
    { header: 'Notes', accessorKey: 'notes', render: r => <span className="text-[var(--erp-muted)]">{r.notes}</span> },
    { header: 'Status', align: 'center', width: '90px', render: r => <StatusChip status={r.is_active ? 'active' : 'inactive'} /> },
    {
      header: 'Actions',
      align: 'right',
      render: r => (
        <div className="flex justify-end gap-1">
          <button className="p-1 text-[var(--erp-muted)] hover:text-[var(--erp-gold)]" onClick={() => { setForm(r); setModalOpen(true); }}><Edit2 className="w-3.5 h-3.5" /></button>
          <button className="p-1 text-[var(--erp-muted)] hover:text-[var(--erp-negative)]" onClick={() => setPendingDelete(r)}><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      ),
    },
  ];

  return (
    <div className="p-6 flex flex-col gap-6 text-left">
      <PageHeader
        moduleNumber="25"
        section="Masters"
        title="Parameters & Operational Codes"
        subtitle="Logistics Zones, Fleet, Grades, Shades & Sizing"
        actions={
          <button onClick={() => { setForm(emptyParam(tab)); setModalOpen(true); }} className="px-4 py-1.5 bg-[var(--erp-gold)] text-[#0F141B] text-xs font-semibold flex items-center gap-1.5 cursor-pointer">
            <Plus className="w-3.5 h-3.5" /> New Parameter
          </button>
        }
      />
      {error && <MasterError message={error} onRetry={load} />}
      <div className="flex flex-wrap gap-1">
        {CATEGORIES.map(cat => (
          <button key={cat} onClick={() => setTab(cat)} className={`px-2.5 py-1 text-[11px] font-mono border ${tab === cat ? 'border-[var(--erp-gold)] text-[var(--erp-gold)] bg-[var(--erp-surface-2)]' : 'border-[var(--erp-hairline)] text-[var(--erp-muted)]'}`}>
            {cat}{cat !== 'All' ? ` (${rows.filter(r => r.category === cat).length})` : ''}
          </button>
        ))}
      </div>
      <div className="relative">
        <Search className="w-4 h-4 text-[var(--erp-muted)] absolute left-3 top-2.5" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search code, name or value..." className="w-full pl-9 pr-3 py-1.5 text-xs font-mono bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] text-[var(--erp-text)] focus:border-[var(--erp-gold)] focus:outline-none" />
      </div>
      {loading ? (
        <MasterLoading label="Loading operational codes…" />
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          keyExtractor={r => r.id}
          emptyMessage={
            rows.length === 0
              ? 'No operational codes configured yet.'
              : search
                ? (tab === 'All'
                    ? 'No operational codes match this search.'
                    : `No ${tab.toLowerCase()} codes match this search.`)
                : tab === 'All'
                  ? 'No operational codes configured yet.'
                  : `No ${tab.toLowerCase()} codes configured yet.`
          }
          emptyActionText={search ? undefined : (tab === 'All' ? 'Add first parameter' : `Add ${tab} code`)}
          onEmptyAction={search ? undefined : () => { setForm(emptyParam(tab)); setModalOpen(true); }}
        />
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <form onSubmit={save} className="w-full max-w-lg bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] p-6 space-y-4">
            <div className="flex justify-between border-b border-[var(--erp-hairline)] pb-3">
              <h3 className="font-display text-base font-bold">{form.id ? 'Edit Parameter' : 'New Parameter'}</h3>
              <button type="button" onClick={() => setModalOpen(false)}><X className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs font-mono">
              <label>Category
                <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="mt-1 w-full p-2 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)]">
                  {CATEGORIES.filter(c => c !== 'All').map(c => <option key={c}>{c}</option>)}
                </select>
              </label>
              <label>Code<input required value={form.code || ''} onChange={e => setForm({ ...form, code: e.target.value })} className="mt-1 w-full p-2 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)]" /></label>
            </div>
            <label className="block text-xs font-mono">Name<input required value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} className="mt-1 w-full p-2 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)]" /></label>
            <label className="block text-xs font-mono">Value / Rate<input value={form.value || ''} onChange={e => setForm({ ...form, value: e.target.value })} className="mt-1 w-full p-2 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)]" /></label>
            <label className="block text-xs font-mono">Notes<input value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} className="mt-1 w-full p-2 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)]" /></label>
            <div className="flex justify-end gap-3 pt-3 border-t border-[var(--erp-hairline)]">
              <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 border border-[var(--erp-hairline)] text-xs">Cancel</button>
              <button type="submit" disabled={saving} className="px-4 py-2 bg-[var(--erp-gold)] text-[var(--erp-base)] text-xs font-bold flex items-center gap-1"><Save className="w-3.5 h-3.5" />{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        </div>
      )}
      <ConfirmDialog
        open={!!pendingDelete}
        entityType="parameter"
        entityLabel={pendingDelete ? `${pendingDelete.name} (${pendingDelete.code})` : ''}
        onCancel={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (!pendingDelete) return;
          try {
            await mastersApi.parameters.remove(pendingDelete.id);
            notifySuccess('Parameter deleted.');
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
