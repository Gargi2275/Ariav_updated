/**
 * Live dashboards — /api/dashboards/
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

export interface DashboardKpis {
  total_sales: string;
  total_invoices: number;
  total_collections: string;
  total_outstanding: string;
  total_overdue: string;
  total_advance: string;
  unadjusted_payments: string;
  bad_debt: string;
  total_pos: number;
  pending_pos: number;
  dispatched_pos: number;
  partially_dispatched_pos: number;
  active_customers: number;
  active_brands: number;
  active_products: number;
  active_entities: number;
}

export interface EntityTurnoverRow {
  entity_id: number;
  short_code: string;
  entity_name: string;
  total_sales: string;
  percent: string;
}

export interface CategoryShareRow {
  category_name: string;
  quantity: string;
  percent: string;
}

export interface DebtorRow {
  customer_id: number;
  customer_code: string;
  customer_name: string;
  outstanding: string;
  credit_days: number;
  days_overdue: number;
  risk_band: string;
}

export interface TopProductRow {
  product_id: number;
  product_code: string;
  product_name: string;
  quantity: string;
}

export interface DashboardEntityOption {
  id: number;
  short_code: string;
  entity_name: string;
}

export interface SnapshotDashboard {
  kpis: DashboardKpis;
  entity_turnover: EntityTurnoverRow[];
  category_share: CategoryShareRow[];
  debtors: DebtorRow[];
  top_products: TopProductRow[];
  entities: DashboardEntityOption[];
}

export interface StaffPoRow {
  id: number;
  po_number: string;
  status: string;
  po_date: string;
  customer_name: string;
}

export interface StaffInvoiceRow {
  id: number;
  invoice_number: string;
  status: string;
  invoice_date: string;
  net_amount: string;
}

export interface StaffDispatchRow {
  id: number;
  lr_number: string;
  dispatch_date: string;
  po_number: string;
  transporter: string;
}

export interface StaffPaymentRow {
  id: number;
  payment_number: string;
  payment_date: string;
  amount: string;
  customer_name: string;
}

export interface StaffDashboard {
  kpis: {
    purchase_orders_created: number;
    pending_pos_created: number;
    pending_invoices_created: number;
    dispatches_recorded: number;
    payments_recorded: number;
  };
  recent_purchase_orders: StaffPoRow[];
  pending_purchase_orders: StaffPoRow[];
  pending_invoices: StaffInvoiceRow[];
  recent_dispatches: StaffDispatchRow[];
  recent_payments: StaffPaymentRow[];
}

export const dashboardsApi = {
  admin: (entityId?: number | 'all') => {
    const q = !entityId || entityId === 'all' ? 'all' : String(entityId);
    return request<SnapshotDashboard>(`/api/dashboards/admin/?entity_id=${encodeURIComponent(q)}`);
  },
  entity: (entityId?: number | 'all') => {
    const q = !entityId || entityId === 'all' ? 'all' : String(entityId);
    return request<SnapshotDashboard>(`/api/dashboards/entity/?entity_id=${encodeURIComponent(q)}`);
  },
  staff: () => request<StaffDashboard>('/api/dashboards/staff/'),
};
