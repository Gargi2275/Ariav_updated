/** Client-side required-field helpers — mirror backend blank/required checks. */

export const REQUIRED_MSG = 'This field is required.';

export function isBlank(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === 'number') return !Number.isFinite(value);
  return String(value).trim() === '';
}

export function collectRequired(fields: Record<string, unknown>): Record<string, string> {
  const messages: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (isBlank(value)) messages[key] = REQUIRED_MSG;
  }
  return messages;
}

export function clearFieldMessage(prev: Record<string, string>, key: string): Record<string, string> {
  if (!(key in prev)) return prev;
  const next = { ...prev };
  delete next[key];
  return next;
}
