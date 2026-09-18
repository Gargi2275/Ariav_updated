/**
 * Masters CRUD client — Django DRF ViewSets under /api/masters/.
 */

import { apiUrl } from './apiBase';
import { parseApiError } from './apiError';

export function formatDrfError(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  return parseApiError(err, fallback);
}

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
    const error = new Error(formatDrfError({ data }, `HTTP ${res.status}`));
    (error as Error & { data: unknown; status: number }).data = data;
    (error as Error & { status: number }).status = res.status;
    throw error;
  }
  return data as T;
}

function unwrapList<T>(data: T[] | { results?: T[] }): T[] {
  if (Array.isArray(data)) return data;
  return data.results || [];
}

function resource(basePath: string) {
  const root = basePath.endsWith('/') ? basePath : `${basePath}/`;
  return {
    list: async <T>(query = '') => unwrapList<T>(await request<T[] | { results: T[] }>(`${root}${query}`)),
    retrieve: <T>(id: number | string) => request<T>(`${root}${id}/`),
    create: <T>(body: unknown) =>
      request<T>(root, { method: 'POST', body: JSON.stringify(body) }),
    update: <T>(id: number | string, body: unknown) =>
      request<T>(`${root}${id}/`, { method: 'PATCH', body: JSON.stringify(body) }),
    remove: (id: number | string) => request<void>(`${root}${id}/`, { method: 'DELETE' }),
  };
}

export const mastersApi = {
  items: resource('/api/masters/items/'),
  groups: resource('/api/masters/groups/'),
  parties: resource('/api/masters/parties/'),
  branches: resource('/api/masters/branches/'),
  parameters: resource('/api/masters/parameters/'),
  taxSlabs: resource('/api/masters/tax-slabs/'),
  brokers: resource('/api/masters/brokers/'),
  chartAccounts: {
    ...resource('/api/masters/chart-accounts/'),
    tree: () => request<ChartAccountNode[]>('/api/masters/chart-accounts/tree/'),
  },
};

export interface MasterItem {
  id: number;
  sku: string;
  description: string;
  group: number | null;
  group_name?: string;
  category: string;
  construction: string;
  width_inches: string | number;
  hsn: string;
  base_rate: string | number;
  packing_unit: string;
  stock_quantity: string | number;
  gst_percent: string | number;
  tax_slab: number | null;
  tax_slab_code?: string;
  mill_origin: string;
  is_active: boolean;
}

export interface MasterGroup {
  id: number;
  code: string;
  name: string;
  category: string;
  hsn_chapter: string;
  construction: string;
  gsm_range: string;
  avg_rate: string | number;
  is_active: boolean;
  sku_count: number;
}

export interface MasterParty {
  id: number;
  code: string;
  name: string;
  trade_name: string;
  group: string;
  city: string;
  state: string;
  gstin: string;
  pan: string;
  credit_limit: string | number;
  credit_days: number;
  broker: string;
  broker_ref: number | null;
  broker_name?: string;
  opening_balance: string | number;
  balance_type: string;
  is_active: boolean;
  linked_branch_ids: number[];
  linked_branch_names: string[];
}

export interface MasterBranchRow {
  id: number;
  code: string;
  name: string;
  city: string;
  gstin: string;
  address: string;
  phone: string;
  is_head_office: boolean;
  is_active: boolean;
}

export interface MasterParameter {
  id: number;
  category: string;
  code: string;
  name: string;
  value: string;
  notes: string;
  is_active: boolean;
}

export interface MasterTaxSlab {
  id: number;
  code: string;
  name: string;
  gst_percent: string | number;
  cgst_percent: string | number;
  sgst_percent: string | number;
  igst_percent: string | number;
  cess_percent: string | number;
  hsn_coverage: string;
  statutory_notification: string;
  effective_from: string | null;
  rcm_applicable: boolean;
  is_active: boolean;
}

export interface MasterBroker {
  id: number;
  code: string;
  name: string;
  firm_name: string;
  commission_rate: string | number;
  pan: string;
  mobile: string;
  city: string;
  is_active: boolean;
  linked_parties_count: number;
  linked_parties: string[];
}

export interface ChartAccountNode {
  id: number;
  code: string;
  name: string;
  account_type: string;
  nature: string;
  parent: number | null;
  parent_code?: string;
  parent_name?: string;
  is_group: boolean;
  opening_balance: string | number;
  is_active: boolean;
  sort_order?: number;
  children_count?: number;
  children?: ChartAccountNode[];
}

export function num(value: string | number | null | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
