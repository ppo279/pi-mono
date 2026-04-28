interface RateLimitWindow {
  count: number;
  resetAt: number;
}

const WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ATTEMPTS = 5;

const windows = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(ip: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  let window = windows.get(ip);
  if (!window || now > window.resetAt) {
    window = { count: 0, resetAt: now + WINDOW_MS };
    windows.set(ip, window);
  }
  if (window.count >= MAX_ATTEMPTS) {
    return { allowed: false, remaining: 0 };
  }
  window.count++;
  return { allowed: true, remaining: MAX_ATTEMPTS - window.count };
}