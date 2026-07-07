import type { PlanLimits, PlanTier } from '@/lib/types';

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  free: { maxConcurrentPipelines: 1, maxWorkerConcurrency: 1, maxRunsPerDay: 5 },
  pro: { maxConcurrentPipelines: 5, maxWorkerConcurrency: 5, maxRunsPerDay: 100 },
  team: { maxConcurrentPipelines: 20, maxWorkerConcurrency: 20, maxRunsPerDay: 1000 },
};

/** Price in paise (INR smallest unit) for a 30-day plan period, charged via a Razorpay order. */
export const PLAN_PRICING: Record<PlanTier, number> = {
  free: 0,
  pro: 99900, // ₹999
  team: 299900, // ₹2,999
};

export const PLAN_LABELS: Record<PlanTier, string> = {
  free: 'Free',
  pro: 'Pro',
  team: 'Team',
};
