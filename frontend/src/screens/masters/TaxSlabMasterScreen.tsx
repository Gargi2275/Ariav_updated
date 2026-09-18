import React, { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '../../components/common/PageHeader';
import { DataTable, Column } from '../../components/common/DataTable';
import { StatusChip } from '../../components/common/StatusChip';
import { MasterError, MasterLoading, emptyTableProps } from './MasterStatus';
import { MasterTaxSlab, mastersApi, num } from '../../services/mastersApi';
import { notifyApiError, notifySuccess } from '../../services/notify';
import { Percent, Plus, Edit2, Search, X, Save, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';

const emptySlab = (): Partial<MasterTaxSlab> => ({
  code: '',
  name: '',
  gst_percent: 5,
  cgst_percent: 2.5,
  sgst_percent: 2.5,
  igst_percent: 5,
  cess_percent: 0,
  hsn_coverage: '',
  statutory_notification: '',
  effective_from: '2017-07-01',
  rcm_applicable: false,
  is_active: true,
});

export const TaxSlabMasterScreen: React.FC = () => {
  const [rows, setRows] = useState<MasterTaxSlab[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState<Partial<MasterTaxSlab>>(emptySlab());
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<MasterTaxSlab | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await mastersApi.taxSlabs.list<MasterTaxSlab>());
    } catch (e) {
      setError(notifyApiError(e, 'Could not load tax slabs.').message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = rows.filter(s => {
    const q = searchTerm.toLowerCase();
    return !q || s.code.toLowerCase().includes(q) || s.name.toLowerCase().includes(q) || (s.hsn_coverage || '').toLowerCase().includes(q);
  });

  const applyGst = (total: number) => {
    setForm(prev => ({ ...prev, gst_percent: total, cgst_percent: total / 2, sgst_percent: total / 2, igst_percent: total }));
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        gst_percent: num(form.gst_percent),
        cgst_percent: num(form.cgst_percent),
        sgst_percent: num(form.sgst_percent),
        igst_percent: num(form.igst_percent),
        cess_percent: num(form.cess_percent),
        is_active: form.is_active !== false,
      };
      if (form.id) await mastersApi.taxSlabs.update(form.id, payload);
      else await mastersApi.taxSlabs.create(payload);
      notifySuccess(`Tariff '${form.code}' saved.`);
      setIsModalOpen(false);
      await load();
    } catch (err) {
      notifyApiError(err);
    } finally {
      setSaving(false);
    }
  };

  const columns: Column<MasterTaxSlab>[] = [
    { header: 'Tariff Code', accessorKey: 'code', mono: true, width: '130px', render: r => <span className="font-mono text-[var(--erp-gold)] font-medium">{r.code}</span> },
    {
      header: 'Slab Title & Scope',
      accessorKey: 'name',
      render: r => (
        <div>
          <span className="font-body font-medium">{r.name}</span>
          <span className="text-[11px] font-mono text-[var(--erp-muted)] block">HSN: {r.hsn_coverage}</span>
        </div>
      ),
    },
    { header: 'Total GST', accessorKey: 'gst_percent', align: 'center', mono: true, width: '90px', render: r => <span className="font-bold text-[var(--erp-gold)]">{num(r.gst_percent)}%</span> },
    { header: 'CGST', accessorKey: 'cgst_percent', align: 'center', mono: true, render: r => <span>{num(r.cgst_percent)}%</span> },
    { header: 'SGST', accessorKey: 'sgst_percent', align: 'center', mono: true, render: r => <span>{num(r.sgst_percent)}%</span> },
    { header: 'IGST', accessorKey: 'igst_percent', align: 'center', mono: true, render: r => <span>{num(r.igst_percent)}%</span> },
    { header: 'Cess', accessorKey: 'cess_percent', align: 'center', mono: true, render: r => <span>{num(r.cess_percent)}%</span> },
    { header: 'RCM', align: 'center', render: r => <span className="text-[10px] font-mono">{r.rcm_applicable ? 'YES' : 'NO'}</span> },
    { header: 'Status', align: 'center', render: r => <StatusChip status={r.is_active ? 'active' : 'inactive'} /> },
    {
      header: 'Actions',
      align: 'right',
      render: r => (
        <div className="flex justify-end gap-1">
          <button className="p-1 text-[var(--erp-muted)] hover:text-[var(--erp-gold)]" onClick={() => { setForm(r); setIsModalOpen(true); }}><Edit2 className="w-3.5 h-3.5" /></button>
          <button className="p-1 text-[var(--erp-muted)] hover:text-[var(--erp-negative)]" onClick={() => setPendingDelete(r)}><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      ),
    },
  ];

  return (
    <div className="p-6 flex flex-col gap-6 text-left">
      <PageHeader
        moduleNumber="27"
        section="Masters"
        title="Tax Slab Master"
        subtitle="Statutory GST Rates, CGST/SGST/IGST & Cess"
        actions={
          <button onClick={() => { setForm(emptySlab()); setIsModalOpen(true); }} className="px-4 py-1.5 bg-[var(--erp-gold)] text-[#0F141B] text-xs font-semibold flex items-center gap-1.5 cursor-pointer">
            <Plus className="w-3.5 h-3.5" /> New Tax Slab
          </button>
        }
      />
      {error && <MasterError message={error} onRetry={load} />}
      <div className="relative bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] p-3">
        <Search className="w-4 h-4 text-[var(--erp-muted)] absolute left-6 top-5" />
        <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search tariff code, description or HSN..." className="w-full pl-9 pr-3 py-1.5 text-xs bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)] focus:border-[var(--erp-gold)] focus:outline-none font-mono" />
      </div>
      {loading ? (
        <MasterLoading label="Loading tax slabs…" />
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          keyExtractor={r => r.id}
          {...emptyTableProps(
            rows.length,
            filtered.length,
            'No tax slabs configured yet.',
            'No tax slabs match this search.',
            'Add first tax slab',
            () => { setForm(emptySlab()); setIsModalOpen(true); },
          )}
        />
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <form onSubmit={save} className="w-full max-w-xl bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] p-6 space-y-4">
            <div className="flex justify-between border-b border-[var(--erp-hairline)] pb-3">
              <div className="flex items-center gap-2"><Percent className="w-4 h-4 text-[var(--erp-gold)]" /><h3 className="font-display text-base font-bold">{form.id ? 'Modify Tax Slab' : 'Create GST Tariff Slab'}</h3></div>
              <button type="button" onClick={() => setIsModalOpen(false)}><X className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-2 gap-4 text-xs font-mono">
              <label>Tariff Code<input required value={form.code || ''} onChange={e => setForm({ ...form, code: e.target.value })} className="mt-1 w-full px-3 py-1.5 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)]" /></label>
              <label>Total GST %
                <select value={num(form.gst_percent)} onChange={e => applyGst(Number(e.target.value))} className="mt-1 w-full px-3 py-1.5 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)]">
                  <option value={0}>0%</option>
                  <option value={5}>5%</option>
                  <option value={12}>12%</option>
                  <option value={18}>18%</option>
                  <option value={28}>28%</option>
                </select>
              </label>
            </div>
            <label className="block text-xs font-mono">Title<input required value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} className="mt-1 w-full px-3 py-1.5 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)]" /></label>
            <div className="grid grid-cols-4 gap-3 p-3 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[11px] font-mono">
              <label>CGST<input type="number" step="0.01" value={form.cgst_percent ?? 0} onChange={e => setForm({ ...form, cgst_percent: e.target.value })} className="mt-1 w-full px-2 py-1 bg-[var(--erp-surface)] border border-[var(--erp-hairline)] text-right" /></label>
              <label>SGST<input type="number" step="0.01" value={form.sgst_percent ?? 0} onChange={e => setForm({ ...form, sgst_percent: e.target.value })} className="mt-1 w-full px-2 py-1 bg-[var(--erp-surface)] border border-[var(--erp-hairline)] text-right" /></label>
              <label>IGST<input type="number" step="0.01" value={form.igst_percent ?? 0} onChange={e => setForm({ ...form, igst_percent: e.target.value })} className="mt-1 w-full px-2 py-1 bg-[var(--erp-surface)] border border-[var(--erp-hairline)] text-right" /></label>
              <label>Cess<input type="number" step="0.01" value={form.cess_percent ?? 0} onChange={e => setForm({ ...form, cess_percent: e.target.value })} className="mt-1 w-full px-2 py-1 bg-[var(--erp-surface)] border border-[var(--erp-hairline)] text-right" /></label>
            </div>
            <label className="block text-xs font-mono">HSN Coverage<input value={form.hsn_coverage || ''} onChange={e => setForm({ ...form, hsn_coverage: e.target.value })} className="mt-1 w-full px-3 py-1.5 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)]" /></label>
            <label className="block text-xs font-mono">Statutory Notification<input value={form.statutory_notification || ''} onChange={e => setForm({ ...form, statutory_notification: e.target.value })} className="mt-1 w-full px-3 py-1.5 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)]" /></label>
            <label className="flex items-center gap-2 text-xs font-mono"><input type="checkbox" checked={!!form.rcm_applicable} onChange={e => setForm({ ...form, rcm_applicable: e.target.checked })} /> RCM applicable</label>
            <div className="flex justify-end gap-3 pt-4 border-t border-[var(--erp-hairline)]">
              <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-1.5 border border-[var(--erp-hairline)] text-xs">Cancel</button>
              <button type="submit" disabled={saving} className="px-4 py-1.5 bg-[var(--erp-gold)] text-[#0F141B] text-xs font-semibold flex items-center gap-1"><Save className="w-3.5 h-3.5" />{saving ? 'Saving…' : 'Save Tariff Slab'}</button>
            </div>
          </form>
        </div>
      )}
      <ConfirmDialog
        open={!!pendingDelete}
        entityType="tax slab"
        entityLabel={pendingDelete ? `${pendingDelete.name} (${pendingDelete.code})` : ''}
        onCancel={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (!pendingDelete) return;
          try {
            await mastersApi.taxSlabs.remove(pendingDelete.id);
            notifySuccess('Slab deleted.');
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
