import React, { useCallback, useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useErp } from '../../context/ErpContext';
import { PageHeader } from '../../components/common/PageHeader';
import { DataTable, Column } from '../../components/common/DataTable';
import { StatusChip } from '../../components/common/StatusChip';
import { TextInput, FormField, RequiredLegend } from '../../components/common/FormControls';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { MasterError, MasterLoading, emptyTableProps } from '../masters/MasterStatus';
import { notifyApiError, notifySuccess } from '../../services/notify';
import { clearFieldMessage, collectRequired } from '../../services/requiredFields';
import { EntityRow, entitiesApi } from '../../services/entitiesApi';
import { StaffRow, emptyStaff, staffApi } from '../../services/staffApi';

const fieldClass = 'px-3 py-2 text-sm bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] text-[var(--erp-text)]';

export const StaffManagementScreen: React.FC = () => {
  const { userRole } = useErp();
  const [rows, setRows] = useState<StaffRow[]>([]);
  const [branches, setBranches] = useState<EntityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<Partial<StaffRow>>(emptyStaff());
  const [fieldMessages, setFieldMessages] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [pendingDeactivate, setPendingDeactivate] = useState<StaffRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await staffApi.list());
    } catch (e) {
      setError(notifyApiError(e, 'Could not load staff.').message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    void entitiesApi.list({ status: 'Active' }).then(setBranches).catch(() => setBranches([]));
  }, []);

  if (userRole !== 'admin') {
    return (
      <div className="p-6 text-left">
        <PageHeader moduleNumber="07" section="Admin" title="Staff" subtitle="Only an administrator can manage staff accounts." />
      </div>
    );
  }

  const openCreate = () => {
    setForm(emptyStaff());
    setFieldMessages({});
    setModalOpen(true);
  };

  const openEdit = (row: StaffRow) => {
    setForm({ ...row, password: '' });
    setFieldMessages({});
    setModalOpen(true);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const messages = collectRequired({
      display_name: form.display_name,
      username: form.username,
    });
    if (!form.id && !form.password) messages.password = 'Password is required.';
    setFieldMessages(messages);
    if (Object.keys(messages).length) return;
    setSaving(true);
    try {
      const body: Partial<StaffRow> = {
        display_name: form.display_name?.trim(),
        username: form.username?.trim(),
        email: form.email?.trim() || '',
        operator_code: form.operator_code?.trim() || '',
        entity_id: form.entity_id || null,
        is_active: form.is_active !== false,
        login_bypass: !!form.login_bypass,
      };
      if (form.password) body.password = form.password;
      if (form.id) await staffApi.update(form.id, body);
      else await staffApi.create(body);
      notifySuccess(form.id ? 'Staff account updated.' : 'Staff account created.');
      setModalOpen(false);
      await load();
    } catch (e) {
      notifyApiError(e, 'Could not save this staff account.');
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async () => {
    if (!pendingDeactivate) return;
    try {
      await staffApi.deactivate(pendingDeactivate.id);
      notifySuccess(`${pendingDeactivate.display_name || pendingDeactivate.username} is signed out and inactive.`);
      setPendingDeactivate(null);
      await load();
    } catch (e) {
      notifyApiError(e, 'Could not deactivate this staff account.');
    }
  };

  const columns: Column<StaffRow>[] = [
    { header: 'Name', render: row => <span className="font-medium">{row.display_name || row.username}</span> },
    { header: 'Username', accessorKey: 'username', mono: true },
    { header: 'Code', render: row => row.operator_code || '—', mono: true },
    { header: 'Branch', render: row => row.entity_code ? `${row.entity_code} · ${row.entity_name}` : '—' },
    {
      header: 'Login',
      render: row => row.login_bypass
        ? <StatusChip status="active" label="BYPASS" />
        : <StatusChip status="pending" label="APPROVAL" />,
    },
    { header: 'Status', render: row => <StatusChip status={row.is_active ? 'active' : 'inactive'} label={row.is_active ? 'ACTIVE' : 'INACTIVE'} /> },
    {
      header: '',
      align: 'right',
      render: row => (
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => openEdit(row)} className="text-xs font-mono text-[var(--erp-gold)]">Edit</button>
          {row.is_active && (
            <button type="button" onClick={() => setPendingDeactivate(row)} className="text-xs font-mono text-[var(--erp-negative)]">Deactivate</button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="p-6 flex flex-col gap-6 text-left">
      <PageHeader
        moduleNumber="07"
        section="Admin"
        title="Staff"
        subtitle="Staff accounts for one role. Login still needs your approval unless you turn bypass on."
        actions={
          <button type="button" onClick={openCreate} className="px-4 py-1.5 bg-[var(--erp-gold)] text-[#0F141B] text-xs font-semibold flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Add Staff
          </button>
        }
      />
      {error && <MasterError message={error} onRetry={load} />}
      {loading ? <MasterLoading label="Loading staff…" /> : (
        <DataTable
          columns={columns}
          data={rows}
          keyExtractor={row => row.id}
          {...emptyTableProps(rows.length, rows.length, 'No staff accounts yet.', 'No staff accounts yet.', 'Add first staff', openCreate)}
        />
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <form noValidate onSubmit={save} className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] p-6 space-y-5">
            <div className="flex justify-between border-b border-[var(--erp-hairline)] pb-3">
              <h3 className="font-display text-lg font-bold">{form.id ? 'Edit Staff' : 'Add Staff'}</h3>
              <button type="button" onClick={() => setModalOpen(false)} aria-label="Close"><X className="w-4 h-4" /></button>
            </div>
            <RequiredLegend />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <TextInput label="Name" required error={fieldMessages.display_name} value={form.display_name || ''} onChange={e => { setForm({ ...form, display_name: e.target.value }); setFieldMessages(prev => clearFieldMessage(prev, 'display_name')); }} />
              <TextInput label="Username" required mono error={fieldMessages.username} value={form.username || ''} onChange={e => { setForm({ ...form, username: e.target.value }); setFieldMessages(prev => clearFieldMessage(prev, 'username')); }} />
              <TextInput label={form.id ? 'New password' : 'Password'} required={!form.id} type="password" helper={form.id ? 'Leave blank to keep the current password.' : 'At least 8 characters.'} error={fieldMessages.password} value={form.password || ''} onChange={e => { setForm({ ...form, password: e.target.value }); setFieldMessages(prev => clearFieldMessage(prev, 'password')); }} />
              <TextInput label="Staff code" mono error={fieldMessages.operator_code} value={form.operator_code || ''} onChange={e => setForm({ ...form, operator_code: e.target.value.toUpperCase() })} />
              <TextInput label="Email" error={fieldMessages.email} value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })} />
              <FormField label="Branch">
                <select className={fieldClass} value={form.entity_id || ''} onChange={e => setForm({ ...form, entity_id: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">No branch</option>
                  {branches.map(branch => <option key={branch.id} value={branch.id}>{branch.short_code} · {branch.entity_name}</option>)}
                </select>
              </FormField>
            </div>
            <div className="space-y-3 border border-[var(--erp-hairline)] p-4">
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" checked={!!form.login_bypass} onChange={e => setForm({ ...form, login_bypass: e.target.checked })} />
                <span>
                  <span className="font-medium">Skip login approval</span>
                  <span className="block text-xs text-[var(--erp-muted)]">Password is still required. This person will not wait for you or enter a verbal code.</span>
                </span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.is_active !== false} onChange={e => setForm({ ...form, is_active: e.target.checked })} />
                <span className="font-medium">Active</span>
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 border border-[var(--erp-hairline)] text-sm">Cancel</button>
              <button type="submit" disabled={saving} className="px-4 py-2 bg-[var(--erp-gold)] text-[#0F141B] text-sm font-semibold disabled:opacity-60">{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        </div>
      )}

      <ConfirmDialog
        open={!!pendingDeactivate}
        entityType="staff account"
        entityLabel={pendingDeactivate?.display_name || pendingDeactivate?.username || ''}
        title="Deactivate staff?"
        message="They will be signed out and will not be able to log in."
        confirmLabel="Deactivate"
        confirmTone="gold"
        onConfirm={deactivate}
        onCancel={() => setPendingDeactivate(null)}
      />
    </div>
  );
};
