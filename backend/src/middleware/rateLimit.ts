import { NextFunction, Request, Response } from 'express';

/**
 * Lightweight in-memory rate limiter (sufficient for a single instance — use
 * Redis if you scale horizontally). Keyed by a caller-provided function so auth
 * routes can throttle per-account (email) rather than per-IP, which matters
 * because the Next.js proxy makes every request look like it comes from
 * localhost.
 */
interface Bucket {
  count: number;
  resetAt: number;
}

const store = new Map<string, Bucket>();

// Periodically drop expired buckets so the map doesn't grow unbounded.
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of store) if (b.resetAt <= now) store.delete(k);
}, 60_000).unref?.();

export function rateLimit(opts: {
  windowMs: number;
  max: number;
  keyPrefix: string;
  keyFn?: (req: Request) => string;
  message?: string;
}) {
  const { windowMs, max, keyPrefix, keyFn, message } = opts;
  return (req: Request, res: Response, next: NextFunction) => {
    const base = keyFn ? keyFn(req) : req.ip || 'unknown';
    const key = `${keyPrefix}:${base.toLowerCase()}`;
    const now = Date.now();

    let bucket = store.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      store.set(key, bucket);
    }
    bucket.count++;

    const remaining = Math.max(0, max - bucket.count);
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(remaining));

    if (bucket.count > max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({
        error: message || `Too many attempts. Please try again in ${retryAfter}s.`,
      });
    }
    next();
  };
}

/** Throttle auth attempts per target account (email in body), falling back to IP. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 10,
  keyPrefix: 'auth',
  keyFn: (req) => (req.body?.email as string) || req.ip || 'unknown',
  message: 'Too many attempts for this account. Please wait a few minutes and try again.',
});

/** Coarse per-IP limiter for any sensitive endpoint. */
export const ipLimiter = rateLimit({ windowMs: 60_000, max: 60, keyPrefix: 'ip' });
