/**
 * Dispatches — /api/dispatches/
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

export const OPEN_DISPATCH_KEY = 'ariav_open_dispatch';

export const DISPATCHABLE_PO_STATUSES = [
  'Brand Accepted',
  'Partially Dispatched',
  'Fully Dispatched',
] as const;

export function canRecordDispatch(status: string, pendingTotal?: number): boolean {
  if (!(DISPATCHABLE_PO_STATUSES as readonly string[]).includes(status)) return false;
  if (pendingTotal === undefined) return true;
  return pendingTotal > 0;
}

export interface DispatchLineRow {
  id?: number;
  purchase_order_line_id: number;
  dispatched_quantity: string | number;
  product_code: string;
  product_name: string;
  unit: string;
  ordered_quantity: string | number;
  total_dispatched: string | number;
  pending_quantity: string | number;
}

export interface DispatchRow {
  id: number;
  purchase_order_id: number;
  po_number: string;
  purchase_order_status: string;
  dispatch_date: string;
  lr_number: string;
  transporter: string;
  challan_reference: string;
  lines: DispatchLineRow[];
  created_at?: string;
  updated_at?: string;
  created_by_name?: string;
}

export interface DispatchImportLine {
  description: string;
  product_code: string;
  quantity: string;
  purchase_order_line_id: number;
  po_line_description: string;
}

export interface DispatchImportable {
  group_key: string;
  order_code: string;
  invoice_no: string;
  po_id: number;
  po_number: string;
  customer_code: string;
  customer_name: string;
  lr_number: string;
  lr_date: string;
  transporter: string;
  challan_reference: string;
  line_count: number;
  lines: DispatchImportLine[];
}

export interface DispatchImportExcluded {
  group_key: string;
  order_code: string;
  invoice_no: string;
  customer_code: string;
  customer_name: string;
  reason: string;
  line_count: number;
}

export interface DispatchImportPreview {
  preview_token: string;
  importable: DispatchImportable[];
  excluded: DispatchImportExcluded[];
  warnings: string[];
}

export interface DispatchImportCreated {
  id: number;
  po_id: number;
  po_number: string;
  po_status: string;
  lr_number: string;
  invoice_no: string;
  customer_name: string;
  line_count: number;
}

export interface DispatchImportCommitResult {
  created: DispatchImportCreated[];
  created_count: number;
  excluded: DispatchImportExcluded[];
  excluded_count: number;
  skipped_excluded_group_keys: string[];
}

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const dispatchesApi = {
  list: (params: {
    purchase_order_id?: number;
    date_from?: string;
    date_to?: string;
    transporter?: string;
    search?: string;
    customer_id?: number;
  } = {}) => request<DispatchRow[]>(`/api/dispatches/${qs(params)}`),
  retrieve: (id: number) => request<DispatchRow>(`/api/dispatches/${id}/`),
  create: (body: unknown) =>
    request<DispatchRow>('/api/dispatches/', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: number, body: unknown) =>
    request<DispatchRow>(`/api/dispatches/${id}/`, { method: 'PUT', body: JSON.stringify(body) }),
  remove: (id: number) =>
    request<void>(`/api/dispatches/${id}/`, { method: 'DELETE' }),
  importPreview: async (file: File): Promise<DispatchImportPreview> => {
    const token = localStorage.getItem('ariav_auth_token');
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(apiUrl('/api/dispatches/import/preview/'), {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const error = new Error(
        (data as { detail?: string })?.detail || JSON.stringify(data) || `HTTP ${res.status}`,
      );
      (error as Error & { data: unknown; status: number }).data = data;
      (error as Error & { status: number }).status = res.status;
      throw error;
    }
    return data as DispatchImportPreview;
  },
  importCommit: (args: { previewToken: string; groupKeys: string[] }) =>
    request<DispatchImportCommitResult>('/api/dispatches/import/commit/', {
      method: 'POST',
      body: JSON.stringify({
        preview_token: args.previewToken,
        group_keys: args.groupKeys,
      }),
    }),
};
