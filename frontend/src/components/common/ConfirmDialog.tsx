import React, { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';

export interface ConfirmDialogProps {
  open: boolean;
  /** Lowercase noun used in the heading, e.g. "party" → "Delete party?" */
  entityType: string;
  /** Identifying label shown in the body, e.g. "Gujarat (GUJ)" */
  entityLabel: string;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
  confirmLabel?: string;
  /** Overrides the default "Delete {entityType}?" heading. */
  title?: string;
  /** Overrides the default hard-delete body copy. */
  message?: string;
  busyLabel?: string;
  /** gold = soft deactivate; danger = default delete; critical = permanent delete */
  confirmTone?: 'gold' | 'danger' | 'critical';
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  entityType,
  entityLabel,
  onCancel,
  onConfirm,
  confirmLabel = 'Delete',
  title,
  message,
  busyLabel = 'Deleting…',
  confirmTone = 'danger',
}) => {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setBusy(false);
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  const handleConfirm = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <div
        className="w-full max-w-md bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] shadow-2xl p-6 text-left"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 pb-3 mb-4 border-b border-[var(--erp-hairline)]">
          <span
            aria-hidden
            data-confirm-icon
            className={`mt-0.5 inline-flex size-10 shrink-0 items-center justify-center box-border rounded-none aspect-square overflow-visible border p-3 ${
              confirmTone === 'gold'
                ? 'border-[var(--erp-gold)]/40 bg-[var(--erp-gold)]/10 text-[var(--erp-gold)]'
                : confirmTone === 'critical'
                  ? 'border-red-800 bg-red-950/60 text-red-400'
                  : 'border-[var(--erp-negative)]/40 bg-[var(--erp-negative)]/10 text-[var(--erp-negative)]'
            }`}
          >
            <AlertTriangle
              size={14}
              strokeWidth={1.5}
              className="block size-full overflow-visible"
            />
          </span>
          <div>
            <h3 id="confirm-dialog-title" className="font-display text-lg font-bold text-[var(--erp-text)]">
              {title || `Delete ${entityType}?`}
            </h3>
            <p className="font-body text-sm text-[var(--erp-muted)] mt-1.5 leading-relaxed">
              {message || `${entityLabel} will be permanently removed. This cannot be undone.`}
            </p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="px-4 py-1.5 border border-[var(--erp-hairline-strong)] text-xs font-body text-[var(--erp-muted)] hover:text-[var(--erp-text)] hover:border-[var(--erp-text)]/40 cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleConfirm()}
            className={`px-4 py-1.5 text-xs font-body font-semibold cursor-pointer disabled:opacity-50 ${
              confirmTone === 'gold'
                ? 'bg-[var(--erp-gold)] text-[#0F141B] hover:opacity-90'
                : confirmTone === 'critical'
                  ? 'bg-red-800 text-white hover:bg-red-700 border border-red-950'
                  : 'bg-[var(--erp-negative)] text-white hover:opacity-90'
            }`}
          >
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
