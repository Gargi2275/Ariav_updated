/**
 * Brand Master API — /api/brands/
 * Mill/label commercial terms. Independent of Entity (no entity_id).
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

export const ORDER_METHODS = ['Digital PO', 'Manual/POR'] as const;
export type OrderMethod = (typeof ORDER_METHODS)[number];
export const COMMISSION_BASES = ['% of invoice value', '% of quantity', 'Fixed per order'] as const;
export type CommissionBasis = (typeof COMMISSION_BASES)[number];
export type BrandStatus = 'Active' | 'Inactive';

export interface BrandRow {
  id: number;
  brand_code: string;
  brand_name: string;
  status: BrandStatus;
  created_at?: string;
  updated_at?: string;
  created_by?: number | null;
  created_by_name?: string;
  contact_person: string;
  phone: string;
  mobile: string;
  email: string;
  address: string;
  gst_no: string;
  pan_no: string;
  commission_rate: string | number;
  commission_basis: CommissionBasis | string;
  payment_terms: string;
  credit_days: number;
  order_method: OrderMethod | string;
}

export const emptyBrand = (): Partial<BrandRow> => ({
  brand_code: '',
  brand_name: '',
  status: 'Active',
  contact_person: '',
  phone: '',
  mobile: '',
  email: '',
  address: '',
  gst_no: '',
  pan_no: '',
  commission_rate: 0,
  commission_basis: '% of invoice value',
  payment_terms: '',
  credit_days: 0,
  order_method: 'Digital PO',
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

export const brandsApi = {
  list: (params: { status?: string; search?: string } = {}) =>
    request<BrandRow[]>(`/api/brands/${qs(params)}`),
  retrieve: (id: number) => request<BrandRow>(`/api/brands/${id}/`),
  create: (body: unknown) => request<BrandRow>('/api/brands/', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: number, body: unknown) =>
    request<BrandRow>(`/api/brands/${id}/`, { method: 'PUT', body: JSON.stringify(body) }),
  deactivate: (id: number) => request<BrandRow>(`/api/brands/${id}/`, { method: 'DELETE' }),
  /** Hard delete — backend only allows this when status is already Inactive. */
  removePermanent: (id: number) =>
    request<void>(`/api/brands/${id}/${qs({ permanent: 'true' })}`, { method: 'DELETE' }),
  reactivate: (id: number) =>
    request<BrandRow>(`/api/brands/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'Active' }),
    }),
};
