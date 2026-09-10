/**
 * Python Auth API Client Service
 * Connects frontend auth screens to the Python 3 / SQLite backend via /api/auth
 */

export interface PythonHealthInfo {
  status: string;
  service: string;
  runtime: string;
  port: number;
  uptime_seconds: number;
  database: string;
  db_path: string;
  stats: {
    users: number;
    operator_requests: number;
    audit_records: number;
  };
  timestamp: string;
}

export interface AdminLoginResponse {
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

export interface PinStatusResponse {
  locked: boolean;
  lockout_remaining_seconds: number;
  failed_attempts: number;
}

export interface OperatorRequestResponse {
  success: boolean;
  requestId?: string;
  request_id?: string;
  request?: {
    id: string;
    operatorCode: string;
    operatorName: string;
    branch: string;
    terminalIp: string;
    actionRequested: string;
    timestamp: string;
    status: 'pending' | 'approved' | 'rejected' | 'completed' | 'expired';
    verbalOtp?: string;
    seconds_remaining?: number;
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
  verbal_otp?: string;
  expires_at?: number;
  seconds_remaining?: number;
  created_at: number;
}

export const authApi = {
  // Check backend health & python service details
  async getHealth(): Promise<PythonHealthInfo | null> {
    try {
      const res = await fetch('/api/auth/health');
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      console.warn('Python Auth API ping failed:', e);
      return null;
    }
  },

  // Step 1: Admin Credentials Check (Username + Password)
  async checkCredentials(username: string, password: string): Promise<CheckCredentialsResponse> {
    try {
      const res = await fetch('/api/check-credentials/', {
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

  // Step 2: Dedicated 6-Digit Master PIN Verification (Screen 2)
  async verifyAdminPin(payload: {
    username: string;
    pin: string;
    temp_token?: string;
  }): Promise<VerifyPinResponse> {
    try {
      const res = await fetch('/api/admin/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok && data.success && data.token) {
        localStorage.setItem('ariav_auth_token', data.token);
        localStorage.setItem('ariav_auth_role', 'admin');
      }
      return data;
    } catch (e: any) {
      return { success: false, error: e.message || 'PIN verification failed' };
    }
  },

  // Check Lockout Status & Countdown
  async getPinStatus(username: string = 'admin'): Promise<PinStatusResponse> {
    try {
      const res = await fetch(`/api/admin/pin-status?username=${encodeURIComponent(username)}`);
      if (!res.ok) return { locked: false, lockout_remaining_seconds: 0, failed_attempts: 0 };
      return await res.json();
    } catch {
      return { locked: false, lockout_remaining_seconds: 0, failed_attempts: 0 };
    }
  },

  // Authenticate Admin with PIN (legacy fallback)
  async loginAdmin(pin: string): Promise<AdminLoginResponse> {
    try {
      const res = await fetch('/api/auth/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      if (res.ok && data.success && data.token) {
        localStorage.setItem('ariav_auth_token', data.token);
        localStorage.setItem('ariav_auth_role', 'admin');
      }
      return data;
    } catch (e: any) {
      return { success: false, error: e.message || 'Network connection failed' };
    }
  },

  // Dispatch operator authorization ticket (Login Request)
  async submitLoginRequest(payload: {
    operatorCode?: string;
    operatorName?: string;
    branch?: string;
    actionRequested?: string;
    terminalIp?: string;
  }): Promise<OperatorRequestResponse> {
    try {
      const res = await fetch('/api/login/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return await res.json();
    } catch (e: any) {
      return { success: false, error: e.message || 'Login request submission failed' };
    }
  },

  // Legacy alias for dispatch operator authorization ticket
  async requestOperator(payload: {
    operatorCode: string;
    operatorName: string;
    branch: string;
    actionRequested: string;
    terminalIp?: string;
  }): Promise<OperatorRequestResponse> {
    try {
      const res = await fetch('/api/login/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return await res.json();
    } catch (e: any) {
      return { success: false, error: e.message || 'Request dispatch failed' };
    }
  },

  // Poll operator request status via /api/check-request-status/
  async checkRequestStatus(requestId: string): Promise<{
    success: boolean;
    status: 'pending' | 'approved' | 'rejected' | 'completed' | 'expired' | 'not_found';
    verbal_otp?: string;
    verbalOtp?: string;
    request?: any;
    error?: string;
  }> {
    try {
      const res = await fetch(`/api/check-request-status/?request_id=${encodeURIComponent(requestId)}`);
      return await res.json();
    } catch (e: any) {
      return { success: false, status: 'pending', error: e.message || 'Status poll failed' };
    }
  },

  // Poll operator request status (legacy alias)
  async getOperatorStatus(requestId: string): Promise<OperatorRequestResponse> {
    try {
      const res = await fetch(`/api/check-request-status/?request_id=${encodeURIComponent(requestId)}`);
      return await res.json();
    } catch (e: any) {
      return { success: false, error: e.message || 'Status poll failed' };
    }
  },

  // Admin: Get live authorization queue
  async getAdminQueue(): Promise<{ success: boolean; queue: AdminQueueItem[]; error?: string }> {
    try {
      const res = await fetch('/api/auth/admin/queue');
      return await res.json();
    } catch (e: any) {
      return { success: false, queue: [], error: e.message };
    }
  },

  // Admin: Approve operator request and issue 6-digit verbal OTP
  async approveRequest(requestId: string): Promise<{
    success: boolean;
    requestId?: string;
    verbalOtp?: string;
    expiresInSeconds?: number;
    error?: string;
  }> {
    try {
      const res = await fetch(`/api/admin/approve/${encodeURIComponent(requestId)}/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId }),
      });
      return await res.json();
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
      const res = await fetch(`/api/admin/reject/${encodeURIComponent(requestId)}/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, reason }),
      });
      return await res.json();
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },

  // Operator: Verify Verbal OTP entered at terminal
  async verifyVerbalOtp(otpCode: string): Promise<{
    success: boolean;
    token?: string;
    role?: 'operator';
    user?: { operatorCode: string; name: string; branch: string };
    error?: string;
    message?: string;
  }> {
    try {
      const res = await fetch('/api/auth/operator/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otpCode }),
      });
      const data = await res.json();
      if (res.ok && data.success && data.token) {
        localStorage.setItem('ariav_auth_token', data.token);
        localStorage.setItem('ariav_auth_role', 'operator');
      }
      return data;
    } catch (e: any) {
      return { success: false, error: e.message || 'Verification failed' };
    }
  },

  // Admin: Initiate PIN recovery challenge
  async requestPinResetChallenge(email?: string): Promise<{
    success: boolean;
    challengeId?: string;
    codePreview?: string;
    error?: string;
    message?: string;
  }> {
    try {
      const res = await fetch('/api/auth/admin/pin-reset/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      return await res.json();
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },

  // Admin: Confirm PIN challenge and set new master PIN
  async confirmPinReset(challengeId: string, code: string, newPin: string): Promise<{
    success: boolean;
    error?: string;
    message?: string;
  }> {
    try {
      const res = await fetch('/api/auth/admin/pin-reset/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeId, code, newPin }),
      });
      return await res.json();
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },

  // Fetch security audit records from Python SQLite
  async getAuditTrail(): Promise<any[]> {
    try {
      const res = await fetch('/api/auth/audit-trail');
      const data = await res.json();
      return data.logs || [];
    } catch {
      return [];
    }
  },

  // Clear session
  async logout(): Promise<void> {
    const token = localStorage.getItem('ariav_auth_token');
    try {
      if (token) {
        await fetch('/api/auth/logout', {
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
    }
  },
};
