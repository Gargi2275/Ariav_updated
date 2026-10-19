export const FINANCIAL_YEARS = ['2025-26', '2024-25', '2023-24'] as const;

export const FINANCIAL_MONTHS = [
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
] as const;

export type InvoiceDateRange = {
  date_from?: string;
  date_to?: string;
};

export type Period = {
  fy: string;
  month: number | '';
  from: string;
  to: string;
};

export function currentFinancialYear(today = new Date()): string {
  const startYear = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
  return `${startYear}-${String(startYear + 1).slice(-2)}`;
}

export function normalizeFinancialYear(value: string | null | undefined): string | null {
  const match = /^(\d{4})-(\d{2})$/.exec((value || '').trim());
  if (!match) return null;
  const startYear = Number(match[1]);
  const endYear = Number(match[2]);
  if (startYear < 2000 || startYear > 2100) return null;
  if (endYear !== (startYear + 1) % 100) return null;
  return `${match[1]}-${match[2]}`;
}

export function normalizePeriodMonth(value: string | number | null | undefined): number | '' {
  if (value === '' || value === null || value === undefined) return '';
  const month = Number(value);
  return FINANCIAL_MONTHS.some(item => item.value === month) ? month : '';
}

export function financialYearOptions(today = new Date(), selected = ''): string[] {
  const current = currentFinancialYear(today);
  const startYear = Number(current.slice(0, 4));
  const options = [0, 1, 2].map(offset => {
    const year = startYear - offset;
    return `${year}-${String(year + 1).slice(-2)}`;
  });
  const extra = normalizeFinancialYear(selected);
  if (extra && !options.includes(extra)) options.push(extra);
  return options;
}

export function periodLabel(fy: string, month: number | ''): string {
  if (!month) return `FY ${fy} · All months`;
  const startYear = Number(fy.slice(0, 4));
  const calendarYear = month <= 3 ? startYear + 1 : startYear;
  const name = FINANCIAL_MONTHS.find(item => item.value === month)?.label || '';
  return `FY ${fy} · ${name} ${calendarYear}`;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function financialYearRange(year: string, month?: number | ''): InvoiceDateRange {
  const match = /^(\d{4})-(\d{2})$/.exec(year);
  if (!match) return {};
  const startYear = Number(match[1]);
  const selectedMonth = month && FINANCIAL_MONTHS.some(item => item.value === month) ? month : '';
  const actualYear = selectedMonth && selectedMonth <= 3 ? startYear + 1 : startYear;
  if (!selectedMonth) {
    return { date_from: `${startYear}-04-01`, date_to: `${startYear + 1}-03-31` };
  }

  const lastDay = new Date(actualYear, selectedMonth, 0).getDate();
  return {
    date_from: `${actualYear}-${pad(selectedMonth)}-01`,
    date_to: `${actualYear}-${pad(selectedMonth)}-${pad(lastDay)}`,
  };
}

export function getPeriod(fy: string, month: number | ''): Period {
  const range = financialYearRange(fy, month);
  return {
    fy,
    month,
    from: range.date_from || '',
    to: range.date_to || '',
  };
}

export function customDateRange(from: string, to: string): InvoiceDateRange {
  return {
    date_from: from || undefined,
    date_to: to || undefined,
  };
}

export function isDateRangeInvalid(from: string, to: string): boolean {
  return Boolean(from && to && from > to);
}
