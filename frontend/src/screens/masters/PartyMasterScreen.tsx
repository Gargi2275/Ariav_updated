import React, { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '../../components/common/PageHeader';
import { DataTable, Column } from '../../components/common/DataTable';
import { StatusChip } from '../../components/common/StatusChip';
import { TextInput, AmountInput } from '../../components/common/FormControls';
import { MasterError, MasterLoading, emptyTableProps } from './MasterStatus';
import { MasterBranchRow, MasterBroker, MasterParty, mastersApi, num } from '../../services/mastersApi';
import { notifyApiError, notifySuccess } from '../../services/notify';
import { Plus, Edit2, Search, X, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';

const emptyParty = (): Partial<MasterParty> => ({
  code: '',
  name: '',
  trade_name: '',
  group: 'Sundry Debtors',
  gstin: '',
  pan: '',
  city: 'Surat',
  state: 'Gujarat',
  credit_limit: 0,
  credit_days: 45,
  broker: '',
  broker_ref: null,
  linked_branch_ids: [],
  is_active: true,
  balance_type: 'Dr',
  opening_balance: 0,
});

export const PartyMasterScreen: React.FC = () => {
  const [rows, setRows] = useState<MasterParty[]>([]);
  const [brokers, setBrokers] = useState<MasterBroker[]>([]);
  const [branches, setBranches] = useState<MasterBranchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState<Partial<MasterParty>>(emptyParty());
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<MasterParty | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [parties, brokerRows, branchRows] = await Promise.all([
        mastersApi.parties.list<MasterParty>('?parties=1'),
        mastersApi.brokers.list<MasterBroker>(),
        mastersApi.branches.list<MasterBranchRow>(),
      ]);
      setRows(parties);
      setBrokers(brokerRows);
      setBranches(branchRows);
    } catch (e) {
      setError(notifyApiError(e, 'Could not load party master.').message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = rows.filter(p => {
    const q = searchTerm.toLowerCase();
    const matchSearch = !q || p.name.toLowerCase().includes(q) || p.gstin.toLowerCase().includes(q) || p.city.toLowerCase().includes(q) || (p.broker || '').toLowerCase().includes(q);
    const matchType = filterType === 'all' || p.group.toLowerCase().includes(filterType);
    return matchSearch && matchType;
  });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const payload = {
      code: form.code,
      name: form.name,
      trade_name: form.trade_name,
      group: form.group,
      city: form.city,
      state: form.state,
      gstin: form.gstin,
      pan: form.pan,
      credit_limit: num(form.credit_limit),
      credit_days: Number(form.credit_days) || 0,
      broker: form.broker,
      broker_ref: form.broker_ref || null,
      opening_balance: num(form.opening_balance),
      balance_type: form.balance_type || 'Dr',
      is_active: form.is_active !== false,
      linked_branch_ids: form.linked_branch_ids || [],
    };
    try {
      if (form.id) {
        await mastersApi.parties.update(form.id, payload);
        notifySuccess(`Party '${form.name}' updated.`);
      } else {
        await mastersApi.parties.create(payload);
        notifySuccess(`Party '${form.name}' registered.`);
      }
      setIsModalOpen(false);
      await load();
    } catch (err) {
      notifyApiError(err);
    } finally {
      setSaving(false);
    }
  };

  const columns: Column<MasterParty>[] = [
    { header: 'Code', accessorKey: 'code', mono: true, width: '90px', render: r => <span className="font-mono text-[var(--erp-gold)]">{r.code}</span> },
    {
      header: 'Party Trade Name',
      accessorKey: 'name',
      render: r => (
        <div>
          <span className="font-medium text-[var(--erp-text)]">{r.name}</span>
          <span className="text-[11px] font-mono text-[var(--erp-muted)] block">{r.city}, {r.state} • PAN: {r.pan || '—'}</span>
        </div>
      ),
    },
    { header: 'GSTIN', accessorKey: 'gstin', mono: true, width: '160px' },
    {
      header: 'Account Classification',
      accessorKey: 'group',
      width: '140px',
      render: r => <span className="px-2 py-0.5 text-[10px] font-mono uppercase bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)]">{r.group}</span>,
    },
    {
      header: 'Credit Limit & Days',
      accessorKey: 'credit_limit',
      align: 'right',
      mono: true,
      render: r => (
        <div>
          <span className="text-xs font-semibold">₹{(num(r.credit_limit) / 100000).toFixed(1)} L</span>
          <span className="text-[10px] text-[var(--erp-muted)] block font-mono">{r.credit_days} days</span>
        </div>
      ),
    },
    { header: 'Broker', accessorKey: 'broker', render: r => <span className="text-xs text-[var(--erp-muted)]">{r.broker_name || r.broker || '—'}</span> },
    {
      header: 'Branches',
      render: r => (
        <div className="flex flex-wrap gap-1">
          {(r.linked_branch_names || []).map(b => (
            <span key={b} className="px-1.5 py-0.5 text-[9px] font-mono bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-muted)]">{b.split(' ')[0]}</span>
          ))}
        </div>
      ),
    },
    { header: 'Status', align: 'center', width: '90px', render: r => <StatusChip status={r.is_active ? 'active' : 'inactive'} /> },
    {
      header: 'Actions',
      align: 'right',
      render: r => (
        <div className="flex justify-end gap-1">
          <button className="p-1 text-[var(--erp-muted)] hover:text-[var(--erp-gold)] cursor-pointer" onClick={() => { setForm({ ...r, linked_branch_ids: r.linked_branch_ids || [] }); setIsModalOpen(true); }}><Edit2 className="w-3.5 h-3.5" /></button>
          <button className="p-1 text-[var(--erp-muted)] hover:text-[var(--erp-negative)] cursor-pointer" onClick={() => setPendingDelete(r)}><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      ),
    },
  ];

  return (
    <div className="p-6 flex flex-col gap-6 text-left">
      <PageHeader
        moduleNumber="23"
        section="Masters"
        title="Account / Party Master"
        subtitle="GSTIN, PAN, Credit Limit, Broker & Branches"
        actions={
          <button onClick={() => { setForm(emptyParty()); setIsModalOpen(true); }} className="px-4 py-1.5 bg-[var(--erp-gold)] text-[#0F141B] font-body text-xs font-semibold flex items-center gap-1.5 cursor-pointer">
            <Plus className="w-3.5 h-3.5" /> Create Party Master
          </button>
        }
      />
      {error && <MasterError message={error} onRetry={load} />}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] p-3">
        <div className="relative sm:col-span-2">
          <Search className="w-4 h-4 text-[var(--erp-muted)] absolute left-3 top-2.5" />
          <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search party, GSTIN, PAN or broker..." className="w-full pl-9 pr-3 py-1.5 text-xs bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)] focus:border-[var(--erp-gold)] focus:outline-none" />
        </div>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} className="w-full px-3 py-1.5 text-xs font-mono bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)]">
          <option value="all">All Account Types</option>
          <option value="debtor">Sundry Debtors</option>
          <option value="creditor">Sundry Creditors</option>
          <option value="bank">Bank Accounts</option>
        </select>
      </div>
      {loading ? (
        <MasterLoading label="Loading party accounts…" />
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          keyExtractor={r => r.id}
          {...emptyTableProps(
            rows.length,
            filtered.length,
            'No party accounts in the registry yet.',
            'No parties match this search or account type.',
            'Create first party',
            () => { setForm(emptyParty()); setIsModalOpen(true); },
          )}
        />
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <form onSubmit={save} className="w-full max-w-2xl bg-[var(--erp-surface)] border border-[var(--erp-gold)] shadow-2xl p-6 space-y-4 text-left">
            <div className="flex justify-between border-b border-[var(--erp-hairline)] pb-3">
              <h3 className="font-serif text-lg font-bold">Party Master Account Setup</h3>
              <button type="button" onClick={() => setIsModalOpen(false)}><X className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <TextInput label="Party Code" mono required value={form.code || ''} onChange={e => setForm({ ...form, code: e.target.value })} />
              <TextInput label="Legal Trade Name" required value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="flex flex-col gap-1 text-xs text-[var(--erp-muted)]">Account Classification
                <select value={form.group} onChange={e => setForm({ ...form, group: e.target.value })} className="px-3 py-2 text-xs font-mono bg-[var(--erp-surface-2)] border border-[var(--erp-hairline-strong)] text-[var(--erp-text)]">
                  <option>Sundry Debtors</option>
                  <option>Sundry Creditors</option>
                  <option>Bank Accounts</option>
                  <option>Cash-in-Hand</option>
                </select>
              </label>
              <TextInput label="Trade Name" value={form.trade_name || ''} onChange={e => setForm({ ...form, trade_name: e.target.value })} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <TextInput label="GSTIN" mono value={form.gstin || ''} onChange={e => setForm({ ...form, gstin: e.target.value.toUpperCase() })} />
              <TextInput label="PAN" mono value={form.pan || ''} onChange={e => setForm({ ...form, pan: e.target.value.toUpperCase() })} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <TextInput label="City" value={form.city || ''} onChange={e => setForm({ ...form, city: e.target.value })} />
              <AmountInput label="Credit Limit (₹)" value={String(form.credit_limit ?? 0)} onChange={e => setForm({ ...form, credit_limit: e.target.value })} />
              <TextInput label="Credit Days" mono value={String(form.credit_days ?? 0)} onChange={e => setForm({ ...form, credit_days: parseInt(e.target.value, 10) || 0 })} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="flex flex-col gap-1 text-xs text-[var(--erp-muted)]">Broker
                <select value={form.broker_ref ?? ''} onChange={e => {
                  const id = e.target.value ? Number(e.target.value) : null;
                  const br = brokers.find(b => b.id === id);
                  setForm({ ...form, broker_ref: id, broker: br ? `${br.name} (${br.code})` : '' });
                }} className="px-3 py-2 text-xs font-mono bg-[var(--erp-surface-2)] border border-[var(--erp-hairline-strong)] text-[var(--erp-text)]">
                  <option value="">None</option>
                  {brokers.map(b => <option key={b.id} value={b.id}>{b.name} · {num(b.commission_rate)}%</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-[var(--erp-muted)]">Linked Branches
                <select multiple value={(form.linked_branch_ids || []).map(String)} onChange={e => setForm({ ...form, linked_branch_ids: Array.from(e.target.selectedOptions, (o: HTMLOptionElement) => Number(o.value)) })} className="px-3 py-2 text-xs font-mono bg-[var(--erp-surface-2)] border border-[var(--erp-hairline-strong)] text-[var(--erp-text)] min-h-[72px]">
                  {branches.map(b => <option key={b.id} value={b.id}>{b.code} · {b.name}</option>)}
                </select>
              </label>
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t border-[var(--erp-hairline)]">
              <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 border border-[var(--erp-hairline)] text-xs font-mono">Cancel</button>
              <button type="submit" disabled={saving} className="px-5 py-2 bg-[var(--erp-gold)] text-[#0F141B] text-xs font-semibold">{saving ? 'Saving…' : 'Save Party Master'}</button>
            </div>
          </form>
        </div>
      )}
      <ConfirmDialog
        open={!!pendingDelete}
        entityType="party"
        entityLabel={pendingDelete ? `${pendingDelete.name} (${pendingDelete.code})` : ''}
        onCancel={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (!pendingDelete) return;
          try {
            await mastersApi.parties.remove(pendingDelete.id);
            notifySuccess('Party deleted.');
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
