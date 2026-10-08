import { toast } from 'react-toastify';

export const SESSION_EXPIRED_MESSAGE = 'Your session has expired. Please sign in again.';

const SESSION_EXPIRED_EVENT = 'ariav:session-expired';
let sessionExpiryHandled = false;

export function handleUnauthorizedResponse(): void {
  if (typeof window === 'undefined' || !localStorage.getItem('ariav_auth_token')) return;

  localStorage.removeItem('ariav_auth_token');
  localStorage.removeItem('ariav_auth_role');
  localStorage.removeItem('ariav_auth_name');
  localStorage.removeItem('ariav_selected_entity_id');
  sessionStorage.removeItem('ariav_current_screen');

  if (sessionExpiryHandled) return;
  sessionExpiryHandled = true;
  toast.error(SESSION_EXPIRED_MESSAGE, { autoClose: 6000, toastId: 'session-expired' });
  window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
}

export function markSessionAuthenticated(): void {
  sessionExpiryHandled = false;
}

export function isSessionExpiryHandled(): boolean {
  return sessionExpiryHandled;
}

export function subscribeToSessionExpiry(listener: () => void): () => void {
  const handler = () => listener();
  window.addEventListener(SESSION_EXPIRED_EVENT, handler);
  return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handler);
}