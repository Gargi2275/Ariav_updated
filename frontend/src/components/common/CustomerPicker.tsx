import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { CustomerRow } from '../../services/customersApi';

export interface CustomerPickerProps {
  customers: CustomerRow[];
  value: number | '';
  onChange: (id: number | '') => void;
  placeholder?: string;
  allowAll?: boolean;
  allLabel?: string;
  disabled?: boolean;
  error?: boolean;
  className?: string;
  compact?: boolean;
}

export const CustomerPicker: React.FC<CustomerPickerProps> = ({
  customers,
  value,
  onChange,
  placeholder = 'Select customer…',
  allowAll = false,
  allLabel = 'All customers',
  disabled = false,
  error = false,
  className = '',
  compact = false,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const selected = customers.find(c => c.id === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(c =>
      c.customer_name.toLowerCase().includes(q)
      || c.customer_code.toLowerCase().includes(q)
      || (c.city || '').toLowerCase().includes(q)
    );
  }, [customers, query]);

  const triggerClass = compact
    ? 'px-2 py-1 text-xs font-mono min-w-[220px] max-w-[280px] bg-[var(--erp-surface-2)]'
    : 'px-3 py-2 text-sm bg-[var(--erp-surface)]';

  const label = selected
    ? `${selected.customer_code} · ${selected.customer_name}`
    : allowAll && value === ''
      ? allLabel
      : placeholder;

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => { if (!disabled) setOpen(prev => !prev); }}
        className={`w-full ${triggerClass} border text-left flex items-center justify-between gap-2 cursor-pointer disabled:opacity-50 ${
          error ? 'border-[var(--erp-negative)]' : open ? 'border-[var(--erp-gold)]' : compact ? 'border-[var(--erp-hairline)]' : 'border-[var(--erp-hairline-strong)]'
        } text-[var(--erp-text)]`}
      >
        <span className={`truncate ${selected || (allowAll && value === '') ? 'text-[var(--erp-text)]' : 'text-[var(--erp-muted)]'}`}>
          {label}
        </span>
        <Search className="w-3.5 h-3.5 text-[var(--erp-muted)] shrink-0" />
      </button>
      {open && (
        <div className="absolute z-40 top-full left-0 mt-1 w-[min(100vw-2rem,22rem)] bg-[var(--erp-surface)] border border-[var(--erp-gold)]/40 shadow-xl">
          <div className="p-2 border-b border-[var(--erp-hairline)] sticky top-0 bg-[var(--erp-surface)]">
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Type name or customer code…"
              className="w-full px-2.5 py-1.5 text-xs bg-[var(--erp-surface-2)] border border-[var(--erp-hairline)] text-[var(--erp-text)] focus:outline-none focus:border-[var(--erp-gold)] font-mono"
            />
          </div>
          <div className="max-h-60 overflow-y-auto">
            {allowAll ? (
              <button
                type="button"
                onClick={() => { onChange(''); setOpen(false); }}
                className="w-full text-left px-3 py-2 text-xs hover:bg-[var(--erp-surface-2)] cursor-pointer text-[var(--erp-muted)] font-mono"
              >
                {allLabel}
              </button>
            ) : null}
            {filtered.map(c => (
              <button
                type="button"
                key={c.id}
                onClick={() => { onChange(c.id); setOpen(false); }}
                className={`w-full text-left px-3 py-2 text-xs hover:bg-[var(--erp-surface-2)] cursor-pointer ${
                  c.id === value ? 'bg-[var(--erp-surface-2)] text-[var(--erp-gold)]' : 'text-[var(--erp-text)]'
                }`}
              >
                <span className="font-medium block truncate">{c.customer_name}</span>
                <span className="font-mono text-[11px] text-[var(--erp-muted)]">
                  {c.customer_code}{c.city ? ` · ${c.city}` : ''}
                </span>
              </button>
            ))}
            {filtered.length === 0 ? (
              <p className="p-3 text-xs text-center text-[var(--erp-muted)] font-mono">No matching customers.</p>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};
