import {
  customDateRange,
  financialYearRange,
  getPeriod,
  isDateRangeInvalid,
  normalizeFinancialYear,
  normalizePeriodMonth,
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
assert(normalizeFinancialYear('2024-25') === '2024-25', 'a real financial year should be kept');
assert(normalizeFinancialYear('2024-26') === null, 'a broken year pair should be rejected');
assert(normalizeFinancialYear('FY 2024') === null, 'free text should be rejected');
assert(normalizePeriodMonth('4') === 4, 'April should be accepted');
assert(normalizePeriodMonth('13') === '', 'a month outside the financial year should be cleared');
assert(normalizePeriodMonth('') === '', 'an empty month means all months');
const expectedMonths = [
  ['2025-04-01', '2025-04-30'],
  ['2025-05-01', '2025-05-31'],
  ['2025-06-01', '2025-06-30'],
  ['2025-07-01', '2025-07-31'],
  ['2025-08-01', '2025-08-31'],
  ['2025-09-01', '2025-09-30'],
  ['2025-10-01', '2025-10-31'],
  ['2025-11-01', '2025-11-30'],
  ['2025-12-01', '2025-12-31'],
  ['2026-01-01', '2026-01-31'],
  ['2026-02-01', '2026-02-28'],
  ['2026-03-01', '2026-03-31'],
];
expectedMonths.forEach(([from, to], index) => {
  const period = getPeriod('2025-26', index + 4 > 12 ? index - 8 : index + 4);
  assert(period.from === from && period.to === to, `month ${index + 1} should have exact boundaries`);
});
assert(
  getPeriod('2027-28', 2).to === '2028-02-29',
  'getPeriod should preserve leap-year February',
);

console.log('invoice date filter helper tests passed');
