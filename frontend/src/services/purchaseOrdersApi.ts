/**
 * Purchase Orders â€” Digital PO and Manual/POR â€” /api/purchase-orders/
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

export const OPEN_PO_KEY = 'ariav_open_purchase_order';

export const PO_STATUSES = [
  'Draft',
  'Submitted',
  'Sent to Brand',
  'Brand Accepted',
  'Partially Dispatched',
  'Fully Dispatched',
  'Closed',
  'Rejected',
  'Cancelled',
  'On Hold',
] as const;
export type POStatus = (typeof PO_STATUSES)[number];

export interface PurchaseOrderLineRow {
  id?: number;
  product_id: number | null;
  product_description: string;
  product_code: string;
  product_name: string;
  unit: string;
  quantity: string | number;
  rate: string | number | null;
  line_total: string | number | null;
  total_dispatched?: string | number;
  pending_quantity?: string | number;
  total_invoiced?: string | number;
  invoiceable_quantity?: string | number;
}

export type POOrderType = 'Digital' | 'Manual';

export interface PurchaseOrderRow {
  id: number;
  po_number: string;
  brand_order_code: string | null;
  order_type: POOrderType | string;
  entity_id: number;
  entity_code: string;
  entity_name: string;
  customer_id: number;
  customer_code: string;
  customer_name: string;
  brand_id: number;
  brand_code: string;
  brand_name: string;
  po_date: string;
  status: POStatus | string;
  remarks: string;
  handy_form_upload?: string | null;
  handy_form_url: string;
  lines: PurchaseOrderLineRow[];
  total_quantity: string | number;
  total_amount: string | number;
  priced_lines: number;
  unpriced_lines: number;
  has_unpriced_lines: boolean;
  dispatch_progress?: string;
  financial_status?: 'Pending' | 'Clear' | string;
  dispatched_amount?: string | number;
  invoiced_amount?: string | number;
  paid_amount?: string | number;
  debit_amount?: string | number;
  credit_amount?: string | number;
  created_at?: string;
  updated_at?: string;
  created_by?: number | null;
  created_by_name?: string;
  allowed_transitions: string[];
}

export interface PipelineSummary {
  type_counts: Record<string, number>;
  statuses: Record<string, { count: number; total_amount: string }>;
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const emptyPurchaseOrder = (): Partial<PurchaseOrderRow> => ({
  po_number: '',
  brand_order_code: '',
  entity_id: undefined,
  customer_id: undefined,
  brand_id: undefined,
  po_date: todayIso(),
  remarks: '',
  lines: [],
  status: 'Draft',
  order_type: 'Digital',
  handy_form_url: '',
});

function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return;
    sp.set(k, String(v));
  });
  const s = sp.toString();
  return s ? `?${s}` : '';
}

async function sendPo(id: number | undefined, body: Record<string, unknown>, file?: File | null) {
  const token = localStorage.getItem('ariav_auth_token');
  const path = id ? `/api/purchase-orders/${id}/` : '/api/purchase-orders/';
  const method = id ? 'PUT' : 'POST';
  if (file) {
    const fd = new FormData();
    Object.entries(body).forEach(([k, v]) => {
      if (v === undefined) return;
      if (k === 'lines') {
        fd.append('lines', JSON.stringify(v));
        return;
      }
      if (v === null) {
        fd.append(k, '');
        return;
      }
      fd.append(k, String(v));
    });
    fd.append('handy_form_upload', file);
    const res = await fetch(apiUrl(path), {
      method,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    });
    if (res.status === 204) return undefined as PurchaseOrderRow;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const error = new Error(
        (data as { detail?: string })?.detail || JSON.stringify(data) || `HTTP ${res.status}`,
      );
      (error as Error & { data: unknown; status: number }).data = data;
      (error as Error & { status: number }).status = res.status;
      throw error;
    }
    return data as PurchaseOrderRow;
  }
  return request<PurchaseOrderRow>(path, { method, body: JSON.stringify(body) });
}

export interface PoImportLine {
  description: string;
  quantity: string | number;
  rate: null;
}

export interface PoImportable {
  order_no: string;
  customer_code: string;
  customer_name: string;
  matched_customer_id: number;
  line_count: number;
  lines: PoImportLine[];
}

export interface PoImportExcluded {
  order_no: string;
  customer_code: string;
  customer_name: string;
  reason: string;
  line_count: number;
}

export interface PoImportPreview {
  preview_token: string;
  entity_id: number;
  brand_id: number;
  importable: PoImportable[];
  excluded: PoImportExcluded[];
  warnings: string[];
}

export interface PoImportCommitResult {
  created: { id: number; po_number: string; customer_id: number; line_count: number }[];
  created_count: number;
  excluded: PoImportExcluded[];
  excluded_count: number;
  skipped_excluded_order_nos: string[];
}

export const purchaseOrdersApi = {
  list: (params: {
    status?: string;
    entity_id?: number;
    customer_id?: number;
    brand_id?: number;
    order_type?: string;
    search?: string;
    limit?: number;
    offset?: number;
    has_unpriced?: boolean;
  } = {}) => request<PurchaseOrderRow[]>(`/api/purchase-orders/${qs(params)}`),
  retrieve: (id: number) => request<PurchaseOrderRow>(`/api/purchase-orders/${id}/`),
  create: (body: Record<string, unknown>, file?: File | null) =>
    sendPo(undefined, body, file),
  update: (id: number, body: Record<string, unknown>, file?: File | null) =>
    sendPo(id, body, file),
  submit: (id: number) =>
    request<PurchaseOrderRow>(`/api/purchase-orders/${id}/submit/`, { method: 'POST', body: JSON.stringify({}) }),
  changeStatus: (id: number, next: string) =>
    request<PurchaseOrderRow>(`/api/purchase-orders/${id}/status/`, {
      method: 'POST',
      body: JSON.stringify({ status: next }),
    }),
  setRate: (id: number, lineId: number, rate: string | number) =>
    request<PurchaseOrderRow>(`/api/purchase-orders/${id}/lines/${lineId}/set-rate/`, {
      method: 'POST',
      body: JSON.stringify({ rate }),
    }),
  pipelineSummary: (params: {
    entity_id?: number;
    customer_id?: number;
    brand_id?: number;
    order_type?: string;
    search?: string;
    has_unpriced?: boolean;
  } = {}) => request<PipelineSummary>(`/api/purchase-orders/pipeline-summary/${qs(params)}`),
  remove: (id: number) =>
    request<void>(`/api/purchase-orders/${id}/`, { method: 'DELETE' }),
  importPreview: async (args: {
    entityId: number;
    brandId: number;
    file: File;
  }): Promise<PoImportPreview> => {
    const token = localStorage.getItem('ariav_auth_token');
    const fd = new FormData();
    fd.append('entity_id', String(args.entityId));
    fd.append('brand_id', String(args.brandId));
    fd.append('file', args.file);
    const res = await fetch(apiUrl('/api/purchase-orders/import/preview/'), {
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
    return data as PoImportPreview;
  },
  importCommit: (args: {
    previewToken: string;
    entityId: number;
    brandId: number;
    orderNos: string[];
  }) =>
    request<PoImportCommitResult>('/api/purchase-orders/import/commit/', {
      method: 'POST',
      body: JSON.stringify({
        preview_token: args.previewToken,
        entity_id: args.entityId,
        brand_id: args.brandId,
        order_nos: args.orderNos,
      }),
    }),
  pdf: async (id: number): Promise<Blob> => {
    const token = localStorage.getItem('ariav_auth_token');
    const res = await fetch(apiUrl(`/api/purchase-orders/${id}/pdf/`), {
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
  dispatchExcel: async (id: number): Promise<Blob> => {
    const token = localStorage.getItem('ariav_auth_token');
    const res = await fetch(apiUrl(`/api/purchase-orders/${id}/dispatch-excel/`), {
      headers: token ? { Authorization: 'Bearer ' + token } : {},
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(
        (data as { detail?: string })?.detail || JSON.stringify(data) || `HTTP ${res.status}`,
      );
    }
    return res.blob();
  },
};
