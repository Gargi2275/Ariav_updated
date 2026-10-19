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
  dispatched_meters?: string | number | null;
}

export interface DispatchRow {
  id: number;
  purchase_order_id: number;
  po_number: string;
  po_entity_code: string;
  po_entity_name: string;
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
  meters?: string | null;
}

export interface DispatchImportable {
  group_key: string;
  order_code: string;
  invoice_no: string;
  po_id: number;
  po_number: string;
  po_entity_code: string;
  po_entity_name: string;
  customer_code: string;
  customer_name: string;
  lr_number: string;
  lr_date: string;
  transporter: string;
  challan_reference: string;
  line_count: number;
  opening_pending_quantity: string | number;
  closing_pending_quantity: string | number;
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
  source_rows: number[];
}

export interface DispatchImportSkipped {
  reason: string;
  row_numbers: number[];
}

export interface DispatchImportPreview {
  preview_token: string;
  importable: DispatchImportable[];
  excluded: DispatchImportExcluded[];
  warnings: string[];
  skipped: DispatchImportSkipped[];
  format_id?: string;
  format_name?: string;
  counts?: { rows: number; importable: number; sample: number; excluded: number };
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

export interface ReconciliationShipment {
  dispatch_id: number;
  dispatch_line_id: number;
  invoice_number: string;
  dispatch_date: string;
  quantity: string;
  meters: string | null;
  source_rate: string | null;
  net_rate: string | null;
  lr_number: string;
  counted: boolean;
}

export interface ReconciliationRow {
  purchase_order_line_id: number;
  purchase_order_id: number;
  po_number: string;
  order_code: string;
  customer_code: string;
  customer_name: string;
  branch_code: string;
  branch_name: string;
  brand_code: string;
  brand_name: string;
  trade_name: string;
  product_code: string;
  ordered_quantity: string;
  dispatched_quantity: string;
  balance_quantity: string;
  excess_quantity: string;
  unit: string;
  po_rate: string | null;
  dispatch_rate: string | null;
  rate_mismatch: boolean;
  rate_note: string;
  po_value: string | null;
  dispatched_value: string | null;
  customer_delivery_date: string | null;
  delivery_status: string;
  delivery_note: string;
  status: string;
  reasons: string[];
  shipments: ReconciliationShipment[];
}

export interface ReconciliationReport {
  summary: {
    total: number;
    fully_dispatched: number;
    partially_dispatched: number;
    not_dispatched: number;
    excess_dispatched: number;
    unmatched: number;
    needs_review: number;
    rate_mismatches: number;
    overdue: number;
  };
  rows: ReconciliationRow[];
  statuses: string[];
  notes: string[];
}

export const dispatchesApi = {
  reconciliation: (params: {
    brand_id?: number;
    customer_id?: number;
    entity_id?: number | string;
    date_from?: string;
    date_to?: string;
    search?: string;
    status?: string;
    kam?: string;
  } = {}) => request<ReconciliationReport>(`/api/dispatches/reconciliation/${qs(params)}`),
  list: (params: {
    purchase_order_id?: number;
    entity_id?: number;
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
