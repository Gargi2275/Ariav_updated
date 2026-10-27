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
  quantity_unit?: 'Pieces' | 'Meters' | string;
  shade?: string;
  size?: string;
  delivery_from?: string | null;
  delivery_to?: string | null;
  line_remarks?: string;
  form_row_no?: number | null;
  quantity: string | number;
  rate: string | number | null;
  line_total: string | number | null;
  total_dispatched?: string | number;
  pending_quantity?: string | number;
  total_invoiced?: string | number;
  invoiceable_quantity?: string | number;
  expected_delivery_period?: string;
  customer_delivery_date?: string | null;
  extra_data?: Record<string, unknown>;
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
  place?: string;
  mode_of_despatch?: string;
  destination?: string;
  documents_through?: string;
  special_instructions?: string;
  print_profile?: string;
  print_copies?: { id: string; label: string }[];
  status: POStatus | string;
  remarks: string;
  source_format?: string;
  extra_data?: Record<string, unknown>;
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
  place: '',
  mode_of_despatch: '',
  destination: '',
  documents_through: '',
  special_instructions: '',
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
  rate: string | number | null;
  row_number?: number;
  expected_delivery_period?: string;
  customer_delivery_date?: string | null;
  extra_data?: Record<string, unknown>;
}

export interface PoImportable {
  order_no: string;
  customer_code: string;
  customer_name: string;
  matched_customer_id: number;
  line_count: number;
  lines: PoImportLine[];
  po_date?: string;
  remarks?: string;
  extra_data?: Record<string, unknown>;
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
  preview_id: string;
  entity_id: number;
  brand_id: number;
  importable: PoImportable[];
  excluded: PoImportExcluded[];
  warnings: string[];
  errors: string[];
  format_id: string;
  format_name: string;
  allowed_formats: { id: string; name: string }[];
  unmatched_parties: PoImportUnmatchedParty[];
}

export interface PoImportSuggestedParty {
  id: number;
  code: string;
  name: string;
  city: string;
  why: string;
}

export interface PoImportUnmatchedParty {
  code: string;
  name: string;
  city: string;
  state: string;
  address: string;
  gst: string;
  po_count: number;
  line_count: number;
  order_nos: string[];
  suggested_matches: PoImportSuggestedParty[];
  exists_in_branches: { code: string; name: string }[];
  existing_party_id: number | null;
  existing_party_name: string;
}

export interface PoImportCommitResult {
  created: { id: number; po_number: string; customer_id: number; line_count: number }[];
  created_count: number;
  excluded: PoImportExcluded[];
  excluded_count: number;
  skipped_excluded_order_nos: string[];
  parties_created: { id: number; code: string; name: string; branches: { code: string; name: string }[] }[];
  parties_mapped: { source_code: string; id: number; code: string; name: string }[];
  parties_linked: { source_code: string; id: number; code: string; name: string; branch: { code: string; name: string } }[];
  parties_linked_count: number;
}

export interface FormQuality {
  quality_code: string;
  quality_label: string;
  shades: string[];
  price: string | null;
  ex_mill?: string | null;
  wholesale?: string | null;
  retail?: string | null;
  collection?: string;
  product_id: number | null;
  product_code: string;
  product_name: string;
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
    date_from?: string;
    date_to?: string;
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
    formatId?: string;
  }): Promise<PoImportPreview> => {
    const token = localStorage.getItem('ariav_auth_token');
    const fd = new FormData();
    fd.append('entity_id', String(args.entityId));
    fd.append('brand_id', String(args.brandId));
    fd.append('file', args.file);
    if (args.formatId) fd.append('format_id', args.formatId);
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
    decisions: Record<string, Record<string, unknown>>;
  }) =>
    request<PoImportCommitResult>('/api/purchase-orders/import/commit/', {
      method: 'POST',
      body: JSON.stringify({
        preview_token: args.previewToken,
        entity_id: args.entityId,
        brand_id: args.brandId,
        order_nos: args.orderNos,
        decisions: args.decisions,
      }),
    }),
  nextNumber: (entityId: number, brandId: number) =>
    request<{ po_number: string }>(`/api/purchase-orders/next-number/${qs({ entity_id: entityId, brand_id: brandId })}`),
  formQualities: (brandId: number, q = '') =>
    request<FormQuality[]>(`/api/purchase-orders/form-qualities/${qs({ brand_id: brandId, q })}`),
  pdf: async (id: number, params: { form?: boolean; copy?: string; blank?: boolean } = {}): Promise<Blob> => {
    const token = localStorage.getItem('ariav_auth_token');
    const res = await fetch(apiUrl(`/api/purchase-orders/${id}/pdf/${qs({
      form: params.form ? 1 : undefined,
      copy: params.copy,
      blank: params.blank ? 1 : undefined,
    })}`), {
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
  ocmOfficialList: async (params: { search?: string; status?: string; unresolved?: boolean } = {}) => {
    const body = await request<{ orders?: Record<string, unknown>[]; total?: number } | Record<string, unknown>[]>(
      `/api/purchase-orders/ocm-official/${qs({
        search: params.search || undefined,
        status: params.status || undefined,
        unresolved: params.unresolved ? '1' : undefined,
      })}`,
    );
    if (Array.isArray(body)) return { orders: body, total: body.length };
    return { orders: body.orders || [], total: body.total ?? (body.orders || []).length };
  },
  ocmOfficialImport: async (file: File) => {
    const token = localStorage.getItem('ariav_auth_token');
    const body = new FormData();
    body.append('file', file);
    const res = await fetch(apiUrl('/api/purchase-orders/ocm-official/'), {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const body = data as { detail?: string; file?: string; rows?: { row: number; reason: string }[] };
      const rowText = Array.isArray(body.rows)
        ? body.rows.map((row) => `Row ${row.row}: ${row.reason}`).join(' ')
        : '';
      const error = new Error(body.file || (typeof body.detail === 'string' ? body.detail : '') || rowText || `HTTP ${res.status}`);
      (error as Error & { data: unknown; status: number }).data = data;
      (error as Error & { status: number }).status = res.status;
      throw error;
    }
    return data as { duplicate_file: boolean; orders: Record<string, unknown>[]; row_errors: { row: number; reason: string }[] };
  },
  ocmOfficialDetail: (id: number) => request<Record<string, unknown>>(`/api/purchase-orders/ocm-official/${id}/`),
  ocmOfficialSelect: (id: number, purchaseOrderId: number) =>
    request<Record<string, unknown>>(`/api/purchase-orders/ocm-official/${id}/select/`, {
      method: 'POST',
      body: JSON.stringify({ purchase_order_id: purchaseOrderId }),
    }),
  ocmOfficialMapping: (id: number, body: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/api/purchase-orders/ocm-official/${id}/mapping/`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  ocmOfficialApprove: (id: number, reason: string) =>
    request<Record<string, unknown>>(`/api/purchase-orders/ocm-official/${id}/approve/`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  ocmOfficialDelete: (ids: number[], allUnapproved = false) =>
    request<{
      deleted: { id: number; order_number: string }[];
      deleted_count: number;
      blocked: { id: number; order_number: string; reason: string }[];
      missing: number[];
      remaining: number;
    }>('/api/purchase-orders/ocm-official/delete/', {
      method: 'POST',
      body: JSON.stringify(allUnapproved ? { all_unapproved: true } : { ids }),
    }),
};
