/**
 * Run: npx tsx src/screens/masters/CustomerMasterLoad.test.ts
 */
import { shouldApplyCustomerListResponse } from './CustomerMasterScreen';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => {
    resolve = res;
  });
  return { promise, resolve };
}

const allEntities = deferred<string[]>();
const shriva = deferred<string[]>();
let currentRequestId = 0;
let rows: string[] = [];

const startRequest = async (response: Deferred<string[]>) => {
  const requestId = ++currentRequestId;
  const result = await response.promise;
  if (shouldApplyCustomerListResponse(requestId, currentRequestId)) {
    rows = result;
  }
};

const oldRequest = startRequest(allEntities);
const newRequest = startRequest(shriva);
shriva.resolve([]);
await newRequest;
assert(rows.length === 0, 'switching to an entity with no links should show an empty list');

allEntities.resolve(['Aditi customer']);
await oldRequest;
assert(rows.length === 0, 'a slower earlier response must not overwrite the newer entity list');

console.log('customer master stale-response test passed');
