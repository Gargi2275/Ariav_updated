import React, { useId } from 'react';
import { AlertCircle, AlertTriangle, ListRestart, Plus, Trash2 } from 'lucide-react';
import { AccessibleSelectModal, SelectOption } from '../../components/common/AccessibleSelectModal';
import { rateIsUnset } from '../../components/common/RateNotSetBadge';
import { num } from '../../services/mastersApi';
import { REQUIRED_MSG } from '../../services/requiredFields';

export type LineDraft = {
  key: string;
  category_id?: number;
  product_id?: number;
  product_description: string;
  manualEntry: boolean;
  quantity: string;
  rate: string;
};

interface PurchaseOrderLineItemsProps {
  lines: LineDraft[];
  setLines: React.Dispatch<React.SetStateAction<LineDraft[]>>;
  onAddLine: () => void;
  onCategoryChange: (key: string, categoryId: number, index: number) => void;
  onProductChange: (key: string, productId: number, index: number) => void;
  categories: SelectOption[];
  productOptionsByCategory: Map<number, SelectOption[]>;
  products: { id: number; unit?: string | null }[];
  brandSelected: boolean;
  brandName?: string;
  isManual: boolean;
  fieldMessages: Record<string, string>;
  totals: { qty: number; amt: number };
}

function money(value: number): string {
  return `₹${num(value).toFixed(2)}`;
}

/** Shared by the header row and every line so columns stay on one axis. */
const GRID_COLUMNS =
  '@2xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1.45fr)_80px_96px_minmax(112px,0.75fr)_44px] ' +
  '@3xl:grid-cols-[minmax(0,30fr)_minmax(0,28fr)_minmax(84px,11fr)_minmax(100px,13fr)_minmax(128px,18fr)_44px]';

const inputBase =
  'h-12 w-full px-3 rounded-md border bg-[var(--erp-surface)] text-[15px] text-[var(--erp-text)] placeholder:text-[var(--erp-faint)] transition-[border-color,box-shadow] duration-150 hover:border-[var(--erp-text)]/40 focus:outline-none focus:border-[var(--erp-gold)] focus:ring-[3px] focus:ring-[color:var(--erp-gold)]/30';

const borderFor = (invalid: boolean) =>
  invalid ? 'border-[var(--erp-negative)] hover:border-[var(--erp-negative)]' : 'border-[var(--erp-hairline-strong)]';

const mobileLabel = 'block mb-1.5 text-[12px] font-mono font-semibold uppercase tracking-[0.06em] text-[var(--erp-text)]/65';

const RequiredMark: React.FC = () => (
  <>
    <span aria-hidden className="ml-0.5 text-[var(--erp-negative)]">*</span>
    <span className="sr-only"> (required)</span>
  </>
);

/** Narrow numeric columns show "Required" for any required-style message; the full text stays available. */
const FieldError: React.FC<{ id: string; message?: string; numeric?: boolean }> = ({ id, message, numeric = false }) => {
  if (!message) return null;
  const short = message === REQUIRED_MSG || (numeric && /required/i.test(message)) ? 'Required' : message;
  return (
    <p
      id={id}
      title={short !== message ? message : undefined}
      className={`mt-1.5 flex items-start gap-1 text-[12.5px] leading-snug text-[var(--erp-negative)] ${numeric ? 'justify-end text-right' : ''}`}
    >
      <AlertCircle aria-hidden className="w-3.5 h-3.5 mt-px shrink-0" strokeWidth={2.25} />
      {short === message ? message : (
        <>
          <span aria-hidden>{short}</span>
          <span className="sr-only">{message}</span>
        </>
      )}
    </p>
  );
};

export const PurchaseOrderLineItems: React.FC<PurchaseOrderLineItemsProps> = ({
  lines,
  setLines,
  onAddLine,
  onCategoryChange,
  onProductChange,
  categories,
  productOptionsByCategory,
  products,
  brandSelected,
  brandName,
  isManual,
  fieldMessages,
  totals,
}) => {
  const baseId = useId();

  const patchLine = (key: string, patch: Partial<LineDraft>) =>
    setLines(prev => prev.map(l => (l.key === key ? { ...l, ...patch } : l)));

  const toggleManualEntry = (line: LineDraft, freeText: boolean) =>
    patchLine(line.key, {
      manualEntry: !freeText,
      category_id: undefined,
      product_id: undefined,
      product_description: '',
      rate: '',
    });

  return (
    <div className="@container">
      {fieldMessages.lines ? (
        <p role="alert" className="mb-3 flex items-center gap-1.5 text-[13.5px] text-[var(--erp-negative)]">
          <AlertCircle aria-hidden className="w-4 h-4 shrink-0" strokeWidth={2.25} />
          {fieldMessages.lines}
        </p>
      ) : null}

      <div className="rounded-lg border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] overflow-hidden">
        <div role="table" aria-label="Purchase order line items" aria-rowcount={lines.length + 1}>
          <div role="rowgroup" className="hidden @2xl:block">
            <div
              role="row"
              className={`grid ${GRID_COLUMNS} items-center h-10 px-2 bg-[var(--erp-surface-2)]/70 border-b border-[var(--erp-hairline-strong)] font-mono text-[11.5px] font-semibold uppercase tracking-[0.06em] text-[var(--erp-text)]/65`}
            >
              <div role="columnheader" className="px-1.5"><span className="block px-3">Category<RequiredMark /></span></div>
              <div role="columnheader" className="px-1.5"><span className="block px-3">Product<RequiredMark /></span></div>
              <div role="columnheader" className="px-1.5 text-right"><span className="block px-3">Qty<RequiredMark /></span></div>
              <div role="columnheader" className="px-1.5 text-right"><span className="block px-3">Rate</span></div>
              <div role="columnheader" className="px-1.5 text-right"><span className="block px-3">Line total</span></div>
              <div role="columnheader"><span className="sr-only">Remove</span></div>
            </div>
          </div>

          <div role="rowgroup" className="divide-y divide-[var(--erp-hairline)]">
            {lines.map((line, index) => {
              const n = index + 1;
              const product = line.product_id ? products.find(p => p.id === line.product_id) : undefined;
              const lineProducts = (line.category_id && productOptionsByCategory.get(line.category_id)) || [];
              const lineTotal = num(line.quantity) * num(line.rate);
              const freeText = isManual && line.manualEntry;
              const category = categories.find(c => c.id === line.category_id);
              const ids = {
                category: `${baseId}-${line.key}-category-error`,
                product: `${baseId}-${line.key}-product-error`,
                desc: `${baseId}-${line.key}-desc`,
                qty: `${baseId}-${line.key}-qty`,
                rate: `${baseId}-${line.key}-rate`,
              };
              const msg = {
                category: fieldMessages[`line_${index}_category`],
                product: fieldMessages[`line_${index}_product`],
                desc: fieldMessages[`line_${index}_desc`],
                qty: fieldMessages[`line_${index}_qty`],
                rate: fieldMessages[`line_${index}_rate`],
              };
              const showRateUnset = !msg.rate && !!(line.product_id || line.product_description.trim()) && rateIsUnset(line.rate);
              const removeButton = lines.length > 1 ? (
                <button
                  type="button"
                  aria-label={`Remove line ${n}`}
                  onClick={() => setLines(prev => prev.filter(l => l.key !== line.key))}
                  className="inline-flex items-center justify-center w-11 h-11 rounded-md text-[var(--erp-muted)] hover:text-[var(--erp-negative)] hover:bg-[var(--erp-negative)]/10 focus:outline-none focus-visible:ring-[3px] focus-visible:ring-[color:var(--erp-gold)]/40 cursor-pointer"
                >
                  <Trash2 aria-hidden className="w-[18px] h-[18px]" strokeWidth={2} />
                </button>
              ) : null;

              return (
                <div
                  key={line.key}
                  role="row"
                  aria-rowindex={n + 1}
                  className={`grid grid-cols-2 gap-x-3 gap-y-4 p-4 @2xl:gap-0 @2xl:px-2 @2xl:py-3 ${GRID_COLUMNS} items-start focus-within:bg-[var(--erp-gold)]/[0.035]`}
                >
                  <div role="cell" className="col-span-2 flex items-center justify-between -mt-1 -mb-1 @2xl:hidden">
                    <span className="font-mono text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--erp-muted)]">Line {n}</span>
                    {removeButton}
                  </div>

                  <div role="cell" className="col-span-2 @2xl:col-span-1 @2xl:px-1.5 min-w-0">
                    <span aria-hidden className={`${mobileLabel} @2xl:hidden`}>Category<RequiredMark /></span>
                    {freeText ? (
                      <div className="min-h-12 flex items-center px-3 rounded-md border border-dashed border-[var(--erp-hairline-strong)] text-[14px] text-[var(--erp-muted)]">
                        Manual entry
                      </div>
                    ) : (
                      <>
                        <AccessibleSelectModal
                          fieldLabel={`Category, line ${n}`}
                          title="Select Category"
                          subtitle={brandName ? `Categories available for ${brandName}` : 'Choose a category to continue'}
                          searchPlaceholder="Search categories..."
                          mostUsedHeading="Frequently Used"
                          allHeading="All Categories"
                          emptyText="No categories found"
                          placeholder={brandSelected ? 'Select category…' : 'Select brand first'}
                          options={categories}
                          value={line.category_id}
                          disabled={!brandSelected}
                          invalid={!!msg.category}
                          describedBy={msg.category ? ids.category : undefined}
                          onChange={categoryId => {
                            if (categoryId !== line.category_id) onCategoryChange(line.key, categoryId, index);
                          }}
                        />
                        <FieldError id={ids.category} message={msg.category} />
                      </>
                    )}
                  </div>

                  <div role="cell" className="col-span-2 @2xl:col-span-1 @2xl:px-1.5 min-w-0">
                    {freeText ? (
                      <>
                        <label htmlFor={ids.desc} className={`${mobileLabel} @2xl:hidden`}>
                          Product description<RequiredMark />
                        </label>
                        <input
                          id={ids.desc}
                          aria-label={`Product description, line ${n}`}
                          aria-required
                          value={line.product_description}
                          placeholder="Item from handy form…"
                          aria-invalid={!!msg.desc || undefined}
                          aria-describedby={msg.desc ? `${ids.desc}-error` : undefined}
                          onChange={e => patchLine(line.key, { product_description: e.target.value })}
                          className={`${inputBase} ${borderFor(!!msg.desc)}`}
                        />
                        <FieldError id={`${ids.desc}-error`} message={msg.desc} />
                      </>
                    ) : (
                      <>
                        <span aria-hidden className={`${mobileLabel} @2xl:hidden`}>Product<RequiredMark /></span>
                        <AccessibleSelectModal
                          fieldLabel={`Product, line ${n}`}
                          title="Select Product"
                          subtitle={category
                            ? `Products in ${category.detail ? `${category.detail} › ` : ''}${category.label}`
                            : 'Choose a product from the selected category'}
                          searchPlaceholder="Search products..."
                          mostUsedHeading="Frequently Used"
                          allHeading="All Products"
                          emptyText="No products found"
                          placeholder={line.category_id ? 'Select product…' : 'Select category first'}
                          options={lineProducts}
                          value={line.product_id}
                          disabled={!brandSelected || !line.category_id}
                          invalid={!!msg.product}
                          describedBy={msg.product ? ids.product : undefined}
                          onChange={productId => onProductChange(line.key, productId, index)}
                        />
                        <FieldError id={ids.product} message={msg.product} />
                      </>
                    )}
                    {isManual ? (
                      <button
                        type="button"
                        onClick={() => toggleManualEntry(line, freeText)}
                        aria-label={freeText ? `Pick from catalogue, line ${n}` : `Product not in catalogue? Enter manually, line ${n}`}
                        title={freeText ? undefined : 'Product not in catalogue? Enter it manually'}
                        className="mt-0.5 -mb-1.5 -ml-2 flex w-fit items-center gap-1.5 h-8 px-2 rounded-md text-[13.5px] font-medium text-[var(--erp-text)]/80 hover:text-[var(--erp-text)] hover:bg-[var(--erp-gold)]/10 focus:outline-none focus-visible:ring-[3px] focus-visible:ring-[color:var(--erp-gold)]/40 cursor-pointer"
                      >
                        {freeText ? (
                          <ListRestart aria-hidden className="w-4 h-4 text-[var(--erp-gold-soft)]" strokeWidth={2} />
                        ) : (
                          <Plus aria-hidden className="w-4 h-4 text-[var(--erp-gold-soft)]" strokeWidth={2.25} />
                        )}
                        {freeText ? 'Pick from catalogue' : 'Enter manually'}
                      </button>
                    ) : null}
                  </div>

                  <div role="cell" className="@2xl:px-1.5 min-w-0">
                    <label htmlFor={ids.qty} className={`${mobileLabel} @2xl:hidden`}>
                      Qty<RequiredMark />
                    </label>
                    <input
                      id={ids.qty}
                      aria-label={`Quantity, line ${n}`}
                      aria-required
                      inputMode="decimal"
                      autoComplete="off"
                      value={line.quantity}
                      placeholder="0"
                      aria-invalid={!!msg.qty || undefined}
                      aria-describedby={msg.qty ? `${ids.qty}-error` : undefined}
                      onChange={e => patchLine(line.key, { quantity: e.target.value })}
                      className={`${inputBase} ${borderFor(!!msg.qty)} text-right font-mono tabular-nums`}
                    />
                    <FieldError id={`${ids.qty}-error`} message={msg.qty} numeric />
                  </div>

                  <div role="cell" className="@2xl:px-1.5 min-w-0">
                    <label htmlFor={ids.rate} className={`${mobileLabel} @2xl:hidden`}>
                      Rate
                    </label>
                    <input
                      id={ids.rate}
                      aria-label={`Rate, line ${n}`}
                      inputMode="decimal"
                      autoComplete="off"
                      value={line.rate}
                      placeholder="0.00"
                      aria-invalid={!!msg.rate || undefined}
                      aria-describedby={msg.rate ? `${ids.rate}-error` : showRateUnset ? `${ids.rate}-unset` : undefined}
                      onChange={e => patchLine(line.key, { rate: e.target.value })}
                      className={`${inputBase} ${borderFor(!!msg.rate)} text-right font-mono tabular-nums`}
                    />
                    <FieldError id={`${ids.rate}-error`} message={msg.rate} numeric />
                    {showRateUnset ? (
                      <p id={`${ids.rate}-unset`} className="mt-1.5 flex items-center justify-end gap-1 text-[12.5px] font-medium text-[var(--erp-negative)]">
                        <AlertTriangle aria-hidden className="w-3.5 h-3.5 shrink-0" strokeWidth={2.25} />
                        Rate not set
                      </p>
                    ) : null}
                  </div>

                  <div
                    role="cell"
                    className="col-span-2 @2xl:col-span-1 @2xl:px-1.5 flex items-center justify-between gap-3 pt-3 border-t border-[var(--erp-hairline)] @2xl:pt-0 @2xl:border-0 @2xl:min-h-12 @2xl:flex-col @2xl:items-end @2xl:justify-center @2xl:gap-0"
                  >
                    <span className="text-[14px] font-medium text-[var(--erp-muted)] @2xl:hidden">Line total</span>
                    <span className="text-right @2xl:px-3">
                      <span className={`block font-mono tabular-nums text-[16px] font-semibold leading-tight ${lineTotal ? 'text-[var(--erp-text)]' : 'text-[var(--erp-muted)]'}`}>
                        {money(lineTotal)}
                      </span>
                      {product?.unit ? (
                        <span className="block mt-0.5 text-[12.5px] leading-tight text-[var(--erp-muted)]">{product.unit}</span>
                      ) : null}
                    </span>
                  </div>

                  <div role="cell" className="hidden @2xl:flex justify-center items-center min-h-12">
                    {removeButton}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3 @2xl:pr-[70px] border-t border-[var(--erp-hairline-strong)] bg-[var(--erp-surface-2)]/40">
          <button
            type="button"
            disabled={!brandSelected}
            onClick={onAddLine}
            className="inline-flex items-center gap-2 h-11 px-4 rounded-md border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] text-[14px] font-medium text-[var(--erp-text)] hover:border-[var(--erp-gold)]/60 hover:bg-[var(--erp-gold)]/[0.06] focus:outline-none focus-visible:ring-[3px] focus-visible:ring-[color:var(--erp-gold)]/40 disabled:opacity-45 disabled:cursor-not-allowed disabled:hover:border-[var(--erp-hairline-strong)] disabled:hover:bg-[var(--erp-surface)] cursor-pointer"
          >
            <Plus aria-hidden className="w-4 h-4 text-[var(--erp-gold-soft)]" strokeWidth={2.25} />
            Add line
          </button>

          <dl aria-label="Line item totals" className="ml-auto grid grid-cols-[auto_auto] items-baseline gap-x-8 gap-y-1 text-right">
            <dt className="text-[13.5px] text-[var(--erp-muted)]">Total qty</dt>
            <dd className="font-mono tabular-nums text-[15px] text-[var(--erp-text)]">{totals.qty.toFixed(2)}</dd>
            <dt className="text-[13.5px] text-[var(--erp-muted)]">Amount</dt>
            <dd className="font-mono tabular-nums text-[17px] font-semibold text-[var(--erp-text)]">{money(totals.amt)}</dd>
          </dl>
        </div>
      </div>
    </div>
  );
};
