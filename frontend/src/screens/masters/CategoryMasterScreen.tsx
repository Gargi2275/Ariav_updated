import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronRight, Edit2, FolderTree, MoreVertical, Plus, RotateCcw, Search, Trash2, X } from 'lucide-react';
import { useErp } from '../../context/ErpContext';
import { PageHeader } from '../../components/common/PageHeader';
import { TextInput, RequiredLegend } from '../../components/common/FormControls';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { MasterError, MasterLoading } from './MasterStatus';
import { notifyApiError, notifySuccess, parseApiErrorDetails } from '../../services/notify';
import { acquireSaveLock, releaseSaveLock } from '../../services/saveLock';
import { clearFieldMessage, collectRequired } from '../../services/requiredFields';
import {
  CategoryRow,
  CategoryTreeNode,
  categoriesApi,
  emptyCategory,
} from '../../services/categoriesApi';

type FlatNode = CategoryTreeNode & { depth: number };

function flatten(nodes: CategoryTreeNode[], depth = 0, acc: FlatNode[] = []): FlatNode[] {
  for (const n of nodes) {
    acc.push({ ...n, depth });
    if (n.children?.length) flatten(n.children, depth + 1, acc);
  }
  return acc;
}

const sectionTitle = 'text-[11px] font-mono uppercase tracking-wider text-[var(--erp-gold)] border-b border-[var(--erp-hairline)] pb-1 mb-3';

export const CategoryMasterScreen: React.FC = () => {
  const { userRole } = useErp();
  const canWrite = userRole === 'admin';
  const [tree, setTree] = useState<CategoryTreeNode[]>([]);
  const [roots, setRoots] = useState<CategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Active' | 'Inactive'>('All');
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<Partial<CategoryRow>>(emptyCategory());
  const [fieldErrors, setFieldErrors] = useState<string[]>([]);
  const [fieldMessages, setFieldMessages] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<CategoryTreeNode | null>(null);
  const [deleteBlockDetail, setDeleteBlockDetail] = useState<string | null>(null);
  const [pendingHardDelete, setPendingHardDelete] = useState<CategoryTreeNode | null>(null);
  const [hardDeleteBlockDetail, setHardDeleteBlockDetail] = useState<string | null>(null);
  const [kebab, setKebab] = useState<{ node: CategoryTreeNode; top: number; left: number } | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const savingLock = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [t, r] = await Promise.all([
        categoriesApi.tree(statusFilter === 'All' ? {} : { status: statusFilter }),
        categoriesApi.list({ parent_category_id: 'null' }),
      ]);
      setTree(t);
      setRoots(r);
    } catch (e) {
      const parsed = notifyApiError(e, 'Could not load categories.');
      setError(parsed.message);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!kebab) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-category-kebab]')) return;
      setKebab(null);
    };
    // Defer so the opening click does not immediately close the menu.
    const timer = window.setTimeout(() => {
      document.addEventListener('mousedown', onPointerDown);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [kebab]);

  const flat = useMemo(() => flatten(tree), [tree]);

  const visible = useMemo(() => {
    const q = search.toLowerCase().trim();
    const byId = new Map<number, FlatNode>(flat.map(r => [r.id, r]));
    const keep = new Set<number>();
    for (const n of flat) {
      const selfMatch = !q
        || n.category_name.toLowerCase().includes(q)
        || n.category_code.toLowerCase().includes(q);
      if (!selfMatch) continue;
      keep.add(n.id);
      let parentId = n.parent_category_id;
      while (parentId) {
        keep.add(parentId);
        parentId = byId.get(parentId)?.parent_category_id ?? null;
      }
    }
    return flat.filter(n => {
      if (!keep.has(n.id)) return false;
      let parentId = n.parent_category_id;
      while (parentId) {
        if (collapsed[parentId]) return false;
        parentId = byId.get(parentId)?.parent_category_id ?? null;
      }
      return true;
    });
  }, [flat, search, collapsed]);

  const parentOptions = roots.filter(r => r.id !== form.id && !r.parent_category_id && (r.status === 'Active' || r.id === form.parent_category_id));

  const openCreate = (parentId: number | null = null) => {
    setForm({ ...emptyCategory(), parent_category_id: parentId });
    setFieldErrors([]);
    setFieldMessages({});
    setModalOpen(true);
  };

  const openEdit = async (id: number) => {
    try {
      const detail = await categoriesApi.retrieve(id);
      setForm(detail);
      setFieldErrors([]);
      setFieldMessages({});
      setModalOpen(true);
    } catch (e) {
      notifyApiError(e);
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const messages = collectRequired({
      category_code: form.category_code,
      category_name: form.category_name,
    });
    if (Object.keys(messages).length) {
      setFieldMessages(messages);
      setFieldErrors(Object.keys(messages));
      if (messages.category_code) requestAnimationFrame(() => codeRef.current?.focus());
      return;
    }
    setFieldMessages({});
    if (!acquireSaveLock(savingLock)) return;
    setSaving(true);
    setFieldErrors([]);
    const payload = {
      category_code: (form.category_code || '').trim().toUpperCase(),
      category_name: (form.category_name || '').trim(),
      parent_category_id: form.parent_category_id || null,
      status: form.status || 'Active',
    };
    try {
      if (form.id) {
        await categoriesApi.update(form.id, payload);
        notifySuccess(`Category '${payload.category_name}' saved.`);
      } else {
        await categoriesApi.create(payload);
        notifySuccess(`Category '${payload.category_name}' saved.`);
      }
      setModalOpen(false);
      await load(); // list refresh only after 2xx — never optimistic
    } catch (err) {
      const parsed = notifyApiError(err);
      setFieldErrors(parsed.fields);
      if (parsed.fields.includes('category_code')) {
        requestAnimationFrame(() => codeRef.current?.focus());
      }
    } finally {
      setSaving(false);
      releaseSaveLock(savingLock);
    }
  };

  return (
    <div className="p-6 flex flex-col gap-6 text-left">
      <PageHeader
        moduleNumber="38"
        section="Masters"
        title="Category Master"
        subtitle="Two-level Category → Subcategory list, shared across all brands"
        actions={
          canWrite ? (
            <button type="button" onClick={() => openCreate(null)} className="px-4 py-1.5 bg-[var(--erp-gold)] text-[#0F141B] font-body text-xs font-semibold flex items-center gap-1.5 cursor-pointer">
              <Plus className="w-3.5 h-3.5" /> Add Category
            </button>
          ) : undefined
        }
      />
      {error && <MasterError message={error} onRetry={load} />}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] p-3">
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 text-[var(--erp-muted)] absolute left-3 top-2.5" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search code or name…" className="w-full pl-9 pr-3 py-1.5 text-xs bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)] focus:border-[var(--erp-gold)] focus:outline-none font-mono" />
        </div>
        <div className="flex items-center gap-2 font-mono text-xs">
          {(['All', 'Active', 'Inactive'] as const).map(s => (
            <button key={s} type="button" onClick={() => setStatusFilter(s)} className={`px-3 py-1 border ${statusFilter === s ? 'border-[var(--erp-gold)] text-[var(--erp-gold)] bg-[var(--erp-surface-2)]' : 'border-[var(--erp-hairline)] text-[var(--erp-muted)]'}`}>{s}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <MasterLoading label="Loading categories…" rows={8} />
      ) : (
        <div className="border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)]">
          <div className="bg-[var(--erp-surface-2)] border-b border-[var(--erp-hairline-strong)] px-4 py-2.5 font-mono text-xs text-[var(--erp-muted)] flex justify-between">
            <span>CATEGORY → SUBCATEGORY</span>
            <div className="flex items-center gap-8">
              <span className="w-20">STATUS</span>
              <span className="w-24" />
            </div>
          </div>
          {visible.length === 0 ? (
            <div className="py-12 text-center text-xs font-mono text-[var(--erp-muted)]">
              {statusFilter !== 'All' || search.trim() ? 'No categories match this filter.' : 'No categories configured yet.'}
            </div>
          ) : (
            <div className="divide-y divide-[var(--erp-hairline)]">
              {visible.map(node => {
                const hasChildren = (node.children?.length || 0) > 0;
                const isCollapsed = !!collapsed[node.id];
                const contextOnly = !!node.context_only;
                const isRoot = !node.parent_category_id;
                return (
                  <div
                    key={node.id}
                    className={`flex items-center px-4 py-2 text-xs ${contextOnly ? 'opacity-45' : 'hover:bg-[var(--erp-surface-2)]/60'}`}
                  >
                    <button type="button" onClick={() => hasChildren && setCollapsed(p => ({ ...p, [node.id]: !p[node.id] }))} className="flex items-center gap-2 flex-1 text-left min-w-0" style={{ paddingLeft: node.depth * 18 }}>
                      {hasChildren ? (isCollapsed ? <ChevronRight className="w-3.5 h-3.5 text-[var(--erp-gold)]" /> : <ChevronDown className="w-3.5 h-3.5 text-[var(--erp-gold)]" />) : <span className="w-3.5" />}
                      <FolderTree className={`w-3.5 h-3.5 shrink-0 ${contextOnly ? 'text-[var(--erp-muted)]' : 'text-[var(--erp-gold)]'}`} />
                      <span className={`font-mono w-14 shrink-0 ${contextOnly ? 'text-[var(--erp-muted)]' : 'text-[var(--erp-gold)]'}`}>{node.category_code}</span>
                      <span className={`truncate ${contextOnly ? 'font-normal text-[var(--erp-muted)]' : 'font-medium text-[var(--erp-text)]'}`}>{node.category_name}</span>
                      {contextOnly && (
                        <span className="ml-2 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wide border border-[var(--erp-hairline)] text-[var(--erp-faint)]">context</span>
                      )}
                      {!contextOnly && isRoot && (
                        <span className="ml-2 px-1.5 py-0.5 text-[9px] font-mono border border-[var(--erp-hairline)] text-[var(--erp-muted)]">category</span>
                      )}
                      {!contextOnly && !isRoot && (
                        <span className="ml-2 px-1.5 py-0.5 text-[9px] font-mono border border-[var(--erp-hairline)] text-[var(--erp-muted)]">sub</span>
                      )}
                    </button>
                    <span className="w-20">
                      <span className={`font-mono text-[10px] ${contextOnly || node.status !== 'Active' ? 'text-[var(--erp-muted)]' : 'text-[var(--erp-positive)]'}`}>{node.status.toUpperCase()}</span>
                    </span>
                    {canWrite && !contextOnly && (
                      <div className="w-24 flex justify-end gap-1 relative">
                        {isRoot && node.status === 'Active' && (
                          <button type="button" className="p-1 text-[var(--erp-muted)] hover:text-[var(--erp-gold)] cursor-pointer" title="Add subcategory" onClick={() => openCreate(node.id)}><Plus className="w-3.5 h-3.5" /></button>
                        )}
                        <button type="button" className="p-1 text-[var(--erp-muted)] hover:text-[var(--erp-gold)] cursor-pointer" onClick={() => void openEdit(node.id)}><Edit2 className="w-3.5 h-3.5" /></button>
                        {node.status === 'Active' && (
                          <button
                            type="button"
                            className="p-1 text-[var(--erp-muted)] hover:text-[var(--erp-negative)] cursor-pointer"
                            title="Deactivate"
                            onClick={() => {
                              setDeleteBlockDetail(null);
                              setPendingDelete(node);
                            }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {node.status === 'Inactive' && (
                          <button
                            type="button"
                            data-category-kebab
                            className="p-1 text-[var(--erp-muted)] hover:text-[var(--erp-gold)] cursor-pointer"
                            title="More actions"
                            aria-haspopup="menu"
                            aria-expanded={kebab?.node.id === node.id}
                            onClick={e => {
                              e.preventDefault();
                              e.stopPropagation();
                              const rect = e.currentTarget.getBoundingClientRect();
                              const width = 184;
                              const left = Math.min(
                                Math.max(8, rect.right - width),
                                window.innerWidth - width - 8,
                              );
                              setKebab(open => (
                                open?.node.id === node.id
                                  ? null
                                  : { node, top: rect.bottom + 4, left }
                              ));
                            }}
                          >
                            <MoreVertical className="w-3.5 h-3.5 pointer-events-none" />
                          </button>
                        )}
                      </div>
                    )}
                    {canWrite && contextOnly && <div className="w-24" />}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {kebab && createPortal(
        <div
          data-category-kebab
          role="menu"
          className="fixed z-[70] min-w-[11.5rem] border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface-2)] shadow-lg py-1"
          style={{ top: kebab.top, left: kebab.left }}
        >
          <button
            type="button"
            role="menuitem"
            className="w-full px-3 py-1.5 text-left text-[11px] font-body text-[var(--erp-text)] hover:bg-[var(--erp-surface)] flex items-center gap-2 cursor-pointer"
            onClick={async () => {
              const node = kebab.node;
              setKebab(null);
              try {
                await categoriesApi.reactivate(node.id);
                notifySuccess(`Category '${node.category_name}' reactivated.`);
                await load();
              } catch (err) {
                notifyApiError(err);
              }
            }}
          >
            <RotateCcw className="w-3.5 h-3.5 text-[var(--erp-gold)]" /> Reactivate
          </button>
          <button
            type="button"
            role="menuitem"
            className="w-full px-3 py-1.5 text-left text-[11px] font-body text-red-400 hover:bg-[var(--erp-surface)] flex items-center gap-2 cursor-pointer"
            onClick={() => {
              const node = kebab.node;
              setKebab(null);
              setHardDeleteBlockDetail(null);
              setPendingHardDelete(node);
            }}
          >
            <Trash2 className="w-3.5 h-3.5" /> Delete permanently
          </button>
        </div>,
        document.body,
      )}

      {modalOpen && canWrite && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <form noValidate onSubmit={save} className="w-full max-w-lg bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] p-6 space-y-5">
            <div className="flex justify-between border-b border-[var(--erp-hairline)] pb-3">
              <h3 className="font-display text-lg font-bold">{form.id ? 'Edit Category' : 'Add Category'}</h3>
              <button type="button" onClick={() => setModalOpen(false)}><X className="w-4 h-4" /></button>
            </div>
            <RequiredLegend />
            <section>
              <h4 className={sectionTitle}>Identity</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <TextInput
                  ref={codeRef}
                  label="Category code"
                  mono
                  required
                  error={fieldMessages.category_code}
                  invalid={fieldErrors.includes('category_code')}
                  value={form.category_code || ''}
                  onChange={e => {
                    setForm({ ...form, category_code: e.target.value.toUpperCase() });
                    setFieldErrors(prev => prev.filter(f => f !== 'category_code'));
                    setFieldMessages(prev => clearFieldMessage(prev, 'category_code'));
                  }}
                />
                <TextInput
                  label="Category name"
                  required
                  error={fieldMessages.category_name}
                  invalid={fieldErrors.includes('category_name')}
                  value={form.category_name || ''}
                  onChange={e => {
                    setForm({ ...form, category_name: e.target.value });
                    setFieldErrors(prev => prev.filter(f => f !== 'category_name'));
                    setFieldMessages(prev => clearFieldMessage(prev, 'category_name'));
                  }}
                />
                <label className="flex flex-col gap-1 text-xs text-[var(--erp-muted)] sm:col-span-2">Parent category
                  <select
                    value={form.parent_category_id ?? ''}
                    onChange={e => setForm({ ...form, parent_category_id: e.target.value ? Number(e.target.value) : null })}
                    className="px-3 py-2 text-sm bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] text-[var(--erp-text)]"
                  >
                    <option value="">Top-level category (none)</option>
                    {parentOptions.map(r => (
                      <option key={r.id} value={r.id}>{r.category_code} · {r.category_name}</option>
                    ))}
                  </select>
                  <span className="text-[11px] font-mono">Leave empty for a top-level category. Only Category → Subcategory is allowed.</span>
                </label>
                <label className="flex flex-col gap-1 text-xs text-[var(--erp-muted)]">Status
                  <select value={form.status || 'Active'} onChange={e => setForm({ ...form, status: e.target.value as CategoryRow['status'] })} className="px-3 py-2 text-sm bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] text-[var(--erp-text)]">
                    <option>Active</option>
                    <option>Inactive</option>
                  </select>
                </label>
              </div>
            </section>
            <div className="flex justify-end gap-3 pt-2 border-t border-[var(--erp-hairline)]">
              <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 border border-[var(--erp-hairline)] text-xs font-mono">Cancel</button>
              <button type="submit" disabled={saving} className="px-5 py-2 bg-[var(--erp-gold)] text-[#0F141B] text-xs font-semibold">{saving ? 'Saving…' : 'Save Category'}</button>
            </div>
          </form>
        </div>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        entityType="category"
        entityLabel={pendingDelete ? `${pendingDelete.category_name} (${pendingDelete.category_code})` : ''}
        title={deleteBlockDetail ? 'Cannot deactivate category' : 'Deactivate category?'}
        message={
          deleteBlockDetail
          || (pendingDelete
            ? `${pendingDelete.category_name} (${pendingDelete.category_code}) will be set to Inactive. This does not delete any records — it can be reactivated later from the Inactive filter.`
            : '')
        }
        confirmLabel={deleteBlockDetail ? 'Understood' : 'Deactivate'}
        busyLabel={deleteBlockDetail ? 'Understood' : 'Deactivating…'}
        confirmTone="gold"
        onCancel={() => { setPendingDelete(null); setDeleteBlockDetail(null); }}
        onConfirm={async () => {
          if (!pendingDelete) return;
          if (deleteBlockDetail) {
            setPendingDelete(null);
            setDeleteBlockDetail(null);
            return;
          }
          try {
            await categoriesApi.deactivate(pendingDelete.id);
            notifySuccess(`${pendingDelete.category_name} (${pendingDelete.category_code}) deactivated.`);
            setPendingDelete(null);
            await load();
          } catch (err) {
            const status = (err as { status?: number }).status;
            if (status === 409) {
              setDeleteBlockDetail(parseApiErrorDetails(err).message);
              return;
            }
            notifyApiError(err);
          }
        }}
      />

      <ConfirmDialog
        open={!!pendingHardDelete}
        entityType="category"
        entityLabel={pendingHardDelete ? pendingHardDelete.category_name : ''}
        title={hardDeleteBlockDetail ? 'Cannot delete category' : 'Permanently delete category?'}
        message={
          hardDeleteBlockDetail
          || (pendingHardDelete
            ? `Permanently delete '${pendingHardDelete.category_name}'? This cannot be undone. All data for this category will be permanently removed.`
            : '')
        }
        confirmLabel={hardDeleteBlockDetail ? 'Understood' : 'Delete permanently'}
        busyLabel={hardDeleteBlockDetail ? 'Understood' : 'Deleting…'}
        confirmTone="critical"
        onCancel={() => { setPendingHardDelete(null); setHardDeleteBlockDetail(null); }}
        onConfirm={async () => {
          if (!pendingHardDelete) return;
          if (hardDeleteBlockDetail) {
            setPendingHardDelete(null);
            setHardDeleteBlockDetail(null);
            return;
          }
          try {
            await categoriesApi.removePermanent(pendingHardDelete.id);
            notifySuccess(`'${pendingHardDelete.category_name}' permanently deleted.`);
            setPendingHardDelete(null);
            await load();
          } catch (err) {
            const status = (err as { status?: number }).status;
            if (status === 409 || status === 400) {
              setHardDeleteBlockDetail(parseApiErrorDetails(err).message);
              return;
            }
            notifyApiError(err);
          }
        }}
      />
    </div>
  );
};
