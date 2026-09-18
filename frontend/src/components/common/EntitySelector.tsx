import React, { useEffect, useMemo, useState } from 'react';
import { EntityRow, EntityStatus, entitiesApi } from '../../services/entitiesApi';

export interface EntitySelectorProps {
  value: number | null;
  onChange: (id: number | null) => void;
  includeSubEntities?: boolean;
  onIncludeSubEntitiesChange?: (next: boolean) => void;
  showRollupToggle?: boolean;
  excludeIds?: number[];
  allowEmpty?: boolean;
  emptyLabel?: string;
  label?: string;
  disabled?: boolean;
  status?: EntityStatus | '';
}

export const EntitySelector: React.FC<EntitySelectorProps> = ({
  value,
  onChange,
  includeSubEntities = false,
  onIncludeSubEntitiesChange,
  showRollupToggle = true,
  excludeIds = [],
  allowEmpty = true,
  emptyLabel = 'All entities',
  label = 'Entity',
  disabled = false,
  status = 'Active',
}) => {
  const [rows, setRows] = useState<EntityRow[]>([]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    void entitiesApi.list(status ? { status } : {}).then(setRows).catch(() => setRows([]));
  }, [status]);

  const excluded = useMemo(() => new Set(excludeIds), [excludeIds]);
  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return rows.filter(r => {
      if (excluded.has(r.id)) return false;
      if (!q) return true;
      return (
        r.entity_name.toLowerCase().includes(q)
        || r.short_code.toLowerCase().includes(q)
        || r.city.toLowerCase().includes(q)
      );
    });
  }, [rows, query, excluded]);

  const selected = rows.find(r => r.id === value);

  return (
    <div className="flex flex-col gap-1 text-left relative">
      {label && <span className="text-xs font-normal text-[var(--erp-muted)] font-sans">{label}</span>}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        className="w-full px-3 py-2 text-sm text-left bg-[var(--erp-surface)] border border-[var(--erp-hairline-strong)] text-[var(--erp-text)] focus:outline-none focus:border-[var(--erp-gold)] disabled:opacity-50"
      >
        {selected ? (
          <span><span className="font-mono text-[var(--erp-gold)]">{selected.short_code}</span> · {selected.entity_name}</span>
        ) : (
          <span className="text-[var(--erp-faint)]">{emptyLabel}</span>
        )}
      </button>
      {open && (
        <div className="absolute z-40 top-full mt-1 w-full bg-[var(--erp-surface)] border border-[var(--erp-gold)] shadow-2xl max-h-64 overflow-hidden">
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search code or name…"
            className="w-full px-3 py-2 text-xs font-mono bg-[var(--erp-surface-2)] border-b border-[var(--erp-hairline)] text-[var(--erp-text)] focus:outline-none"
          />
          <div className="overflow-y-auto max-h-48">
            {allowEmpty && (
              <button
                type="button"
                className="w-full text-left px-3 py-2 text-xs hover:bg-[var(--erp-surface-2)] text-[var(--erp-muted)]"
                onClick={() => { onChange(null); setOpen(false); setQuery(''); }}
              >
                {emptyLabel}
              </button>
            )}
            {filtered.map(r => (
              <button
                key={r.id}
                type="button"
                className={`w-full text-left px-3 py-2 text-xs hover:bg-[var(--erp-surface-2)] ${r.id === value ? 'text-[var(--erp-gold)]' : 'text-[var(--erp-text)]'}`}
                onClick={() => { onChange(r.id); setOpen(false); setQuery(''); }}
              >
                <span className="font-mono text-[var(--erp-gold)]">{r.short_code}</span>
                <span className="ml-2">{r.entity_name}</span>
                <span className="ml-2 font-mono text-[10px] text-[var(--erp-muted)]">{r.entity_type}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-3 py-2 text-xs font-mono text-[var(--erp-muted)]">No matching entities</p>
            )}
          </div>
        </div>
      )}
      {showRollupToggle && value != null && onIncludeSubEntitiesChange && (
        <label className="flex items-center gap-2 text-[11px] font-mono text-[var(--erp-muted)] mt-1">
          <input
            type="checkbox"
            checked={includeSubEntities}
            onChange={e => onIncludeSubEntitiesChange(e.target.checked)}
          />
          Include sub-entities (roll-up)
        </label>
      )}
    </div>
  );
};
