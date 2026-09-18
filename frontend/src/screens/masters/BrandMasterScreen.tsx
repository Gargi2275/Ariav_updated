import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Edit2, Plus, Search, Tag, Trash2, X } from 'lucide-react';
import { useErp } from '../../context/ErpContext';
import { PageHeader } from '../../components/common/PageHeader';
import { DataTable, Column } from '../../components/common/DataTable';
import { StatusChip } from '../../components/common/StatusChip';
import { TextInput, FormLabel, FieldError, RequiredLegend } from '../../components/common/FormControls';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { RowKebabMenu, RowKebabTrigger, kebabMenuPosition, useOutsideKebabClose } from '../../components/common/RowKebabMenu';
import { MasterError, MasterLoading, emptyTableProps } from './MasterStatus';
import { num } from '../../services/mastersApi';
import { notifyApiError, notifySuccess, parseApiErrorDetails } from '../../services/notify';
import { acquireSaveLock, releaseSaveLock } from '../../services/saveLock';
import { clearFieldMessage, collectRequired } from '../../services/requiredFields';
import {
  BrandRow,
  COMMISSION_BASES,
  ORDER_METHODS,
  brandsApi,
  emptyBrand,
} from '../../services/brandsApi';

const sectionTitle = 'text-[11px] font-mono uppercase tracking-wider text-[var(--erp-gold)] border-b border-[var(--erp-hairline)] pb-1 mb-3';

export const BrandMasterScreen: React.FC = () => {
  const { userRole } = useErp();
  const canWrite = userRole === 'admin';
  const [rows, setRows] = useState<BrandRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Active' | 'Inactive'>('All');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<Partial<BrandRow>>(emptyBrand());
  const [fieldErrors, setFieldErrors] = useState<string[]>([]);
  const [fieldMessages, setFieldMessages] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<BrandRow | null>(null);
  const [deleteBlockDetail, setDeleteBlockDetail] = useState<string | null>(null);
  const [pendingHardDelete, setPendingHardDelete] = useState<BrandRow | null>(null);
  const [hardDeleteBlockDetail, setHardDeleteBlockDetail] = useState<string | null>(null);
  const [kebab, setKebab] = useState<{ row: BrandRow; top: number; left: number } | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const savingLock = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await brandsApi.list({
        status: statusFilter === 'All' ? undefined : statusFilter,
      }));
    } catch (e) {
      const parsed = notifyApiError(e, 'Could not load brands.');
      setError(parsed.message);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { void load(); }, [load]);
  useOutsideKebabClose(!!kebab, () => setKebab(null));

  const filtered = rows.filter(r => {
    const q = search.toLowerCase().trim();
    return !q
      || r.brand_code.toLowerCase().includes(q)
      || r.brand_name.toLowerCase().includes(q);
  });

  const openCreate = () => {
    setForm(emptyBrand());
    setFieldErrors([]);
    setFieldMessages({});
    setModalOpen(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const messages = collectRequired({
      brand_code: form.brand_code,
      brand_name: form.brand_name,
      order_method: form.order_method,
    });
    if (Object.keys(messages).length) {
      setFieldMessages(messages);
      setFieldErrors(Object.keys(messages));
      if (messages.brand_code) requestAnimationFrame(() => codeRef.current?.focus());
      return;
    }
    setFieldMessages({});
    if (!acquireSaveLock(savingLock)) return;
    setSaving(true);
    setFieldErrors([]);
    const payload = {
      ...form,
      brand_code: (form.brand_code || '').trim().toUpperCase(),
      brand_name: (form.brand_name || '').trim(),
      commission_rate: num(form.commission_rate),
      credit_days: Math.max(0, Math.floor(num(form.credit_days))),
    };
    try {
      if (form.id) {
        await brandsApi.update(form.id, payload);
        notifySuccess(`Brand '${payload.brand_name}' updated.`);
      } else {
        await brandsApi.create(payload);
        notifySuccess(`Brand '${payload.brand_name}' created successfully.`);
      }
      setModalOpen(false);
      await load(); // list refresh only after 2xx — never optimistic
    } catch (err) {
      const parsed = notifyApiError(err);
      setFieldErrors(parsed.fields);
      if (parsed.fields.includes('brand_code')) {
        requestAnimationFrame(() => codeRef.current?.focus());
      }
    } finally {
      setSaving(false);
      releaseSaveLock(savingLock);
    }
  };

  const columns: Column<BrandRow>[] = [
    { header: 'Code', accessorKey: 'brand_code', mono: true, width: '100px', render: r => <span className="font-mono text-[var(--erp-gold)]">{r.brand_code}</span> },
    { header: 'Name', accessorKey: 'brand_name', render: r => <span className="font-medium text-[var(--erp-text)]">{r.brand_name}</span> },
    { header: 'Order Method', accessorKey: 'order_method', mono: true, width: '130px' },
    { header: 'GST No', accessorKey: 'gst_no', mono: true, width: '160px', render: r => r.gst_no || '—' },
    {
      header: 'Status',
      accessorKey: 'status',
      align: 'center',
      width: '100px',
      render: r => <StatusChip status={r.status === 'Active' ? 'active' : 'inactive'} label={r.status.toUpperCase()} />,
    },
    {
      header: '',
      align: 'right',
      width: '72px',
      render: r => canWrite ? (
        <div className="flex justify-end gap-1">
          <button type="button" className="p-1 text-[var(--erp-muted)] hover:text-[var(--erp-gold)] cursor-pointer" onClick={() => { setForm(r); setFieldErrors([]); setFieldMessages({}); setModalOpen(true); }}><Edit2 className="w-3.5 h-3.5" /></button>
          {r.status === 'Active' && (
            <button
              type="button"
              className="p-1 text-[var(--erp-muted)] hover:text-[var(--erp-negative)] cursor-pointer"
              title="Deactivate"
              onClick={() => { setDeleteBlockDetail(null); setPendingDelete(r); }}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          {r.status === 'Inactive' && (
            <RowKebabTrigger
              expanded={kebab?.row.id === r.id}
              onClick={e => {
                const pos = kebabMenuPosition(e.currentTarget.getBoundingClientRect());
                setKebab(open => (open?.row.id === r.id ? null : { row: r, ...pos }));
              }}
            />
          )}
        </div>
      ) : null,
    },
  ];

  return (
    <div className="p-6 flex flex-col gap-6 text-left">
      <PageHeader
        moduleNumber="37"
        section="Masters"
        title="Brand Master"
        subtitle="Mill labels, commission terms, and Digital PO vs Manual/POR routing"
        actions={
          canWrite ? (
            <button type="button" onClick={openCreate} className="px-4 py-1.5 bg-[var(--erp-gold)] text-[#0F141B] font-body text-xs font-semibold flex items-center gap-1.5 cursor-pointer">
              <Plus className="w-3.5 h-3.5" /> Add Brand
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
        <MasterLoading label="Loading brands…" />
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          keyExtractor={r => r.id}
          {...emptyTableProps(
            rows.length,
            filtered.length,
            statusFilter !== 'All' ? 'No brands match this filter.' : 'No brands configured yet.',
            'No brands match this filter.',
            canWrite ? 'Add first brand' : '',
            canWrite ? openCreate : () => undefined,
          )}
        />
      )}

      {modalOpen && canWrite && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <form noValidate onSubmit={save} className="w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] p-6 space-y-6">
            <div className="flex justify-between border-b border-[var(--erp-hairline)] pb-3 sticky top-0 bg-[var(--erp-surface)] z-10">
              <h3 className="font-display text-lg font-bold flex items-center gap-2"><Tag className="w-4 h-4 text-[var(--erp-gold)]" />{form.id ? 'Edit Brand' : 'Add Brand'}</h3>
              <button type="button" onClick={() => setModalOpen(false)}><X className="w-4 h-4" /></button>
            </div>
            <RequiredLegend />
            <section>
              <h4 className={sectionTitle}>Identity</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <TextInput
                  ref={codeRef}
                  label="Brand code"
                  mono
                  required
                  error={fieldMessages.brand_code}
                  invalid={fieldErrors.includes('brand_code')}
                  value={form.brand_code || ''}
                  onChange={e => {
                    setForm({ ...form, brand_code: e.target.value.toUpperCase() });
                    setFieldErrors(prev => prev.filter(f => f !== 'brand_code'));
                    setFieldMessages(prev => clearFieldMessage(prev, 'brand_code'));
                  }}
                />
                <TextInput
                  label="Brand name"
                  required
                  error={fieldMessages.brand_name}
                  invalid={fieldErrors.includes('brand_name')}
                  value={form.brand_name || ''}
                  onChange={e => {
                    setForm({ ...form, brand_name: e.target.value });
                    setFieldErrors(prev => prev.filter(f => f !== 'brand_name'));
                    setFieldMessages(prev => clearFieldMessage(prev, 'brand_name'));
                  }}
                />
                <label className="flex flex-col gap-1 text-xs text-[var(--erp-muted)]">Status
                  <select value={form.status || 'Active'} onChange={e => setForm({ ...form, status: e.target.value as BrandRow['status'] })} className="px-3 py-2 text-sm bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] text-[var(--erp-text)]">
                    <option>Active</option>
                    <option>Inactive</option>
                  </select>
                </label>
              </div>
            </section>

            <section>
              <h4 className={sectionTitle}>Contacts</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <TextInput label="Contact person" value={form.contact_person || ''} onChange={e => setForm({ ...form, contact_person: e.target.value })} />
                <TextInput label="Email" value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })} />
                <TextInput label="Phone" mono value={form.phone || ''} onChange={e => setForm({ ...form, phone: e.target.value })} />
                <TextInput label="Mobile" mono value={form.mobile || ''} onChange={e => setForm({ ...form, mobile: e.target.value })} />
                <label className="flex flex-col gap-1 text-xs text-[var(--erp-muted)] sm:col-span-2">Address
                  <textarea value={form.address || ''} onChange={e => setForm({ ...form, address: e.target.value })} rows={3} className="px-3 py-2 text-sm bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] text-[var(--erp-text)] focus:outline-none focus:border-[var(--erp-gold)] rounded-none" />
                </label>
              </div>
            </section>

            <section>
              <h4 className={sectionTitle}>Statutory</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <TextInput label="GSTIN" mono value={form.gst_no || ''} onChange={e => setForm({ ...form, gst_no: e.target.value.toUpperCase() })} />
                <TextInput label="PAN" mono value={form.pan_no || ''} onChange={e => setForm({ ...form, pan_no: e.target.value.toUpperCase() })} />
              </div>
            </section>

            <section>
              <h4 className={sectionTitle}>Commercial Terms</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <TextInput label="Commission rate %" mono value={String(form.commission_rate ?? 0)} onChange={e => setForm({ ...form, commission_rate: e.target.value })} />
                <label className="flex flex-col gap-1 text-xs text-[var(--erp-muted)]">Commission basis
                  <select value={form.commission_basis || '% of invoice value'} onChange={e => setForm({ ...form, commission_basis: e.target.value })} className="px-3 py-2 text-sm bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] text-[var(--erp-text)]">
                    {COMMISSION_BASES.map(b => <option key={b}>{b}</option>)}
                  </select>
                </label>
                <TextInput label="Credit days" mono value={String(form.credit_days ?? 0)} onChange={e => setForm({ ...form, credit_days: parseInt(e.target.value, 10) || 0 })} />
                <label className="flex flex-col gap-1 text-xs text-[var(--erp-muted)] sm:col-span-2">Payment terms
                  <textarea value={form.payment_terms || ''} onChange={e => setForm({ ...form, payment_terms: e.target.value })} rows={2} className="px-3 py-2 text-sm bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] text-[var(--erp-text)] focus:outline-none focus:border-[var(--erp-gold)] rounded-none" />
                </label>
              </div>
            </section>

            <section>
              <h4 className={sectionTitle}>Order Processing</h4>
              <FormLabel required>Order method</FormLabel>
              <p className="text-[11px] font-mono text-[var(--erp-muted)] mb-3 mt-1">Drives whether later purchase orders go out as Digital PO or Manual/POR.</p>
              <div className="flex flex-wrap gap-2">
                {ORDER_METHODS.map(method => {
                  const selected = (form.order_method || 'Digital PO') === method;
                  return (
                    <button
                      key={method}
                      type="button"
                      onClick={() => {
                        setForm({ ...form, order_method: method });
                        setFieldMessages(prev => clearFieldMessage(prev, 'order_method'));
                        setFieldErrors(prev => prev.filter(f => f !== 'order_method'));
                      }}
                      className={`px-4 py-2 text-xs font-mono border cursor-pointer ${selected ? 'border-[var(--erp-gold)] text-[var(--erp-gold)] bg-[var(--erp-surface-2)]' : 'border-[var(--erp-hairline)] text-[var(--erp-muted)]'}`}
                    >
                      {method}
                    </button>
                  );
                })}
              </div>
              <FieldError message={fieldMessages.order_method} />
            </section>

            <div className="flex justify-end gap-3 pt-4 border-t border-[var(--erp-hairline)]">
              <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 border border-[var(--erp-hairline)] text-xs font-mono">Cancel</button>
              <button type="submit" disabled={saving} className="px-5 py-2 bg-[var(--erp-gold)] text-[#0F141B] text-xs font-semibold">{saving ? 'Saving…' : 'Save Brand'}</button>
            </div>
          </form>
        </div>
      )}

      {kebab && (
        <RowKebabMenu
          open
          top={kebab.top}
          left={kebab.left}
          onReactivate={async () => {
            const row = kebab.row;
            setKebab(null);
            try {
              await brandsApi.reactivate(row.id);
              notifySuccess(`Brand '${row.brand_name}' reactivated.`);
              await load();
            } catch (err) {
              notifyApiError(err);
            }
          }}
          onDeletePermanent={() => {
            const row = kebab.row;
            setKebab(null);
            setHardDeleteBlockDetail(null);
            setPendingHardDelete(row);
          }}
        />
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        entityType="brand"
        entityLabel={pendingDelete ? `${pendingDelete.brand_name} (${pendingDelete.brand_code})` : ''}
        title={deleteBlockDetail ? 'Cannot deactivate brand' : 'Deactivate brand?'}
        message={
          deleteBlockDetail
          || (pendingDelete
            ? `${pendingDelete.brand_name} (${pendingDelete.brand_code}) will be set to Inactive. This does not delete any records — it can be reactivated later from the Inactive filter.`
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
            await brandsApi.deactivate(pendingDelete.id);
            notifySuccess(`${pendingDelete.brand_name} (${pendingDelete.brand_code}) deactivated.`);
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
        entityType="brand"
        entityLabel={pendingHardDelete ? pendingHardDelete.brand_name : ''}
        title={hardDeleteBlockDetail ? 'Cannot delete brand' : 'Permanently delete brand?'}
        message={
          hardDeleteBlockDetail
          || (pendingHardDelete
            ? `Permanently delete '${pendingHardDelete.brand_name}'? This cannot be undone. All data for this brand will be permanently removed.`
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
            await brandsApi.removePermanent(pendingHardDelete.id);
            notifySuccess(`'${pendingHardDelete.brand_name}' permanently deleted.`);
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
