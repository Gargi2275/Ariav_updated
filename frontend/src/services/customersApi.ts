/**
 * Customer Master API — /api/customers/
 * Unique customer_code is the ledger/invoice key. M2M entities with one primary.
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

export const CUSTOMER_TYPES = ['Company', 'Individual', 'Distributor'] as const;
export type CustomerTypeName = (typeof CUSTOMER_TYPES)[number];
export type CustomerStatus = 'Active' | 'Inactive';

export interface CustomerEntityLink {
  entity_id: number;
  short_code?: string;
  entity_name?: string;
  primary_entity: boolean;
}

export interface CustomerRow {
  id: number;
  customer_code: string;
  customer_name: string;
  customer_type: CustomerTypeName | string;
  status: CustomerStatus;
  created_at?: string;
  updated_at?: string;
  created_by?: number | null;
  created_by_name?: string;
  entities: CustomerEntityLink[];
  primary_entity_id: number | null;
  primary_entity_code: string;
  primary_entity_name: string;
  contact_person: string;
  phone: string;
  mobile: string;
  fax: string;
  email: string;
  website: string;
  address_line_1: string;
  address_line_2: string;
  area: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  district: string;
  zone: string;
  std_code: string;
  pan_no: string;
  gst_no: string;
  vat_tin: string;
  cst_tin: string;
  licence_no: string;
  ecc: string;
  division: string;
  range: string;
  credit_days: number;
  credit_limit: string | number;
  opening_balance: string | number;
  interest_rate: string | number | null;
  lower_rate: string | number | null;
  salesman_ref: string;
  broker_ref: string;
  commission_type: string;
  bank_name: string;
  rtgs_details: string;
  tds_percent: string | number | null;
  tds_form_no: string;
  vat_date: string | null;
  vat_date_1: string | null;
  comp_id: string;
  visit_day: string;
  file_no: string;
  mill_code: string;
  transport: string;
  other_1: string;
  other_2: string;
}

export const emptyCustomer = (): Partial<CustomerRow> => ({
  customer_code: '',
  customer_name: '',
  customer_type: 'Company',
  status: 'Active',
  entities: [],
  primary_entity_id: null,
  primary_entity_code: '',
  primary_entity_name: '',
  contact_person: '',
  phone: '',
  mobile: '',
  fax: '',
  email: '',
  website: '',
  address_line_1: '',
  address_line_2: '',
  area: '',
  city: '',
  state: '',
  pincode: '',
  country: 'India',
  district: '',
  zone: '',
  std_code: '',
  pan_no: '',
  gst_no: '',
  vat_tin: '',
  cst_tin: '',
  licence_no: '',
  ecc: '',
  division: '',
  range: '',
  credit_days: 0,
  credit_limit: 0,
  opening_balance: 0,
  interest_rate: null,
  lower_rate: null,
  salesman_ref: '',
  broker_ref: '',
  commission_type: '',
  bank_name: '',
  rtgs_details: '',
  tds_percent: null,
  tds_form_no: '',
  vat_date: null,
  vat_date_1: null,
  comp_id: '',
  visit_day: '',
  file_no: '',
  mill_code: '',
  transport: '',
  other_1: '',
  other_2: '',
});

function qs(params: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return;
    sp.set(k, String(v));
  });
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export const CUSTOMER_LEDGER_KEY = 'ariav_customer_ledger';
export const CUSTOMER_360_KEY = 'ariav_customer_360';
export const CUSTOMER_LIST_FILTER_KEY = 'ariav_customer_list_filter';

export type LedgerEntryType = 'Invoice' | 'Payment' | 'Adjustment';

export interface CustomerLedgerEntry {
  date: string;
  type: LedgerEntryType | string;
  reference: string;
  source_id: number;
  debit_amount: string | number;
  credit_amount: string | number;
  running_balance: string | number;
}

export interface CustomerLedgerSummary {
  total_invoiced: string | number;
  total_paid: string | number;
  outstanding_balance: string | number;
  advance_credit_balance: string | number;
  overdue_amount: string | number;
}

export interface CustomerLedgerPayload {
  customer_id: number;
  customer_code: string;
  customer_name: string;
  date_from: string | null;
  date_to: string | null;
  opening_balance: string | number;
  summary: CustomerLedgerSummary;
  entries: CustomerLedgerEntry[];
}

export interface Customer360EntityLink {
  entity_id: number;
  short_code: string;
  entity_name: string;
  primary_entity: boolean;
}

export interface Customer360BasicInfo {
  customer_code: string;
  customer_name: string;
  customer_type: string;
  status: string;
  contact_person: string;
  phone: string;
  mobile: string;
  email: string;
  address_line_1: string;
  city: string;
  state: string;
  pincode: string;
  gst_no: string;
  pan_no: string;
  credit_days: number;
  credit_limit: string | number;
  entities: Customer360EntityLink[];
}

export interface Customer360History<T> {
  total_count: number;
  rows: T[];
}

export interface Customer360PurchaseRow {
  id: number;
  po_number: string;
  po_date: string;
  status: string;
  brand_name: string;
  entity_name: string;
  total_amount: string | number;
}

export interface Customer360DispatchRow {
  id: number;
  dispatch_date: string;
  lr_number: string;
  transporter: string;
  challan_reference: string;
  po_number: string;
  purchase_order_id: number;
}

export interface Customer360InvoiceRow {
  id: number;
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  status: string;
  display_status: string;
  is_overdue: boolean;
  net_amount: string | number;
  remaining_balance: string | number;
}

export interface Customer360PaymentRow {
  id: number;
  payment_number: string;
  payment_date: string;
  amount: string | number;
  unallocated_amount: string | number;
  payment_mode: string;
}

export interface Customer360TrendRow {
  rank: number;
  product_id: number;
  product_code: string;
  product_name: string;
  total_qty: string | number;
  total_value: string | number;
}

export interface Customer360Behaviour {
  average_days_to_pay: string | number | null;
  on_time_payment_rate: string | number | null;
  total_payment_count: number;
  paid_invoice_count: number;
}

export interface Customer360Payload {
  customer_id: number;
  date_from: string | null;
  date_to: string | null;
  basic_info: Customer360BasicInfo;
  outstanding: string | number;
  advance: string | number;
  overdue: string | number;
  summary: CustomerLedgerSummary;
  purchase_history: Customer360History<Customer360PurchaseRow>;
  dispatch_history: Customer360History<Customer360DispatchRow>;
  invoice_history: Customer360History<Customer360InvoiceRow>;
  payment_history: Customer360History<Customer360PaymentRow>;
  ledger_preview: CustomerLedgerEntry[];
  product_purchase_trends: Customer360TrendRow[];
  payment_behaviour: Customer360Behaviour;
}

export function readCustomerListFilter(): number | '' {
  const raw = sessionStorage.getItem(CUSTOMER_LIST_FILTER_KEY);
  if (!raw) return '';
  sessionStorage.removeItem(CUSTOMER_LIST_FILTER_KEY);
  const id = Number(raw);
  return id || '';
}

export function writeCustomerListFilter(id: number) {
  sessionStorage.setItem(CUSTOMER_LIST_FILTER_KEY, String(id));
}

export const customersApi = {
  list: (params: { status?: string; search?: string; entity_id?: number | string } = {}) =>
    request<CustomerRow[]>(`/api/customers/${qs(params)}`),
  retrieve: (id: number) => request<CustomerRow>(`/api/customers/${id}/`),
  ledger: (id: number, params: { from?: string; to?: string } = {}) =>
    request<CustomerLedgerPayload>(`/api/customers/${id}/ledger/${qs(params)}`),
  profile360: (id: number, params: { from?: string; to?: string } = {}) =>
    request<Customer360Payload>(`/api/customers/${id}/360/${qs(params)}`),
  ledgerPdf: async (id: number, params: { from?: string; to?: string } = {}): Promise<Blob> => {
    const token = localStorage.getItem('ariav_auth_token');
    const res = await fetch(apiUrl(`/api/customers/${id}/ledger/pdf/${qs(params)}`), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const error = new Error(
        (data as { detail?: string })?.detail || JSON.stringify(data) || `HTTP ${res.status}`,
      );
      (error as Error & { data: unknown; status: number }).data = data;
      (error as Error & { status: number }).status = res.status;
      throw error;
    }
    return res.blob();
  },
  advanceBalance: (id: number) =>
    request<{ customer_id: number; customer_code: string; advance_balance: string }>(
      `/api/customers/${id}/advance-balance/`,
    ),
  create: (body: unknown) => request<CustomerRow>('/api/customers/', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: number, body: unknown) =>
    request<CustomerRow>(`/api/customers/${id}/`, { method: 'PUT', body: JSON.stringify(body) }),
  deactivate: (id: number) => request<CustomerRow>(`/api/customers/${id}/`, { method: 'DELETE' }),
  removePermanent: (id: number) =>
    request<void>(`/api/customers/${id}/${qs({ permanent: 'true' })}`, { method: 'DELETE' }),
  reactivate: (id: number) =>
    request<CustomerRow>(`/api/customers/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'Active' }),
    }),
};
