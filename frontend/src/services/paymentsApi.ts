/**
 * Customer Payments — /api/payments/
 */

import { apiUrl } from './apiBase';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('ariav_auth_token');
  const res = await fetch(apiUrl(path), {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(
      (data as { detail?: string })?.detail
        || JSON.stringify(data)
        || `HTTP ${res.status}`,
    );
    (error as Error & { data: unknown; status: number }).data = data;
    (error as Error & { status: number }).status = res.status;
    throw error;
  }
  return data as T;
}

function qs(params: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return;
    sp.set(k, String(v));
  });
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export const PAYMENT_MODES = [
  'Cash',
  'Cheque',
  'Bank Transfer',
  'UPI',
  'RTGS',
  'NEFT',
  'Other',
] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

export interface PaymentAllocationRow {
  id?: number;
  invoice_id: number;
  invoice_number?: string;
  invoice_date?: string;
  invoice_status?: string;
  invoice_net_amount?: string | number;
  allocated_amount: string | number;
}

export interface PaymentAdjustmentRow {
  id: number;
  payment_id: number;
  payment_number: string;
  payment_allocation_id: number | null;
  invoice_id: number;
  invoice_number: string;
  customer_id: number;
  customer_code: string;
  customer_name: string;
  amount: string | number;
  reason: string;
  reference: string;
  status: string;
  created_by: number;
  created_by_name: string;
  approved_by: number | null;
  approved_by_name: string;
  created_at: string;
  approved_at: string | null;
}

export interface PaymentRow {
  id: number;
  payment_number: string;
  payment_date: string;
  entity_id: number;
  entity_code: string;
  entity_name: string;
  customer_id: number;
  customer_code: string;
  customer_name: string;
  amount: string | number;
  payment_mode: PaymentMode | string;
  bank_cash_account: string;
  transaction_reference: string;
  invoice_reference: string | null;
  deposit_account_id: number | null;
  deposit_account_name: string;
  deposit_account_masked: string;
  payer_bank_name: string;
  payer_bank_branch: string;
  instrument_number: string;
  instrument_date: string | null;
  remarks: string;
  unallocated_amount: string | number;
  allocations: PaymentAllocationRow[];
  adjustments?: PaymentAdjustmentRow[];
  created_at?: string;
  updated_at?: string;
  created_by_name?: string;
  duplicate_warning?: string;
}

export interface BankAccountRow {
  id: number;
  entity_id: number;
  entity_name: string;
  bank_name: string;
  bank_branch_name: string;
  account_number_masked: string;
  ifsc: string;
  active: boolean;
}

export function paymentInvoiceSummary(payment: Pick<PaymentRow, 'allocations'>): string {
  const numbers = payment.allocations.map(row => row.invoice_number).filter(Boolean) as string[];
  if (!numbers.length) return 'Unallocated';
  return numbers.length > 1 ? `${numbers[0]} +${numbers.length - 1} more` : numbers[0];
}

export function paymentModeFields(mode: string): {
  showInstrument: boolean;
  showPayerBank: boolean;
  showDepositAccount: boolean;
} {
  return {
    showInstrument: mode === 'Cheque',
    showPayerBank: mode !== 'Cash',
    showDepositAccount: mode !== 'Cash',
  };
}

export function paymentDuplicateWarningText(warning?: string): string {
  return warning?.trim() || '';
}

export interface InvoicePaymentAllocationRow {
  id: number;
  payment_id: number;
  payment_number: string;
  payment_date: string;
  payment_mode: string;
  allocated_amount: string | number;
}

export const PAYMENT_ADJUSTMENT_REASONS = [
  'Applied advance to new invoice',
  'Correction',
  'Settlement of unallocated balance',
] as const;

export function paymentTodayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const LEDGER_OPEN_PAYMENT_KEY = 'ariav_ledger_open_payment';

export const paymentsApi = {
  list: (params: {
    customer_id?: number;
    entity_id?: number;
    payment_mode?: string;
    date_from?: string;
    date_to?: string;
    allocation_status?: 'allocated' | 'unallocated';
    invoice_id?: number;
    search?: string;
  } = {}) => request<PaymentRow[]>(`/api/payments/${qs(params)}`),
  retrieve: (id: number) => request<PaymentRow>(`/api/payments/${id}/`),
  bankAccounts: (entity_id: number) => request<BankAccountRow[]>(`/api/payments/bank-accounts/${qs({ entity_id })}`),
  create: (body: unknown) =>
    request<PaymentRow>('/api/payments/', { method: 'POST', body: JSON.stringify(body) }),
  allocate: (id: number, body: {
    invoice_id: number;
    allocated_amount: string;
    reason: string;
    reference?: string;
  }) =>
    request<PaymentRow>(`/api/payments/${id}/allocate/`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  removeAllocation: (paymentId: number, allocationId: number) =>
    request<PaymentRow>(`/api/payments/${paymentId}/allocations/${allocationId}/`, { method: 'DELETE' }),
  remove: (id: number) => request<void>(`/api/payments/${id}/`, { method: 'DELETE' }),
};

export const paymentAdjustmentsApi = {
  list: (params: {
    payment_id?: number;
    invoice_id?: number;
    customer_id?: number;
    date_from?: string;
    date_to?: string;
    search?: string;
  } = {}) => request<PaymentAdjustmentRow[]>(`/api/payment-adjustments/${qs(params)}`),
  retrieve: (id: number) => request<PaymentAdjustmentRow>(`/api/payment-adjustments/${id}/`),
};
