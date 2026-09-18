import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Edit2, GitBranch, Plus, Search, Trash2, X } from 'lucide-react';
import { useErp } from '../../context/ErpContext';
import { PageHeader } from '../../components/common/PageHeader';
import { TextInput, RequiredLegend } from '../../components/common/FormControls';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { EntitySelector } from '../../components/common/EntitySelector';
import { MasterError, MasterLoading } from './MasterStatus';
import { notifyApiError, notifySuccess, parseApiErrorDetails } from '../../services/notify';
import { acquireSaveLock, releaseSaveLock } from '../../services/saveLock';
import { clearFieldMessage, collectRequired } from '../../services/requiredFields';
import {
  ENTITY_TYPES,
  EntityRow,
  EntityTreeNode,
  emptyEntity,
  entitiesApi,
} from '../../services/entitiesApi';

type FlatNode = EntityTreeNode & { depth: number };

function flatten(nodes: EntityTreeNode[], depth = 0, acc: FlatNode[] = []): FlatNode[] {
  for (const n of nodes) {
    acc.push({ ...n, depth });
    if (n.children?.length) flatten(n.children, depth + 1, acc);
  }
  return acc;
}

function collectDescendantIds(node: EntityTreeNode, acc: number[] = []): number[] {
  for (const c of node.children || []) {
    acc.push(c.id);
    collectDescendantIds(c, acc);
  }
  return acc;
}

function findNode(nodes: EntityTreeNode[], id: number): EntityTreeNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const hit = findNode(n.children || [], id);
    if (hit) return hit;
  }
  return null;
}

const sectionTitle = 'text-[11px] font-mono uppercase tracking-wider text-[var(--erp-gold)] border-b border-[var(--erp-hairline)] pb-1 mb-3';

function activeChildrenBlockMessage(name: string, count: number): string {
  const noun = count === 1 ? 'child entity' : 'child entities';
  return `Cannot deactivate ${name}: it has ${count} active ${noun}. Deactivate or re-parent them first.`;
}

export const EntityMasterScreen: React.FC = () => {
  const { userRole } = useErp();
  const canWrite = userRole === 'admin';
  const [tree, setTree] = useState<EntityTreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Active' | 'Inactive'>('All');
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<Partial<EntityRow>>(emptyEntity());
  const [fieldErrors, setFieldErrors] = useState<string[]>([]);
  const [fieldMessages, setFieldMessages] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<EntityTreeNode | null>(null);
  const [deleteBlockDetail, setDeleteBlockDetail] = useState<string | null>(null);
  const [pendingDeactivate, setPendingDeactivate] = useState<Partial<EntityRow> | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const savingLock = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setTree(await entitiesApi.tree(statusFilter === 'All' ? {} : { status: statusFilter }));
    } catch (e) {
      const parsed = notifyApiError(e, 'Could not load entities.');
      setError(parsed.message);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { void load(); }, [load]);

  const flat = useMemo(() => flatten(tree), [tree]);

  const visible = useMemo(() => {
    const q = search.toLowerCase().trim();
    const byId = new Map<number, FlatNode>(flat.map(r => [r.id, r]));
    const keep = new Set<number>();
    for (const n of flat) {
      const selfMatch = !q
        || n.entity_name.toLowerCase().includes(q)
        || n.short_code.toLowerCase().includes(q)
        || n.city.toLowerCase().includes(q);
      if (!selfMatch) continue;
      keep.add(n.id);
      let parentId = n.parent_entity_id;
      while (parentId) {
        keep.add(parentId);
        parentId = byId.get(parentId)?.parent_entity_id ?? null;
      }
    }
    return flat.filter(n => {
      if (!keep.has(n.id)) return false;
      let parentId = n.parent_entity_id;
      while (parentId) {
        if (collapsed[parentId]) return false;
        parentId = byId.get(parentId)?.parent_entity_id ?? null;
      }
      return true;
    });
  }, [flat, search, collapsed]);

  const parentExcludeIds = useMemo(() => {
    if (!form.id) return [];
    const node = findNode(tree, form.id);
    return [form.id, ...(node ? collectDescendantIds(node) : [])];
  }, [form.id, tree]);

  const openCreate = (parentId: number | null = null) => {
    setForm({ ...emptyEntity(), parent_entity_id: parentId });
    setFieldErrors([]);
    setFieldMessages({});
    setModalOpen(true);
  };

  const openEdit = async (id: number) => {
    try {
      const detail = await entitiesApi.retrieve(id);
      setForm(detail);
      setFieldErrors([]);
      setFieldMessages({});
      setModalOpen(true);
    } catch (e) {
      notifyApiError(e, 'Could not load entity.');
    }
  };

  const persist = async (payload: Partial<EntityRow>) => {
    if (!acquireSaveLock(savingLock)) return;
    setSaving(true);
    setFieldErrors([]);
    try {
      if (payload.id) {
        await entitiesApi.update(payload.id, payload);
        notifySuccess(`Entity '${payload.entity_name}' updated.`);
      } else {
        await entitiesApi.create(payload);
        notifySuccess(`Entity '${payload.entity_name}' created successfully.`);
      }
      setModalOpen(false);
      setPendingDeactivate(null);
      await load(); // list refresh only after 2xx — never optimistic
    } catch (err) {
      const parsed = notifyApiError(err);
      setFieldErrors(parsed.fields);
      if (parsed.fields.includes('short_code')) {
        requestAnimationFrame(() => codeRef.current?.focus());
      }
    } finally {
      setSaving(false);
      releaseSaveLock(savingLock);
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const messages = collectRequired({
      short_code: form.short_code,
      entity_name: form.entity_name,
    });
    if (Object.keys(messages).length) {
      setFieldMessages(messages);
      setFieldErrors(Object.keys(messages));
      if (messages.short_code) requestAnimationFrame(() => codeRef.current?.focus());
      return;
    }
    setFieldMessages({});
    const wasActive = form.id ? (flat.find(n => n.id === form.id)?.status === 'Active') : true;
    const goingInactive = form.status === 'Inactive' && wasActive;
    const kids = form.active_children_count || 0;
    if (goingInactive && kids > 0) {
      setPendingDeactivate(form);
      return;
    }
    await persist(form);
  };

  return (
    <div className="p-6 flex flex-col gap-6 text-left">
      <PageHeader
        moduleNumber="36"
        section="Masters"
        title="Entity Master"
        subtitle="Multi-level parent–child entities for Gujarat, Aditi and Shriva"
        actions={
          canWrite ? (
            <button type="button" onClick={() => openCreate(null)} className="px-4 py-1.5 bg-[var(--erp-gold)] text-[#0F141B] font-body text-xs font-semibold flex items-center gap-1.5 cursor-pointer">
              <Plus className="w-3.5 h-3.5" /> Add Entity
            </button>
          ) : undefined
        }
      />
      {error && <MasterError message={error} onRetry={load} />}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] p-3">
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 text-[var(--erp-muted)] absolute left-3 top-2.5" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search code, name or city…" className="w-full pl-9 pr-3 py-1.5 text-xs bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)] focus:border-[var(--erp-gold)] focus:outline-none font-mono" />
        </div>
        <div className="flex items-center gap-2 font-mono text-xs">
          {(['All', 'Active', 'Inactive'] as const).map(s => (
            <button key={s} type="button" onClick={() => setStatusFilter(s)} className={`px-3 py-1 border ${statusFilter === s ? 'border-[var(--erp-gold)] text-[var(--erp-gold)] bg-[var(--erp-surface-2)]' : 'border-[var(--erp-hairline)] text-[var(--erp-muted)]'}`}>{s}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <MasterLoading label="Loading entity tree…" rows={8} />
      ) : (
        <div className="border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] overflow-hidden">
          <div className="bg-[var(--erp-surface-2)] border-b border-[var(--erp-hairline-strong)] px-4 py-2.5 font-mono text-xs text-[var(--erp-muted)] flex justify-between">
            <span>ENTITY HIERARCHY</span>
            <div className="flex items-center gap-8">
              <span className="w-24">TYPE</span>
              <span className="w-20">STATUS</span>
              <span className="w-14" />
            </div>
          </div>
          {visible.length === 0 ? (
            <div className="py-12 text-center text-xs font-mono text-[var(--erp-muted)]">
              {statusFilter !== 'All' || search.trim()
                ? 'No entities match this filter.'
                : 'No entities configured yet.'}
            </div>
          ) : (
            <div className="divide-y divide-[var(--erp-hairline)]">
              {visible.map(node => {
                const hasChildren = (node.children?.length || 0) > 0;
                const isCollapsed = !!collapsed[node.id];
                const contextOnly = !!node.context_only;
                return (
                  <div
                    key={node.id}
                    className={`flex items-center px-4 py-2 text-xs ${contextOnly ? 'opacity-45' : 'hover:bg-[var(--erp-surface-2)]/60'}`}
                  >
                    <button type="button" onClick={() => hasChildren && setCollapsed(p => ({ ...p, [node.id]: !p[node.id] }))} className="flex items-center gap-2 flex-1 text-left min-w-0" style={{ paddingLeft: node.depth * 18 }}>
                      {hasChildren ? (isCollapsed ? <ChevronRight className="w-3.5 h-3.5 text-[var(--erp-gold)]" /> : <ChevronDown className="w-3.5 h-3.5 text-[var(--erp-gold)]" />) : <span className="w-3.5" />}
                      <GitBranch className={`w-3.5 h-3.5 shrink-0 ${contextOnly ? 'text-[var(--erp-muted)]' : 'text-[var(--erp-gold)]'}`} />
                      <span className={`font-mono w-12 shrink-0 ${contextOnly ? 'text-[var(--erp-muted)]' : 'text-[var(--erp-gold)]'}`}>{node.short_code}</span>
                      <span className={`truncate ${contextOnly ? 'font-normal text-[var(--erp-muted)]' : 'font-medium text-[var(--erp-text)]'}`}>{node.entity_name}</span>
                      {contextOnly && (
                        <span className="ml-2 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wide border border-[var(--erp-hairline)] text-[var(--erp-faint)]">context</span>
                      )}
                      {!contextOnly && node.active_children_count > 0 && (
                        <span className="ml-2 px-1.5 py-0.5 text-[9px] font-mono border border-[var(--erp-hairline)] text-[var(--erp-muted)]">
                          {node.active_children_count} child{node.active_children_count === 1 ? '' : 'ren'}
                        </span>
                      )}
                    </button>
                    <span className="font-mono text-[var(--erp-muted)] w-24">{node.entity_type}</span>
                    <span className="w-20">
                      <span className={`font-mono text-[10px] ${contextOnly || node.status !== 'Active' ? 'text-[var(--erp-muted)]' : 'text-[var(--erp-positive)]'}`}>{node.status.toUpperCase()}</span>
                    </span>
                    {canWrite && !contextOnly && (
                      <div className="w-14 flex justify-end gap-1">
                        <button type="button" className="p-1 text-[var(--erp-muted)] hover:text-[var(--erp-gold)] cursor-pointer" onClick={() => void openEdit(node.id)}><Edit2 className="w-3.5 h-3.5" /></button>
                        {node.status === 'Active' && (
                          <button
                            type="button"
                            className="p-1 text-[var(--erp-muted)] hover:text-[var(--erp-negative)] cursor-pointer"
                            onClick={() => {
                              const kids = node.active_children_count || 0;
                              setDeleteBlockDetail(kids > 0 ? activeChildrenBlockMessage(node.entity_name, kids) : null);
                              setPendingDelete(node);
                            }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                    {canWrite && contextOnly && <div className="w-14" />}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {modalOpen && canWrite && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <form noValidate onSubmit={save} className="w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] p-6 space-y-6">
            <div className="flex justify-between border-b border-[var(--erp-hairline)] pb-3 sticky top-0 bg-[var(--erp-surface)] z-10">
              <h3 className="font-display text-lg font-bold">{form.id ? 'Edit Entity' : 'Add Entity'}</h3>
              <button type="button" onClick={() => setModalOpen(false)}><X className="w-4 h-4" /></button>
            </div>
            <RequiredLegend />
            <section>
              <h4 className={sectionTitle}>Identity</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <TextInput
                  ref={codeRef}
                  label="Short code"
                  mono
                  required
                  error={fieldMessages.short_code}
                  invalid={fieldErrors.includes('short_code')}
                  value={form.short_code || ''}
                  onChange={e => {
                    setForm({ ...form, short_code: e.target.value.toUpperCase() });
                    setFieldErrors(prev => prev.filter(f => f !== 'short_code'));
                    setFieldMessages(prev => clearFieldMessage(prev, 'short_code'));
                  }}
                />
                <TextInput
                  label="Entity name"
                  required
                  error={fieldMessages.entity_name}
                  invalid={fieldErrors.includes('entity_name')}
                  value={form.entity_name || ''}
                  onChange={e => {
                    setForm({ ...form, entity_name: e.target.value });
                    setFieldErrors(prev => prev.filter(f => f !== 'entity_name'));
                    setFieldMessages(prev => clearFieldMessage(prev, 'entity_name'));
                  }}
                />
                <label className="flex flex-col gap-1 text-xs text-[var(--erp-muted)]">Entity type
                  <select value={form.entity_type || 'Branch'} onChange={e => setForm({ ...form, entity_type: e.target.value })} className="px-3 py-2 text-sm bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] text-[var(--erp-text)]">
                    {ENTITY_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-[var(--erp-muted)]">Status
                  <select value={form.status || 'Active'} onChange={e => setForm({ ...form, status: e.target.value as EntityRow['status'] })} className="px-3 py-2 text-sm bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] text-[var(--erp-text)]">
                    <option>Active</option>
                    <option>Inactive</option>
                  </select>
                </label>
                <TextInput label="Cash code" mono value={form.cash_code || ''} onChange={e => setForm({ ...form, cash_code: e.target.value })} />
                <TextInput label="Invoice series" mono value={form.invoice_series || ''} onChange={e => setForm({ ...form, invoice_series: e.target.value })} />
              </div>
            </section>

            <section>
              <h4 className={sectionTitle}>Hierarchy</h4>
              <EntitySelector
                label="Parent entity"
                value={form.parent_entity_id ?? null}
                onChange={id => setForm({ ...form, parent_entity_id: id })}
                excludeIds={parentExcludeIds}
                allowEmpty
                emptyLabel="Top-level (no parent)"
                showRollupToggle={false}
                status=""
              />
              <p className="text-[11px] font-mono text-[var(--erp-muted)] mt-2">Leave empty for a root entity. Parent cannot be this entity or one of its descendants.</p>
            </section>

            <section>
              <h4 className={sectionTitle}>Address</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <TextInput label="Address line 1" value={form.address_line_1 || ''} onChange={e => setForm({ ...form, address_line_1: e.target.value })} />
                <TextInput label="Street" value={form.street || ''} onChange={e => setForm({ ...form, street: e.target.value })} />
                <TextInput label="Address line 2" value={form.address_line_2 || ''} onChange={e => setForm({ ...form, address_line_2: e.target.value })} />
                <TextInput label="Area" value={form.area || ''} onChange={e => setForm({ ...form, area: e.target.value })} />
                <TextInput label="City" value={form.city || ''} onChange={e => setForm({ ...form, city: e.target.value })} />
                <TextInput label="District" value={form.district || ''} onChange={e => setForm({ ...form, district: e.target.value })} />
                <TextInput label="State" value={form.state || ''} onChange={e => setForm({ ...form, state: e.target.value })} />
                <TextInput label="PIN code" mono value={form.pin_code || ''} onChange={e => setForm({ ...form, pin_code: e.target.value })} />
                <TextInput label="Country" value={form.country || ''} onChange={e => setForm({ ...form, country: e.target.value })} />
                <TextInput label="Zone" value={form.zone || ''} onChange={e => setForm({ ...form, zone: e.target.value })} />
              </div>
            </section>

            <section>
              <h4 className={sectionTitle}>Contact</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <TextInput label="Contact person" value={form.contact_person || ''} onChange={e => setForm({ ...form, contact_person: e.target.value })} />
                <TextInput label="STD code" mono value={form.std_code || ''} onChange={e => setForm({ ...form, std_code: e.target.value })} />
                <TextInput label="Phone" mono value={form.phone || ''} onChange={e => setForm({ ...form, phone: e.target.value })} />
                <TextInput label="Mobile" mono value={form.mobile || ''} onChange={e => setForm({ ...form, mobile: e.target.value })} />
                <TextInput label="Fax" mono value={form.fax || ''} onChange={e => setForm({ ...form, fax: e.target.value })} />
                <TextInput label="Email" value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })} />
                <TextInput label="Website" value={form.website || ''} onChange={e => setForm({ ...form, website: e.target.value })} className="sm:col-span-2" />
              </div>
            </section>

            <section>
              <h4 className={sectionTitle}>Statutory</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <TextInput label="PAN" mono value={form.pan_no || ''} onChange={e => setForm({ ...form, pan_no: e.target.value.toUpperCase() })} />
                <TextInput label="GSTIN" mono value={form.gst_no || ''} onChange={e => setForm({ ...form, gst_no: e.target.value.toUpperCase() })} />
                <TextInput label="CST / TIN" mono value={form.cst_tin || ''} onChange={e => setForm({ ...form, cst_tin: e.target.value })} />
                <TextInput label="Licence no" mono value={form.licence_no || ''} onChange={e => setForm({ ...form, licence_no: e.target.value })} />
                <TextInput label="ECC" mono value={form.ecc || ''} onChange={e => setForm({ ...form, ecc: e.target.value })} />
                <TextInput label="Division" value={form.division || ''} onChange={e => setForm({ ...form, division: e.target.value })} />
                <TextInput label="Range" value={form.range || ''} onChange={e => setForm({ ...form, range: e.target.value })} />
              </div>
            </section>

            <section>
              <h4 className={sectionTitle}>Custom</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <TextInput label="Other 1" value={form.other_1 || ''} onChange={e => setForm({ ...form, other_1: e.target.value })} />
                <TextInput label="Other 2" value={form.other_2 || ''} onChange={e => setForm({ ...form, other_2: e.target.value })} />
              </div>
            </section>

            <div className="flex justify-end gap-3 pt-4 border-t border-[var(--erp-hairline)]">
              <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 border border-[var(--erp-hairline)] text-xs font-mono">Cancel</button>
              <button type="submit" disabled={saving} className="px-5 py-2 bg-[var(--erp-gold)] text-[#0F141B] text-xs font-semibold">{saving ? 'Saving…' : 'Save Entity'}</button>
            </div>
          </form>
        </div>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        entityType="entity"
        entityLabel={pendingDelete ? `${pendingDelete.entity_name} (${pendingDelete.short_code})` : ''}
        title={deleteBlockDetail ? 'Cannot deactivate entity' : 'Deactivate entity?'}
        message={
          deleteBlockDetail
          || (pendingDelete
            ? `${pendingDelete.entity_name} (${pendingDelete.short_code}) will be set to Inactive. This does not delete any records — it can be reactivated later from the Inactive filter.`
            : '')
        }
        confirmLabel={deleteBlockDetail ? 'Understood' : 'Deactivate'}
        busyLabel={deleteBlockDetail ? 'Understood' : 'Deactivating…'}
        onCancel={() => {
          setPendingDelete(null);
          setDeleteBlockDetail(null);
        }}
        onConfirm={async () => {
          if (!pendingDelete) return;
          if (deleteBlockDetail) {
            setPendingDelete(null);
            setDeleteBlockDetail(null);
            return;
          }
          try {
            await entitiesApi.deactivate(pendingDelete.id);
            notifySuccess(`${pendingDelete.entity_name} (${pendingDelete.short_code}) deactivated.`);
            setPendingDelete(null);
            setDeleteBlockDetail(null);
            await load();
          } catch (err) {
            const status = (err as { status?: number }).status;
            const data = (err as { data?: { active_children_count?: number; detail?: string } }).data;
            if (status === 409) {
              const parsed = parseApiErrorDetails(err);
              const count = data?.active_children_count || pendingDelete.active_children_count || 0;
              setDeleteBlockDetail(data?.detail || parsed.message || activeChildrenBlockMessage(pendingDelete.entity_name, count));
              return;
            }
            notifyApiError(err);
          }
        }}
      />

      <ConfirmDialog
        open={!!pendingDeactivate}
        entityType="entity"
        entityLabel={pendingDeactivate ? pendingDeactivate.entity_name || '' : ''}
        title="Cannot deactivate entity"
        message={
          pendingDeactivate
            ? activeChildrenBlockMessage(
                pendingDeactivate.entity_name || 'This entity',
                pendingDeactivate.active_children_count || 0,
              )
            : ''
        }
        confirmLabel="Understood"
        onCancel={() => setPendingDeactivate(null)}
        onConfirm={() => {
          setPendingDeactivate(null);
        }}
      />
    </div>
  );
};
