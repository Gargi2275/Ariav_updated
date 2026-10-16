import React, { useEffect, useRef, useState } from 'react';
import { Pencil } from 'lucide-react';

export interface InputDialogProps {
  open: boolean;
  title: string;
  message: string;
  label: string;
  initialValue?: string;
  onCancel: () => void;
  onConfirm: (value: string) => void | Promise<void>;
  confirmLabel?: string;
  busyLabel?: string;
  type?: React.HTMLInputTypeAttribute;
}

export const InputDialog: React.FC<InputDialogProps> = ({
  open,
  title,
  message,
  label,
  initialValue = '',
  onCancel,
  onConfirm,
  confirmLabel = 'Save',
  busyLabel = 'Saving…',
  type = 'text',
}) => {
  const [value, setValue] = useState(initialValue);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setBusy(false);
      return;
    }
    setValue(initialValue);
    inputRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) {
        event.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [busy, initialValue, onCancel, open]);

  if (!open) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || !value.trim()) return;
    setBusy(true);
    try {
      await onConfirm(value.trim());
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true" aria-labelledby="input-dialog-title">
      <form onSubmit={submit} className="w-full max-w-md rounded-xl border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] p-6 shadow-2xl">
        <div className="mb-5 flex items-start gap-3">
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg border border-[var(--erp-gold)]/40 bg-[var(--erp-gold)]/10 text-[var(--erp-gold)]" aria-hidden>
            <Pencil size={16} />
          </span>
          <div>
            <h3 id="input-dialog-title" className="font-display text-lg font-bold text-[var(--erp-text)]">{title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-[var(--erp-muted)]">{message}</p>
          </div>
        </div>
        <label className="block text-sm font-medium text-[var(--erp-text)]">
          {label}
          <input ref={inputRef} type={type} value={value} onChange={event => setValue(event.target.value)} className="mt-2 w-full rounded-lg border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface-2)] px-3 py-2 text-sm text-[var(--erp-text)] outline-none focus:border-[var(--erp-gold)] focus:ring-2 focus:ring-[var(--erp-gold)]/20" />
        </label>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" disabled={busy} onClick={onCancel} className="rounded-lg border border-[var(--erp-hairline-strong)] px-4 py-2 text-sm text-[var(--erp-muted)] hover:text-[var(--erp-text)] disabled:opacity-50">Cancel</button>
          <button type="submit" disabled={busy || !value.trim()} className="rounded-lg bg-[var(--erp-gold)] px-4 py-2 text-sm font-semibold text-[#0F141B] hover:opacity-90 disabled:opacity-50">{busy ? busyLabel : confirmLabel}</button>
        </div>
      </form>
    </div>
  );
};
