import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db';
import { PLAN_LIMITS, PlanTier, isPlanTier } from './plans';

export interface SubscriptionView {
  plan: PlanTier;
  status: string;
  limits: typeof PLAN_LIMITS[PlanTier];
  usage: { runningPipelines: number; runsToday: number };
  razorpaySubscriptionId: string | null;
  currentPeriodEnd: string | null;
}

/** Fetch the current plan + live usage counters for a user. Creates a default "free" row if missing. */
export async function getSubscription(userId: string): Promise<SubscriptionView> {
  const { rows } = await pool.query(
    `SELECT plan, status, razorpay_subscription_id, current_period_end
       FROM subscriptions WHERE user_id = $1`,
    [userId]
  );

  let plan: PlanTier = 'free';
  let status = 'active';
  let razorpaySubscriptionId: string | null = null;
  let currentPeriodEnd: string | null = null;

  if (rows.length === 0) {
    await pool.query(
      `INSERT INTO users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`,
      [userId]
    );
    await pool.query(
      `INSERT INTO subscriptions (user_id, plan, status) VALUES ($1, 'free', 'active')
       ON CONFLICT (user_id) DO NOTHING`,
      [userId]
    );
  } else {
    plan = isPlanTier(rows[0].plan) ? rows[0].plan : 'free';
    status = rows[0].status;
    razorpaySubscriptionId = rows[0].razorpay_subscription_id;
    currentPeriodEnd = rows[0].current_period_end;

    // Paid plans are sold as 30-day periods. Enforce expiry here (rather than
    // relying on a cron job) so plan limits immediately fall back to Free once
    // the paid period ends.
    const periodEnd = rows[0].current_period_end ? new Date(rows[0].current_period_end) : null;
    if (plan !== 'free' && periodEnd && periodEnd.getTime() <= Date.now()) {
      plan = 'free';
      status = 'inactive';
      await pool.query(
        `UPDATE subscriptions
            SET plan = 'free', status = 'inactive', updated_at = now()
          WHERE user_id = $1
            AND plan <> 'free'
            AND current_period_end = $2`,
        [userId, rows[0].current_period_end]
      );
    }
  }

  const usage = await getUsage(userId);

  return {
    plan,
    status,
    limits: PLAN_LIMITS[plan],
    usage,
    razorpaySubscriptionId,
    currentPeriodEnd,
  };
}

async function getUsage(userId: string): Promise<{ runningPipelines: number; runsToday: number }> {
  const { rows: runningRows } = await pool.query(
    `SELECT count(*) FROM runs WHERE owner_id = $1 AND status = 'running'`,
    [userId]
  );
  const { rows: todayRows } = await pool.query(
    `SELECT count(*) FROM runs WHERE owner_id = $1 AND created_at >= date_trunc('day', now())`,
    [userId]
  );
  return {
    runningPipelines: parseInt(runningRows[0].count, 10),
    runsToday: parseInt(todayRows[0].count, 10),
  };
}

export class PlanLimitError extends Error {}

/**
 * Throws a PlanLimitError if triggering a new run would exceed the user's
 * plan limits (concurrent runs or daily run count). Call before creating a run.
 */
export async function assertCanStartRun(userId: string): Promise<void> {
  const sub = await getSubscription(userId);
  if (sub.usage.runningPipelines >= sub.limits.maxConcurrentPipelines) {
    throw new PlanLimitError(
      `Plan limit reached: ${sub.plan} allows ${sub.limits.maxConcurrentPipelines} concurrent pipeline run(s). Finish a run or upgrade your plan.`
    );
  }
  if (sub.usage.runsToday >= sub.limits.maxRunsPerDay) {
    throw new PlanLimitError(
      `Plan limit reached: ${sub.plan} allows ${sub.limits.maxRunsPerDay} run(s) per day. Try again tomorrow or upgrade your plan.`
    );
  }
}

/** Effective worker concurrency cap for a plan - used as a soft cap communicated to workers/dashboard. */
export function maxWorkerConcurrencyForPlan(plan: PlanTier): number {
  return PLAN_LIMITS[plan].maxWorkerConcurrency;
}

// ---------------------------------------------------------------------------
// Razorpay order tracking (order created by the Next.js route, recorded here)
// ---------------------------------------------------------------------------

export async function recordPendingOrder(userId: string, razorpayOrderId: string, plan: PlanTier, amount: number): Promise<void> {
  if (!isPlanTier(plan)) throw new Error(`Invalid plan: ${plan}`);
  await pool.query(
    `INSERT INTO billing_orders (id, user_id, razorpay_order_id, plan, amount, status)
     VALUES ($1, $2, $3, $4, $5, 'pending')`,
    [uuidv4(), userId, razorpayOrderId, plan, amount]
  );
}

/** Mark an order paid and activate the corresponding plan on the user's subscription. Idempotent. */
export async function activateOrderByRazorpayOrderId(razorpayOrderId: string, razorpayPaymentId: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT * FROM billing_orders WHERE razorpay_order_id = $1 FOR UPDATE`,
      [razorpayOrderId]
    );
    if (rows.length === 0) {
      console.warn(`[billing] webhook referenced unknown order ${razorpayOrderId}`);
      await client.query('ROLLBACK');
      return;
    }
    const order = rows[0];

    if (order.status === 'paid') {
      await client.query('ROLLBACK'); // already processed - idempotent no-op
      return;
    }

    await client.query(
      `UPDATE billing_orders SET status = 'paid', paid_at = now() WHERE id = $1`,
      [order.id]
    );

    await client.query(
      `INSERT INTO subscriptions (user_id, plan, status, current_period_end, updated_at)
       VALUES ($1, $2, 'active', now() + interval '30 days', now())
       ON CONFLICT (user_id) DO UPDATE
         SET plan = EXCLUDED.plan, status = 'active', current_period_end = EXCLUDED.current_period_end, updated_at = now()`,
      [order.user_id, order.plan]
    );

    await client.query('COMMIT');
    console.log(`[billing] activated plan "${order.plan}" for user ${order.user_id} (payment ${razorpayPaymentId})`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Records a raw webhook delivery for idempotency/audit. Returns false if this event_id was already processed. */
export async function recordWebhookEvent(provider: string, eventId: string, eventType: string, payload: unknown): Promise<boolean> {
  try {
    await pool.query(
      `INSERT INTO webhook_events (id, provider, event_id, event_type, payload) VALUES ($1, $2, $3, $4, $5)`,
      [uuidv4(), provider, eventId, eventType, JSON.stringify(payload)]
    );
    return true;
  } catch (err: any) {
    if (err.code === '23505') return false; // unique violation -> already processed
    throw err;
  }
}
