/**
 * Run: npx tsx src/screens/core/PurchaseOrderPipeline.test.tsx
 */
import { isPipelineStatusChangeAllowed } from './PurchaseOrderPipeline';
import type { PurchaseOrderRow } from '../../services/purchaseOrdersApi';

const row = {
  id: 1,
  po_number: 'PO-1',
  allowed_transitions: ['Submitted', 'Cancelled'],
} as PurchaseOrderRow;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

assert(isPipelineStatusChangeAllowed(row, 'Submitted'), 'an allowed status should be a valid status change');
assert(!isPipelineStatusChangeAllowed(row, 'Brand Accepted'), 'a disallowed status must not request a move');
assert(!isPipelineStatusChangeAllowed(row, 'Partially Dispatched'), 'a locked dispatch status must not request a move');
assert(!isPipelineStatusChangeAllowed(row, 'Fully Dispatched'), 'a locked dispatch status must not request a move');
console.log('purchaseOrderPipeline tests passed');
