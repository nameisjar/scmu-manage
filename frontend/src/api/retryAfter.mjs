// Retry-After can contain seconds or an HTTP date. Do not automatically resend credentials.
export function retryAfterSeconds(value, now = Date.now()) {
  if (value == null || String(value).trim() === '') return 60;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.max(1, Math.ceil(seconds));
  const remaining = Date.parse(value) - now;
  return Number.isFinite(remaining) && remaining > 0 ? Math.ceil(remaining / 1000) : 60;
}
