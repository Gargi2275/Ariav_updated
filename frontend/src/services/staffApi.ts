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

export interface StaffRow {
  id: number;
  username: string;
  display_name: string;
  email: string;
  operator_code: string;
  entity_id: number | null;
  entity_name: string;
  entity_code: string;
  is_active: boolean;
  login_bypass: boolean;
  password?: string;
  last_login: string | null;
}

export const emptyStaff = (): Partial<StaffRow> => ({
  username: '',
  display_name: '',
  email: '',
  operator_code: '',
  entity_id: null,
  is_active: true,
  login_bypass: false,
  password: '',
});

export const staffApi = {
  list: () => request<StaffRow[]>('/api/staff/'),
  create: (body: Partial<StaffRow>) => request<StaffRow>('/api/staff/', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: number, body: Partial<StaffRow>) => request<StaffRow>(`/api/staff/${id}/`, { method: 'PUT', body: JSON.stringify(body) }),
  deactivate: (id: number) => request<StaffRow>(`/api/staff/${id}/deactivate/`, { method: 'POST', body: '{}' }),
};
