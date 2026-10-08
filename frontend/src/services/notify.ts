/**
 * Ariav toast helpers. Use these (or parseApiError) in every new module —
 * never dump DRF JSON into a modal banner.
 *
 * Success: notifySuccess(`Entity '${name}' created successfully.`)
 * Failure: notifyApiError(err)  // toasts + returns { message, fields }
 */
import { toast } from 'react-toastify';
import { parseApiErrorDetails, type ParsedApiError } from './apiError';
import { SESSION_EXPIRED_MESSAGE } from './sessionExpiry';

export function notifySuccess(message: string) {
  toast.success(message, { autoClose: 4000 });
}

export function notifyInfo(message: string) {
  toast.info(message, { autoClose: 4000 });
}

export function notifyError(message: string) {
  toast.error(message, { autoClose: 6000 });
}

export function notifyApiError(err: unknown, fallback?: string): ParsedApiError {
  const parsed = parseApiErrorDetails(err, fallback);
  if ((err as { status?: number } | null)?.status === 401) {
    return { ...parsed, message: SESSION_EXPIRED_MESSAGE };
  }
  notifyError(parsed.message);
  return parsed;
}

export { parseApiError, parseApiErrorDetails } from './apiError';
