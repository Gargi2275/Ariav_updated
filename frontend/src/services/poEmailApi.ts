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
    const body = data as { detail?: string; remaining?: number };
    const error = new Error(body.detail || `HTTP ${res.status}`);
    (error as Error & { data: unknown; status: number }).data = data;
    (error as Error & { status: number }).status = res.status;
    throw error;
  }
  return data as T;
}

export type EmailMode = 'off' | 'test' | 'live';
export type EmailBadge = 'queued' | 'sent' | 'failed' | 'unknown';

export interface EmailTransport {
  mode: EmailMode;
  configured: boolean;
  test_recipient: string;
  from_configured?: boolean;
  smtp_host?: string;
  smtp_port?: number;
  smtp_user?: string;
  from_email?: string;
}

export interface EmailSettings extends EmailTransport {
  enabled: boolean;
  from_name: string;
  reply_to_default: string;
  daily_cap: number;
  per_minute_cap: number;
  require_preview: boolean;
  after_send_status_action: 'none' | 'ask' | 'mark_sent_to_brand';
  smtp_password?: string;
}

export interface BrandEmailConfig {
  brand_id: number;
  to_addresses: string[];
  cc_addresses: string[];
  bcc_addresses: string[];
  subject_template: string;
  body_template: string;
  attach_pdf: boolean;
  include_rates: boolean;
  copy_label: string;
  require_preview: boolean | null;
  placeholders: string[];
}

export interface ComposeItem {
  po_id: number;
  po_number: string;
  status: string;
  sendable: boolean;
  subject: string;
  body: string;
  to: string[];
  cc: string[];
  bcc?: string[];
  attachment_name: string;
  attachment_bytes: number;
  include_rates: boolean;
  warnings: string[];
}

export interface ComposeResult extends EmailTransport {
  enabled: boolean;
  require_preview: boolean;
  items: ComposeItem[];
}

export interface SendResult extends EmailTransport {
  ask_status_update: boolean;
  marked_sent_to_brand: number[];
  rows: Array<{ id: number; po_id: number; po_number: string; status: string; idempotent: boolean }>;
}

export interface EmailHistoryRow {
  id: number;
  status: string;
  subject: string;
  body: string;
  to: string[];
  cc: string[];
  bcc?: string[];
  attachment_filename: string;
  attachment_sha256: string;
  attempts: number;
  last_error: string;
  sent_at: string | null;
  created_at: string;
  created_by: string;
  resend_reason: string;
  resend_of: number | null;
}

export const SENDABLE_PO_STATUSES = new Set([
  'Submitted',
  'Sent to Brand',
  'Brand Accepted',
  'Partially Dispatched',
  'Fully Dispatched',
]);

export function emailBadgeLabel(status?: string): string {
  if (status === 'queued') return 'Queued';
  if (status === 'sent') return 'Sent';
  if (status === 'failed') return 'Failed';
  if (status === 'unknown') return 'Unknown';
  return 'Not sent';
}

export const poEmailApi = {
  settings: () => request<EmailSettings>('/api/purchase-orders/email/settings/'),
  saveSettings: (body: Partial<EmailSettings>) => request<EmailSettings>('/api/purchase-orders/email/settings/', {
    method: 'PUT',
    body: JSON.stringify(body),
  }),
  connection: () => request<EmailTransport & { ok: boolean; detail: string }>('/api/purchase-orders/email/connection/', { method: 'POST', body: '{}' }),
  sendTest: () => request<{ detail: string }>('/api/purchase-orders/email/test/', { method: 'POST', body: '{}' }),
  brand: (brandId: number) => request<BrandEmailConfig>(`/api/purchase-orders/email/brands/${brandId}/`),
  saveBrand: (brandId: number, body: Partial<BrandEmailConfig>) => request<BrandEmailConfig>(`/api/purchase-orders/email/brands/${brandId}/`, {
    method: 'PUT',
    body: JSON.stringify(body),
  }),
  badges: () => request<EmailTransport & { statuses: Record<string, EmailBadge> }>('/api/purchase-orders/email/badges/'),
  compose: (poIds: number[]) => request<ComposeResult>('/api/purchase-orders/email/compose/', {
    method: 'POST',
    body: JSON.stringify({ po_ids: poIds }),
  }),
  send: (items: Array<Record<string, unknown>>) => request<SendResult>('/api/purchase-orders/email/send/', {
    method: 'POST',
    body: JSON.stringify({ items }),
  }),
  history: (poId: number) => request<EmailHistoryRow[]>(`/api/purchase-orders/${poId}/email/history/`),
  retry: (id: number) => request<{ id: number; status: string; attempts: number; last_error: string }>('/api/purchase-orders/email/retry/', {
    method: 'POST',
    body: JSON.stringify({ id }),
  }),
  async previewPdf(poId: number): Promise<Blob> {
    const token = localStorage.getItem('ariav_auth_token');
    const res = await fetch(apiUrl(`/api/purchase-orders/${poId}/email/preview-pdf/`), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error('Could not load the purchase order attachment.');
    return res.blob();
  },
};
