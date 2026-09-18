/**
 * In-flight lock for master create/update.
 *
 * Save handlers must:
 *   1. acquireSaveLock (reject overlapping clicks)
 *   2. await the API call
 *   3. refresh the list ONLY after a successful response
 *   4. on error: toast + keep modal open — never retry, never invent a code
 */
export function acquireSaveLock(lock: { current: boolean }): boolean {
  if (lock.current) return false;
  lock.current = true;
  return true;
}

export function releaseSaveLock(lock: { current: boolean }) {
  lock.current = false;
}
