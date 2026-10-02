/**
 * Run: npx tsx src/services/invoiceTrace.test.ts
 */
import { NOT_RECORDED, traceActor, traceStamp } from './invoicesApi.ts';

function assertEqual(actual: string, expected: string) {
  if (actual !== expected) {
    throw new Error(`Expected:\n  ${expected}\nGot:\n  ${actual}`);
  }
}

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

assertEqual(NOT_RECORDED, 'Not recorded');

// Legacy invoice issued before traceability: issued_by / issued_at are null.
assertEqual(traceActor(null), 'Not recorded');
assertEqual(traceActor(undefined), 'Not recorded');
assertEqual(traceActor({ id: 3, name: '' }), 'Not recorded');
assertEqual(traceStamp(null), 'Not recorded');
assertEqual(traceStamp(undefined), 'Not recorded');
assertEqual(traceStamp('not-a-date'), 'Not recorded');

assertEqual(traceActor({ id: 1, name: 'Bhargav Akshaya' }), 'Bhargav Akshaya');
const stamp = traceStamp('2026-09-05T10:30:00+05:30');
assert(stamp !== 'Not recorded' && stamp.includes('2026'), `expected formatted stamp, got ${stamp}`);

console.log('invoiceTrace.test.ts: all assertions passed');
