/**
 * Run: npx tsx src/screens/core/ProductLinePicker.test.tsx
 */
import type { ComponentProps } from 'react';
import { Window } from 'happy-dom';

const win = new Window({ url: 'http://localhost/' });
Object.assign(globalThis, {
  window: win,
  document: win.document,
  HTMLElement: win.HTMLElement,
  Node: win.Node,
  Element: win.Element,
  Event: win.Event,
  InputEvent: win.InputEvent,
  getComputedStyle: win.getComputedStyle.bind(win),
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, 'navigator', { value: win.navigator, configurable: true });

const React = await import('react');
const { act } = React;
const { createRoot } = await import('react-dom/client');
const { PurchaseOrderLineItems } = await import('./PurchaseOrderLineItems.tsx');
const { ProductLinePicker } = await import('./ProductLinePicker.tsx');

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const container = document.createElement('div');
document.body.appendChild(container);
const root = createRoot(container);

const lineProps: ComponentProps<typeof PurchaseOrderLineItems> = {
  lines: [{
    key: 'line-1',
    product_description: '',
    manualEntry: false,
    quantity: '1',
    rate: '',
  }],
  setLines: () => undefined,
  onAddLine: () => undefined,
  onCategoryChange: () => undefined,
  onProductChange: () => undefined,
  categories: [{ id: 10, label: 'Cotton', detail: 'Yarn' }],
  productOptionsByCategory: new Map([[10, [{ id: 1, label: 'Woolrite' }]]]),
  products: [],
  brandSelected: true,
  brandId: 4,
  isManual: false,
  fieldMessages: {},
  totals: { qty: 0, amt: 0 },
};

await act(async () => {
  root.render(<PurchaseOrderLineItems {...lineProps} productCategory={false} />);
});
assert(!container.textContent?.includes('Category'), 'category column is hidden when the flag is off');
assert(!container.textContent?.includes('Cotton'), 'category names are not shown on the line');
assert(container.querySelector('[role="combobox"]'), 'product search box is shown');

await act(async () => {
  root.render(<PurchaseOrderLineItems {...lineProps} productCategory />);
});
assert(container.textContent?.includes('Category'), 'category column returns when the flag is on');
assert(container.textContent?.includes('Select category'), 'the previous category picker is rendered');

const calls: { query: string; page: number }[] = [];
let releaseFirst: (value: { results: { id: number; product_code: string; product_name: string; rate: string; category_name: string }[]; page: number; has_more: boolean }) => void = () => undefined;
let releaseSecond: typeof releaseFirst = () => undefined;
const searchProducts = (query: string, page: number) => {
  calls.push({ query, page });
  return new Promise<Awaited<ReturnType<typeof searchProducts>>>(resolve => {
    if (calls.length === 1) releaseFirst = resolve;
    else releaseSecond = resolve;
  });
};

let selected = '';
await act(async () => {
  root.render(
    <ProductLinePicker
      brandId={4}
      lineNumber={1}
      debounceMs={20}
      searchProducts={searchProducts}
      onSelect={product => { selected = `${product.product_code} - ${product.product_name}`; }}
    />,
  );
});
const box = container.querySelector('[role="combobox"]') as HTMLInputElement;
await act(async () => {
  box.focus();
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  setter?.call(box, 'AI');
  box.dispatchEvent(new Event('input', { bubbles: true }));
  box.dispatchEvent(new Event('change', { bubbles: true }));
});
await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
assert(calls.length === 1 && calls[0].query === 'AI', 'typing starts a search');
await act(async () => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  setter?.call(box, 'AMB');
  box.dispatchEvent(new Event('input', { bubbles: true }));
});
await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
await act(async () => {
  releaseFirst({
    results: [{ id: 1, product_code: 'AI', product_name: 'Woolrite', rate: '1799', category_name: 'Yarn' }],
    page: 1,
    has_more: false,
  });
  releaseSecond({
    results: [{ id: 2, product_code: 'AMB', product_name: 'Ambassador White', rate: '999', category_name: 'Yarn' }],
    page: 1,
    has_more: true,
  });
  await Promise.resolve();
});
assert(container.textContent?.includes('AMB - Ambassador White'), 'the latest search result is shown as code - name');
assert(!container.textContent?.includes('AI - Woolrite'), 'a slower earlier response is ignored');
assert(!container.textContent?.includes('Yarn'), 'category text is not shown in the product list');
assert(container.textContent?.includes('Load more'), 'another page can be requested');
const option = container.querySelector('[role="option"] button') as HTMLButtonElement;
await act(async () => { option.click(); });
assert(selected === 'AMB - Ambassador White', 'choosing a result fills the line from that product');
root.unmount();
console.log('product line picker tests passed');
