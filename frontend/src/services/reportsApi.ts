/**
 * Live reports — /api/reports/
 */

import { apiUrl } from './apiBase';

async function request<T>(path: string): Promise<T> {
  const token = localStorage.getItem('ariav_auth_token');
  const res = await fetch(apiUrl(path), {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
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

export type ReportTab =
  | 'purchase-sales'
  | 'payment'
  | 'product'
  | 'seasonal'
  | 'bad-debt'
  | 'outstanding'
  | 'customer'
  | 'brand'
  | 'entity';

export interface ReportFilters {
  from: string;
  to: string;
  entityId: number | 'all';
}

function qs(filters: ReportFilters): string {
  const entity = filters.entityId === 'all' ? 'all' : String(filters.entityId);
  return `from=${encodeURIComponent(filters.from)}&to=${encodeURIComponent(filters.to)}&entity_id=${encodeURIComponent(entity)}`;
}

export interface ReportEnvelope<T> {
  from: string;
  to: string;
  entity_id: number | 'all';
  rows: T[];
  note?: string;
}

export interface PurchaseSalesRow {
  month: string;
  po_value: string;
  sales_value: string;
}

export interface PaymentTrendRow {
  month: string;
  payment_value: string;
}

export interface ProductMonthlyPoint {
  month: string;
  quantity: string;
  value: string;
}

export interface ProductTrendRow {
  product_id: number;
  product_code: string;
  product_name: string;
  total_value: string;
  monthly: ProductMonthlyPoint[];
}

export interface SeasonalRow {
  season: string;
  total_value: string;
}

export interface BadDebtRow {
  month: string;
  bad_debt: string;
}

export interface OutstandingRow {
  customer_id: number;
  customer_code: string;
  customer_name: string;
  entity_id: number | null;
  entity_short_code: string;
  entity_name: string;
  outstanding_balance: string;
  overdue_amount: string;
  oldest_overdue_days: number;
}

export interface CustomerPerfRow {
  customer_id: number;
  customer_code: string;
  customer_name: string;
  total_orders: number;
  total_invoiced: string;
  total_paid: string;
  average_days_to_pay: string | null;
  outstanding_balance: string;
}

export interface BrandPerfRow {
  brand_id: number;
  brand_code: string;
  brand_name: string;
  total_pos: number;
  total_dispatched_value: string;
  total_invoiced_value: string;
}

export interface EntityPerfRow {
  entity_id: number;
  short_code: string;
  entity_name: string;
  total_sales: string;
  total_orders: number;
  total_customers: number;
  total_outstanding: string;
  total_overdue: string;
}

export const reportsApi = {
  purchaseSales: (f: ReportFilters) =>
    request<ReportEnvelope<PurchaseSalesRow>>(`/api/reports/purchase-sales-trend/?${qs(f)}`),
  payment: (f: ReportFilters) =>
    request<ReportEnvelope<PaymentTrendRow>>(`/api/reports/payment-trend/?${qs(f)}`),
  product: (f: ReportFilters) =>
    request<ReportEnvelope<ProductTrendRow>>(`/api/reports/product-trend/?${qs(f)}`),
  seasonal: (f: ReportFilters) =>
    request<ReportEnvelope<SeasonalRow>>(`/api/reports/seasonal-trend/?${qs(f)}`),
  badDebt: (f: ReportFilters) =>
    request<ReportEnvelope<BadDebtRow>>(`/api/reports/bad-debt-trend/?${qs(f)}`),
  outstanding: (f: ReportFilters) =>
    request<ReportEnvelope<OutstandingRow>>(`/api/reports/outstanding-report/?${qs(f)}`),
  customer: (f: ReportFilters) =>
    request<ReportEnvelope<CustomerPerfRow>>(`/api/reports/customer-performance/?${qs(f)}`),
  brand: (f: ReportFilters) =>
    request<ReportEnvelope<BrandPerfRow>>(`/api/reports/brand-performance/?${qs(f)}`),
  entity: (f: ReportFilters) =>
    request<ReportEnvelope<EntityPerfRow>>(`/api/reports/entity-performance/?${qs(f)}`),
};
