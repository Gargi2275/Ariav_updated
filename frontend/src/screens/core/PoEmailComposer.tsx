import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Mail, X } from 'lucide-react';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { EmailModeBanner } from '../../components/common/EmailModeBanner';
import { notifyApiError, notifySuccess } from '../../services/notify';
import {
  ComposeItem,
  EmailHistoryRow,
  emailBadgeLabel,
  poEmailApi,
} from '../../services/poEmailApi';

interface Draft extends ComposeItem {
  resendReason: string;
}

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  return `${(size / 1024).toFixed(1)} KB`;
}

export const PoEmailHistory: React.FC<{ poId: number; isAdmin: boolean; onChanged?: () => void }> = ({ poId, isAdmin, onChanged }) => {
  const [rows, setRows] = useState<EmailHistoryRow[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => {
    poEmailApi.history(poId).then(setRows).catch(err => notifyApiError(err, 'Could not load email history.'));
  };
  useEffect(load, [poId]);

  const resend = async () => {
    const latest = rows.find(row => row.status === 'sent');
    if (!latest || reason.trim().length < 5) return;
    setBusy(true);
    try {
      await poEmailApi.send([{
        po_id: poId,
        subject: latest.subject,
        body: latest.body,
        ...(isAdmin ? { to: latest.to, cc: latest.cc, bcc: latest.bcc || [] } : {}),
        resend_reason: reason.trim(),
      }]);
      setReason('');
      notifySuccess('The purchase order email was resent.');
      load();
      onChanged?.();
    } catch (err) {
      notifyApiError(err, 'Could not resend.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-2">
      <h4 className="text-[11px] font-mono uppercase tracking-wider text-[var(--erp-gold)]">Email history</h4>
      {!rows.length ? <p className="text-xs text-[var(--erp-muted)]">Not sent</p> : null}
      {rows.map(row => (
        <article key={row.id} className="border border-[var(--erp-hairline)] p-2 text-xs space-y-1">
          <div className="flex justify-between gap-2">
            <span>{new Date(row.sent_at || row.created_at).toLocaleString()} · {row.created_by || '-'}</span>
            <span className="font-mono">{emailBadgeLabel(row.status)}</span>
          </div>
          <div>To {row.to.join(', ') || '-'}</div>
          {row.resend_reason ? <div>Resend reason: {row.resend_reason}</div> : null}
          {row.last_error ? <div className="text-[var(--erp-negative)]">{row.last_error}</div> : null}
          <div className="font-mono text-[10px] break-all">{row.attachment_filename || 'No attachment'} {row.attachment_sha256}</div>
          <div className="flex gap-2">
            <button type="button" className="text-[var(--erp-gold)]" onClick={() => setOpenId(openId === row.id ? null : row.id)}>View sent text</button>
            {row.status === 'failed' && row.attempts < 3 ? (
              <button type="button" className="text-[var(--erp-gold)]" onClick={() => void poEmailApi.retry(row.id).then(() => { load(); onChanged?.(); }).catch(err => notifyApiError(err, 'Could not retry.'))}>Retry</button>
            ) : null}
          </div>
          {openId === row.id ? (
            <div className="border-t border-[var(--erp-hairline)] pt-2 whitespace-pre-wrap">
              <div className="font-semibold">{row.subject}</div>
              <div className="mt-1">{row.body}</div>
            </div>
          ) : null}
        </article>
      ))}
      {rows.some(row => row.status === 'sent') ? (
        <div className="flex gap-2">
          <input value={reason} onChange={event => setReason(event.target.value)} placeholder="Reason for resend" className="h-8 flex-1 bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] px-2 text-xs" />
          <button type="button" disabled={busy || reason.trim().length < 5} onClick={() => void resend()} className="inline-flex h-8 items-center gap-1.5 px-2 border border-[var(--erp-gold)] text-[var(--erp-gold)] text-xs disabled:opacity-40">
            {busy ? <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" /> : null}
            {busy ? 'Sending…' : 'Resend'}
          </button>
        </div>
      ) : null}
    </section>
  );
};

export const PoEmailComposer: React.FC<{
  poIds: number[];
  isAdmin: boolean;
  onClose: () => void;
  onSent: () => void;
}> = ({ poIds, isAdmin, onClose, onSent }) => {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [templates, setTemplates] = useState<Record<number, Draft>>({});
  const [activeId, setActiveId] = useState<number | null>(poIds[0] ?? null);
  const [opened, setOpened] = useState<number[]>([]);
  const [mode, setMode] = useState('');
  const [pdfUrl, setPdfUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmLive, setConfirmLive] = useState(false);

  useEffect(() => {
    let live = true;
    poEmailApi.compose(poIds).then(result => {
      if (!live) return;
      const next = result.items.map(item => ({ ...item, resendReason: '' }));
      setDrafts(next);
      setTemplates(Object.fromEntries(next.map(item => [item.po_id, item])));
      setMode(result.mode);
      setActiveId(next[0]?.po_id ?? null);
    }).catch(err => notifyApiError(err, 'Could not prepare the emails.'));
    return () => { live = false; };
  }, [poIds]);

  const active = drafts.find(item => item.po_id === activeId) || null;

  useEffect(() => {
    if (activeId == null || !drafts.some(item => item.po_id === activeId)) return;
    setOpened(current => current.includes(activeId) ? current : [...current, activeId]);
  }, [activeId, drafts]);

  useEffect(() => {
    if (!activeId) return undefined;
    let cancelled = false;
    let url = '';
    poEmailApi.previewPdf(activeId).then(blob => {
      if (cancelled) return;
      url = URL.createObjectURL(blob);
      setPdfUrl(previous => {
        if (previous) URL.revokeObjectURL(previous);
        return url;
      });
    }).catch(() => { if (!cancelled) setPdfUrl(''); });
    return () => { cancelled = true; };
  }, [activeId]);

  const openPo = (id: number) => {
    setActiveId(id);
    setOpened(current => current.includes(id) ? current : [...current, id]);
  };

  const update = (patch: Partial<Draft>) => {
    setDrafts(current => current.map(item => item.po_id === activeId ? { ...item, ...patch } : item));
  };

  const needsReason = drafts.some(item => item.warnings.some(warning => warning.startsWith('Already emailed')) && item.resendReason.trim().length < 5);
  const unopened = drafts.filter(item => !opened.includes(item.po_id));
  const unsendable = drafts.filter(item => !item.sendable);
  const noRecipients = drafts.filter(item => !item.to.length);
  const ready = drafts.length > 0 && !unopened.length && !unsendable.length && !noRecipients.length && !needsReason;
  const blockedReason = !drafts.length
    ? ''
    : unsendable.length
      ? `${unsendable.map(item => item.po_number).join(', ')} cannot be emailed in its current status.`
      : noRecipients.length
        ? `Add a To address for ${noRecipients.map(item => item.po_number).join(', ')}.`
        : unopened.length
          ? `Open ${unopened.map(item => item.po_number).join(', ')} on the left to review before sending.`
          : needsReason
            ? 'Enter a resend reason of at least 5 characters.'
            : '';
  const recipientText = useMemo(() => drafts.map(item => `${item.po_number}: ${item.to.join(', ') || 'no recipients'}`).join('\n'), [drafts]);

  const send = async () => {
    setConfirmLive(false);
    setBusy(true);
    try {
      const result = await poEmailApi.send(drafts.map(item => ({
        po_id: item.po_id,
        subject: item.subject,
        body: item.body,
        ...(isAdmin ? { to: item.to, cc: item.cc, bcc: item.bcc || [] } : {}),
        ...(item.resendReason.trim() ? { resend_reason: item.resendReason.trim() } : {}),
      })));
      const sent = result.rows.filter(row => row.status === 'sent');
      const failed = result.rows.filter(row => row.status === 'failed' || row.status === 'unknown');
      const marked = result.marked_sent_to_brand?.length || 0;
      if (sent.length) {
        const plural = sent.length === 1 ? '' : 's';
        notifySuccess(
          marked
            ? `Sent ${sent.length} purchase order email${plural}. ${marked} marked Sent to Brand.`
            : `Sent ${sent.length} purchase order email${plural}.`,
        );
      }
      if (failed.length) {
        notifyApiError(
          new Error(`${failed.map(row => row.po_number).join(', ')} could not be sent. Open the email history to retry.`),
          'Some emails were not sent.',
        );
      }
      onSent();
    } catch (err) {
      notifyApiError(err, 'Could not send the emails.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-3">
      <div className="relative flex max-h-[92vh] w-full max-w-6xl flex-col bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)]" aria-busy={busy}>
        {busy ? (
          <div role="status" aria-live="polite" className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[var(--erp-surface)]/90 backdrop-blur-[2px]">
            <span className="relative flex h-14 w-14 items-center justify-center">
              <Loader2 className="absolute h-14 w-14 animate-spin text-[var(--erp-gold)] motion-reduce:animate-none" strokeWidth={1.5} />
              <Mail className="h-5 w-5 text-[var(--erp-gold)]" />
            </span>
            <p className="font-display text-base font-semibold text-[var(--erp-text)]">
              Sending {drafts.length} email{drafts.length === 1 ? '' : 's'} to the brand…
            </p>
            <p className="max-w-sm text-center text-xs text-[var(--erp-muted)]">
              Attaching the purchase order PDF and delivering it. Please keep this window open.
            </p>
          </div>
        ) : null}
        <div className="flex items-center justify-between border-b border-[var(--erp-hairline)] px-4 py-3">
          <h2 className="font-display text-lg font-bold flex items-center gap-2"><Mail className="w-4 h-4 text-[var(--erp-gold)]" />Send email ({drafts.length})</h2>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close email" className="disabled:opacity-40"><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-3 overflow-y-auto p-4">
          <EmailModeBanner mode={mode} />
          <div className="grid min-h-[28rem] grid-cols-1 gap-3 lg:grid-cols-[220px_minmax(0,1fr)]">
            <div className="space-y-1">
              {drafts.map(item => (
                <button key={item.po_id} type="button" onClick={() => openPo(item.po_id)} className={`block w-full border px-2 py-2 text-left text-xs ${item.po_id === activeId ? 'border-[var(--erp-gold)]' : 'border-[var(--erp-hairline)]'}`}>
                  <span className="font-mono text-[var(--erp-gold)]">{item.po_number}</span>
                  <span className="mt-1 block text-[var(--erp-muted)]">{opened.includes(item.po_id) ? 'Opened' : 'Not opened'} · {item.warnings.length ? `${item.warnings.length} warnings` : item.status}</span>
                </button>
              ))}
            </div>
            {active ? (
              <div className="space-y-3">
                {active.warnings.map(warning => <p key={warning} className="border border-[var(--erp-negative)]/40 px-2 py-1 text-xs">{warning}</p>)}
                {isAdmin ? (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <label className="text-xs">To
                      <input value={active.to.join(', ')} onChange={event => update({ to: event.target.value.split(',').map(value => value.trim().toLowerCase()).filter(Boolean) })} className="mt-1 h-9 w-full border border-[var(--erp-hairline)] bg-[var(--erp-surface-2)] px-2" />
                    </label>
                    <label className="text-xs">CC
                      <input value={active.cc.join(', ')} onChange={event => update({ cc: event.target.value.split(',').map(value => value.trim().toLowerCase()).filter(Boolean) })} className="mt-1 h-9 w-full border border-[var(--erp-hairline)] bg-[var(--erp-surface-2)] px-2" />
                    </label>
                    <label className="text-xs">BCC
                      <input value={(active.bcc || []).join(', ')} onChange={event => update({ bcc: event.target.value.split(',').map(value => value.trim().toLowerCase()).filter(Boolean) })} className="mt-1 h-9 w-full border border-[var(--erp-hairline)] bg-[var(--erp-surface-2)] px-2" />
                    </label>
                  </div>
                ) : (
                  <p className="text-xs">To {active.to.join(', ') || 'none configured'}{active.cc.length ? ` · CC ${active.cc.join(', ')}` : ''}</p>
                )}
                <label className="block text-xs">Subject
                  <input value={active.subject} onChange={event => update({ subject: event.target.value })} className="mt-1 h-9 w-full border border-[var(--erp-hairline)] bg-[var(--erp-surface-2)] px-2" />
                </label>
                <label className="block text-xs">Body
                  <textarea value={active.body} onChange={event => update({ body: event.target.value })} rows={6} className="mt-1 w-full border border-[var(--erp-hairline)] bg-[var(--erp-surface-2)] px-2 py-2" />
                </label>
                {active.warnings.some(warning => warning.startsWith('Already emailed')) ? (
                  <label className="block text-xs">Resend reason
                    <input value={active.resendReason} onChange={event => update({ resendReason: event.target.value })} className="mt-1 h-9 w-full border border-[var(--erp-hairline)] bg-[var(--erp-surface-2)] px-2" />
                  </label>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="h-8 border border-[var(--erp-hairline)] px-2 text-xs" onClick={() => {
                    const original = templates[active.po_id];
                    if (original) update({ subject: original.subject, body: original.body, to: original.to, cc: original.cc, bcc: original.bcc });
                  }}>Reset to template</button>
                  <button type="button" className="h-8 border border-[var(--erp-hairline)] px-2 text-xs" onClick={() => setDrafts(current => current.map(item => ({ ...item, subject: active.subject, body: active.body })))}>Apply subject/body edits to all selected</button>
                </div>
                <div className="text-xs text-[var(--erp-muted)]">Attachment {active.attachment_name || 'none'} · {formatBytes(active.attachment_bytes)}</div>
                {pdfUrl ? <iframe title="Purchase order attachment" src={pdfUrl} className="h-64 w-full border border-[var(--erp-hairline)]" /> : <p className="text-xs text-[var(--erp-muted)]">The attachment preview is loading.</p>}
                {pdfUrl ? <a href={pdfUrl} download={active.attachment_name || 'purchase-order.pdf'} className="text-xs text-[var(--erp-gold)]">Download attachment</a> : null}
              </div>
            ) : <p className="text-xs text-[var(--erp-muted)]">Preparing the selected purchase orders…</p>}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-[var(--erp-hairline)] px-4 py-3">
          {blockedReason && !busy ? <p className="mr-auto text-xs text-[var(--erp-muted)]">{blockedReason}</p> : null}
          <button type="button" onClick={onClose} disabled={busy} className="h-9 px-3 text-xs text-[var(--erp-muted)] disabled:opacity-40">Cancel</button>
          <button
            type="button"
            disabled={!ready || busy}
            onClick={() => { if (mode === 'live') setConfirmLive(true); else void send(); }}
            className="inline-flex h-9 items-center gap-2 bg-[var(--erp-gold)] px-3 text-xs font-semibold text-[#1B2430] disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" /> : null}
            {busy ? 'Sending…' : `Send ${drafts.length} email${drafts.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
      <ConfirmDialog
        open={confirmLive}
        entityType="email"
        entityLabel="live delivery"
        title="Send these emails?"
        message={<span className="whitespace-pre-wrap">{recipientText}</span>}
        confirmLabel="Send"
        confirmTone="gold"
        onCancel={() => setConfirmLive(false)}
        onConfirm={() => void send()}
      />
    </div>
  );
};
