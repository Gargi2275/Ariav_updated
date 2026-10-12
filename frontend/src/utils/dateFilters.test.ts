import {
  customDateRange,
  financialYearRange,
  isDateRangeInvalid,
} from './dateFilters';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

assert(
  JSON.stringify(financialYearRange('2025-26', 4)) === '{"date_from":"2025-04-01","date_to":"2025-04-30"}',
  'April range should use the first financial-year calendar month',
);
assert(
  JSON.stringify(financialYearRange('2027-28', 2)) === '{"date_from":"2028-02-01","date_to":"2028-02-29"}',
  'leap-year February should end on February 29',
);
assert(
  JSON.stringify(financialYearRange('2025-26', 3)) === '{"date_from":"2026-03-01","date_to":"2026-03-31"}',
  'March should use the second calendar year',
);
assert(
  JSON.stringify(financialYearRange('2025-26')) === '{"date_from":"2025-04-01","date_to":"2026-03-31"}',
  'whole financial year should cover April through March',
);
assert(
  JSON.stringify(customDateRange('2026-05-01', '')) === '{"date_from":"2026-05-01"}',
  'custom ranges should allow only From',
);
assert(isDateRangeInvalid('2026-05-02', '2026-05-01'), 'From after To should be rejected');
assert(!isDateRangeInvalid('2026-05-01', '2026-05-02'), 'ordered dates should be accepted');

console.log('invoice date filter helper tests passed');
