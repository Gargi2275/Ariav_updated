import React, { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '../../components/common/PageHeader';
import { DataTable, Column } from '../../components/common/DataTable';
import { StatusChip } from '../../components/common/StatusChip';
import { TextInput } from '../../components/common/FormControls';
import { MasterError, MasterLoading, emptyTableProps } from './MasterStatus';
import { MasterBroker, mastersApi, num } from '../../services/mastersApi';
import { notifyApiError, notifySuccess } from '../../services/notify';
import { Plus, Edit2, X, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';

const emptyBroker = (): Partial<MasterBroker> => ({
  code: '',
  name: '',
  firm_name: '',
  commission_rate: 2,
  pan: '',
  mobile: '',
  city: 'Surat',
  is_active: true,
});

export const BrokerMasterScreen: React.FC = () => {
  const [rows, setRows] = useState<MasterBroker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState<Partial<MasterBroker>>(emptyBroker());
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [pendingDelete, setPendingDelete] = useState<MasterBroker | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await mastersApi.brokers.list<MasterBroker>());
    } catch (e) {
      const parsed = notifyApiError(e, 'Could not load brokers.');
      setError(parsed.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = rows.filter(b => {
    const q = search.toLowerCase();
    return !q || b.name.toLowerCase().includes(q) || b.code.toLowerCase().includes(q) || b.city.toLowerCase().includes(q);
  });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, commission_rate: num(form.commission_rate), is_active: form.is_active !== false };
      if (form.id) await mastersApi.brokers.update(form.id, payload);
      else await mastersApi.brokers.create(payload);
      notifySuccess(`Broker '${form.name}' saved.`);
      setIsModalOpen(false);
      await load();
    } catch (err) {
      notifyApiError(err);
    } finally {
      setSaving(false);
    }
  };

  const columns: Column<MasterBroker>[] = [
    { header: 'Code', accessorKey: 'code', mono: true, width: '90px', render: r => <span className="font-mono text-[var(--erp-gold)]">{r.code}</span> },
    {
      header: 'Broker Name & Firm',
      accessorKey: 'name',
      render: r => (
        <div>
          <span className="font-medium">{r.name}</span>
          <span className="text-[11px] font-mono text-[var(--erp-muted)] block">{r.firm_name} • {r.city} • {r.mobile}</span>
        </div>
      ),
    },
    { header: 'Rate %', accessorKey: 'commission_rate', align: 'center', mono: true, width: '80px', render: r => <span className="font-bold text-[var(--erp-gold)]">{num(r.commission_rate)}%</span> },
    {
      header: 'Linked Parties',
      render: r => (
        <div>
          <span className="font-mono text-xs font-semibold block">{r.linked_parties_count} Accounts</span>
          <span className="text-[11px] text-[var(--erp-muted)] truncate block max-w-xs">{(r.linked_parties || []).join(', ') || '—'}</span>
        </div>
      ),
    },
    { header: 'PAN', accessorKey: 'pan', mono: true },
    { header: 'Status', accessorKey: 'is_active', align: 'center', width: '90px', render: r => <StatusChip status={r.is_active ? 'active' : 'inactive'} label={r.is_active ? 'ACTIVE' : 'SUSPENDED'} /> },
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
        moduleNumber="28"
        section="Masters"
        title="Broker Master"
        subtitle="Commission Rate, Active Status & Linked Accounts"
        actions={
          <button onClick={() => { setForm(emptyBroker()); setIsModalOpen(true); }} className="px-4 py-1.5 bg-[var(--erp-gold)] text-[#0F141B] font-mono text-xs font-semibold flex items-center gap-1.5 cursor-pointer">
            <Plus className="w-3.5 h-3.5" /> Register New Broker
          </button>
        }
      />
      {error && <MasterError message={error} onRetry={load} />}
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search broker, code or city..." className="w-full sm:w-96 px-3 py-1.5 text-xs font-mono bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] text-[var(--erp-text)] focus:border-[var(--erp-gold)] focus:outline-none" />
      {loading ? (
        <MasterLoading label="Loading brokers…" />
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          keyExtractor={r => r.id}
          {...emptyTableProps(
            rows.length,
            filtered.length,
            'No brokers registered yet.',
            'No brokers match this search.',
            'Register first broker',
            () => { setForm(emptyBroker()); setIsModalOpen(true); },
          )}
        />
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <form onSubmit={save} className="w-full max-w-xl bg-[var(--erp-surface)] border border-[var(--erp-gold)] p-6 space-y-4">
            <div className="flex justify-between border-b border-[var(--erp-hairline)] pb-3">
              <h3 className="font-serif text-lg font-bold">Broker Commission Account</h3>
              <button type="button" onClick={() => setIsModalOpen(false)}><X className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <TextInput label="Broker Code" mono required value={form.code || ''} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} />
              <TextInput label="Broker Full Name" required value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <TextInput label="Firm Name" value={form.firm_name || ''} onChange={e => setForm({ ...form, firm_name: e.target.value })} />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <TextInput label="Commission Rate %" mono value={String(form.commission_rate ?? 2)} onChange={e => setForm({ ...form, commission_rate: e.target.value })} />
              <TextInput label="PAN" mono value={form.pan || ''} onChange={e => setForm({ ...form, pan: e.target.value.toUpperCase() })} />
              <TextInput label="City" value={form.city || ''} onChange={e => setForm({ ...form, city: e.target.value })} />
            </div>
            <TextInput label="Mobile" mono value={form.mobile || ''} onChange={e => setForm({ ...form, mobile: e.target.value })} />
            <label className="flex items-center gap-2 text-xs font-mono">
              <input type="checkbox" checked={form.is_active !== false} onChange={e => setForm({ ...form, is_active: e.target.checked })} /> Active
            </label>
            <div className="flex justify-end gap-3 pt-4 border-t border-[var(--erp-hairline)]">
              <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 border border-[var(--erp-hairline)] text-xs font-mono">Cancel</button>
              <button type="submit" disabled={saving} className="px-5 py-2 bg-[var(--erp-gold)] text-[#0F141B] text-xs font-semibold">{saving ? 'Saving…' : 'Save Broker Master'}</button>
            </div>
          </form>
        </div>
      )}
      <ConfirmDialog
        open={!!pendingDelete}
        entityType="broker"
        entityLabel={pendingDelete ? `${pendingDelete.name} (${pendingDelete.code})` : ''}
        onCancel={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (!pendingDelete) return;
          try {
            await mastersApi.brokers.remove(pendingDelete.id);
            notifySuccess('Broker deleted.');
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
