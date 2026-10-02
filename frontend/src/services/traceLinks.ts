import { CUSTOMER_360_KEY } from './customersApi';
import { OPEN_DISPATCH_KEY } from './dispatchesApi';
import { LEDGER_OPEN_INVOICE_KEY, TraceLinkType } from './invoicesApi';
import { LEDGER_OPEN_PAYMENT_KEY } from './paymentsApi';
import { OPEN_PO_KEY } from './purchaseOrdersApi';

const TARGETS: Record<TraceLinkType, { key: string; screen: number }> = {
  purchase_order: { key: OPEN_PO_KEY, screen: 40 },
  dispatch: { key: OPEN_DISPATCH_KEY, screen: 41 },
  invoice: { key: LEDGER_OPEN_INVOICE_KEY, screen: 42 },
  payment: { key: LEDGER_OPEN_PAYMENT_KEY, screen: 43 },
  customer: { key: CUSTOMER_360_KEY, screen: 48 },
};

export function openTraceTarget(type: TraceLinkType, id: number, navigateTo: (screen: number) => void): void {
  const target = TARGETS[type];
  sessionStorage.setItem(target.key, String(id));
  navigateTo(target.screen);
}
