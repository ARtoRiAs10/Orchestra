'use client';

import { useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { Check, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { useOrchestraApi } from '@/lib/client-api';
import { PLAN_LABELS, PLAN_PRICING, PLAN_LIMITS } from '@/lib/plans';
import type { PlanTier, Subscription } from '@/lib/types';

declare global {
  interface Window {
    Razorpay: any;
  }
}

const PLAN_ORDER: PlanTier[] = ['free', 'pro', 'team'];

function loadRazorpayScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Razorpay checkout script'));
    document.body.appendChild(script);
  });
}

export function BillingPanel({ initialSubscription }: { initialSubscription: Subscription }) {
  const { user } = useUser();
  const { apiFetch } = useOrchestraApi();
  const [subscription, setSubscription] = useState(initialSubscription);
  const [loadingPlan, setLoadingPlan] = useState<PlanTier | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upgrade(plan: PlanTier) {
    setError(null);
    setLoadingPlan(plan);
    try {
      await loadRazorpayScript();

      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to start checkout');
      }
      const order = await res.json();

      const rzp = new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        order_id: order.orderId,
        name: 'Orchestra',
        description: `${PLAN_LABELS[plan]} plan - 30 days`,
        prefill: { email: user?.primaryEmailAddress?.emailAddress, name: user?.fullName ?? undefined },
        theme: { color: '#5b6cff' },
        handler: async () => {
          // Webhook (server-to-server) activates the subscription; poll once
          // it's likely processed and refresh the displayed plan.
          setTimeout(async () => {
            try {
              const updated = await apiFetch('/api/billing/subscription');
              if (updated.ok) setSubscription(await updated.json());
            } finally {
              setLoadingPlan(null);
            }
          }, 2000);
        },
        modal: { ondismiss: () => setLoadingPlan(null) },
      });

      rzp.open();
    } catch (err: any) {
      setError(err.message);
      setLoadingPlan(null);
    }
  }

  const usagePct = (used: number, max: number) => Math.min(100, Math.round((used / max) * 100));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Billing & plan</h1>
        <p className="text-sm text-muted-foreground">Plan tier controls concurrent pipelines, worker concurrency, and daily run limits.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Current usage
            <Badge variant={subscription.status === 'active' ? 'success' : 'muted'}>{subscription.status}</Badge>
          </CardTitle>
          <CardDescription>Resets daily; concurrent pipeline limit applies to runs currently in progress.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex justify-between text-sm">
              <span>Concurrent pipeline runs</span>
              <span className="text-muted-foreground">
                {subscription.usage.runningPipelines} / {subscription.limits.maxConcurrentPipelines}
              </span>
            </div>
            <Progress value={usagePct(subscription.usage.runningPipelines, subscription.limits.maxConcurrentPipelines)} />
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-sm">
              <span>Runs today</span>
              <span className="text-muted-foreground">
                {subscription.usage.runsToday} / {subscription.limits.maxRunsPerDay}
              </span>
            </div>
            <Progress value={usagePct(subscription.usage.runsToday, subscription.limits.maxRunsPerDay)} />
          </div>
          <div className="flex justify-between text-sm">
            <span>Worker concurrency cap</span>
            <span className="text-muted-foreground">{subscription.limits.maxWorkerConcurrency} jobs/worker</span>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-destructive/50 bg-destructive/10">
          <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        {PLAN_ORDER.map((plan) => {
          const limits = PLAN_LIMITS[plan];
          const price = PLAN_PRICING[plan];
          const isCurrent = subscription.plan === plan;
          return (
            <Card key={plan} className={isCurrent ? 'border-primary ring-1 ring-primary' : ''}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  {PLAN_LABELS[plan]}
                  {isCurrent && <Badge>Current</Badge>}
                </CardTitle>
                <CardDescription>{price === 0 ? 'Free forever' : `₹${(price / 100).toLocaleString('en-IN')} / 30 days`}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-success" /> {limits.maxConcurrentPipelines} concurrent pipeline runs
                </div>
                <div className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-success" /> {limits.maxWorkerConcurrency} jobs per worker
                </div>
                <div className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-success" /> {limits.maxRunsPerDay} runs / day
                </div>
              </CardContent>
              <CardFooter>
                {plan === 'free' ? (
                  <Button variant="outline" disabled className="w-full">
                    Default plan
                  </Button>
                ) : (
                  <Button className="w-full" disabled={isCurrent || loadingPlan !== null} onClick={() => upgrade(plan)}>
                    {loadingPlan === plan && <Loader2 className="h-4 w-4 animate-spin" />}
                    {isCurrent ? 'Current plan' : `Upgrade to ${PLAN_LABELS[plan]}`}
                  </Button>
                )}
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
