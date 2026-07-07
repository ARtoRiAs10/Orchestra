import { NextRequest, NextResponse } from 'next/server';
import Razorpay from 'razorpay';
import { auth } from '@clerk/nextjs/server';
import { apiJson } from '@/lib/api';
import { PLAN_PRICING } from '@/lib/plans';
import type { PlanTier } from '@/lib/types';

/**
 * Creates a Razorpay order for the requested plan and records it as
 * "pending" against the current user via the master API. The Razorpay
 * webhook (configured to point at the master's /api/billing/webhook)
 * verifies payment and activates the subscription.
 */
export async function POST(req: NextRequest) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { plan } = (await req.json()) as { plan?: PlanTier };
  if (!plan || !(plan in PLAN_PRICING)) {
    return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
  }

  const amount = PLAN_PRICING[plan];
  if (amount === 0) {
    return NextResponse.json({ error: 'The free plan does not require checkout' }, { status: 400 });
  }

  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    return NextResponse.json({ error: 'Razorpay is not configured on the server' }, { status: 500 });
  }

  const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });

  const order = await razorpay.orders.create({
    amount,
    currency: 'INR',
    receipt: `orchestra_${plan}_${userId}_${Date.now()}`,
    notes: { clerkUserId: userId, plan },
  });

  // Record the pending order so the webhook can match it back to this user/plan.
  await apiJson('/api/billing/orders', {
    method: 'POST',
    body: JSON.stringify({ razorpayOrderId: order.id, plan, amount }),
  });

  return NextResponse.json({
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    keyId,
    plan,
  });
}
