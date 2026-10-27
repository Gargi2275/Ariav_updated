import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, Loader2, Plus, Search, Trash2, X } from 'lucide-react';
import { blockTotal, emptyBlock, OrderBlock, QualitySelection, QuantityUnit } from '../../services/orderForm';
import { purchaseOrdersApi, FormQuality } from '../../services/purchaseOrdersApi';

const labelClass = 'mb-1 block text-xs text-[var(--erp-muted)]';
const controlClass = 'h-9 w-full min-w-0 rounded-md border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] px-2.5 text-sm text-[var(--erp-text)] placeholder:text-[var(--erp-faint)] focus:border-[var(--erp-gold)] focus:outline-none focus:shadow-[0_0_0_3px_rgba(182,141,55,0.16)]';
const readOnlyClass = 'flex h-9 min-w-0 items-center overflow-hidden whitespace-nowrap rounded-md border border-[var(--erp-hairline)] bg-[var(--erp-surface-2)] px-2.5 text-sm text-[var(--erp-text)]';

function listMoney(value: string): string {
  if (!value.trim()) return '—';
  const number = Number(value);
  if (!Number.isFinite(number)) return value;
  return `₹${number.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function selectionFromHit(hit: FormQuality): QualitySelection {
  return {
    productName: hit.product_name || hit.collection || '',
    productCode: hit.product_code || '',
    collection: hit.collection || '',
    exMill: hit.ex_mill || '',
    wholesale: hit.wholesale || '',
    retail: hit.retail || '',
    shades: hit.shades || [],
  };
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-1 flex items-start gap-1 text-xs text-[var(--erp-negative)]">
      <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
      <span>{message}</span>
    </p>
  );
}

function QualityPicker({
  brandId,
  block,
  onPick,
}: {
  brandId?: number;
  block: OrderBlock;
  onPick: (quality: string, productId: number | null, selection: QualitySelection | null) => void;
}) {
  const listId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const requestId = useRef(0);
  const skipFocusOpen = useRef(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(block.quality);
  const [hits, setHits] = useState<FormQuality[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [active, setActive] = useState(0);
  const [retry, setRetry] = useState(0);
  const [box, setBox] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => { setQuery(block.quality); }, [block.quality]);

  const place = () => {
    const anchor = searchRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const width = Math.min(440, Math.max(rect.width, 280));
    let left = rect.left;
    if (left + width > window.innerWidth - 12) left = Math.max(12, window.innerWidth - 12 - width);
    const panelHeight = panelRef.current?.offsetHeight ?? 280;
    const below = window.innerHeight - rect.bottom;
    const top = below < 200 && rect.top > below ? Math.max(8, rect.top - panelHeight - 6) : rect.bottom + 6;
    setBox({ top, left, width });
  };

  useLayoutEffect(() => {
    if (!open) return undefined;
    place();
    const onReflow = () => place();
    window.addEventListener('resize', onReflow);
    window.addEventListener('scroll', onReflow, true);
    return () => {
      window.removeEventListener('resize', onReflow);
      window.removeEventListener('scroll', onReflow, true);
    };
  }, [open, hits, status, box === null]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || searchRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, [open]);

  useEffect(() => {
    if (!open || !brandId) return undefined;
    const id = ++requestId.current;
    setStatus('loading');
    const timer = window.setTimeout(() => {
      void purchaseOrdersApi.formQualities(brandId, query.trim())
        .then(rows => {
          if (id !== requestId.current) return;
          setHits(rows);
          setStatus('ready');
          setActive(0);
        })
        .catch(() => {
          if (id !== requestId.current) return;
          setHits([]);
          setStatus('error');
        });
    }, query.trim() ? 200 : 0);
    return () => window.clearTimeout(timer);
  }, [open, brandId, query, retry]);

  const choose = (hit: FormQuality) => {
    const label = hit.quality_label || hit.quality_code;
    onPick(label, hit.product_id, selectionFromHit(hit));
    setQuery(label);
    setOpen(false);
    if (document.activeElement !== searchRef.current) {
      skipFocusOpen.current = true;
      searchRef.current?.focus();
    }
  };

  const onSearchKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      searchRef.current?.focus();
      return;
    }
    if (event.key === 'Enter') event.preventDefault();
    if (!hits.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive(index => (index + 1) % hits.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive(index => (index - 1 + hits.length) % hits.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const hit = hits[active];
      if (hit) choose(hit);
    }
  };

  const catalogue = block.productId != null && block.quality.trim().length > 0;

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--erp-faint)]" />
        <input
          ref={searchRef}
          className={`${controlClass} pl-8 font-mono`}
          aria-label={`Quality for row ${block.rowNo}`}
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={open && hits[active] ? `${listId}-${active}` : undefined}
          placeholder="Search quality"
          value={query}
          onFocus={() => {
            if (skipFocusOpen.current) {
              skipFocusOpen.current = false;
              return;
            }
            setOpen(true);
          }}
          onChange={event => {
            const next = event.target.value;
            setQuery(next);
            setOpen(true);
            onPick(next, null, null);
          }}
          onKeyDown={onSearchKey}
        />
      </div>
      {open ? createPortal(
        <div
          ref={panelRef}
          className="fixed z-[80] overflow-hidden rounded-lg border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] shadow-[0_16px_40px_rgba(15,20,27,0.18)]"
          style={box ? { top: box.top, left: box.left, width: box.width } : { top: -9999, left: 0, width: 360 }}
        >
          <div className="max-h-64 overflow-auto" role="listbox" id={listId} aria-label="Matching products">
            {!brandId ? (
              <p className="px-3 py-3 text-xs text-[var(--erp-muted)]">Choose a brand before searching qualities.</p>
            ) : status === 'loading' && hits.length === 0 ? (
              <p className="flex items-center gap-2 px-3 py-3 text-xs text-[var(--erp-muted)]">
                <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
                Searching qualities…
              </p>
            ) : status === 'error' ? (
              <div className="flex items-center justify-between gap-3 px-3 py-3 text-xs text-[var(--erp-negative)]">
                <span>Could not load qualities.</span>
                <button type="button" className="text-[var(--erp-text)] underline" onClick={() => setRetry(value => value + 1)}>Retry</button>
              </div>
            ) : status === 'ready' && hits.length === 0 ? (
              catalogue && query.trim() === block.quality.trim() ? (
                <p className="px-3 py-3 text-xs text-[var(--erp-muted)]">Selected {block.quality}.</p>
              ) : (
                <p className="px-3 py-3 text-xs text-[var(--erp-muted)]">
                  {query.trim() ? `No quality matches “${query.trim()}”. The typed code will be saved as entered.` : 'No qualities are available for this brand.'}
                </p>
              )
            ) : (
              hits.map((hit, index) => {
                const label = hit.quality_label || hit.quality_code;
                const selected = label === block.quality && hit.product_id === block.productId;
                const secondary = [hit.product_name, hit.product_code && hit.product_code !== label ? hit.product_code : '']
                  .filter(Boolean)
                  .filter((value, valueIndex, all) => all.indexOf(value) === valueIndex)
                  .join(' · ');
                return (
                  <button
                    key={`${hit.quality_code}-${hit.product_id ?? 'text'}-${index}`}
                    id={`${listId}-${index}`}
                    type="button"
                    role="option"
                    aria-selected={selected || index === active}
                    className={`flex w-full items-baseline gap-3 px-3 py-2 text-left text-sm ${index === active ? 'bg-[var(--erp-gold)]/12' : ''} ${selected ? 'text-[var(--erp-text)]' : 'text-[var(--erp-text)]'} hover:bg-[var(--erp-gold)]/10`}
                    onMouseDown={event => {
                      event.preventDefault();
                      choose(hit);
                    }}
                    onMouseEnter={() => setActive(index)}
                  >
                    <span className="shrink-0 font-mono">{label}</span>
                    <span className="min-w-0 flex-1 truncate text-[var(--erp-muted)]">{secondary}</span>
                    {hit.wholesale || hit.price ? <span className="shrink-0 font-mono text-xs text-[var(--erp-muted)]">{listMoney(hit.wholesale || hit.price || '')}</span> : null}
                  </button>
                );
              })
            )}
          </div>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}

export function OrderFormView({
  blocks,
  brandId,
  partyCode,
  partyControl,
  partyError,
  indent,
  onIndent,
  indentError,
  indentReadOnly = false,
  indentHint,
  date,
  place,
  footer,
  messages,
  onChange,
  onPlace,
  onFooter,
}: {
  blocks: OrderBlock[];
  brandId?: number;
  partyCode: string;
  partyControl?: React.ReactNode;
  partyError?: string;
  indent: string;
  onIndent?: (value: string) => void;
  indentError?: string;
  indentReadOnly?: boolean;
  indentHint?: string;
  date: string;
  place: string;
  footer: { mode: string; destination: string; documents: string; instructions: string };
  messages: Record<string, string>;
  onChange: (blocks: OrderBlock[]) => void;
  onPlace: (value: string) => void;
  onFooter: (footer: { mode: string; destination: string; documents: string; instructions: string }) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const key = Object.keys(messages).find(item => item.startsWith('block_') && messages[item]);
    if (!key || !rootRef.current) return;
    const body = key.slice('block_'.length);
    const match = blocks.find(block => body === block.key || body.startsWith(`${block.key}_`));
    if (!match) return;
    rootRef.current.querySelector(`[data-block="${CSS.escape(match.key)}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [messages]);

  const update = (key: string, patch: Partial<OrderBlock>) => {
    onChange(blocks.map(block => (block.key === key ? { ...block, ...patch } : block)));
  };

  return (
    <div ref={rootRef} className="space-y-4">
      <section>
        <h4 className="mb-2 text-xs font-medium text-[var(--erp-text)]">Order</h4>
        <div className="grid grid-cols-2 gap-2.5 @4xl:grid-cols-[1.2fr_1.2fr_1fr_1.2fr]">
          <div className="min-w-0" data-invalid={partyError ? 'true' : undefined} data-field="customer_id">
            <span className={labelClass}>
              Party code <span className="text-[var(--erp-negative)]">*</span>
            </span>
            {partyControl || <div className={`${readOnlyClass} font-mono tracking-wide`}>{partyCode || '—'}</div>}
            <FieldError message={partyError} />
          </div>
          <div className="min-w-0" data-invalid={indentError ? 'true' : undefined} data-field="po_number">
            <label className={labelClass} htmlFor="order-form-indent">
              Indent number
            </label>
            {indentReadOnly || !onIndent ? (
              <input
                id="order-form-indent"
                readOnly
                className={`${readOnlyClass} font-mono`}
                aria-label="Indent number"
                aria-invalid={indentError ? true : undefined}
                value={indent}
              />
            ) : (
              <input
                id="order-form-indent"
                className={`${controlClass} font-mono`}
                aria-label="Indent number"
                aria-invalid={indentError ? true : undefined}
                value={indent}
                onChange={event => onIndent(event.target.value)}
              />
            )}
            {indentHint && !indentError ? <p className="mt-1 text-[11px] text-[var(--erp-muted)]">{indentHint}</p> : null}
            <FieldError message={indentError} />
          </div>
          <div className="min-w-0">
            <span className={labelClass}>Date</span>
            <div className={`${readOnlyClass} font-mono`}>{date || '—'}</div>
          </div>
          <div className="min-w-0">
            <label className={labelClass} htmlFor="order-form-place">Place</label>
            <input id="order-form-place" className={controlClass} aria-label="Place" value={place} onChange={event => onPlace(event.target.value)} />
          </div>
        </div>
      </section>

      <section className="space-y-2.5">
        <h4 className="text-xs font-medium text-[var(--erp-text)]">Qualities</h4>
        {blocks.map(block => {
          const prefix = `block_${block.key}`;
          const total = blockTotal(block);
          const shadeError = messages[`${prefix}_shades`];
          return (
            <article key={block.key} data-block={block.key} className="rounded-lg border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)]">
              <div className="flex items-start gap-2 border-b border-[var(--erp-hairline)] px-3 py-2.5">
                <span className="mt-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded bg-[var(--erp-surface-2)] px-1 font-mono text-[11px] text-[var(--erp-muted)]">{block.rowNo}</span>
                <div className="min-w-0 flex-1">
                  <div className={labelClass}>
                    Quality <span className="text-[var(--erp-negative)]">*</span>
                  </div>
                  <QualityPicker
                    brandId={brandId}
                    block={block}
                    onPick={(quality, productId, selection) => {
                      const same = productId != null && productId === block.productId && quality === block.quality;
                      const listPrice = selection?.wholesale || selection?.exMill || '';
                      update(block.key, {
                        quality,
                        productId,
                        selection,
                        shades: same ? block.shades : [],
                        price: productId == null
                          ? (block.productId ? '' : block.price)
                          : (same ? block.price : listPrice),
                      });
                    }}
                  />
                  {block.selection ? (
                    <div className="mt-2 rounded-md border border-[var(--erp-hairline)] bg-[var(--erp-surface-2)] px-2.5 py-2 text-xs">
                      <p className="font-medium text-[var(--erp-text)]">{block.selection.productName || block.quality}</p>
                      <p className="mt-1 text-[var(--erp-muted)]">
                        <span className="font-mono text-[var(--erp-text)]">{block.quality}</span>
                        {block.selection.productCode && block.selection.productCode !== block.quality ? ` · Product ${block.selection.productCode}` : ''}
                        {block.selection.collection && block.selection.collection !== block.selection.productName ? ` · ${block.selection.collection}` : ''}
                      </p>
                      <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[var(--erp-muted)]">
                        <span>Ex-mill {listMoney(block.selection.exMill)}</span>
                        <span>Wholesale {listMoney(block.selection.wholesale)}</span>
                        <span>Retail {listMoney(block.selection.retail)}</span>
                      </p>
                    </div>
                  ) : null}
                  <FieldError message={messages[`${prefix}_quality`]} />
                </div>
                <button
                  type="button"
                  className="mt-5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--erp-hairline)] text-[var(--erp-muted)] hover:border-[var(--erp-negative)]/40 hover:text-[var(--erp-negative)]"
                  aria-label={`Remove quality ${block.rowNo}`}
                  onClick={() => onChange(blocks.filter(item => item.key !== block.key))}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="px-3 py-2.5">
                <div className="mb-1.5">
                  <span className={labelClass}>
                    Shades <span className="text-[var(--erp-negative)]">*</span>
                  </span>
                </div>
                {block.selection?.shades.length ? (
                  <div className="mb-2 flex flex-wrap gap-1.5" role="group" aria-label={`Shades for row ${block.rowNo}`}>
                    {block.selection.shades.map(shade => {
                      const selected = block.shades.some(cell => cell.shade.trim().toLowerCase() === shade.toLowerCase());
                      return (
                        <button
                          key={shade}
                          type="button"
                          aria-pressed={selected}
                          className={`rounded-md border px-2.5 py-1 text-xs ${selected ? 'border-[var(--erp-gold)] bg-[var(--erp-gold)] font-medium text-[#1B2430]' : 'border-[var(--erp-hairline-strong)] text-[var(--erp-text)] hover:border-[var(--erp-gold)]'}`}
                          onClick={() => {
                            const index = block.shades.findIndex(cell => cell.shade.trim().toLowerCase() === shade.toLowerCase());
                            if (index >= 0) {
                              update(block.key, { shades: block.shades.filter((_, shadeIndex) => shadeIndex !== index) });
                              return;
                            }
                            if (block.shades.length >= 7) return;
                            update(block.key, { shades: [...block.shades, { shade, quantity: '' }] });
                          }}
                        >
                          {shade}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mb-2 text-xs text-[var(--erp-muted)]">
                    {block.selection ? 'This quality has no shades listed.' : 'Choose a quality to see its shades.'}
                  </p>
                )}
                {block.shades.some(cell => cell.shade.trim()) ? (
                  <div className="overflow-hidden rounded-md border border-[var(--erp-hairline)]">
                    <div className="grid grid-cols-[minmax(0,1fr)_7.5rem_2.25rem] gap-2 bg-[var(--erp-surface-2)] px-2 py-1.5 text-xs text-[var(--erp-muted)]">
                      <span>Shade</span>
                      <span>Pieces</span>
                      <span className="sr-only">Remove</span>
                    </div>
                    {block.shades.map((cell, index) => cell.shade.trim() ? (
                      <div key={`${block.key}-shade-${cell.shade}`} className="border-t border-[var(--erp-hairline)] px-2 py-1.5">
                        <div className="grid grid-cols-[minmax(0,1fr)_7.5rem_2.25rem] items-center gap-2">
                          <div className="text-sm text-[var(--erp-text)]" aria-label={`Shade ${cell.shade} for row ${block.rowNo}`}>{cell.shade}</div>
                          <input
                            className={`${controlClass} text-right font-mono`}
                            aria-label={`Pieces for shade ${cell.shade} on row ${block.rowNo}`}
                            inputMode="decimal"
                            value={cell.quantity}
                            onChange={event => {
                              const shades = block.shades.slice();
                              shades[index] = { ...cell, quantity: event.target.value };
                              update(block.key, { shades });
                            }}
                          />
                          <button
                            type="button"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-[var(--erp-faint)] hover:text-[var(--erp-negative)]"
                            aria-label={`Remove shade ${cell.shade} for row ${block.rowNo}`}
                            onClick={() => update(block.key, { shades: block.shades.filter((_, shadeIndex) => shadeIndex !== index) })}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <FieldError message={messages[`${prefix}_qty_${index}`]} />
                      </div>
                    ) : null)}
                  </div>
                ) : null}
                <div data-invalid={shadeError ? 'true' : undefined} data-field={`${prefix}_shades`}>
                  <FieldError message={shadeError} />
                </div>

                <div className="mt-2.5 grid grid-cols-2 gap-2.5 @3xl:grid-cols-3 @5xl:grid-cols-6">
                  <div className="min-w-0">
                    <label className={labelClass} htmlFor={`size-${block.key}`}>Size</label>
                    <input id={`size-${block.key}`} className={controlClass} aria-label={`Size for row ${block.rowNo}`} value={block.size} onChange={event => update(block.key, { size: event.target.value })} />
                  </div>
                  <div className="min-w-0">
                    <span className={labelClass}>Pieces / Meters</span>
                    <div className="flex h-9 overflow-hidden rounded-md border border-[var(--erp-hairline-strong)]" role="group" aria-label={`Unit for row ${block.rowNo}`}>
                      {(['Pieces', 'Meters'] as QuantityUnit[]).map(unit => (
                        <button
                          key={unit}
                          type="button"
                          aria-pressed={block.unit === unit}
                          className={`flex-1 text-xs ${block.unit === unit ? 'bg-[var(--erp-gold)] font-medium text-[#1B2430]' : 'text-[var(--erp-muted)] hover:bg-[var(--erp-surface-2)]'}`}
                          onClick={() => update(block.key, { unit })}
                        >
                          {unit}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <span className={labelClass}>Total</span>
                    <div className={`${readOnlyClass} font-mono`} aria-label={`Total for row ${block.rowNo}`}>{total ? total.toFixed(block.unit === 'Pieces' ? 0 : 2) : '—'}</div>
                  </div>
                  <div className="min-w-0">
                    <label className={labelClass} htmlFor={`price-${block.key}`}>Price</label>
                    <input id={`price-${block.key}`} className={`${controlClass} font-mono`} aria-label={`Price for row ${block.rowNo}`} value={block.price} onChange={event => update(block.key, { price: event.target.value })} />
                    {block.selection ? (
                      <p className="mt-1 text-[11px] text-[var(--erp-muted)]">
                        {block.selection.wholesale
                          ? `Wholesale ${listMoney(block.selection.wholesale)}`
                          : block.selection.exMill
                            ? `Ex-mill ${listMoney(block.selection.exMill)}`
                            : 'No list price'}
                      </p>
                    ) : null}
                  </div>
                  <div className="min-w-0">
                    <label className={labelClass} htmlFor={`from-${block.key}`}>Delivery from</label>
                    <input id={`from-${block.key}`} className={controlClass} type="date" aria-label={`Delivery period from for row ${block.rowNo}`} value={block.deliveryFrom} onChange={event => update(block.key, { deliveryFrom: event.target.value })} />
                  </div>
                  <div className="min-w-0">
                    <label className={labelClass} htmlFor={`to-${block.key}`}>Delivery to</label>
                    <input id={`to-${block.key}`} className={controlClass} type="date" aria-label={`Delivery period to for row ${block.rowNo}`} value={block.deliveryTo} onChange={event => update(block.key, { deliveryTo: event.target.value })} />
                  </div>
                </div>
                <FieldError message={messages[`${prefix}_delivery`]} />
                <div className="mt-2.5">
                  <label className={labelClass} htmlFor={`remarks-${block.key}`}>Remarks</label>
                  <textarea
                    id={`remarks-${block.key}`}
                    rows={2}
                    className={`${controlClass} h-auto resize-y py-1.5`}
                    aria-label={`Remarks for row ${block.rowNo}`}
                    value={block.remarks}
                    onChange={event => update(block.key, { remarks: event.target.value })}
                  />
                </div>
              </div>
            </article>
          );
        })}
        <button
          type="button"
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--erp-hairline-strong)] px-2.5 text-xs text-[var(--erp-text)] hover:border-[var(--erp-gold)] hover:bg-[var(--erp-surface-2)]"
          onClick={() => onChange([...blocks, emptyBlock(Math.max(0, ...blocks.map(item => item.rowNo)) + 1)])}
        >
          <Plus className="h-3.5 w-3.5" /> Add quality
        </button>
      </section>

      <section>
        <h4 className="mb-2 text-xs font-medium text-[var(--erp-text)]">Dispatch</h4>
        <div className="grid grid-cols-1 gap-2.5 @md:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="order-form-despatch">Mode of despatch</label>
            <input id="order-form-despatch" className={controlClass} aria-label="Mode of despatch" value={footer.mode} onChange={event => onFooter({ ...footer, mode: event.target.value })} />
          </div>
          <div>
            <label className={labelClass} htmlFor="order-form-destination">Destination</label>
            <input id="order-form-destination" className={controlClass} aria-label="Destination" value={footer.destination} onChange={event => onFooter({ ...footer, destination: event.target.value })} />
          </div>
          <div>
            <label className={labelClass} htmlFor="order-form-documents">Documents through</label>
            <input id="order-form-documents" className={controlClass} aria-label="Documents through" value={footer.documents} onChange={event => onFooter({ ...footer, documents: event.target.value })} />
          </div>
          <div>
            <label className={labelClass} htmlFor="order-form-instructions">Special instructions</label>
            <textarea
              id="order-form-instructions"
              rows={2}
              className={`${controlClass} h-auto resize-y py-1.5`}
              aria-label="Special instructions"
              value={footer.instructions}
              onChange={event => onFooter({ ...footer, instructions: event.target.value })}
            />
          </div>
        </div>
      </section>
    </div>
  );
}

