/**
 * In-app notifications — /api/notifications/
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

function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return;
    sp.set(k, String(v));
  });
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export const NOTIFICATION_TYPES = [
  'Upcoming Due',
  'Due Today',
  'Overdue',
  'Payment Confirmation',
  'PO Notification',
  'Dispatch Notification',
  'Admin Access Request',
] as const;

export const NOTIFICATION_STATUSES = ['Unread', 'Read', 'Dismissed'] as const;

export interface NotificationRow {
  id: number;
  notification_type: string;
  title: string;
  message: string;
  reference_type: string;
  reference_id: number;
  customer_id: number | null;
  customer_code: string;
  customer_name: string;
  entity_id: number | null;
  entity_code: string;
  recipient_user_id: number | null;
  status: string;
  channel: string;
  delivery_status: string;
  created_at: string;
  read_at: string | null;
}

export function relativeTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const sec = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000));
  if (sec < 60) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}

export const notificationsApi = {
  list: (params: {
    status?: string;
    notification_type?: string;
    entity_id?: number;
    customer_id?: number;
    unread_only?: boolean;
    date_from?: string;
    date_to?: string;
    search?: string;
  } = {}) => request<NotificationRow[]>(`/api/notifications/${qs(params)}`),
  unreadCount: () => request<{ unread_count: number }>('/api/notifications/unread-count/'),
  markRead: (id: number) =>
    request<NotificationRow>(`/api/notifications/${id}/mark-read/`, { method: 'POST' }),
  markAllRead: () =>
    request<{ updated: number; unread_count: number }>('/api/notifications/mark-all-read/', { method: 'POST' }),
  dismiss: (id: number) =>
    request<NotificationRow>(`/api/notifications/${id}/dismiss/`, { method: 'POST' }),
};
