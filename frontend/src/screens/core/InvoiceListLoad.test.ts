import { shouldApplyInvoiceListResponse } from './InvoiceScreen';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

assert(shouldApplyInvoiceListResponse(2, 2), 'latest invoice response should apply');
assert(!shouldApplyInvoiceListResponse(1, 2), 'stale invoice response should be ignored');

console.log('invoice stale-response test passed');
