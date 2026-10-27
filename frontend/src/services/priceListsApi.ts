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
  valid_to: string | null;
  status: PriceListStatus;
  revision_label?: string;
  season_name?: string;
  season_year?: number | null;
  source_filename?: string;
  tax_note?: string;
  unit_text?: string;
  packing_note?: string;
  entry_count: number;
  quality_entry_count?: number;
  brand_quality_count?: number;
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
  year: number;
  season: 'Summer' | 'Winter';
  season_label: string;
  valid_from: string;
  valid_to: string;
  importable: PriceListImportGroup[];
  excluded: PriceListImportExcluded[];
  warnings: string[];
}
export interface PriceListImportCommitResult {
  created_count: number;
  entry_count: number;
  excluded_count: number;
}
export interface QualityPriceFlag { severity: 'error' | 'warning' | 'info'; code: string; message: string; }
export interface QualityPriceEntry {
  source_row: number;
  source_page: number | null;
  collection_name: string;
  collection_code: string;
  serial_no: number | null;
  quality_no: string;
  shades_raw: string;
  shade_tokens: string[];
  delivery_raw: string;
  delivery_month: number | null;
  ex_mill: string | null;
  wholesale: string | null;
  retail: string | null;
  flags: QualityPriceFlag[];
  raw_values: Record<string, string>;
}
export interface QualityPricePreview {
  preview_token: string;
  format_id: string;
  title: string;
  season: 'Summer' | 'Winter';
  year: number;
  valid_from: string;
  valid_to: string;
  entries: QualityPriceEntry[];
  collections: { code: string; name: string; count: number }[];
  skipped_lines: Record<string, number>;
  unrecognized_columns: { header: string; non_empty_cells: number }[];
  flagged_counts: Record<'error' | 'warning' | 'info', number>;
  warnings: { code: string; message: string; count: number; examples: number[] }[];
  unit_text: string;
  header_rows: number[];
  detected_columns: { column: number; header: string; field: string | null }[];
  hidden_data: { rows: number[]; columns: string[]; sheets: string[] };
  warning_summary: { code: string; message: string; count: number; examples: number[] }[];
  error_summary: { code: string; message: string; count: number; examples: number[] }[];
  info_summary: { code: string; message: string; count: number; examples: number[] }[];
  reconciliation: { rows_read: number; imported: number; excluded: number; skipped: number; skipped_by_kind: Record<string, number> };
}
export interface OsmPdfEntry {
  sr_no: number;
  source_page: number;
  quality_code: string;
  quality_prefix: string;
  quality_number: string;
  ex_mill: string | null;
  wholesale: string | null;
  retail: string | null;
  discount_percent: string | null;
  discount_min_meters: string | null;
  discount_note: string;
  collection_name?: string;
  collection_code?: string;
  shades_raw?: string;
  delivery_raw?: string;
}
export interface OsmPdfPreview {
  preview_token: string;
  format_id: 'osm_pdf_pricelist';
  title: string;
  season: 'Summer' | 'Winter';
  year: number;
  valid_from: string;
  valid_to: null;
  unit_text: string;
  tax_note: string;
  packing_note: string;
  revision_label: string;
  row_count: number;
  entries: OsmPdfEntry[];
  flagged_counts: Record<'error' | 'warning' | 'info', number>;
  warnings: { code: string; message: string }[];
}
export interface QualityPriceRow extends QualityPriceEntry {
  id: number;
  shades: string[];
  review_status: string;
  product_code?: string;
  product_name?: string;
  discount_percent?: string;
  discount_note?: string;
  unit_text?: string;
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
  qualityEntries: (id: number, search?: string) => request<QualityPriceRow[]>(`/api/price-lists/${id}/quality-entries/${qs({ search })}`),
  downloadQualityEntries: async (id: number) => {
    const token = localStorage.getItem('ariav_auth_token');
    const response = await fetch(apiUrl(`/api/price-lists/${id}/quality-entries/export/`), { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!response.ok) throw new Error('Could not export quality prices.');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `quality-prices-${id}.xlsx`;
    link.click();
    URL.revokeObjectURL(url);
  },
  importPreview: async (file: File, year: number, season: 'Summer' | 'Winter', branchId: number, brandId: number, formatId?: string) => {
    const token = localStorage.getItem('ariav_auth_token');
    const body = new FormData();
    body.append('file', file);
    body.append('year', String(year));
    body.append('season', season);
    body.append('branch_id', String(branchId));
    body.append('brand_id', String(brandId));
    if (formatId) body.append('format_id', formatId);
    const response = await fetch(apiUrl('/api/price-lists/import/preview/'), { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error((data as { detail?: string }).detail || JSON.stringify(data) || `HTTP ${response.status}`);
      (error as Error & { data: unknown; status: number }).data = data;
      (error as Error & { status: number }).status = response.status;
      throw error;
    }
    return data as PriceListImportPreview | QualityPricePreview | OsmPdfPreview;
  },
  importCommit: (previewToken: string, groupKeys: string[], year: number, season: 'Summer' | 'Winter', branchId: number, brandId: number, formatId?: string, confirmedWarnings?: boolean) => request<PriceListImportCommitResult & { price_list_id?: number; rows_imported?: number; products_created?: number; products_updated?: number }>('/api/price-lists/import/commit/', { method: 'POST', body: JSON.stringify({ preview_token: previewToken, group_keys: groupKeys, year, season, branch_id: branchId, brand_id: brandId, ...(formatId ? { format_id: formatId, confirmed_warnings: confirmedWarnings } : {}) }) }),
};
