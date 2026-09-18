import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, Edit2, MoreVertical, Plus, RotateCcw, ScanSearch, Search, Star, Trash2, Users, X } from 'lucide-react';
import { useErp } from '../../context/ErpContext';
import { PageHeader } from '../../components/common/PageHeader';
import { DataTable, Column } from '../../components/common/DataTable';
import { StatusChip } from '../../components/common/StatusChip';
import { TextInput, FormSectionTitle, FieldError, RequiredLegend } from '../../components/common/FormControls';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { MasterError, MasterLoading, emptyTableProps } from './MasterStatus';
import { num } from '../../services/mastersApi';
import { notifyApiError, notifySuccess, parseApiErrorDetails } from '../../services/notify';
import { acquireSaveLock, releaseSaveLock } from '../../services/saveLock';
import { clearFieldMessage, collectRequired } from '../../services/requiredFields';
import { EntityRow, entitiesApi } from '../../services/entitiesApi';
import {
  CUSTOMER_360_KEY,
  CUSTOMER_LEDGER_KEY,
  CUSTOMER_TYPES,
  CustomerEntityLink,
  CustomerRow,
  customersApi,
  emptyCustomer,
} from '../../services/customersApi';

const sectionTitle = 'text-[11px] font-mono uppercase tracking-wider text-[var(--erp-gold)] border-b border-[var(--erp-hairline)] pb-1 mb-3';
const selectClass = 'px-3 py-2 text-sm bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] text-[var(--erp-text)]';

function nullableDecimal(value: string | number | null | undefined): number | null {
  if (value === '' || value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function dateOrNull(value: string | null | undefined): string | null {
  const v = (value || '').trim();
  return v || null;
}

function toggleEntity(links: CustomerEntityLink[], entity: EntityRow, checked: boolean): CustomerEntityLink[] {
  if (checked) {
    if (links.some(l => l.entity_id === entity.id)) return links;
    const next: CustomerEntityLink = {
      entity_id: entity.id,
      short_code: entity.short_code,
      entity_name: entity.entity_name,
      primary_entity: links.length === 0,
    };
    return [...links, next];
  }
  const remaining = links.filter(l => l.entity_id !== entity.id);
  if (remaining.length && !remaining.some(l => l.primary_entity)) {
    remaining[0] = { ...remaining[0], primary_entity: true };
  }
  return remaining;
}

function markPrimary(links: CustomerEntityLink[], entityId: number): CustomerEntityLink[] {
  return links.map(l => ({ ...l, primary_entity: l.entity_id === entityId }));
}

function entitiesGroupError(links: CustomerEntityLink[]): string | undefined {
  if (!links.length) return 'Select at least one entity and mark exactly one as primary.';
  const primaries = links.filter(l => l.primary_entity).length;
  if (primaries !== 1) return 'Mark exactly one entity as primary.';
  return undefined;
}

export const CustomerMasterScreen: React.FC = () => {
  const { userRole, navigateTo } = useErp();
  const canWrite = userRole === 'admin';
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [entityOptions, setEntityOptions] = useState<EntityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Active' | 'Inactive'>('All');
  const [entityFilter, setEntityFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<Partial<CustomerRow>>(emptyCustomer());
  const [fieldErrors, setFieldErrors] = useState<string[]>([]);
  const [fieldMessages, setFieldMessages] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<CustomerRow | null>(null);
  const [deleteBlockDetail, setDeleteBlockDetail] = useState<string | null>(null);
  const [pendingHardDelete, setPendingHardDelete] = useState<CustomerRow | null>(null);
  const [hardDeleteBlockDetail, setHardDeleteBlockDetail] = useState<string | null>(null);
  const [kebab, setKebab] = useState<{ row: CustomerRow; top: number; left: number } | null>(null);
  const [advanceBalance, setAdvanceBalance] = useState<string | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const savingLock = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [customers, ents] = await Promise.all([
        customersApi.list({
          status: statusFilter === 'All' ? undefined : statusFilter,
          entity_id: entityFilter || undefined,
        }),
        entitiesApi.list(),
      ]);
      setRows(customers);
      setEntityOptions(ents);
    } catch (e) {
      const parsed = notifyApiError(e, 'Could not load customers.');
      setError(parsed.message);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, entityFilter]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!kebab) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-customer-kebab]')) return;
      setKebab(null);
    };
    const timer = window.setTimeout(() => {
      document.addEventListener('mousedown', onPointerDown);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [kebab]);

  useEffect(() => {
    if (!modalOpen || !form.id) {
      setAdvanceBalance(null);
      return;
    }
    void customersApi.advanceBalance(form.id).then(row => {
      setAdvanceBalance(row.advance_balance);
    }).catch(notifyApiError);
  }, [modalOpen, form.id]);

  const filtered = rows.filter(r => {
    const q = search.toLowerCase().trim();
    return !q
      || r.customer_code.toLowerCase().includes(q)
      || r.customer_name.toLowerCase().includes(q);
  });

  const openCreate = () => {
    setForm(emptyCustomer());
    setFieldErrors([]);
    setFieldMessages({});
    setModalOpen(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const messages = collectRequired({
      customer_code: form.customer_code,
      customer_name: form.customer_name,
    });
    const entityErr = entitiesGroupError(form.entities || []);
    if (entityErr) messages.entities = entityErr;
    if (Object.keys(messages).length) {
      setFieldMessages(messages);
      setFieldErrors(Object.keys(messages));
      if (messages.customer_code) requestAnimationFrame(() => codeRef.current?.focus());
      return;
    }
    setFieldMessages({});
    if (!acquireSaveLock(savingLock)) return;
    setSaving(true);
    setFieldErrors([]);
    const links = form.entities || [];
    const payload = {
      ...form,
      customer_code: (form.customer_code || '').trim().toUpperCase(),
      customer_name: (form.customer_name || '').trim(),
      credit_days: Math.max(0, Math.floor(num(form.credit_days))),
      credit_limit: num(form.credit_limit),
      opening_balance: num(form.opening_balance),
      interest_rate: nullableDecimal(form.interest_rate),
      lower_rate: nullableDecimal(form.lower_rate),
      tds_percent: nullableDecimal(form.tds_percent),
      vat_date: dateOrNull(form.vat_date),
      vat_date_1: dateOrNull(form.vat_date_1),
      entities: links.map(l => ({ entity_id: l.entity_id, primary_entity: l.primary_entity })),
    };
    try {
      if (form.id) {
        await customersApi.update(form.id, payload);
        notifySuccess(`Customer '${payload.customer_name}' updated.`);
      } else {
        await customersApi.create(payload);
        notifySuccess(`Customer '${payload.customer_name}' created successfully.`);
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      const parsed = notifyApiError(err);
      setFieldErrors(parsed.fields);
      if (parsed.fields.includes('customer_code')) {
        requestAnimationFrame(() => codeRef.current?.focus());
      }
    } finally {
      setSaving(false);
      releaseSaveLock(savingLock);
    }
  };

  const setField = (patch: Partial<CustomerRow>) => {
    setForm(prev => ({ ...prev, ...patch }));
  };

  const columns: Column<CustomerRow>[] = [
    { header: 'Customer Code', accessorKey: 'customer_code', mono: true, width: '120px', render: r => <span className="font-mono text-[var(--erp-gold)]">{r.customer_code}</span> },
    { header: 'Customer Name', accessorKey: 'customer_name', render: r => <span className="font-medium text-[var(--erp-text)]">{r.customer_name}</span> },
    {
      header: 'Primary Entity',
      accessorKey: 'primary_entity_name',
      width: '160px',
      render: r => r.primary_entity_code
        ? <span className="font-mono text-xs">{r.primary_entity_code} · {r.primary_entity_name}</span>
        : <span className="text-[var(--erp-muted)]">—</span>,
    },
    { header: 'Type', accessorKey: 'customer_type', width: '120px' },
    { header: 'City', accessorKey: 'city', width: '120px', render: r => r.city || '—' },
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
      width: '120px',
      render: r => (
        <div className="flex justify-end gap-1">
          <button
            type="button"
            className="p-1 text-[var(--erp-muted)] hover:text-[var(--erp-gold)] cursor-pointer"
            title="View 360°"
            onClick={() => {
              sessionStorage.setItem(CUSTOMER_360_KEY, String(r.id));
              navigateTo(48);
            }}
          >
            <ScanSearch className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            className="p-1 text-[var(--erp-muted)] hover:text-[var(--erp-gold)] cursor-pointer"
            title="View Ledger"
            onClick={() => {
              sessionStorage.setItem(CUSTOMER_LEDGER_KEY, String(r.id));
              navigateTo(44);
            }}
          >
            <BookOpen className="w-3.5 h-3.5" />
          </button>
          {canWrite ? (
            <>
          <button
            type="button"
            className="p-1 text-[var(--erp-muted)] hover:text-[var(--erp-gold)] cursor-pointer"
            onClick={() => { setForm(r); setFieldErrors([]); setFieldMessages({}); setModalOpen(true); }}
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
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
            <button
              type="button"
              data-customer-kebab
              className="p-1 text-[var(--erp-muted)] hover:text-[var(--erp-gold)] cursor-pointer"
              title="More actions"
              aria-haspopup="menu"
              aria-expanded={kebab?.row.id === r.id}
              onClick={e => {
                e.preventDefault();
                e.stopPropagation();
                const rect = e.currentTarget.getBoundingClientRect();
                const width = 184;
                const left = Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8);
                setKebab(open => (open?.row.id === r.id ? null : { row: r, top: rect.bottom + 4, left }));
              }}
            >
              <MoreVertical className="w-3.5 h-3.5 pointer-events-none" />
            </button>
          )}
            </>
          ) : null}
        </div>
      ),
    },
  ];

  const linked = form.entities || [];
  const pickerEntities = entityOptions.filter(ent => ent.status === 'Active' || linked.some(l => l.entity_id === ent.id));

  return (
    <div className="p-6 flex flex-col gap-6 text-left">
      <PageHeader
        moduleNumber="23"
        section="Masters"
        title="Customer Master"
        subtitle="Trading customers keyed by unique customer code, linked to one or more entities"
        actions={
          canWrite ? (
            <button type="button" onClick={openCreate} className="px-4 py-1.5 bg-[var(--erp-gold)] text-[#0F141B] font-body text-xs font-semibold flex items-center gap-1.5 cursor-pointer">
              <Plus className="w-3.5 h-3.5" /> Add Customer
            </button>
          ) : undefined
        }
      />
      {error && <MasterError message={error} onRetry={load} />}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] p-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-[var(--erp-muted)] absolute left-3 top-2.5" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search code or name…" className="w-full pl-9 pr-3 py-1.5 text-xs bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)] focus:border-[var(--erp-gold)] focus:outline-none font-mono" />
        </div>
        <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
          <select
            value={entityFilter}
            onChange={e => setEntityFilter(e.target.value)}
            className="px-2 py-1 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)]"
          >
            <option value="">All entities</option>
            {entityOptions.map(ent => (
              <option key={ent.id} value={ent.id}>{ent.short_code} · {ent.entity_name}</option>
            ))}
          </select>
          {(['All', 'Active', 'Inactive'] as const).map(s => (
            <button key={s} type="button" onClick={() => setStatusFilter(s)} className={`px-3 py-1 border ${statusFilter === s ? 'border-[var(--erp-gold)] text-[var(--erp-gold)] bg-[var(--erp-surface-2)]' : 'border-[var(--erp-hairline)] text-[var(--erp-muted)]'}`}>{s}</button>
          ))}
        </div>
      </div>
      {loading ? (
        <MasterLoading label="Loading customers…" />
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          keyExtractor={r => r.id}
          {...emptyTableProps(
            rows.length,
            filtered.length,
            statusFilter !== 'All' || entityFilter ? 'No customers match this filter.' : 'No customers configured yet.',
            'No customers match this filter.',
            canWrite ? 'Add first customer' : '',
            canWrite ? openCreate : () => undefined,
          )}
        />
      )}

      {kebab && createPortal(
        <div
          data-customer-kebab
          role="menu"
          className="fixed z-[70] min-w-[11.5rem] border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface-2)] shadow-lg py-1"
          style={{ top: kebab.top, left: kebab.left }}
        >
          <button
            type="button"
            role="menuitem"
            className="w-full px-3 py-1.5 text-left text-[11px] font-body text-[var(--erp-text)] hover:bg-[var(--erp-surface)] flex items-center gap-2 cursor-pointer"
            onClick={async () => {
              const row = kebab.row;
              setKebab(null);
              try {
                await customersApi.reactivate(row.id);
                notifySuccess(`Customer '${row.customer_name}' reactivated.`);
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
              const row = kebab.row;
              setKebab(null);
              setHardDeleteBlockDetail(null);
              setPendingHardDelete(row);
            }}
          >
            <Trash2 className="w-3.5 h-3.5" /> Delete permanently
          </button>
        </div>,
        document.body,
      )}

      {modalOpen && canWrite && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <form noValidate onSubmit={save} className="w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] p-6 space-y-6">
            <div className="flex justify-between border-b border-[var(--erp-hairline)] pb-3 sticky top-0 bg-[var(--erp-surface)] z-10">
              <h3 className="font-display text-lg font-bold flex items-center gap-2"><Users className="w-4 h-4 text-[var(--erp-gold)]" />{form.id ? 'Edit Customer' : 'Add Customer'}</h3>
              <button type="button" onClick={() => setModalOpen(false)}><X className="w-4 h-4" /></button>
            </div>
            <RequiredLegend />

            <section>
              <h4 className={sectionTitle}>Identity</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <TextInput
                  ref={codeRef}
                  label="Customer code"
                  mono
                  required
                  error={fieldMessages.customer_code}
                  invalid={fieldErrors.includes('customer_code')}
                  value={form.customer_code || ''}
                  onChange={e => {
                    setField({ customer_code: e.target.value.toUpperCase() });
                    setFieldErrors(prev => prev.filter(f => f !== 'customer_code'));
                    setFieldMessages(prev => clearFieldMessage(prev, 'customer_code'));
                  }}
                />
                <TextInput
                  label="Customer name"
                  required
                  error={fieldMessages.customer_name}
                  invalid={fieldErrors.includes('customer_name')}
                  value={form.customer_name || ''}
                  onChange={e => {
                    setField({ customer_name: e.target.value });
                    setFieldErrors(prev => prev.filter(f => f !== 'customer_name'));
                    setFieldMessages(prev => clearFieldMessage(prev, 'customer_name'));
                  }}
                />
                <label className="flex flex-col gap-1 text-xs text-[var(--erp-muted)]">Type
                  <select value={form.customer_type || 'Company'} onChange={e => setField({ customer_type: e.target.value })} className={selectClass}>
                    {CUSTOMER_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-[var(--erp-muted)]">Status
                  <select value={form.status || 'Active'} onChange={e => setField({ status: e.target.value as CustomerRow['status'] })} className={selectClass}>
                    <option>Active</option>
                    <option>Inactive</option>
                  </select>
                </label>
              </div>
            </section>

            <section>
              <FormSectionTitle required>Entities</FormSectionTitle>
              <p className="text-[11px] font-mono text-[var(--erp-muted)] mb-3">Select every entity this customer trades with. Star marks the primary (default) entity.</p>
              <div className={`border p-2 space-y-1 ${fieldMessages.entities || fieldErrors.includes('entities') ? 'border-[var(--erp-negative)]' : 'border-[var(--erp-hairline)]'}`}>
                {pickerEntities.length === 0 ? (
                  <p className="text-xs text-[var(--erp-muted)] px-2 py-3">No entities available. Create an entity first.</p>
                ) : pickerEntities.map(ent => {
                  const isLinked = linked.some(l => l.entity_id === ent.id);
                  const isPrimary = linked.some(l => l.entity_id === ent.id && l.primary_entity);
                  return (
                    <div key={ent.id} className="flex items-center gap-2 px-2 py-1.5 hover:bg-[var(--erp-surface-2)]">
                      <input
                        type="checkbox"
                        checked={isLinked}
                        onChange={e => {
                          setField({ entities: toggleEntity(linked, ent, e.target.checked) });
                          setFieldErrors(prev => prev.filter(f => f !== 'entities'));
                          setFieldMessages(prev => clearFieldMessage(prev, 'entities'));
                        }}
                        className="accent-[var(--erp-gold)]"
                      />
                      <span className="flex-1 text-sm font-mono text-[var(--erp-text)]">{ent.short_code} · {ent.entity_name}</span>
                      {isLinked && (
                        <button
                          type="button"
                          title="Primary entity"
                          onClick={() => {
                            setField({ entities: markPrimary(linked, ent.id) });
                            setFieldErrors(prev => prev.filter(f => f !== 'entities'));
                            setFieldMessages(prev => clearFieldMessage(prev, 'entities'));
                          }}
                          className={`p-1 cursor-pointer ${isPrimary ? 'text-[var(--erp-gold)]' : 'text-[var(--erp-muted)] hover:text-[var(--erp-gold)]'}`}
                        >
                          <Star className="w-3.5 h-3.5" fill={isPrimary ? 'currentColor' : 'none'} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              <FieldError message={fieldMessages.entities} />
            </section>

            <section>
              <h4 className={sectionTitle}>Contact</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <TextInput label="Contact person" value={form.contact_person || ''} onChange={e => setField({ contact_person: e.target.value })} />
                <TextInput label="Email" value={form.email || ''} onChange={e => setField({ email: e.target.value })} />
                <TextInput label="Phone" mono value={form.phone || ''} onChange={e => setField({ phone: e.target.value })} />
                <TextInput label="Mobile" mono value={form.mobile || ''} onChange={e => setField({ mobile: e.target.value })} />
                <TextInput label="Fax" mono value={form.fax || ''} onChange={e => setField({ fax: e.target.value })} />
                <TextInput label="Website" value={form.website || ''} onChange={e => setField({ website: e.target.value })} />
              </div>
            </section>

            <section>
              <h4 className={sectionTitle}>Address</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <TextInput label="Address line 1" value={form.address_line_1 || ''} onChange={e => setField({ address_line_1: e.target.value })} />
                <TextInput label="Address line 2" value={form.address_line_2 || ''} onChange={e => setField({ address_line_2: e.target.value })} />
                <TextInput label="Area" value={form.area || ''} onChange={e => setField({ area: e.target.value })} />
                <TextInput label="City" value={form.city || ''} onChange={e => setField({ city: e.target.value })} />
                <TextInput label="District" value={form.district || ''} onChange={e => setField({ district: e.target.value })} />
                <TextInput label="State" value={form.state || ''} onChange={e => setField({ state: e.target.value })} />
                <TextInput label="Pincode" mono value={form.pincode || ''} onChange={e => setField({ pincode: e.target.value })} />
                <TextInput label="Country" value={form.country || ''} onChange={e => setField({ country: e.target.value })} />
                <TextInput label="Zone" value={form.zone || ''} onChange={e => setField({ zone: e.target.value })} />
                <TextInput label="STD code" mono value={form.std_code || ''} onChange={e => setField({ std_code: e.target.value })} />
              </div>
            </section>

            <section>
              <h4 className={sectionTitle}>Statutory</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <TextInput label="PAN" mono value={form.pan_no || ''} onChange={e => setField({ pan_no: e.target.value.toUpperCase() })} />
                <TextInput label="GSTIN" mono value={form.gst_no || ''} onChange={e => setField({ gst_no: e.target.value.toUpperCase() })} />
                <TextInput label="VAT TIN" mono value={form.vat_tin || ''} onChange={e => setField({ vat_tin: e.target.value })} />
                <TextInput label="CST TIN" mono value={form.cst_tin || ''} onChange={e => setField({ cst_tin: e.target.value })} />
                <TextInput label="Licence no" mono value={form.licence_no || ''} onChange={e => setField({ licence_no: e.target.value })} />
                <TextInput label="ECC" mono value={form.ecc || ''} onChange={e => setField({ ecc: e.target.value })} />
                <TextInput label="Division" value={form.division || ''} onChange={e => setField({ division: e.target.value })} />
                <TextInput label="Range" value={form.range || ''} onChange={e => setField({ range: e.target.value })} />
              </div>
            </section>

            <section>
              <h4 className={sectionTitle}>Financial Terms</h4>
              {form.id && advanceBalance != null ? (
                <p className="text-xs font-mono text-[var(--erp-gold)] mb-3">Advance/Credit Balance: ₹{num(advanceBalance).toFixed(2)}</p>
              ) : null}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <TextInput label="Credit days" mono value={String(form.credit_days ?? 0)} onChange={e => setField({ credit_days: parseInt(e.target.value, 10) || 0 })} />
                <TextInput label="Credit limit" mono value={String(form.credit_limit ?? 0)} onChange={e => setField({ credit_limit: e.target.value })} />
                <TextInput label="Opening balance" mono value={String(form.opening_balance ?? 0)} onChange={e => setField({ opening_balance: e.target.value })} />
                <TextInput label="Interest rate %" mono value={form.interest_rate == null ? '' : String(form.interest_rate)} onChange={e => setField({ interest_rate: e.target.value })} />
                <TextInput label="Lower rate %" helper="Legacy field — confirm meaning with business." mono value={form.lower_rate == null ? '' : String(form.lower_rate)} onChange={e => setField({ lower_rate: e.target.value })} />
                <TextInput label="Commission type" value={form.commission_type || ''} onChange={e => setField({ commission_type: e.target.value })} />
                <TextInput label="Salesman" helper="Free text until Salesman master exists." value={form.salesman_ref || ''} onChange={e => setField({ salesman_ref: e.target.value })} />
                <TextInput label="Broker" helper="Free text until Broker FK is wired." value={form.broker_ref || ''} onChange={e => setField({ broker_ref: e.target.value })} />
              </div>
            </section>

            <section>
              <h4 className={sectionTitle}>Banking</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <TextInput label="Bank name" value={form.bank_name || ''} onChange={e => setField({ bank_name: e.target.value })} />
                <TextInput label="RTGS details" value={form.rtgs_details || ''} onChange={e => setField({ rtgs_details: e.target.value })} />
              </div>
            </section>

            <section>
              <h4 className={sectionTitle}>Tax / Compliance</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <TextInput label="TDS %" mono value={form.tds_percent == null ? '' : String(form.tds_percent)} onChange={e => setField({ tds_percent: e.target.value })} />
                <TextInput label="TDS form no" mono value={form.tds_form_no || ''} onChange={e => setField({ tds_form_no: e.target.value })} />
                <TextInput label="VAT date" type="date" value={form.vat_date || ''} onChange={e => setField({ vat_date: e.target.value })} />
                <TextInput label="VAT date 1" type="date" value={form.vat_date_1 || ''} onChange={e => setField({ vat_date_1: e.target.value })} />
              </div>
            </section>

            <section>
              <h4 className={sectionTitle}>Misc</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <TextInput label="Comp ID" mono value={form.comp_id || ''} onChange={e => setField({ comp_id: e.target.value })} />
                <TextInput label="Visit day" value={form.visit_day || ''} onChange={e => setField({ visit_day: e.target.value })} />
                <TextInput label="File no" mono value={form.file_no || ''} onChange={e => setField({ file_no: e.target.value })} />
                <TextInput label="Mill code" mono value={form.mill_code || ''} onChange={e => setField({ mill_code: e.target.value })} />
                <TextInput label="Transport" value={form.transport || ''} onChange={e => setField({ transport: e.target.value })} />
                <TextInput label="Other 1" value={form.other_1 || ''} onChange={e => setField({ other_1: e.target.value })} />
                <TextInput label="Other 2" value={form.other_2 || ''} onChange={e => setField({ other_2: e.target.value })} />
              </div>
            </section>

            <div className="flex justify-end gap-3 pt-4 border-t border-[var(--erp-hairline)]">
              <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 border border-[var(--erp-hairline)] text-xs font-mono">Cancel</button>
              <button type="submit" disabled={saving} className="px-5 py-2 bg-[var(--erp-gold)] text-[#0F141B] text-xs font-semibold">{saving ? 'Saving…' : 'Save Customer'}</button>
            </div>
          </form>
        </div>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        entityType="customer"
        entityLabel={pendingDelete ? `${pendingDelete.customer_name} (${pendingDelete.customer_code})` : ''}
        title={deleteBlockDetail ? 'Cannot deactivate customer' : 'Deactivate customer?'}
        message={
          deleteBlockDetail
          || (pendingDelete
            ? `${pendingDelete.customer_name} (${pendingDelete.customer_code}) will be set to Inactive. This does not delete any records — it can be reactivated later from the Inactive filter.`
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
            await customersApi.deactivate(pendingDelete.id);
            notifySuccess(`${pendingDelete.customer_name} (${pendingDelete.customer_code}) deactivated.`);
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
        entityType="customer"
        entityLabel={pendingHardDelete ? pendingHardDelete.customer_name : ''}
        title={hardDeleteBlockDetail ? 'Cannot delete customer' : 'Permanently delete customer?'}
        message={
          hardDeleteBlockDetail
          || (pendingHardDelete
            ? `Permanently delete '${pendingHardDelete.customer_name}'? This cannot be undone. All data for this customer will be permanently removed.`
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
            await customersApi.removePermanent(pendingHardDelete.id);
            notifySuccess(`'${pendingHardDelete.customer_name}' permanently deleted.`);
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
