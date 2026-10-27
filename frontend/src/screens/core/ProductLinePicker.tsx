import React, { useEffect, useId, useRef, useState } from 'react';

export interface ProductSearchHit {
  id: number;
  product_code: string;
  product_name: string;
  rate: string | number;
  brand_id?: number | null;
  category_id?: number | null;
  description?: string;
}

export interface ProductSearchPage {
  results: ProductSearchHit[];
  page: number;
  has_more: boolean;
}

interface ProductLinePickerProps {
  brandId?: number;
  brandCode?: string;
  lineNumber: number;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  selectedLabel?: string;
  debounceMs?: number;
  searchProducts: (query: string, page: number, brandId: number) => Promise<ProductSearchPage>;
  onSelect: (product: ProductSearchHit) => void;
}

export function productOptionLabel(product: Pick<ProductSearchHit, 'product_code' | 'product_name'>): string {
  return `${product.product_code} - ${product.product_name}`;
}

export const ProductLinePicker: React.FC<ProductLinePickerProps> = ({
  brandId,
  brandCode = '',
  lineNumber,
  disabled = false,
  invalid = false,
  describedBy,
  selectedLabel = '',
  debounceMs = 300,
  searchProducts,
  onSelect,
}) => {
  const listId = useId();
  const [query, setQuery] = useState(selectedLabel);
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<ProductSearchHit[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [active, setActive] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    setQuery(selectedLabel);
    setOpen(false);
    setResults([]);
  }, [selectedLabel, brandId]);

  useEffect(() => {
    if (!open || !brandId) {
      setResults([]);
      setHasMore(false);
      return undefined;
    }
    const id = ++requestId.current;
    const handle = window.setTimeout(() => {
      void searchProducts(query.trim(), 1, brandId).then(pageResult => {
        if (id !== requestId.current) return;
        setResults(pageResult.results.filter(product => product.brand_id == null || Number(product.brand_id) === brandId));
        setPage(1);
        setHasMore(pageResult.has_more);
        setActive(0);
      });
    }, query.trim() ? debounceMs : 0);
    return () => window.clearTimeout(handle);
  }, [open, query, brandId, debounceMs, searchProducts]);

  const loadMore = () => {
    if (!brandId || !hasMore || loadingMore) return;
    const id = requestId.current;
    const nextPage = page + 1;
    setLoadingMore(true);
    void searchProducts(query.trim(), nextPage, brandId).then(pageResult => {
      if (id !== requestId.current) return;
      setResults(current => [...current, ...pageResult.results.filter(product => product.brand_id == null || Number(product.brand_id) === brandId)]);
      setPage(nextPage);
      setHasMore(pageResult.has_more);
    }).finally(() => {
      if (id === requestId.current) setLoadingMore(false);
    });
  };

  const choose = (product: ProductSearchHit) => {
    setQuery(productOptionLabel(product));
    setOpen(false);
    onSelect(product);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActive(index => Math.min(index + 1, Math.max(results.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive(index => Math.max(index - 1, 0));
    } else if (event.key === 'Enter' && open && results[active]) {
      event.preventDefault();
      choose(results[active]);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <input
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label={`Product, line ${lineNumber}`}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        disabled={disabled || !brandId}
        value={query}
        placeholder={brandId ? `Search ${brandCode || 'brand'} products…` : 'Select brand first'}
        onFocus={() => setOpen(true)}
        onChange={event => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
        className={`h-12 w-full px-3 rounded-md border bg-[var(--erp-surface)] text-[15px] text-[var(--erp-text)] focus:outline-none focus:border-[var(--erp-gold)] ${invalid ? 'border-[var(--erp-negative)]' : 'border-[var(--erp-hairline-strong)]'}`}
      />
      {open && brandId ? (
        <ul id={listId} role="listbox" aria-label={brandCode ? `${brandCode} products` : 'Brand products'} className="absolute z-20 mt-1 max-h-60 w-full overflow-auto border border-[var(--erp-hairline-strong)] bg-[var(--erp-surface)] shadow-lg">
          <li className="px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-[var(--erp-muted)]">{brandCode ? `${brandCode} products` : 'Selected brand products'}</li>
          {results.map((product, index) => (
            <li key={product.id} role="option" aria-selected={index === active}>
              <button
                type="button"
                className={`block w-full px-3 py-2 text-left text-sm ${index === active ? 'bg-[var(--erp-gold)]/15' : ''}`}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(product)}
              >
                {productOptionLabel(product)}
              </button>
            </li>
          ))}
          {!results.length ? <li className="px-3 py-2 text-sm text-[var(--erp-muted)]">{query.trim() ? 'No products found for this brand' : 'No products for this brand'}</li> : null}
          {hasMore ? (
            <li>
              <button type="button" className="w-full px-3 py-2 text-left text-sm text-[var(--erp-gold)]" onClick={loadMore}>
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
};
