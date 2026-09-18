/**
 * Category Master API — /api/categories/
 * Shared two-level Category → Subcategory list (not scoped to Brand).
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

export type CategoryStatus = 'Active' | 'Inactive';

export interface CategoryRow {
  id: number;
  category_code: string;
  category_name: string;
  parent_category_id: number | null;
  parent_category_code: string;
  parent_category_name: string;
  status: CategoryStatus;
  created_at?: string;
  updated_at?: string;
  created_by?: number | null;
  created_by_name?: string;
  children_count: number;
  active_children_count: number;
  active_product_count: number;
}

export interface CategoryTreeNode {
  id: number;
  category_code: string;
  category_name: string;
  parent_category_id: number | null;
  status: CategoryStatus;
  active_children_count: number;
  context_only?: boolean;
  children: CategoryTreeNode[];
}

export const emptyCategory = (): Partial<CategoryRow> => ({
  category_code: '',
  category_name: '',
  parent_category_id: null,
  status: 'Active',
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

export const categoriesApi = {
  list: (params: { status?: string; parent_category_id?: number | 'null'; search?: string } = {}) =>
    request<CategoryRow[]>(`/api/categories/${qs(params)}`),
  tree: (params: { status?: string } = {}) =>
    request<CategoryTreeNode[]>(`/api/categories/${qs({ ...params, tree: 1 })}`),
  retrieve: (id: number) => request<CategoryRow>(`/api/categories/${id}/`),
  create: (body: unknown) => request<CategoryRow>('/api/categories/', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: number, body: unknown) =>
    request<CategoryRow>(`/api/categories/${id}/`, { method: 'PUT', body: JSON.stringify(body) }),
  deactivate: (id: number) => request<CategoryRow>(`/api/categories/${id}/`, { method: 'DELETE' }),
  /** Hard delete — backend only allows this when status is already Inactive. */
  removePermanent: (id: number) =>
    request<void>(`/api/categories/${id}/${qs({ permanent: 'true' })}`, { method: 'DELETE' }),
  reactivate: (id: number) =>
    request<CategoryRow>(`/api/categories/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'Active' }),
    }),
};
