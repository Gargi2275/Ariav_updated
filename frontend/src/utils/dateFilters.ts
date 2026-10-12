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

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function financialYearRange(year: string, month?: number | ''): InvoiceDateRange {
  const match = /^(\d{4})-(\d{2})$/.exec(year);
  if (!match) return {};
  const startYear = Number(match[1]);
  const selectedMonth = month || '';
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

export function customDateRange(from: string, to: string): InvoiceDateRange {
  return {
    date_from: from || undefined,
    date_to: to || undefined,
  };
}

export function isDateRangeInvalid(from: string, to: string): boolean {
  return Boolean(from && to && from > to);
}
