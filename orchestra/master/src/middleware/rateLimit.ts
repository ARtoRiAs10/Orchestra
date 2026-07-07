import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from '../config';
import { connection } from '../queue';
import { getSubscription } from '../billing/billingService';

/**
 * Global limiter: protects the API from any single IP hammering it,
 * regardless of auth state. Applied to every route.
 */
export const globalRateLimiter = rateLimit({
  windowMs: config.globalRateLimitWindowMs,
  max: config.globalRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, slow down.' },
});

/**
 * Per-user, per-plan limiter for run-triggering specifically. Free/Pro/Team
 * each get a different requests-per-minute budget on top of their daily
 * run-count cap (enforced separately in planLimits.ts) - this protects
 * against rapid-fire abuse within the daily quota.
 *
 * Implemented as a fixed-window counter in Redis (the same Redis instance
 * BullMQ already uses), keyed by user id, so it works correctly across
 * multiple master replicas.
 */
const PLAN_RPM: Record<string, number> = { free: 10, pro: 60, team: 200 };

export async function perUserRateLimiter(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const sub = await getSubscription(req.userId);
    const limit = PLAN_RPM[sub.plan] ?? PLAN_RPM.free;

    const windowSeconds = 60;
    const key = `ratelimit:user:${req.userId}:${Math.floor(Date.now() / 1000 / windowSeconds)}`;

    const count = await connection.incr(key);
    if (count === 1) {
      await connection.expire(key, windowSeconds);
    }

    res.setHeader('X-RateLimit-Limit', String(limit));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, limit - count)));

    if (count > limit) {
      res.status(429).json({ error: `Rate limit exceeded for the ${sub.plan} plan (${limit} requests/min). Upgrade your plan for a higher limit.` });
      return;
    }

    next();
  } catch (err) {
    console.error('[rateLimit] error checking per-user limit, allowing request', err);
    next();
  }
}
