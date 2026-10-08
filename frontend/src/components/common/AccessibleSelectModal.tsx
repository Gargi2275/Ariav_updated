import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, ChevronRight, Clock3, Search, SearchX, X } from 'lucide-react';

export interface SelectOption {
  id: number;
  label: string;
  /** Secondary line under the label (e.g. product code). Also searched. */
  detail?: string;
  /** Usage frequency; options with usage > 0 are listed under the frequently-used heading. */
  usage?: number | null;
}

export interface AccessibleSelectModalProps {
  /** Field name for screen readers, e.g. "Category". */
  fieldLabel: string;
  /** Modal heading, e.g. "Select Category". */
  title: string;
  /** One-line helper under the heading. */
  subtitle?: string;
  searchPlaceholder: string;
  mostUsedHeading: string;
  allHeading: string;
  emptyText: string;
  /** Text on the field when nothing is selected. */
  placeholder: string;
  /** Options in the order they should appear under the "all" heading. */
  options: SelectOption[];
  value?: number;
  onChange: (id: number) => void;
  disabled?: boolean;
  invalid?: boolean;
  /** Id of an element describing the field (e.g. its error message). */
  describedBy?: string;
  mostUsedLimit?: number;
  /** Cap on rendered rows; typing narrows the list further. */
  renderLimit?: number;
}

type Section = { key: string; heading: string; count: number; icon?: boolean; items: SelectOption[] };

function matches(option: SelectOption, terms: string[]): boolean {
  const haystack = `${option.label} ${option.detail ?? ''}`.toLowerCase();
  return terms.every(term => haystack.includes(term));
}

const focusRing =
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--erp-gold)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--erp-surface)]';

export const AccessibleSelectModal: React.FC<AccessibleSelectModalProps> = ({
  fieldLabel,
  title,
  subtitle,
  searchPlaceholder,
  mostUsedHeading,
  allHeading,
  emptyText,
  placeholder,
  options,
  value,
  onChange,
  disabled = false,
  invalid = false,
  describedBy,
  mostUsedLimit = 5,
  renderLimit = 200,
}) => {
  const baseId = useId();
  const titleId = `${baseId}-title`;
  const subtitleId = `${baseId}-subtitle`;
  const listId = `${baseId}-list`;
  const optionId = (id: number) => `${baseId}-opt-${id}`;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = options.find(o => o.id === value);

  const { sections, flat, totalMatches } = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length) {
      const results = options.filter(o => matches(o, terms));
      const shown = results.slice(0, renderLimit);
      return {
        sections: shown.length
          ? [{ key: 'results', heading: 'Results', count: results.length, items: shown }]
          : [],
        flat: shown,
        totalMatches: results.length,
      };
    }
    const mostUsed = options
      .filter(o => (o.usage ?? 0) > 0)
      .sort((a, b) => (b.usage ?? 0) - (a.usage ?? 0) || a.label.localeCompare(b.label))
      .slice(0, mostUsedLimit);
    const mostUsedIds = new Set(mostUsed.map(o => o.id));
    const rest = options.filter(o => !mostUsedIds.has(o.id));
    const restShown = rest.slice(0, renderLimit);
    const result: Section[] = [];
    if (mostUsed.length) {
      result.push({ key: 'most', heading: mostUsedHeading, count: mostUsed.length, icon: true, items: mostUsed });
    }
    if (restShown.length) result.push({ key: 'all', heading: allHeading, count: rest.length, items: restShown });
    return { sections: result, flat: [...mostUsed, ...restShown], totalMatches: mostUsed.length + rest.length };
  }, [options, query, mostUsedLimit, renderLimit, mostUsedHeading, allHeading]);

  const truncated = flat.length < totalMatches;

  const openModal = () => {
    if (disabled) return;
    setQuery('');
    setOpen(true);
  };

  const closeModal = () => {
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const choose = (option: SelectOption) => {
    onChange(option.id);
    closeModal();
  };

  // On open, start on the selected row (or the first row) and focus the search box.
  useEffect(() => {
    if (!open) return;
    const selectedIndex = flat.findIndex(o => o.id === value);
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    searchRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const active = flat[activeIndex];

  useEffect(() => {
    if (!open || !active) return;
    document.getElementById(optionId(active.id))?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const last = flat.length - 1;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex(i => Math.min(i + 1, last));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex(i => Math.max(i - 1, 0));
        break;
      case 'PageDown':
        e.preventDefault();
        setActiveIndex(i => Math.min(i + 5, last));
        break;
      case 'PageUp':
        e.preventDefault();
        setActiveIndex(i => Math.max(i - 5, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (active) choose(active);
        break;
      default:
        break;
    }
  };

  const onDialogKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeModal();
      return;
    }
    if (e.key === 'Tab' && dialogRef.current) {
      const focusables = [...dialogRef.current.querySelectorAll<HTMLElement>('input, button:not([disabled])')];
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  const onTriggerKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      openModal();
    }
  };

  const clearSearch = () => {
    setQuery('');
    setActiveIndex(0);
    searchRef.current?.focus();
  };

  const resultAnnouncement = flat.length
    ? `${totalMatches} ${totalMatches === 1 ? 'option' : 'options'} available. Use arrow keys to move, Enter to select.`
    : emptyText;

  let rowIndex = -1;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        aria-label={`${fieldLabel}: ${selected ? selected.label : placeholder}`}
        onClick={openModal}
        onKeyDown={onTriggerKeyDown}
        className={`group w-full min-h-12 pl-3 pr-2.5 py-[5px] flex items-center justify-between gap-1.5 text-left rounded-md bg-[var(--erp-surface)] text-[var(--erp-text)] border cursor-pointer transition-[border-color,box-shadow] duration-150 hover:border-[var(--erp-text)]/40 focus:outline-none focus-visible:border-[var(--erp-gold)] focus-visible:ring-[3px] focus-visible:ring-[color:var(--erp-gold)]/30 disabled:cursor-not-allowed disabled:bg-[var(--erp-surface-2)]/40 disabled:hover:border-[var(--erp-hairline-strong)] ${
          invalid ? 'border-[var(--erp-negative)] hover:border-[var(--erp-negative)]' : 'border-[var(--erp-hairline-strong)]'
        }`}
      >
        <span className="min-w-0 break-words">
          {selected ? (
            <>
              <span className="block text-[15px] font-medium leading-[1.3]">{selected.label}</span>
              {selected.detail ? (
                <span className="block text-[12.5px] leading-[1.3] text-[var(--erp-muted)] line-clamp-2" title={selected.detail}>{selected.detail}</span>
              ) : null}
            </>
          ) : (
            <span className="block text-[15px] leading-[1.3] text-[var(--erp-muted)]">{placeholder}</span>
          )}
        </span>
        <ChevronDown aria-hidden className="w-[18px] h-[18px] shrink-0 text-[var(--erp-muted)] group-hover:text-[var(--erp-text)] group-disabled:opacity-50" strokeWidth={2} />
      </button>

      {open && createPortal(
        <div
          className="erp-picker-overlay fixed inset-0 z-[70] flex items-start justify-center px-[2.5vw] sm:px-5 pt-[max(12px,8vh)] pb-3 bg-[rgba(10,14,20,0.55)] backdrop-blur-[2px]"
          onMouseDown={e => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={subtitle ? subtitleId : undefined}
            onKeyDown={onDialogKeyDown}
            className="erp-picker-panel w-full sm:w-[90vw] md:w-[600px] max-w-[calc(100vw-20px)] sm:max-w-[calc(100vw-40px)] max-h-[88vh] md:max-h-[76vh] flex flex-col overflow-hidden rounded-xl bg-[var(--erp-surface)] text-[var(--erp-text)] border border-[var(--erp-hairline-strong)] shadow-[0_24px_60px_-12px_rgba(0,0,0,0.45)] text-left"
          >
            <div className="px-5 sm:px-6 pt-5 pb-4 border-b border-[var(--erp-hairline)]">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 id={titleId} className="text-[22px] font-semibold leading-tight tracking-[-0.01em]">{title}</h2>
                  {subtitle ? (
                    <p id={subtitleId} className="mt-1 text-sm text-[var(--erp-muted)] break-words">{subtitle}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={closeModal}
                  aria-label={`Close ${title.toLowerCase()}`}
                  className={`-mr-1.5 -mt-0.5 inline-flex items-center justify-center w-10 h-10 shrink-0 rounded-lg text-[var(--erp-muted)] hover:text-[var(--erp-text)] hover:bg-[var(--erp-text)]/[0.07] cursor-pointer ${focusRing}`}
                >
                  <X aria-hidden className="w-5 h-5" strokeWidth={2} />
                </button>
              </div>

              <div className="relative mt-4">
                <label htmlFor={`${baseId}-search`} className="sr-only">{searchPlaceholder}</label>
                <Search
                  aria-hidden
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-[var(--erp-muted)] pointer-events-none"
                  strokeWidth={2}
                />
                <input
                  ref={searchRef}
                  id={`${baseId}-search`}
                  type="text"
                  role="combobox"
                  aria-expanded="true"
                  aria-controls={listId}
                  aria-autocomplete="list"
                  aria-activedescendant={active ? optionId(active.id) : undefined}
                  autoComplete="off"
                  spellCheck={false}
                  value={query}
                  onChange={e => {
                    setQuery(e.target.value);
                    setActiveIndex(0);
                  }}
                  onKeyDown={onSearchKeyDown}
                  placeholder={searchPlaceholder}
                  className="w-full h-[50px] pl-11 pr-11 rounded-[10px] text-base bg-[var(--erp-base)]/55 text-[var(--erp-text)] border border-[var(--erp-hairline-strong)] placeholder:text-[var(--erp-muted)] hover:border-[var(--erp-text)]/30 focus:outline-none focus:border-[var(--erp-gold)] focus:ring-4 focus:ring-[color:var(--erp-gold)]/20"
                />
                {query ? (
                  <button
                    type="button"
                    onClick={clearSearch}
                    aria-label="Clear search"
                    className={`absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-8 h-8 rounded-md text-[var(--erp-muted)] hover:text-[var(--erp-text)] hover:bg-[var(--erp-text)]/[0.07] cursor-pointer ${focusRing}`}
                  >
                    <X aria-hidden className="w-4 h-4" strokeWidth={2} />
                  </button>
                ) : null}
              </div>
              <p className="sr-only" aria-live="polite" aria-atomic="true">{resultAnnouncement}</p>
            </div>

            <div className="erp-picker-scroll flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 sm:px-6 pt-3 pb-5">
              {flat.length === 0 ? (
                <div className="flex flex-col items-center text-center py-10">
                  <span className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-[var(--erp-text)]/[0.06] text-[var(--erp-muted)]">
                    <SearchX aria-hidden className="w-5 h-5" strokeWidth={2} />
                  </span>
                  <p className="mt-3 text-base font-semibold">{emptyText}</p>
                  <p className="mt-1 text-sm text-[var(--erp-muted)]">Check the spelling or try a shorter search.</p>
                </div>
              ) : (
                <div id={listId} role="listbox" aria-label={title}>
                  {sections.map(section => (
                    <div key={section.key} role="group" aria-labelledby={`${baseId}-${section.key}`} className="mt-3 first:mt-1">
                      <div role="presentation" className="flex items-center gap-2 mb-2 px-0.5">
                        {section.icon ? (
                          <Clock3 aria-hidden className="w-3.5 h-3.5 text-[var(--erp-gold)]" strokeWidth={2.25} />
                        ) : null}
                        <span id={`${baseId}-${section.key}`} className="text-[13px] font-semibold text-[var(--erp-text)]/80">
                          {section.heading}
                          <span className="font-normal text-[var(--erp-muted)]"> · {section.count}</span>
                        </span>
                        <span aria-hidden className="flex-1 h-px bg-[var(--erp-hairline)]" />
                      </div>
                      <div className="rounded-lg border border-[var(--erp-hairline-strong)] overflow-hidden divide-y divide-[var(--erp-hairline)]">
                        {section.items.map(option => {
                          rowIndex += 1;
                          const index = rowIndex;
                          const isActive = index === activeIndex;
                          const isSelected = option.id === value;
                          return (
                            <div
                              key={option.id}
                              id={optionId(option.id)}
                              role="option"
                              aria-selected={isSelected}
                              data-active={isActive || undefined}
                              onClick={() => choose(option)}
                              onMouseMove={() => {
                                if (!isActive) setActiveIndex(index);
                              }}
                              className={`group relative min-h-[52px] px-3.5 py-3 flex items-center gap-3 cursor-pointer select-none ${
                                isSelected
                                  ? 'bg-[var(--erp-gold)]/[0.11]'
                                  : isActive
                                    ? 'bg-[var(--erp-text)]/[0.06]'
                                    : 'bg-[var(--erp-surface)]'
                              }`}
                            >
                              {isActive ? (
                                <span aria-hidden className="absolute left-0 top-0 bottom-0 w-[3px] bg-[var(--erp-gold)]" />
                              ) : null}
                              <span className="flex-1 min-w-0 break-words">
                                <span
                                  data-option-label
                                  className={`block text-base leading-snug ${isSelected ? 'font-semibold' : 'font-medium'}`}
                                >
                                  {option.label}
                                </span>
                                {option.detail ? (
                                  <span className="block mt-0.5 text-[13.5px] leading-snug text-[var(--erp-muted)]">
                                    {option.detail}
                                  </span>
                                ) : null}
                              </span>
                              {isSelected ? (
                                <span className="inline-flex items-center justify-center w-6 h-6 shrink-0 rounded-full bg-[var(--erp-gold)] text-[#0F141B]">
                                  <Check aria-hidden className="w-4 h-4" strokeWidth={3} />
                                </span>
                              ) : (
                                <ChevronRight
                                  aria-hidden
                                  className={`w-[18px] h-[18px] shrink-0 text-[var(--erp-muted)] ${isActive ? 'opacity-100' : 'opacity-0'}`}
                                  strokeWidth={2}
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {truncated ? (
                <p className="mt-3 text-sm text-[var(--erp-muted)]">
                  Showing {flat.length} of {totalMatches}. Keep typing to narrow the list.
                </p>
              ) : null}
            </div>

            <div
              aria-hidden
              className="hidden sm:flex [@media(max-height:620px)]:hidden items-center gap-4 px-6 py-2.5 border-t border-[var(--erp-hairline)] bg-[var(--erp-surface-2)]/50 text-[13px] text-[var(--erp-muted)]"
            >
              <span className="inline-flex items-center gap-1.5"><kbd className="erp-picker-kbd">↑</kbd><kbd className="erp-picker-kbd">↓</kbd> Move</span>
              <span className="inline-flex items-center gap-1.5"><kbd className="erp-picker-kbd">Enter</kbd> Select</span>
              <span className="inline-flex items-center gap-1.5"><kbd className="erp-picker-kbd">Esc</kbd> Close</span>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
};
