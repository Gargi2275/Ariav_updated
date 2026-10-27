import React, { useEffect, useState } from 'react';
import { EmailModeBanner } from '../../components/common/EmailModeBanner';
import { notifyApiError, notifySuccess } from '../../services/notify';
import { BrandEmailConfig, poEmailApi } from '../../services/poEmailApi';

const SAMPLE: Record<string, string> = {
  po_number: 'PO-1001',
  po_date: '26/10/2026',
  brand_name: 'Sample Brand',
  party_name: 'Sample Party',
  party_code: 'P-100',
  branch_name: 'Sample Branch',
  line_count: '3',
  total_pieces: '12',
  total_amount: '-',
  sender_name: 'Sample sender',
  signature: 'Sample Branch',
};

function fill(template: string) {
  return template.replace(/\{([a-z_]+)\}/g, (_match, key: string) => SAMPLE[key] || '-');
}

function chips(label: string, values: string[], onChange: (next: string[]) => void) {
  return (
    <AddressField label={label} values={values} onChange={onChange} />
  );
}

const AddressField: React.FC<{ label: string; values: string[]; onChange: (next: string[]) => void }> = ({ label, values, onChange }) => {
  const [draft, setDraft] = useState('');
  const add = () => {
    const next = draft.trim().toLowerCase();
    if (!next || values.includes(next) || values.length >= 10) return;
    onChange([...values, next]);
    setDraft('');
  };
  return (
    <div>
      <div className="text-[11px] font-mono uppercase tracking-wider text-[var(--erp-muted)] mb-1">{label}</div>
      <div className="flex flex-wrap gap-1 mb-2">
        {values.map(value => (
          <button key={value} type="button" onClick={() => onChange(values.filter(item => item !== value))} className="border border-[var(--erp-hairline)] px-2 py-0.5 text-[11px] font-mono">
            {value} ×
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); add(); } }} placeholder="name@brand.example" className="h-9 flex-1 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] px-2 text-xs" />
        <button type="button" onClick={add} className="h-9 px-2 border border-[var(--erp-gold)] text-[var(--erp-gold)] text-xs">Add</button>
      </div>
    </div>
  );
};

export const BrandEmailPanel: React.FC<{ brandId: number }> = ({ brandId }) => {
  const [form, setForm] = useState<BrandEmailConfig | null>(null);
  const [mode, setMode] = useState('');
  const [testRecipient, setTestRecipient] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    poEmailApi.brand(brandId).then(row => { if (live) setForm(row); }).catch(err => notifyApiError(err, 'Could not load brand email.'));
    poEmailApi.badges().then(row => { if (live) { setMode(row.mode); setTestRecipient(row.test_recipient); } }).catch(() => undefined);
    return () => { live = false; };
  }, [brandId]);

  if (!form) return <p className="text-xs text-[var(--erp-muted)]">Loading brand email…</p>;

  const insert = (token: string) => setForm({ ...form, body_template: `${form.body_template}{${token}}` });

  return (
    <div className="space-y-4">
      <EmailModeBanner mode={mode} testRecipient={testRecipient} />
      {chips('To', form.to_addresses, values => setForm({ ...form, to_addresses: values }))}
      {chips('CC', form.cc_addresses, values => setForm({ ...form, cc_addresses: values }))}
      {chips('BCC', form.bcc_addresses, values => setForm({ ...form, bcc_addresses: values }))}
      <label className="block text-xs">
        Subject
        <input value={form.subject_template} maxLength={200} onChange={event => setForm({ ...form, subject_template: event.target.value })} className="mt-1 h-9 w-full bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] px-2 text-sm" />
      </label>
      <label className="block text-xs">
        Body
        <textarea value={form.body_template} onChange={event => setForm({ ...form, body_template: event.target.value })} rows={6} className="mt-1 w-full bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] px-2 py-2 text-sm" />
      </label>
      <div className="flex flex-wrap gap-1">
        {form.placeholders.map(token => (
          <button key={token} type="button" onClick={() => insert(token)} className="border border-[var(--erp-hairline)] px-2 py-1 font-mono text-[10px] text-[var(--erp-gold)]">{`{${token}}`}</button>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <label className="flex items-center gap-2"><input type="checkbox" checked={form.attach_pdf} onChange={event => setForm({ ...form, attach_pdf: event.target.checked })} />Attach PDF</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={form.include_rates} onChange={event => setForm({ ...form, include_rates: event.target.checked })} />Include rates</label>
        <label className="block">Copy label
          <input value={form.copy_label} onChange={event => setForm({ ...form, copy_label: event.target.value })} className="mt-1 h-9 w-full bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] px-2" />
        </label>
      </div>
      <div className="border border-[var(--erp-hairline)] bg-[var(--erp-surface-2)] p-3 text-xs whitespace-pre-wrap">
        <div className="font-mono text-[10px] uppercase text-[var(--erp-muted)] mb-2">Sample preview</div>
        <div className="font-semibold">{fill(form.subject_template) || '-'}</div>
        <div className="mt-2">{fill(form.body_template) || '-'}</div>
      </div>
      <button
        type="button"
        disabled={saving}
        onClick={() => {
          setSaving(true);
          poEmailApi.saveBrand(brandId, form)
            .then(saved => { setForm(saved); notifySuccess('Brand email saved.'); })
            .catch(err => notifyApiError(err, 'Could not save brand email.'))
            .finally(() => setSaving(false));
        }}
        className="h-9 px-3 bg-[var(--erp-gold)] text-[#1B2430] text-xs font-semibold disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save email'}
      </button>
    </div>
  );
};
