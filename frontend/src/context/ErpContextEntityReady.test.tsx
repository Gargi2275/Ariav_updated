/**
 * Run: npx tsx src/context/ErpContextEntityReady.test.tsx
 */
import React, { useEffect } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Window } from 'happy-dom';
import { ErpProvider, useErp } from './ErpContext';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const browser = new Window();
Object.defineProperty(globalThis, 'window', { value: browser, configurable: true });
Object.defineProperty(globalThis, 'document', { value: browser.document, configurable: true });
Object.defineProperty(globalThis, 'localStorage', { value: browser.localStorage, configurable: true });
Object.defineProperty(globalThis, 'sessionStorage', { value: browser.sessionStorage, configurable: true });
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

localStorage.setItem('ariav_auth_token', 'test-token');
localStorage.setItem('ariav_selected_entity_id', '7');

const requests: string[] = [];
globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = String(input);
  if (url.includes('/api/auth/me/')) {
    return new Response(JSON.stringify({ success: true, role: 'admin', user: { name: 'Test' } }), { status: 200 });
  }
  if (url.includes('/api/entities/')) {
    return new Response(JSON.stringify([{
      id: 7,
      short_code: 'SRV',
      entity_name: 'Shriva',
      entity_type: 'Branch',
      city: '',
      address_line_1: '',
      street: '',
      area: '',
      phone: '',
      mobile: '',
      gst_no: '',
    }]), { status: 200 });
  }
  if (url.includes('/api/customers/')) requests.push(url);
  return new Response(JSON.stringify([]), { status: 200 });
}) as typeof fetch;

function FirstRequestProbe() {
  const { entityReady, selectedEntityId } = useErp();
  useEffect(() => {
    if (entityReady) {
      void fetch(`/api/customers/?entity_id=${selectedEntityId}`);
    }
  }, [entityReady, selectedEntityId]);
  return null;
}

const host = document.createElement('div');
document.body.appendChild(host);
const root = createRoot(host);
await act(async () => {
  root.render(
    <ErpProvider>
      <FirstRequestProbe />
    </ErpProvider>,
  );
  await new Promise(resolve => setTimeout(resolve, 0));
  await new Promise(resolve => setTimeout(resolve, 0));
});

assert(requests.length === 1, 'expected one first customer request');
assert(requests[0].includes('entity_id=7'), 'the first customer request must carry the persisted SRV entity');
root.unmount();
console.log('entity-ready initialization test passed');
