import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Edit2, Eye, GitBranch, Plus, Search, Trash2, X } from 'lucide-react';
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
import { RecordPrintShare } from '../../components/common/RecordPrintShare';
import { BrandRow, brandsApi } from '../../services/brandsApi';

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
  const noun = count === 1 ? 'child branch' : 'child branches';
  return `Cannot deactivate ${name}: it has ${count} active ${noun}. Deactivate or re-parent them first.`;
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--erp-muted)]">{label}</div>
      <div className="mt-1 min-h-5 text-[var(--erp-text)]">{value || '—'}</div>
    </div>
  );
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
  const [detail, setDetail] = useState<import('../../services/entitiesApi').EntityDetail | null>(null);
  const [brands, setBrands] = useState<BrandRow[]>([]);
  const [brandSearch, setBrandSearch] = useState('');
  const [brandsLoading, setBrandsLoading] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);
  const savingLock = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setTree(await entitiesApi.tree(statusFilter === 'All' ? {} : { status: statusFilter }));
    } catch (e) {
      const parsed = notifyApiError(e, 'Could not load branches.');
      setError(parsed.message);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    setBrandsLoading(true);
    brandsApi.list({ status: 'Active' })
      .then(setBrands)
      .catch(e => notifyApiError(e, 'Could not load active brands.'))
      .finally(() => setBrandsLoading(false));
  }, []);

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
    setBrandSearch('');
    setModalOpen(true);
  };

  const openEdit = async (id: number) => {
    try {
      const detail = await entitiesApi.retrieve(id);
      setForm(detail);
      setFieldErrors([]);
      setFieldMessages({});
      setBrandSearch('');
      setModalOpen(true);
    } catch (e) {
      notifyApiError(e, 'Could not load branch.');
    }
  };

  const openDetails = async (id: number) => {
    try {
      setDetail(await entitiesApi.retrieve(id));
    } catch (e) {
      notifyApiError(e, 'Could not load branch details.');
    }
  };

  const persist = async (payload: Partial<EntityRow>) => {
    if (!acquireSaveLock(savingLock)) return;
    setSaving(true);
    setFieldErrors([]);
    try {
      if (payload.id) {
        await entitiesApi.update(payload.id, payload);
        notifySuccess(`Branch '${payload.entity_name}' updated.`);
      } else {
        await entitiesApi.create(payload);
        notifySuccess(`Branch '${payload.entity_name}' created successfully.`);
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
    if (!form.brand_ids?.length) messages.brand_ids = 'Select at least one active brand.';
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
        title="Branch Master"
        subtitle="Multi-level parent–child branches for Gujarat, Aditi and Shriva"
        actions={
          canWrite ? (
            <button type="button" onClick={() => openCreate(null)} className="px-4 py-1.5 bg-[var(--erp-gold)] text-[#0F141B] font-body text-xs font-semibold flex items-center gap-1.5 cursor-pointer">
              <Plus className="w-3.5 h-3.5" /> Add Branch
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
        <MasterLoading label="Loading branch tree…" rows={8} />
      ) : (
        <div className="border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] overflow-hidden">
          <div className="bg-[var(--erp-surface-2)] border-b border-[var(--erp-hairline-strong)] px-4 py-2.5 font-mono text-xs text-[var(--erp-muted)] flex justify-between">
            <span>BRANCH HIERARCHY</span>
            <div className="flex items-center gap-8">
              <span className="w-24">TYPE</span>
              <span className="w-20">STATUS</span>
              <span className="w-20" />
            </div>
          </div>
          {visible.length === 0 ? (
            <div className="py-12 text-center text-xs font-mono text-[var(--erp-muted)]">
              {statusFilter !== 'All' || search.trim()
                ? 'No branches match this filter.'
                : 'No branches configured yet.'}
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
                    <span className="font-mono text-[var(--erp-muted)] w-24">{node.entity_type === 'Branch' ? 'Branch' : node.entity_type}</span>
                    <span className="w-20">
                      <span className={`font-mono text-[10px] ${contextOnly || node.status !== 'Active' ? 'text-[var(--erp-muted)]' : 'text-[var(--erp-positive)]'}`}>{node.status.toUpperCase()}</span>
                    </span>
                    {!contextOnly && (
                      <div className={`${canWrite ? 'w-20' : 'w-8'} flex justify-end gap-1`}>
                        <button type="button" aria-label={`View ${node.entity_name} details`} title="View details" className="p-1 text-[var(--erp-muted)] hover:text-[var(--erp-gold)] cursor-pointer" onClick={() => void openDetails(node.id)}><Eye className="w-3.5 h-3.5" /></button>
                        {canWrite && (
                        <button type="button" className="p-1 text-[var(--erp-muted)] hover:text-[var(--erp-gold)] cursor-pointer" onClick={() => void openEdit(node.id)}><Edit2 className="w-3.5 h-3.5" /></button>
                        )}
                        {canWrite && node.status === 'Active' && (
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
                    {contextOnly && <div className="w-20" />}
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
              <h3 className="font-display text-lg font-bold">{form.id ? 'Edit Branch' : 'Add Branch'}</h3>
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
                  label="Branch name"
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
                <label className="flex flex-col gap-1 text-xs text-[var(--erp-muted)]">Branch type
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
                label="Parent branch"
                value={form.parent_entity_id ?? null}
                onChange={id => setForm({ ...form, parent_entity_id: id })}
                excludeIds={parentExcludeIds}
                allowEmpty
                emptyLabel="Top-level (no parent)"
                showRollupToggle={false}
                status=""
              />
              <p className="text-[11px] font-mono text-[var(--erp-muted)] mt-2">Leave empty for a root branch. Parent cannot be this branch or one of its descendants.</p>
            </section>

            <section>
              <h4 className={sectionTitle}>Allowed brands</h4>
              <div className={`border ${fieldMessages.brand_ids ? 'border-[var(--erp-negative)]' : 'border-[var(--erp-hairline-strong)]'} bg-[var(--erp-surface)]`}>
                <div className="p-2 border-b border-[var(--erp-hairline)]">
                  <input
                    value={brandSearch}
                    onChange={e => setBrandSearch(e.target.value)}
                    placeholder="Search active brands…"
                    className="w-full bg-transparent px-2 py-1.5 text-sm text-[var(--erp-text)] outline-none"
                  />
                </div>
                {brandsLoading ? (
                  <div className="p-3 text-xs text-[var(--erp-muted)]">Loading active brands…</div>
                ) : brands.length === 0 ? (
                  <div className="p-3 text-xs text-[var(--erp-muted)]">No active brands are available.</div>
                ) : (
                  <div className="max-h-40 overflow-y-auto p-2 grid grid-cols-1 sm:grid-cols-2 gap-1">
                    {brands
                      .filter(brand => `${brand.brand_code} ${brand.brand_name}`.toLowerCase().includes(brandSearch.toLowerCase().trim()))
                      .map(brand => {
                        const checked = (form.brand_ids || []).includes(brand.id);
                        return (
                          <label key={brand.id} className="flex items-center gap-2 px-2 py-1.5 text-sm text-[var(--erp-text)] hover:bg-[var(--erp-surface-2)] cursor-pointer">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => setForm({
                                ...form,
                                brand_ids: checked
                                  ? (form.brand_ids || []).filter(id => id !== brand.id)
                                  : [...(form.brand_ids || []), brand.id],
                              })}
                              className="accent-[var(--erp-gold)]"
                            />
                            <span>{brand.brand_code} · {brand.brand_name}</span>
                          </label>
                        );
                      })}
                  </div>
                )}
              </div>
              <p className={`mt-2 text-[11px] ${fieldMessages.brand_ids ? 'text-[var(--erp-negative)]' : 'text-[var(--erp-muted)]'}`}>
                {fieldMessages.brand_ids || 'Select every brand this branch is allowed to use.'}
              </p>
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
                <TextInput label="Reply-to" value={form.reply_to || ''} onChange={e => setForm({ ...form, reply_to: e.target.value })} />
                <label className="flex flex-col gap-1 text-xs text-[var(--erp-muted)] sm:col-span-2">Email signature
                  <textarea value={form.email_signature || ''} onChange={e => setForm({ ...form, email_signature: e.target.value })} rows={3} className="px-3 py-2 text-sm bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] text-[var(--erp-text)]" />
                </label>
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
              <button type="submit" disabled={saving} className="px-5 py-2 bg-[var(--erp-gold)] text-[#0F141B] text-xs font-semibold">{saving ? 'Saving…' : 'Save Branch'}</button>
            </div>
          </form>
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] p-6 space-y-5">
            <div className="flex items-start justify-between border-b border-[var(--erp-hairline)] pb-3">
              <div>
                <h3 className="font-display text-lg font-bold text-[var(--erp-text)]">{detail.entity_name}</h3>
                <p className="font-mono text-xs text-[var(--erp-muted)]">{detail.short_code} · {detail.entity_type} · {detail.status}</p>
              </div>
              <div className="flex items-center gap-3">
                <RecordPrintShare
                  title="Branch Details"
                  recordName={detail.entity_name}
                  fields={[
                    { label: 'Branch Code', value: detail.short_code },
                    { label: 'Branch Name', value: detail.entity_name },
                    { label: 'Type', value: detail.entity_type },
                    { label: 'Parent Branch', value: detail.parent ? `${detail.parent.short_code} · ${detail.parent.entity_name}` : undefined },
                    { label: 'Status', value: detail.status },
                    { label: 'Cash Code', value: detail.cash_code },
                    { label: 'Invoice Series', value: detail.invoice_series },
                    { label: 'Contact Person', value: detail.contact_person },
                    { label: 'Phone', value: detail.phone },
                    { label: 'Mobile', value: detail.mobile },
                    { label: 'Email', value: detail.email },
                    { label: 'Website', value: detail.website },
                    { label: 'Address', value: [detail.address_line_1, detail.street, detail.area, detail.city, detail.district, detail.state, detail.pin_code].filter(Boolean).join(', ') },
                    { label: 'GST No.', value: detail.gst_no },
                    { label: 'PAN No.', value: detail.pan_no },
                    { label: 'CST TIN', value: detail.cst_tin },
                    { label: 'Licence No.', value: detail.licence_no },
                  ]}
                />
                <button type="button" aria-label="Close branch details" onClick={() => setDetail(null)}><X className="w-4 h-4" /></button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-xs">
              <DetailField label="Parent branch" value={detail.parent ? `${detail.parent.short_code} · ${detail.parent.entity_name}` : 'None'} />
              <DetailField label="Cash code" value={detail.cash_code} />
              <DetailField label="Invoice series" value={detail.invoice_series} />
              <DetailField label="Allowed brands" value={(detail.brands || []).map(brand => `${brand.brand_code} · ${brand.brand_name}`).join(', ') || 'None'} />
              <DetailField label="Contact person" value={detail.contact_person} />
              <DetailField label="Phone / Mobile" value={[detail.phone, detail.mobile].filter(Boolean).join(' / ')} />
              <DetailField label="Email" value={detail.email} />
              <DetailField label="Reply-to" value={detail.reply_to} />
              <DetailField label="Email signature" value={detail.email_signature} />
              <DetailField label="Website" value={detail.website} />
              <DetailField label="Address" value={[detail.address_line_1, detail.street, detail.area, detail.city, detail.district, detail.state, detail.pin_code].filter(Boolean).join(', ')} />
              <DetailField label="GST No." value={detail.gst_no} />
              <DetailField label="PAN No." value={detail.pan_no} />
              <DetailField label="CST TIN" value={detail.cst_tin} />
              <DetailField label="Licence No." value={detail.licence_no} />
            </div>
            {detail.children.length > 0 && (
              <div className="border-t border-[var(--erp-hairline)] pt-4">
                <h4 className={sectionTitle}>Child branches</h4>
                <div className="flex flex-wrap gap-2">
                  {detail.children.map(child => (
                    <span key={child.id} className="px-2 py-1 border border-[var(--erp-hairline)] font-mono text-[11px]">
                      {child.short_code} · {child.entity_name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        entityType="branch"
        entityLabel={pendingDelete ? `${pendingDelete.entity_name} (${pendingDelete.short_code})` : ''}
        title={deleteBlockDetail ? 'Cannot deactivate branch' : 'Deactivate branch?'}
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
        entityType="branch"
        entityLabel={pendingDeactivate ? pendingDeactivate.entity_name || '' : ''}
        title="Cannot deactivate branch"
        message={
          pendingDeactivate
            ? activeChildrenBlockMessage(
                pendingDeactivate.entity_name || 'This branch',
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
