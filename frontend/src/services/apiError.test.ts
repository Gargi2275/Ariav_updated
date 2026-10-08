/**
 * Run: npx tsx src/services/apiError.test.ts
 */
import { parseApiErrorDetails } from './apiError.ts';

function assertEqual(actual: string, expected: string) {
  if (actual !== expected) {
    throw new Error(`Expected:\n  ${expected}\nGot:\n  ${actual}`);
  }
}

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const GENERIC = 'Something went wrong. Please try again.';

const dup = parseApiErrorDetails({
  status: 400,
  data: { category_code: ['Category code CF is already in use.'] },
});
assertEqual(dup.message, "Category code 'CF' is already in use. Try a different code.");
assert(dup.fields.includes('category_code'), 'expected category_code in fields');

const detail = parseApiErrorDetails({
  status: 403,
  data: { detail: 'You do not have permission to perform this action.' },
});
assertEqual(detail.message, 'You do not have permission to perform this action.');

const server = parseApiErrorDetails({
  status: 500,
  data: { detail: 'Traceback (most recent call last): Internal Server Error' },
});
assertEqual(server.message, GENERIC);

const unknown = parseApiErrorDetails({ status: 400, data: { weird: { nested: [] } } });
assertEqual(unknown.message, GENERIC);

const entityDup = parseApiErrorDetails({
  status: 400,
  data: { short_code: ['Short code GUJ is already in use.'] },
});
assertEqual(entityDup.message, "Short code 'GUJ' is already in use. Try a different code.");
assert(entityDup.fields.includes('short_code'), 'expected short_code in fields');

const brandDup = parseApiErrorDetails({
  status: 400,
  data: { brand_code: ['Brand code XYZ is already in use.'] },
});
assertEqual(brandDup.message, "Brand code 'XYZ' is already in use. Try a different code.");

const headers = parseApiErrorDetails({
  status: 400,
  data: {
    file: 'Missing required column(s): price_value.',
    detected_headers: ['brand_code', ' price_value ', 'season_label'],
  },
});
assert(headers.message.includes('Missing required column(s): price_value.'), headers.message);
assert(headers.message.includes('Detected columns in your file: brand_code,  price_value , season_label'), headers.message);

console.log('parseApiErrorDetails: all assertions passed');
