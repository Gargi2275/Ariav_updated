/**
 * Client Invoices — /api/invoices/
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

export const INVOICE_STATUSES = [
  'Draft',
  'Issued',
  'Partially Paid',
  'Paid',
  'Overdue',
  'Cancelled',
  'Adjusted',
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const INVOICE_FROM_PO_KEY = 'ariav_create_invoice_po';
export const LEDGER_OPEN_INVOICE_KEY = 'ariav_ledger_open_invoice';

export interface InvoiceLineRow {
  id?: number;
  purchase_order_line_id: number;
  product_id: number | null;
  product_description: string;
  product_code: string;
  product_name: string;
  unit: string;
  quantity: string | number;
  rate: string | number;
  line_total: string | number;
  invoiceable_quantity?: string | number;
}

export interface InvoiceRow {
  id: number;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  entity_id: number;
  entity_code: string;
  entity_name: string;
  customer_id: number;
  customer_code: string;
  customer_name: string;
  purchase_order_id: number;
  po_number: string;
  brand_id: number;
  brand_code: string;
  brand_name: string;
  status: InvoiceStatus | string;
  display_status: string;
  is_overdue: boolean;
  discount_percent: string | number;
  discount_amount: string | number;
  tax_percent: string | number;
  tax_amount: string | number;
  other_charges: string | number;
  subtotal: string | number;
  net_amount: string | number;
  total_paid?: string | number;
  remaining_balance?: string | number;
  payment_allocations?: Array<{
    id: number;
    payment_id: number;
    payment_number: string;
    payment_date: string;
    payment_mode: string;
    allocated_amount: string | number;
  }>;
  payment_terms: string;
  remarks: string;
  lines: InvoiceLineRow[];
  created_at?: string;
  updated_at?: string;
  created_by_name?: string;
}

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() + (days || 0));
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

export const invoicesApi = {
  list: (params: {
    status?: string;
    entity_id?: number;
    customer_id?: number;
    purchase_order_id?: number;
    search?: string;
  } = {}) => request<InvoiceRow[]>(`/api/invoices/${qs(params)}`),
  retrieve: (id: number) => request<InvoiceRow>(`/api/invoices/${id}/`),
  create: (body: unknown) =>
    request<InvoiceRow>('/api/invoices/', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: number, body: unknown) =>
    request<InvoiceRow>(`/api/invoices/${id}/`, { method: 'PUT', body: JSON.stringify(body) }),
  issue: (id: number) =>
    request<InvoiceRow>(`/api/invoices/${id}/issue/`, { method: 'POST', body: JSON.stringify({}) }),
  changeStatus: (id: number, next: string) =>
    request<InvoiceRow>(`/api/invoices/${id}/status/`, {
      method: 'POST',
      body: JSON.stringify({ status: next }),
    }),
  remove: (id: number) =>
    request<void>(`/api/invoices/${id}/`, { method: 'DELETE' }),
  pdf: async (id: number): Promise<Blob> => {
    const token = localStorage.getItem('ariav_auth_token');
    const res = await fetch(apiUrl(`/api/invoices/${id}/pdf/`), {
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
};
