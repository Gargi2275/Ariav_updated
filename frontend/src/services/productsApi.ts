/**
 * Product Catalogue API — /api/products/
 * Brand + subcategory required. Multipart for image upload.
 */

import { apiUrl } from './apiBase';

async function parse<T>(res: Response): Promise<T> {
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

function authHeaders(json: boolean): HeadersInit {
  const token = localStorage.getItem('ariav_auth_token');
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export const PRODUCT_UNITS = ['Meter', 'Piece', 'Kg', 'Taka', 'Roll'] as const;
export type ProductUnit = (typeof PRODUCT_UNITS)[number];
export const PRODUCT_AVAILABILITY = ['In Stock', 'Out of Stock', 'Discontinued'] as const;
export type ProductAvailability = (typeof PRODUCT_AVAILABILITY)[number];
export type ProductStatus = 'Active' | 'Inactive';

export interface ProductRow {
  id: number;
  product_code: string;
  product_name: string;
  brand_id: number;
  brand_code: string;
  brand_name: string;
  category_id: number;
  category_code: string;
  category_name: string;
  parent_category_id: number | null;
  parent_category_code: string;
  parent_category_name: string;
  print_name: string;
  description: string;
  design: string;
  colour: string;
  quality: string;
  width_size: string;
  product_type: string;
  group: string;
  unit: ProductUnit | string;
  rate: string | number;
  frate: string | number | null;
  trate: string | number | null;
  season: string;
  collection: string;
  image?: string | null;
  image_url: string;
  availability: ProductAvailability | string;
  status: ProductStatus;
  created_at?: string;
  updated_at?: string;
  created_by?: number | null;
  created_by_name?: string;
  /** Purchase-order lines using this product; only present when listed with `with_usage: 1`. */
  usage_count?: number | null;
}

export const emptyProduct = (): Partial<ProductRow> => ({
  product_code: '',
  product_name: '',
  brand_id: undefined,
  category_id: undefined,
  parent_category_id: null,
  print_name: '',
  description: '',
  design: '',
  colour: '',
  quality: '',
  width_size: '',
  product_type: '',
  group: '',
  unit: 'Meter',
  rate: 0,
  frate: null,
  trate: null,
  season: '',
  collection: '',
  image_url: '',
  availability: 'In Stock',
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

export function toProductFormData(body: Record<string, unknown>, file?: File | null): FormData {
  const fd = new FormData();
  Object.entries(body).forEach(([k, v]) => {
    if (v === undefined) return;
    if (v === null) {
      fd.append(k, '');
      return;
    }
    fd.append(k, String(v));
  });
  if (file) fd.append('image', file);
  return fd;
}

export const productsApi = {
  list: (params: {
    status?: string;
    brand_id?: number;
    category_id?: number;
    availability?: string;
    search?: string;
    with_usage?: 1;
  } = {}) =>
    fetch(apiUrl(`/api/products/${qs(params)}`), { headers: authHeaders(true) }).then(r => parse<ProductRow[]>(r)),
  retrieve: (id: number) =>
    fetch(apiUrl(`/api/products/${id}/`), { headers: authHeaders(true) }).then(r => parse<ProductRow>(r)),
  create: (fd: FormData) =>
    fetch(apiUrl('/api/products/'), { method: 'POST', headers: authHeaders(false), body: fd }).then(r => parse<ProductRow>(r)),
  update: (id: number, fd: FormData) =>
    fetch(apiUrl(`/api/products/${id}/`), { method: 'PUT', headers: authHeaders(false), body: fd }).then(r => parse<ProductRow>(r)),
  deactivate: (id: number) =>
    fetch(apiUrl(`/api/products/${id}/`), { method: 'DELETE', headers: authHeaders(true) }).then(r => parse<ProductRow>(r)),
};
