export type PlanTier = 'free' | 'pro' | 'team';

export interface PlanLimits {
  maxConcurrentPipelines: number;
  maxWorkerConcurrency: number;
  maxRunsPerDay: number;
}

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  free: { maxConcurrentPipelines: 1, maxWorkerConcurrency: 1, maxRunsPerDay: 5 },
  pro: { maxConcurrentPipelines: 5, maxWorkerConcurrency: 5, maxRunsPerDay: 100 },
  team: { maxConcurrentPipelines: 20, maxWorkerConcurrency: 20, maxRunsPerDay: 1000 },
};

/** Price in paise (INR smallest unit) for a 30-day plan period. Must match frontend/src/lib/plans.ts. */
export const PLAN_PRICING: Record<PlanTier, number> = {
  free: 0,
  pro: 99900,
  team: 299900,
};

export function isPlanTier(value: string): value is PlanTier {
  return value === 'free' || value === 'pro' || value === 'team';
}
