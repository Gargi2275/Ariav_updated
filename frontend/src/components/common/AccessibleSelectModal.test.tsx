/**
 * Run: npx tsx src/components/common/AccessibleSelectModal.test.tsx
 */
import type { ComponentProps } from 'react';
import { Window } from 'happy-dom';

const win = new Window({ url: 'http://localhost/' });
Object.defineProperty(globalThis, 'navigator', { value: win.navigator, configurable: true });
Object.assign(globalThis, {
  window: win,
  document: win.document,
  HTMLElement: win.HTMLElement,
  HTMLInputElement: win.HTMLInputElement,
  Node: win.Node,
  Element: win.Element,
  KeyboardEvent: win.KeyboardEvent,
  MouseEvent: win.MouseEvent,
  Event: win.Event,
  getComputedStyle: win.getComputedStyle.bind(win),
  requestAnimationFrame: (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0),
  IS_REACT_ACT_ENVIRONMENT: true,
});
(win.Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = () => {};

const React = await import('react');
const { act } = React;
const { createRoot } = await import('react-dom/client');
const { AccessibleSelectModal } = await import('./AccessibleSelectModal.tsx');
type SelectOption = import('./AccessibleSelectModal.tsx').SelectOption;

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const OPTIONS: SelectOption[] = [
  { id: 1, label: 'Accessories', usage: 0 },
  { id: 2, label: 'Cotton Fabric', usage: 7 },
  { id: 3, label: 'Fabrics › Grey / Greige', usage: 12 },
  { id: 4, label: 'Garments', usage: 0 },
  { id: 5, label: 'Polyester Fabric', usage: 3, detail: 'PF-01' },
];

const doc = win.document as unknown as Document;
const container = doc.createElement('div');
doc.body.appendChild(container);
const root = createRoot(container);

let changes: number[] = [];

async function render(props: Partial<ComponentProps<typeof AccessibleSelectModal>> = {}) {
  await act(async () => {
    root.render(
      <AccessibleSelectModal
        fieldLabel="Category"
        title="Select Category"
        searchPlaceholder="Search categories..."
        mostUsedHeading="Most Used Categories"
        allHeading="All Categories"
        emptyText="No categories found"
        placeholder="Select category…"
        options={OPTIONS}
        onChange={id => changes.push(id)}
        {...props}
      />,
    );
  });
}

const trigger = () => container.querySelector('button') as HTMLButtonElement;
const dialog = () => doc.querySelector('[role="dialog"]');
const search = () => doc.querySelector('[role="combobox"]') as HTMLInputElement;
const optionLabels = (groupHeading: string) => {
  const group = [...doc.querySelectorAll('[role="group"]')].find(g => g.textContent?.startsWith(groupHeading));
  return group ? [...group.querySelectorAll('[role="option"]')].map(o => o.querySelector('[data-option-label]')?.textContent) : null;
};

async function click(el: Element) {
  await act(async () => {
    el.dispatchEvent(new win.MouseEvent('click', { bubbles: true }) as unknown as Event);
  });
}
async function key(el: Element, keyName: string, init: { shiftKey?: boolean } = {}) {
  await act(async () => {
    el.dispatchEvent(new win.KeyboardEvent('keydown', { key: keyName, bubbles: true, ...init }) as unknown as Event);
  });
}
async function type(input: HTMLInputElement, text: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, text);
    input.dispatchEvent(new win.Event('input', { bubbles: true }) as unknown as Event);
  });
}
async function flush() {
  await act(async () => {
    await new Promise(r => setTimeout(r, 5));
  });
}

// Closed: large trigger shows the placeholder and announces the field.
await render();
assert(trigger().textContent?.includes('Select category…'), 'placeholder shown');
assert(trigger().getAttribute('aria-label') === 'Category: Select category…', 'trigger aria-label');
assert(trigger().getAttribute('aria-haspopup') === 'dialog', 'aria-haspopup');
assert(!dialog(), 'closed initially');

// Open: most used first (by usage, desc), then the rest alphabetically without duplicates.
await click(trigger());
assert(dialog(), 'dialog opens on click');
assert(dialog()!.getAttribute('aria-modal') === 'true', 'aria-modal');
assert(doc.getElementById(dialog()!.getAttribute('aria-labelledby')!)?.textContent === 'Select Category', 'dialog labelled by title');
assert(doc.activeElement === search(), 'search box focused on open');
assert(
  JSON.stringify(optionLabels('Most Used Categories')) === JSON.stringify(['Fabrics › Grey / Greige', 'Cotton Fabric', 'Polyester Fabric']),
  `most used order: ${JSON.stringify(optionLabels('Most Used Categories'))}`,
);
assert(JSON.stringify(optionLabels('All Categories')) === JSON.stringify(['Accessories', 'Garments']), 'all categories');

// Search is instant, case-insensitive, and also matches the detail line.
await type(search(), 'FABRIC');
assert(JSON.stringify(optionLabels('Results')) === JSON.stringify(['Cotton Fabric', 'Fabrics › Grey / Greige', 'Polyester Fabric']), 'search results');
await type(search(), 'pf-01');
assert(JSON.stringify(optionLabels('Results')) === JSON.stringify(['Polyester Fabric']), 'detail searched');
await type(search(), 'zzz');
assert(dialog()!.textContent?.includes('No categories found'), 'empty text');
assert(!doc.querySelector('[role="listbox"]'), 'no listbox when empty');

// Keyboard: arrows move the active option (aria-activedescendant), Enter selects and closes.
await type(search(), '');
await key(search(), 'ArrowDown');
await key(search(), 'ArrowDown');
const activeId = search().getAttribute('aria-activedescendant')!;
assert(doc.getElementById(activeId)?.textContent?.startsWith('Polyester Fabric'), 'third option active');
await key(search(), 'ArrowUp');
await key(search(), 'Enter');
await flush();
assert(JSON.stringify(changes) === '[2]', `Enter selects Cotton Fabric, got ${JSON.stringify(changes)}`);
assert(!dialog(), 'closes after select');
assert(doc.activeElement === trigger(), 'focus returns to the field');

// Selected value: shown on the field; in the modal it has aria-selected, a checkmark and "Selected" text, and starts active.
await render({ value: 2 });
assert(trigger().textContent?.includes('Cotton Fabric'), 'selected label on field');
await click(trigger());
const selectedRow = doc.querySelector('[role="option"][aria-selected="true"]')!;
assert(selectedRow.textContent?.includes('Cotton Fabric'), 'selected row is Cotton Fabric');
assert(selectedRow.querySelector('svg.lucide-check'), 'selected row has a checkmark icon');
assert(doc.querySelectorAll('[role="option"] svg.lucide-check').length === 1, 'only the selected row has a checkmark');
assert(search().getAttribute('aria-activedescendant') === selectedRow.id, 'selected row active on open');

// Escape closes without changing the value.
changes = [];
await key(search(), 'Escape');
await flush();
assert(!dialog(), 'Escape closes');
assert(changes.length === 0, 'Escape does not select');

// Tab is trapped inside the dialog (close button -> search -> clear button when there is a query).
await click(trigger());
const closeBtn = doc.querySelector('[aria-label="Close select category"]') as HTMLButtonElement;
assert(closeBtn, 'close button present');
search().focus();
await key(search(), 'Tab');
assert(doc.activeElement === closeBtn, 'Tab from the last control wraps to close');
await key(closeBtn, 'Tab', { shiftKey: true });
assert(doc.activeElement === search(), 'Shift+Tab from the first control wraps to search');
await type(search(), 'cot');
const clearBtn = doc.querySelector('[aria-label="Clear search"]') as HTMLButtonElement;
assert(clearBtn, 'clear button appears with a query');
clearBtn.focus();
await key(clearBtn, 'Tab');
assert(doc.activeElement === closeBtn, 'clear button is last in the trap');
await click(clearBtn);
assert(search().value === '' && doc.activeElement === search(), 'clear empties and refocuses search');
await click(closeBtn);
await flush();
assert(!dialog(), 'close button closes');

// Mouse click on a row selects it.
changes = [];
await click(trigger());
await click([...doc.querySelectorAll('[role="option"]')].find(o => o.textContent?.startsWith('Garments'))!);
assert(JSON.stringify(changes) === '[4]', 'click selects');
await flush();

// No usage data: no "Most used" section, everything under "All".
await render({ value: undefined, options: OPTIONS.map(o => ({ ...o, usage: 0 })) });
await click(trigger());
assert(optionLabels('Most Used Categories') === null, 'no most used section without usage');
assert(optionLabels('All Categories')?.length === 5, 'all options listed');
await key(search(), 'Escape');
await flush();

// Disabled field does not open.
await render({ disabled: true, placeholder: 'Select category first' });
await click(trigger());
assert(!dialog(), 'disabled does not open');
assert(trigger().disabled, 'trigger disabled');

// Render cap keeps the DOM small for big catalogues.
const many = Array.from({ length: 450 }, (_, i) => ({ id: 1000 + i, label: `Item ${String(i).padStart(3, '0')}` }));
await render({ disabled: false, options: many, renderLimit: 200 });
await click(trigger());
assert(doc.querySelectorAll('[role="option"]').length === 200, 'render cap applied');
assert(dialog()!.textContent?.includes('Showing 200 of 450'), 'truncation note');
await type(search(), 'item 44');
assert(doc.querySelectorAll('[role="option"]').length === 14, 'every search word must match');
assert(dialog()!.textContent?.includes('Item 449'), 'search reaches beyond the cap');

await act(async () => root.unmount());
console.log('AccessibleSelectModal tests passed');
await win.happyDOM.abort();
win.close();
