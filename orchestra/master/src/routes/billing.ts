import { Router } from 'express';
import crypto from 'crypto';
import { config } from '../config';
import { isPlanTier } from '../billing/plans';
import {
  getSubscription,
  recordPendingOrder,
  activateOrderByRazorpayOrderId,
  recordWebhookEvent,
} from '../billing/billingService';

export const billingRouter = Router();

// ── Authenticated billing routes ─────────────────────────────────────────────
// These are mounted at app.use('/api/billing', requireAuth, billingRouter) in
// index.ts, so every handler here already has a verified req.userId.

// Current plan + live usage for the authenticated user.
billingRouter.get('/subscription', async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: 'Unauthorized' });
  res.json(await getSubscription(req.userId));
});

// Called by the Next.js /api/billing/checkout route right after creating a
// Razorpay order, so the webhook handler can later match razorpay_order_id
// back to a user + plan.
billingRouter.post('/orders', async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: 'Unauthorized' });

  const { razorpayOrderId, plan, amount } = req.body as {
    razorpayOrderId?: string;
    plan?: string;
    amount?: number;
  };
  if (!razorpayOrderId || !plan || typeof amount !== 'number') {
    return res.status(400).json({ error: 'razorpayOrderId, plan, and amount are required' });
  }
  if (!isPlanTier(plan)) return res.status(400).json({ error: 'Invalid plan' });

  try {
    await recordPendingOrder(req.userId, razorpayOrderId, plan, amount);
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error('[billing] failed to record pending order', err);
    res.status(500).json({ error: 'Failed to record order' });
  }
});

// ── Razorpay webhook ─────────────────────────────────────────────────────────
// NOTE: POST /webhook is NOT on this router. It is mounted directly in
// index.ts BEFORE express.json() runs, using express.raw() so the raw request
// body is preserved for HMAC signature verification. Mounting it on the router
// (which runs after express.json() has consumed the body stream) would break
// signature verification. The handler function below is exported and wired up
// by index.ts at app.post('/api/billing/webhook', express.raw(...), webhookHandler).

export async function razorpayWebhookHandler(req: import('express').Request, res: import('express').Response): Promise<void> {
  const signature = req.headers['x-razorpay-signature'] as string | undefined;
  const rawBody = (req as any).rawBody as Buffer | undefined;

  if (!signature || !rawBody) {
    res.status(400).json({ error: 'Missing signature or raw body' });
    return;
  }
  if (!config.razorpayWebhookSecret) {
    console.error('[billing] RAZORPAY_WEBHOOK_SECRET is not configured');
    res.status(500).json({ error: 'Webhook secret not configured' });
    return;
  }

  const expected = crypto
    .createHmac('sha256', config.razorpayWebhookSecret)
    .update(rawBody)
    .digest('hex');
  if (expected !== signature) {
    console.warn('[billing] webhook signature mismatch');
    res.status(400).json({ error: 'Invalid signature' });
    return;
  }

  let event: any;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    res.status(400).json({ error: 'Invalid JSON payload' });
    return;
  }

  const eventId = req.headers['x-razorpay-event-id'] as string | undefined;
  const isNew = await recordWebhookEvent(
    'razorpay',
    eventId || event.id || `${event.event}-${Date.now()}`,
    event.event,
    event
  );
  if (!isNew) {
    res.json({ ok: true, duplicate: true });
    return;
  }

  try {
    if (event.event === 'payment.captured' || event.event === 'order.paid') {
      const orderId: string | undefined =
        event.payload?.payment?.entity?.order_id || event.payload?.order?.entity?.id;
      const paymentId: string | undefined = event.payload?.payment?.entity?.id;
      if (orderId) {
        await activateOrderByRazorpayOrderId(orderId, paymentId || 'unknown');
      }
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[billing] webhook processing error', err);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
}
