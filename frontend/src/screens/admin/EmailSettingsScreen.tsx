import React, { useCallback, useEffect, useState } from 'react';
import { Mail } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { TextInput } from '../../components/common/FormControls';
import { EmailModeBanner } from '../../components/common/EmailModeBanner';
import { MasterError, MasterLoading } from '../masters/MasterStatus';
import { notifyApiError, notifySuccess } from '../../services/notify';
import { EmailSettings, poEmailApi } from '../../services/poEmailApi';

export const EmailSettingsScreen: React.FC = () => {
  const [settings, setSettings] = useState<EmailSettings | null>(null);
  const [connection, setConnection] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmEnable, setConfirmEnable] = useState(false);
  const [appPassword, setAppPassword] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [row, link] = await Promise.all([
        poEmailApi.settings(),
        poEmailApi.connection().catch(err => {
          const message = err instanceof Error ? err.message : 'Connection failed.';
          return { ok: false, detail: message, mode: 'off' as const, configured: false, test_recipient: '' };
        }),
      ]);
      setSettings({ ...row, smtp_password: '' });
      setAppPassword('');
      setConnection(link.ok ? 'Connection OK.' : link.detail || 'Connection failed.');
    } catch (err) {
      setError(notifyApiError(err, 'Could not load email settings.').message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = async (next: EmailSettings) => {
    setSaving(true);
    try {
      const saved = await poEmailApi.saveSettings({ ...next, smtp_password: appPassword });
      setSettings({ ...saved, smtp_password: '' });
      setAppPassword('');
      const link = await poEmailApi.connection().catch(() => null);
      if (link) setConnection(link.ok ? 'Connection OK.' : link.detail || 'Connection failed.');
      notifySuccess('Email settings saved.');
    } catch (err) {
      notifyApiError(err, 'Could not save email settings.');
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    try {
      const result = await poEmailApi.sendTest();
      notifySuccess(result.detail);
    } catch (err) {
      notifyApiError(err, 'The test email was not sent.');
    }
  };

  if (loading) return <div className="p-3"><MasterLoading label="Loading email settings…" /></div>;
  if (error || !settings) return <div className="p-3"><MasterError message={error || 'Email settings are unavailable.'} onRetry={load} /></div>;

  return (
    <div className="min-h-full p-3 flex flex-col gap-3 text-left">
      <PageHeader moduleNumber="11" section="Admin" title="Email Settings" compact />
      <EmailModeBanner mode={settings.mode} testRecipient={settings.test_recipient} />
      <section className="border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] p-4 space-y-3">
        <h2 className="font-display text-base font-bold flex items-center gap-2"><Mail className="w-4 h-4 text-[var(--erp-gold)]" />Transport</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div><dt className="font-mono uppercase text-[10px] text-[var(--erp-muted)]">Mailbox</dt><dd className="mt-1 text-[var(--erp-text)]">{settings.smtp_user || 'Not saved'}</dd></div>
          <div><dt className="font-mono uppercase text-[10px] text-[var(--erp-muted)]">Connection</dt><dd className="mt-1 text-[var(--erp-text)]">{connection}</dd></div>
          <div><dt className="font-mono uppercase text-[10px] text-[var(--erp-muted)]">App password saved</dt><dd className="mt-1 text-[var(--erp-text)]">{settings.configured ? 'Yes' : 'No'}</dd></div>
          <div><dt className="font-mono uppercase text-[10px] text-[var(--erp-muted)]">From address</dt><dd className="mt-1 text-[var(--erp-text)]">{settings.from_email || 'Not saved'}</dd></div>
        </dl>
      </section>
      <form
        className="border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] p-4 space-y-4"
        onSubmit={event => { event.preventDefault(); void save(settings); }}
      >
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={event => {
              if (event.target.checked) setConfirmEnable(true);
              else setSettings({ ...settings, enabled: false });
            }}
          />
          Live sending enabled
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextInput label="Mailbox email" value={settings.smtp_user || ''} onChange={event => setSettings({ ...settings, smtp_user: event.target.value })} />
          <TextInput label="App password" type="password" autoComplete="new-password" value={appPassword} placeholder={settings.configured ? 'Leave blank to keep the saved password' : 'Paste the app password'} onChange={event => setAppPassword(event.target.value)} />
          <TextInput label="Mail host" value={settings.smtp_host || ''} onChange={event => setSettings({ ...settings, smtp_host: event.target.value })} />
          <TextInput label="Port" mono value={String(settings.smtp_port || 587)} onChange={event => setSettings({ ...settings, smtp_port: Number(event.target.value) || 587 })} />
          <TextInput label="From address" value={settings.from_email || ''} onChange={event => setSettings({ ...settings, from_email: event.target.value })} />
          <TextInput label="From name" value={settings.from_name} onChange={event => setSettings({ ...settings, from_name: event.target.value })} />
          <TextInput label="Default reply-to" value={settings.reply_to_default} onChange={event => setSettings({ ...settings, reply_to_default: event.target.value })} />
          <TextInput label="Daily cap" mono value={String(settings.daily_cap)} onChange={event => setSettings({ ...settings, daily_cap: Number(event.target.value) || 0 })} />
          <TextInput label="Per-minute cap" mono value={String(settings.per_minute_cap)} onChange={event => setSettings({ ...settings, per_minute_cap: Number(event.target.value) || 1 })} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={settings.require_preview} onChange={event => setSettings({ ...settings, require_preview: event.target.checked })} />
          Require preview before send
        </label>
        <label className="block text-xs text-[var(--erp-muted)]">
          After a successful send
          <select
            value={settings.after_send_status_action}
            onChange={event => setSettings({ ...settings, after_send_status_action: event.target.value as EmailSettings['after_send_status_action'] })}
            className="mt-1 box-border h-9 w-full bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] px-2 text-[var(--erp-text)]"
          >
            <option value="none">Leave the purchase order status unchanged</option>
            <option value="ask">Ask before marking Sent to Brand</option>
            <option value="mark_sent_to_brand">Mark Sent to Brand</option>
          </select>
        </label>
        <div className="flex gap-2">
          <button type="submit" disabled={saving} className="h-9 px-3 bg-[var(--erp-gold)] text-[#1B2430] text-xs font-semibold disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
          <button type="button" onClick={() => void sendTest()} className="h-9 px-3 border border-[var(--erp-gold)] text-[var(--erp-gold)] text-xs font-semibold">Send test email to this mailbox</button>
        </div>
      </form>
      <ConfirmDialog
        open={confirmEnable}
        entityType="email"
        entityLabel="live sending"
        title="Enable live email?"
        message="Purchase-order emails will go to the brand recipients saved on each brand."
        confirmLabel="Enable"
        confirmTone="gold"
        onCancel={() => setConfirmEnable(false)}
        onConfirm={() => { setSettings({ ...settings, enabled: true }); setConfirmEnable(false); }}
      />
    </div>
  );
};
