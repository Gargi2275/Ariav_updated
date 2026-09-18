import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../../components/common/PageHeader';
import { MasterError, MasterLoading } from './MasterStatus';
import { ChartAccountNode, mastersApi, num } from '../../services/mastersApi';
import { notifyApiError, notifySuccess } from '../../services/notify';
import { ChevronDown, ChevronRight, Folder, FileCode, Plus, Search, Save, X, Edit2, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';

function flatten(nodes: ChartAccountNode[], depth = 0, acc: Array<ChartAccountNode & { depth: number }> = []): Array<ChartAccountNode & { depth: number }> {
  for (const n of nodes) {
    acc.push({ ...n, depth });
    if (n.children?.length) flatten(n.children, depth + 1, acc);
  }
  return acc;
}

export const ChartOfAccountsScreen: React.FC = () => {
  const [tree, setTree] = useState<ChartAccountNode[]>([]);
  const [flat, setFlat] = useState<ChartAccountNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filterNature, setFilterNature] = useState('All');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<Partial<ChartAccountNode>>({ code: '', name: '', account_type: 'Assets', nature: 'Debit', parent: null, is_group: false, opening_balance: 0, is_active: true });
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ChartAccountNode | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [treeRows, listRows] = await Promise.all([
        mastersApi.chartAccounts.tree(),
        mastersApi.chartAccounts.list<ChartAccountNode>(),
      ]);
      setTree(treeRows);
      setFlat(listRows);
    } catch (e) {
      setError(notifyApiError(e, 'Could not load chart of accounts.').message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const rows = useMemo(() => flatten(tree), [tree]);

  const visible = rows.filter(n => {
    const q = search.toLowerCase();
    const matchQ = !q || n.code.toLowerCase().includes(q) || n.name.toLowerCase().includes(q);
    const matchN = filterNature === 'All' || n.nature === filterNature;
    if (!matchQ || !matchN) return false;
    let parent = n.parent;
    const byId = new Map<number, ChartAccountNode & { depth: number }>(rows.map(r => [r.id, r]));
    while (parent) {
      const p = byId.get(parent);
      if (p && collapsed[p.code]) return false;
      parent = p?.parent ?? null;
    }
    return true;
  });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        code: form.code,
        name: form.name,
        account_type: form.account_type,
        nature: form.nature,
        parent: form.parent || null,
        is_group: !!form.is_group,
        opening_balance: num(form.opening_balance),
        is_active: form.is_active !== false,
      };
      if (form.id) await mastersApi.chartAccounts.update(form.id, payload);
      else await mastersApi.chartAccounts.create(payload);
      notifySuccess(`Account '${form.code}' saved.`);
      setModalOpen(false);
      await load();
    } catch (err) {
      notifyApiError(err);
    } finally {
      setSaving(false);
    }
  };

  const toggle = (code: string) => setCollapsed(prev => ({ ...prev, [code]: !prev[code] }));

  return (
    <div className="p-6 flex flex-col gap-6 text-left">
      <PageHeader
        moduleNumber="26"
        section="Masters"
        title="Chart of Accounts"
        subtitle="Hierarchical Indented General Ledger Tree"
        actions={
          <button onClick={() => { setForm({ code: '', name: '', account_type: 'Assets', nature: 'Debit', parent: null, is_group: false, opening_balance: 0, is_active: true }); setModalOpen(true); }} className="px-4 py-1.5 bg-[var(--erp-gold)] text-[#0F141B] text-xs font-semibold flex items-center gap-1.5 cursor-pointer">
            <Plus className="w-3.5 h-3.5" /> Add Ledger Head
          </button>
        }
      />
      {error && <MasterError message={error} onRetry={load} />}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {['Assets', 'Liabilities', 'Income', 'Expense'].map(t => (
          <div key={t} className="p-3.5 border border-[var(--erp-hairline)] bg-[var(--erp-surface)]">
            <span className="text-[11px] font-mono text-[var(--erp-muted)] block">{t.toUpperCase()}</span>
            <span className="font-mono text-lg font-bold">{flat.filter(n => n.account_type === t).length}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] p-3">
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 text-[var(--erp-muted)] absolute left-3 top-2.5" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter by code or title..." className="w-full pl-9 pr-3 py-1.5 text-xs bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)] focus:border-[var(--erp-gold)] focus:outline-none font-mono" />
        </div>
        <div className="flex items-center gap-2 font-mono text-xs">
          {['All', 'Debit', 'Credit'].map(n => (
            <button key={n} onClick={() => setFilterNature(n)} className={`px-3 py-1 border ${filterNature === n ? 'border-[var(--erp-gold)] text-[var(--erp-gold)] bg-[var(--erp-surface-2)]' : 'border-[var(--erp-hairline)] text-[var(--erp-muted)]'}`}>{n}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <MasterLoading label="Loading chart of accounts…" rows={10} />
      ) : (
        <div className="border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] overflow-hidden">
          <div className="bg-[var(--erp-surface-2)] border-b border-[var(--erp-hairline-strong)] px-4 py-2.5 font-mono text-xs text-[var(--erp-muted)] flex justify-between">
            <span>ACCOUNT HEAD & HIERARCHICAL CODE TREE</span>
            <div className="flex items-center gap-10">
              <span>NATURE</span>
              <span className="w-36 text-right">OPENING (₹)</span>
              <span className="w-10" />
            </div>
          </div>
          {visible.length === 0 ? (
            <div className="py-12 text-center text-xs font-mono text-[var(--erp-muted)] flex flex-col items-center gap-2">
              <p>
                {tree.length === 0
                  ? 'No ledger heads in the chart of accounts yet.'
                  : 'No ledger heads match this filter.'}
              </p>
              {tree.length === 0 && (
                <button
                  type="button"
                  onClick={() => { setForm({ code: '', name: '', account_type: 'Assets', nature: 'Debit', parent: null, is_group: false, opening_balance: 0, is_active: true }); setModalOpen(true); }}
                  className="px-3 py-1.5 text-xs font-body text-[var(--erp-gold)] border border-[var(--erp-gold)]/40 hover:bg-[var(--erp-gold)]/10 cursor-pointer"
                >
                  Add first ledger head
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-[var(--erp-hairline)]">
              {visible.map(node => {
                const hasChildren = (node.children?.length || 0) > 0 || node.is_group;
                const isCollapsed = !!collapsed[node.code];
                return (
                  <div key={node.id} className="flex items-center px-4 py-2 hover:bg-[var(--erp-surface-2)]/60 text-xs">
                    <button type="button" onClick={() => hasChildren && toggle(node.code)} className="flex items-center gap-2 flex-1 text-left" style={{ paddingLeft: node.depth * 18 }}>
                      {hasChildren ? (isCollapsed ? <ChevronRight className="w-3.5 h-3.5 text-[var(--erp-gold)]" /> : <ChevronDown className="w-3.5 h-3.5 text-[var(--erp-gold)]" />) : <span className="w-3.5" />}
                      {node.is_group ? <Folder className="w-3.5 h-3.5 text-[var(--erp-gold)]" /> : <FileCode className="w-3.5 h-3.5 text-[var(--erp-muted)]" />}
                      <span className="font-mono text-[var(--erp-gold)] w-14">{node.code}</span>
                      <span className={node.is_group ? 'font-semibold text-[var(--erp-text)]' : 'text-[var(--erp-text)]'}>{node.name}</span>
                    </button>
                    <span className="font-mono text-[var(--erp-muted)] w-16">{node.nature === 'Debit' ? 'Dr' : 'Cr'}</span>
                    <span className="font-mono w-36 text-right">₹{num(node.opening_balance).toLocaleString('en-IN')}</span>
                    <div className="w-14 flex justify-end gap-1">
                      <button className="p-1 text-[var(--erp-muted)] hover:text-[var(--erp-gold)]" onClick={() => { setForm(node); setModalOpen(true); }}><Edit2 className="w-3.5 h-3.5" /></button>
                      <button className="p-1 text-[var(--erp-muted)] hover:text-[var(--erp-negative)]" onClick={() => setPendingDelete(node)}><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <form onSubmit={save} className="w-full max-w-lg bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] p-6 space-y-4">
            <div className="flex justify-between border-b border-[var(--erp-hairline)] pb-3">
              <h3 className="font-display text-base font-bold">{form.id ? 'Edit Ledger Head' : 'Add Ledger Head'}</h3>
              <button type="button" onClick={() => setModalOpen(false)}><X className="w-4 h-4" /></button>
            </div>
            <label className="block text-xs font-mono">Parent
              <select value={form.parent ?? ''} onChange={e => setForm({ ...form, parent: e.target.value ? Number(e.target.value) : null })} className="mt-1 w-full px-3 py-1.5 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)]">
                <option value="">Top-level (Assets / Liabilities / Income / Expense)</option>
                {flat.filter(n => n.id !== form.id).map(n => <option key={n.id} value={n.id}>{n.code} · {n.name}</option>)}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3 text-xs font-mono">
              <label>Code<input required value={form.code || ''} onChange={e => setForm({ ...form, code: e.target.value })} className="mt-1 w-full px-3 py-1.5 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)]" /></label>
              <label>Nature
                <select value={form.nature} onChange={e => setForm({ ...form, nature: e.target.value })} className="mt-1 w-full px-3 py-1.5 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)]">
                  <option>Debit</option>
                  <option>Credit</option>
                </select>
              </label>
            </div>
            <label className="block text-xs font-mono">Name<input required value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} className="mt-1 w-full px-3 py-1.5 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)]" /></label>
            <div className="grid grid-cols-2 gap-3 text-xs font-mono">
              <label>Type
                <select value={form.account_type} onChange={e => setForm({ ...form, account_type: e.target.value })} className="mt-1 w-full px-3 py-1.5 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)]">
                  <option>Assets</option>
                  <option>Liabilities</option>
                  <option>Income</option>
                  <option>Expense</option>
                  <option>Equity</option>
                </select>
              </label>
              <label>Opening ₹<input type="number" value={form.opening_balance ?? 0} onChange={e => setForm({ ...form, opening_balance: e.target.value })} className="mt-1 w-full px-3 py-1.5 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)] text-right" /></label>
            </div>
            <label className="flex items-center gap-2 text-xs font-mono">
              <input type="checkbox" checked={!!form.is_group} onChange={e => setForm({ ...form, is_group: e.target.checked })} /> Group / header account
            </label>
            <div className="flex justify-end gap-3 pt-4 border-t border-[var(--erp-hairline)]">
              <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-1.5 border border-[var(--erp-hairline)] text-xs">Cancel</button>
              <button type="submit" disabled={saving} className="px-4 py-1.5 bg-[var(--erp-gold)] text-[#0F141B] text-xs font-semibold flex items-center gap-1"><Save className="w-3.5 h-3.5" />{saving ? 'Saving…' : 'Save Ledger Head'}</button>
            </div>
          </form>
        </div>
      )}
      <ConfirmDialog
        open={!!pendingDelete}
        entityType="ledger head"
        entityLabel={pendingDelete ? `${pendingDelete.name} (${pendingDelete.code})` : ''}
        onCancel={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (!pendingDelete) return;
          try {
            await mastersApi.chartAccounts.remove(pendingDelete.id);
            notifySuccess('Ledger head deleted.');
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
