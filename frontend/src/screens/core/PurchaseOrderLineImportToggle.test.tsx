/**
 * Run: npx tsx src/screens/core/PurchaseOrderLineImportToggle.test.tsx
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
  getComputedStyle: win.getComputedStyle.bind(win),
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, 'navigator', { value: win.navigator, configurable: true });

const React = await import('react');
const { act } = React;
const { createRoot } = await import('react-dom/client');
const {
  lineItemsAreReadOnly,
  PurchaseOrderLineImportToggle,
  shouldShowLineItemsGrid,
} = await import('./PurchaseOrderLineImportToggle.tsx');
const { PurchaseOrderLineItems } = await import('./PurchaseOrderLineItems.tsx');

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const container = document.createElement('div');
document.body.appendChild(container);
const root = createRoot(container);
const props: ComponentProps<typeof PurchaseOrderLineImportToggle> = {
  isDigitalPo: false,
  mode: 'manual',
  onModeChange: () => undefined,
};

await act(async () => { root.render(<PurchaseOrderLineImportToggle {...props} />); });
assert(!container.textContent, 'toggle should be hidden without Digital PO');
await act(async () => { root.render(<PurchaseOrderLineImportToggle {...props} isDigitalPo />); });
assert(container.textContent?.includes('Enter manually'), 'manual option should be visible for Digital PO');
assert(container.textContent?.includes('Upload Excel'), 'upload option should be visible for Digital PO');
assert(!shouldShowLineItemsGrid('upload', false), 'upload mode without rows should hide the grid');
assert(shouldShowLineItemsGrid('upload', true), 'upload mode with rows should show the grid');
assert(lineItemsAreReadOnly('upload', true), 'loaded upload rows should be read-only');
assert(!lineItemsAreReadOnly('manual', true), 'switching to manual should make rows editable');

const lines = [{
  key: 'loaded-1',
  category_id: 10,
  product_id: 1,
  product_description: '',
  manualEntry: false,
  quantity: '2',
  rate: '10',
}];
const lineProps = {
  lines,
  setLines: (() => undefined) as ComponentProps<typeof PurchaseOrderLineItems>['setLines'],
  onAddLine: () => undefined,
  onCategoryChange: () => undefined,
  onProductChange: () => undefined,
  categories: [{ id: 10, label: 'Fabric' }],
  productOptionsByCategory: new Map(),
  products: [{ id: 1, product_name: 'Blue Fabric', product_code: 'SKU-1', unit: 'Meter' }],
  brandSelected: true,
  isManual: false,
  fieldMessages: {},
  totals: { qty: 2, amt: 20 },
};
await act(async () => {
  root.render(<PurchaseOrderLineItems {...lineProps} readOnly />);
});
assert(!container.querySelector('input'), 'loaded upload grid should not contain editable inputs');
assert(!container.textContent?.includes('Add line'), 'loaded upload grid should hide Add line');
assert(container.textContent?.includes('Blue Fabric'), 'loaded upload grid should show the product');
await act(async () => {
  root.render(<PurchaseOrderLineItems {...lineProps} readOnly={false} />);
});
assert((container.querySelector('input[aria-label="Quantity, line 1"]') as HTMLInputElement)?.value === '2', 'rows should be preserved when switching to manual');
console.log('purchaseOrderLineImportToggle tests passed');
