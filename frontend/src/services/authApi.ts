/**
 * Auth API client — Django / MySQL backend.
 */

import { apiUrl } from './apiBase';
import { markSessionAuthenticated } from './sessionExpiry';

function persistAuthSession(
  data: {
    token?: string;
    role?: string;
    user?: { name?: string; role?: string };
  },
  fallbackRole: 'admin' | 'operator',
) {
  if (data.token) localStorage.setItem('ariav_auth_token', data.token);
  markSessionAuthenticated();
  const raw = data.user?.role || data.role || fallbackRole;
  const role = raw === 'admin' ? 'admin' : 'operator';
  localStorage.setItem('ariav_auth_role', role);
  if (data.user?.name) localStorage.setItem('ariav_auth_name', data.user.name);
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('ariav_auth_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export interface PythonHealthInfo {
  status: string;
  service: string;
  timestamp: string;
}

export interface CheckCredentialsResponse {
  success: boolean;
  user_type?: 'admin' | 'user';
  role?: 'admin' | 'operator' | 'user';
  message?: string;
  temp_token?: string;
  username?: string;
  masked_username?: string;
  name?: string;
  operator_code?: string;
  operatorCode?: string;
  branch?: string;
  locked?: boolean;
  lockout_remaining_seconds?: number;
  error?: string;
}

export interface VerifyPinResponse {
  success: boolean;
  token?: string;
  role?: 'admin';
  user?: {
    id: string;
    name: string;
    email: string;
    role: string;
    branch: string;
  };
  expires_at?: number;
  message?: string;
  error?: string;
  locked?: boolean;
  lockout_remaining_seconds?: number;
  failed_attempts?: number;
  remaining_attempts?: number;
}

export interface OperatorRequestResponse {
  success: boolean;
  requestId?: string;
  request_id?: string;
  request?: {
    id: string;
    timestamp: string;
    status: 'pending' | 'approved' | 'rejected' | 'completed' | 'expired';
  };
  message?: string;
  error?: string;
}

export interface AdminQueueItem {
  id: string;
  operator_code: string;
  operator_name: string;
  branch: string;
  terminal_ip: string;
  action_requested: string;
  timestamp: string;
  status: 'pending' | 'approved' | 'rejected' | 'completed' | 'expired';
  expires_at?: number;
  seconds_remaining?: number;
  created_at: number;
}

type OperatorRequestPayload = {
  username?: string;
  operatorCode?: string;
  operatorName?: string;
  branch?: string;
  actionRequested?: string;
  terminalIp?: string;
};

async function postOperatorRequest(payload: OperatorRequestPayload, fallbackError: string): Promise<OperatorRequestResponse> {
  try {
    const res = await fetch(apiUrl('/api/login/'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return await res.json();
  } catch (e: any) {
    return { success: false, error: e.message || fallbackError };
  }
}

export const authApi = {
  // Backend liveness only (no counts)
  async getHealth(): Promise<PythonHealthInfo | null> {
    try {
      const res = await fetch(apiUrl('/api/auth/health'));
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      console.warn('Auth API ping failed:', e);
      return null;
    }
  },

  // Step 1: Credentials check (Username + Password)
  async checkCredentials(username: string, password: string): Promise<CheckCredentialsResponse> {
    try {
      const res = await fetch(apiUrl('/api/check-credentials/'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      return data;
    } catch (e: any) {
      return { success: false, error: e.message || 'Network connection failed' };
    }
  },

  // Step 2: 6-digit Master PIN. Requires the temp_token from step 1.
  async verifyAdminPin(payload: { username?: string; pin: string; temp_token: string }): Promise<VerifyPinResponse> {
    try {
      const res = await fetch(apiUrl('/api/admin-login/'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok && data.success && data.token) {
        persistAuthSession(data, 'admin');
      }
      return data;
    } catch (e: any) {
      return { success: false, error: e.message || 'PIN verification failed' };
    }
  },

  // Signed-in admin changes their own PIN
  async changePin(currentPin: string, newPin: string): Promise<{ success: boolean; error?: string; message?: string }> {
    try {
      const res = await fetch(apiUrl('/api/auth/admin/change-pin'), {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ current_pin: currentPin, new_pin: newPin }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401 || res.status === 403) {
        return { success: false, error: data.detail || 'Sign in as an admin to change the PIN.' };
      }
      return data;
    } catch (e: any) {
      return { success: false, error: e.message || 'PIN change failed' };
    }
  },

  // Dispatch operator authorization ticket (Login Request)
  async submitLoginRequest(payload: OperatorRequestPayload): Promise<OperatorRequestResponse> {
    return postOperatorRequest(payload, 'Login request submission failed');
  },

  // Legacy alias for dispatch operator authorization ticket
  async requestOperator(payload: OperatorRequestPayload): Promise<OperatorRequestResponse> {
    return postOperatorRequest(payload, 'Request dispatch failed');
  },

  // Poll operator request status (status only)
  async checkRequestStatus(requestId: string): Promise<{
    success: boolean;
    status: 'pending' | 'approved' | 'rejected' | 'completed' | 'expired' | 'not_found';
    error?: string;
  }> {
    try {
      const res = await fetch(apiUrl(`/api/check-request-status/?request_id=${encodeURIComponent(requestId)}`));
      return await res.json();
    } catch (e: any) {
      return { success: false, status: 'pending', error: e.message || 'Status poll failed' };
    }
  },

  // Admin: live authorization queue (never contains OTPs)
  async getAdminQueue(): Promise<{ success: boolean; queue: AdminQueueItem[]; error?: string }> {
    try {
      const res = await fetch(apiUrl('/api/auth/admin/queue'), { headers: authHeaders() });
      if (!res.ok) return { success: false, queue: [], error: `HTTP ${res.status}` };
      return await res.json();
    } catch (e: any) {
      return { success: false, queue: [], error: e.message };
    }
  },

  // Admin: approve operator request. The verbal OTP is returned only in this response.
  async approveRequest(requestId: string): Promise<{
    success: boolean;
    requestId?: string;
    verbalOtp?: string;
    expiresInSeconds?: number;
    error?: string;
  }> {
    try {
      const res = await fetch(apiUrl(`/api/admin/approve/${encodeURIComponent(requestId)}/`), {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ requestId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { success: false, error: data.error || data.detail || `HTTP ${res.status}` };
      return data;
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },

  // Admin: Reject operator request
  async rejectRequest(requestId: string, reason?: string): Promise<{
    success: boolean;
    requestId?: string;
    error?: string;
  }> {
    try {
      const res = await fetch(apiUrl(`/api/admin/reject/${encodeURIComponent(requestId)}/`), {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ requestId, reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { success: false, error: data.error || data.detail || `HTTP ${res.status}` };
      return data;
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },

  // Operator: Verify Verbal OTP for a specific login request
  async verifyVerbalOtp(requestId: string, otpCode: string): Promise<{
    success: boolean;
    token?: string;
    role?: 'operator';
    user?: { operatorCode: string; name: string; branch: string; role?: string };
    error?: string;
    message?: string;
  }> {
    try {
      const res = await fetch(apiUrl('/api/verify-otp/'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: requestId, otpCode }),
      });
      const data = await res.json();
      if (res.ok && data.success && data.token) {
        persistAuthSession(data, 'operator');
      }
      return data;
    } catch (e: any) {
      return { success: false, error: e.message || 'Verification failed' };
    }
  },

  async me(): Promise<{
    success: boolean;
    role?: 'admin' | 'operator';
    user?: {
      id: string;
      name: string;
      email: string;
      role: string;
      branch: string;
      branch_id?: number | null;
      branch_code?: string;
    };
    error?: string;
  }> {
    const token = localStorage.getItem('ariav_auth_token');
    if (!token) return { success: false, error: 'missing' };
    try {
      const res = await fetch(apiUrl('/api/auth/me/'), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401 || res.status === 403) {
        return { success: false, error: 'unauthorized' };
      }
      if (!res.ok) return { success: false, error: 'unavailable' };
      return await res.json();
    } catch {
      return { success: false, error: 'unavailable' };
    }
  },

  // Clear session
  async logout(): Promise<void> {
    const token = localStorage.getItem('ariav_auth_token');
    try {
      if (token) {
        await fetch(apiUrl('/api/auth/logout'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        });
      }
    } catch {
      // ignore
    } finally {
      localStorage.removeItem('ariav_auth_token');
      localStorage.removeItem('ariav_auth_role');
      localStorage.removeItem('ariav_auth_name');
      localStorage.removeItem('ariav_selected_entity_id');
      sessionStorage.removeItem('ariav_current_screen');
    }
  },
};
