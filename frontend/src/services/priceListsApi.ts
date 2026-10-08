import { apiUrl } from './apiBase';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('ariav_auth_token');
  const res = await fetch(apiUrl(path), {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) },
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error((data as { detail?: string }).detail || JSON.stringify(data) || `HTTP ${res.status}`);
    (error as Error & { data: unknown; status: number }).data = data;
    (error as Error & { status: number }).status = res.status;
    throw error;
  }
  return data as T;
}

function qs(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => value !== undefined && value !== '' && search.set(key, String(value)));
  const value = search.toString();
  return value ? `?${value}` : '';
}

export type PriceListStatus = 'Draft' | 'Active' | 'Expired';
export type PriceBasis = 'Per Meter' | 'Per Taka';
export interface PriceListEntryRow {
  id?: number;
  product_id: number;
  product_code: string;
  product_name: string;
  brand_name: string;
  category_name: string;
  taka_length_meters: string | number;
  price_basis: PriceBasis;
  price_value: string | number;
  price_per_meter: string | number;
  price_per_taka: string | number;
  taka_quantity: number | null;
  status: 'Active' | 'Inactive';
}
export interface PriceListRow {
  id: number;
  brand_id: number;
  brand_name: string;
  season_label: string;
  valid_from: string;
  valid_to: string;
  status: PriceListStatus;
  entry_count: number;
  entries: PriceListEntryRow[];
  warning?: string;
}
export interface CurrentPriceRow {
  product_id: number;
  date: string;
  price: string | number;
  price_per_meter: string | number;
  price_per_taka: string | number | null;
  source: 'Price List' | 'Product';
  season_label: string;
  price_list_id: number | null;
}

export interface PriceListImportEntry {
  source_row: number;
  product_code: string;
  product_name: string;
  product_id: number;
  taka_length_meters: string | number;
  price_basis: PriceBasis;
  price_value: string | number;
  price_per_meter: string | number;
  price_per_taka: string | number;
  taka_quantity: string | number | null;
  status: 'Active' | 'Inactive';
}
export interface PriceListImportGroup {
  import_key: string;
  brand_code: string;
  brand_id: number;
  brand_name: string;
  season_label: string;
  valid_from: string;
  valid_to: string;
  entries: PriceListImportEntry[];
}
export interface PriceListImportExcluded {
  source_row: number;
  brand_code: string;
  product_code: string;
  reason: string;
}
export interface PriceListImportPreview {
  preview_token: string;
  importable: PriceListImportGroup[];
  excluded: PriceListImportExcluded[];
  warnings: string[];
}
export interface PriceListImportCommitResult {
  created_count: number;
  entry_count: number;
  excluded_count: number;
}

export const priceListsApi = {
  list: (params: { brand_id?: number; status?: string; season_label?: string; date_from?: string; date_to?: string } = {}) => request<PriceListRow[]>(`/api/price-lists/${qs(params)}`),
  retrieve: (id: number) => request<PriceListRow>(`/api/price-lists/${id}/`),
  create: (body: unknown) => request<PriceListRow>('/api/price-lists/', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: number, body: unknown) => request<PriceListRow>(`/api/price-lists/${id}/`, { method: 'PUT', body: JSON.stringify(body) }),
  remove: (id: number) => request<void>(`/api/price-lists/${id}/`, { method: 'DELETE' }),
  addEntry: (id: number, body: unknown) => request<PriceListEntryRow & { warning?: string }>(`/api/price-lists/${id}/entries/`, { method: 'POST', body: JSON.stringify(body) }),
  updateEntry: (id: number, entryId: number, body: unknown) => request<PriceListEntryRow>(`/api/price-lists/${id}/entries/${entryId}/`, { method: 'PUT', body: JSON.stringify(body) }),
  removeEntry: (id: number, entryId: number) => request<void>(`/api/price-lists/${id}/entries/${entryId}/`, { method: 'DELETE' }),
  currentPrice: (productId: number, date?: string) => request<CurrentPriceRow>(`/api/products/${productId}/current-price/${qs({ date })}`),
  importPreview: async (file: File) => {
    const token = localStorage.getItem('ariav_auth_token');
    const body = new FormData();
    body.append('file', file);
    const response = await fetch(apiUrl('/api/price-lists/import/preview/'), { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error((data as { detail?: string }).detail || JSON.stringify(data) || `HTTP ${response.status}`);
      (error as Error & { data: unknown; status: number }).data = data;
      (error as Error & { status: number }).status = response.status;
      throw error;
    }
    return data as PriceListImportPreview;
  },
  importCommit: (previewToken: string, groupKeys: string[]) => request<PriceListImportCommitResult>('/api/price-lists/import/commit/', { method: 'POST', body: JSON.stringify({ preview_token: previewToken, group_keys: groupKeys }) }),
};
