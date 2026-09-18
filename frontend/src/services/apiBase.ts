/**
 * Django origin used by every frontend API client.
 *
 * Default: same hostname the page was loaded from, port 8000.
 * Opening http://192.168.1.20:5173 talks to http://192.168.1.20:8000,
 * so another PC on the LAN does not hit its own empty localhost.
 *
 * Set VITE_API_BASE_URL to force a specific origin (do not include /api;
 * clients already prefix paths with /api/...). A loopback override is
 * ignored when the page itself is on a LAN hostname, so .env can stay
 * http://localhost:8000 for local work.
 */

const LOOPBACK = /^(localhost|127\.0\.0\.1|\[::1\])$/i;

function normalizeOrigin(raw: string): string {
  return raw.replace(/\/$/, '').replace(/\/api$/i, '');
}

function isLoopbackHost(host: string): boolean {
  return LOOPBACK.test(host);
}

function isLoopbackOrigin(origin: string): boolean {
  try {
    return isLoopbackHost(new URL(origin).hostname);
  } catch {
    return false;
  }
}

function pageHostname(): string {
  if (typeof window === 'undefined' || !window.location?.hostname) return 'localhost';
  return window.location.hostname;
}

export function getApiBase(): string {
  const fromEnv = normalizeOrigin(String(import.meta.env.VITE_API_BASE_URL || '').trim());
  const host = pageHostname();
  if (fromEnv && !(isLoopbackOrigin(fromEnv) && !isLoopbackHost(host))) {
    return fromEnv;
  }
  return `http://${host}:8000`;
}

export function apiUrl(path: string): string {
  const base = getApiBase();
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}
