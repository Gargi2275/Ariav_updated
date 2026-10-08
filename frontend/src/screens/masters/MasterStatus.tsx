import React from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { SESSION_EXPIRED_MESSAGE } from '../../services/sessionExpiry';

export const MasterLoading: React.FC<{ label?: string; rows?: number }> = ({
  label = 'Loading master records…',
  rows = 8,
}) => (
  <div
    className="border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] overflow-hidden"
    role="status"
    aria-live="polite"
    aria-busy="true"
  >
    <div className="bg-[var(--erp-surface-2)] border-b-2 border-[var(--erp-hairline-strong)] px-3.5 py-2.5 flex items-center gap-2">
      <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--erp-gold)] shrink-0" />
      <span className="font-mono text-[11px] font-semibold tracking-wider uppercase text-[var(--erp-gold)]">
        {label}
      </span>
    </div>
    <div className="divide-y divide-[var(--erp-hairline)]">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="px-3.5 py-2.5 flex items-center gap-3">
          <div className="h-3 w-14 bg-[var(--erp-surface-2)] animate-pulse rounded-none" />
          <div
            className="h-3 bg-[var(--erp-surface-2)] animate-pulse rounded-none"
            style={{ width: `${48 - (i % 4) * 7}%` }}
          />
          <div className="h-3 w-20 bg-[var(--erp-surface-2)] animate-pulse rounded-none ml-auto" />
        </div>
      ))}
    </div>
  </div>
);

export const MasterError: React.FC<{ message: string; onRetry?: () => void }> = ({ message, onRetry }) => {
  if (message === SESSION_EXPIRED_MESSAGE) return null;
  return (
    <div className="flex items-center justify-between gap-3 border border-[var(--erp-negative)]/40 bg-[var(--erp-negative)]/8 px-3 py-2 text-xs">
      <span className="flex items-center gap-2 font-mono text-[var(--erp-negative)]">
        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
        {message}
      </span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="px-2 py-1 border border-[var(--erp-hairline)] text-[var(--erp-text)] hover:border-[var(--erp-gold)] cursor-pointer"
        >
          Retry
        </button>
      )}
    </div>
  );
};

export function emptyTableProps(
  total: number,
  filtered: number,
  noneYet: string,
  noMatch: string,
  addLabel: string,
  onAdd: () => void,
) {
  const catalogueEmpty = total === 0;
  return {
    emptyMessage: catalogueEmpty ? noneYet : noMatch,
    emptyActionText: catalogueEmpty ? addLabel : undefined,
    onEmptyAction: catalogueEmpty ? onAdd : undefined,
  };
}
