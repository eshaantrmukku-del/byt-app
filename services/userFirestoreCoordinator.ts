type FlushFn = () => void;
type FlushNowFn = () => Promise<boolean>;

let flushImpl: FlushFn | null = null;
let flushNowImpl: FlushNowFn | null = null;

export function registerUserFirestoreFlush(fn: FlushFn, flushNow?: FlushNowFn) {
  flushImpl = fn;
  flushNowImpl = flushNow ?? null;
}

export function unregisterUserFirestoreFlush() {
  flushImpl = null;
  flushNowImpl = null;
}

export function requestUserFirestoreFlush() {
  flushImpl?.();
}

/** Await an immediate cloud write (e.g. before logout). True when the write landed or cloud sync is off. */
export async function flushUserFirestoreNow(): Promise<boolean> {
  if (flushNowImpl) return flushNowImpl();
  return true;
}
