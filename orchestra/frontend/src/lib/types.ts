export type StepStatus = 'pending' | 'queued' | 'running' | 'success' | 'failed' | 'skipped';
export type RunStatus = 'pending' | 'running' | 'success' | 'failed';

export interface Pipeline {
  id: string;
  name: string;
  definition: { name: string; steps: PipelineStepDef[] };
  created_at: string;
}

export interface PipelineStepDef {
  id: string;
  name?: string;
  command: string;
  depends_on?: string[];
  host?: Record<string, unknown>;
  max_attempts?: number;
  backoff_ms?: number;
  check?: boolean;
}

export interface StepRow {
  id: string;
  run_id: string;
  step_id: string;
  name: string;
  command: string;
  depends_on: string[];
  host: unknown;
  status: StepStatus;
  worker_id: string | null;
  attempts: number;
  max_attempts: number;
  backoff_ms: number;
  exit_code: number | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface RunSummary {
  id: string;
  pipeline_id: string;
  status: RunStatus;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface Run extends RunSummary {
  steps: StepRow[];
}

export interface LogLine {
  id?: number;
  run_id: string;
  step_id: string;
  stream: 'stdout' | 'stderr' | 'system';
  message: string;
  ts: number | string;
}

export interface WorkerRow {
  id: string;
  hostname: string;
  status: 'online' | 'dead';
  capabilities: unknown;
  registered_at: string;
  last_heartbeat: string;
}

export type PlanTier = 'free' | 'pro' | 'team';

export interface PlanLimits {
  maxConcurrentPipelines: number;
  maxWorkerConcurrency: number;
  maxRunsPerDay: number;
}

export interface Subscription {
  plan: PlanTier;
  status: 'active' | 'inactive' | 'past_due' | 'cancelled';
  limits: PlanLimits;
  usage: {
    runningPipelines: number;
    runsToday: number;
  };
  razorpaySubscriptionId?: string | null;
  currentPeriodEnd?: string | null;
}
