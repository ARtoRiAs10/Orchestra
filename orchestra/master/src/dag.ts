import { jobQueue, jobQueueEvents } from './queue';
import { broadcastRunUpdate } from './socket';
import {
  getSteps,
  getStepById,
  updateStepStatus,
  updateRunStatus,
  StepRow,
} from './services/runService';
import { JobPayload, JobResult, HostTarget } from './types';

const TERMINAL = new Set(['success', 'failed', 'skipped']);

/**
 * Core DAG scheduling loop for a run.
 *
 * - Steps whose dependencies are all "success" get enqueued ("pending" -> "queued").
 * - Steps with a failed/skipped dependency are cascaded to "skipped".
 * - Once every step is in a terminal state, the run itself is marked
 *   "success" (all steps succeeded/skipped-cleanly) or "failed".
 *
 * Safe to call repeatedly/concurrently for the same run - it is idempotent
 * because it only acts on steps still in "pending".
 */
export async function scheduleRun(runId: string): Promise<void> {
  let steps = await getSteps(runId);
  let changed = true;

  while (changed) {
    changed = false;
    const statusMap = new Map<string, string>(steps.map((s: StepRow) => [s.step_id, s.status]));

    for (const step of steps) {
      if (step.status !== 'pending') continue;

      const deps = step.depends_on || [];
      const anyDepFailed = deps.some((d: string) => {
        const st = statusMap.get(d);
        return st === 'failed' || st === 'skipped';
      });
      const allDepsSucceeded = deps.every((d: string) => statusMap.get(d) === 'success');

      if (anyDepFailed) {
        await updateStepStatus(step.id, 'skipped');
        statusMap.set(step.step_id, 'skipped');
        changed = true;
      } else if (allDepsSucceeded) {
        await enqueueStep(runId, step);
        await updateStepStatus(step.id, 'queued');
        statusMap.set(step.step_id, 'queued');
        changed = true;
      }
    }

    if (changed) {
      steps = await getSteps(runId);
    }
  }

  const allTerminal = steps.every((s: StepRow) => TERMINAL.has(s.status));
  if (allTerminal) {
    const anyFailed = steps.some((s: StepRow) => s.status === 'failed');
    await updateRunStatus(runId, anyFailed ? 'failed' : 'success', true);
  }

  broadcastRunUpdate(runId, { steps: await getSteps(runId) });
}

async function enqueueStep(runId: string, step: StepRow): Promise<void> {
  const payload: JobPayload = {
    runId,
    stepDbId: step.id,
    stepId: step.step_id,
    command: step.command,
    host: (step.host as HostTarget) || undefined,
    check: (step.host as any)?.check,
  };

  await jobQueue.add('run-step', payload, {
    jobId: step.id,
    attempts: step.max_attempts,
    backoff: { type: 'exponential', delay: step.backoff_ms },
    removeOnComplete: true,
    removeOnFail: true,
  });
}

/**
 * Wire up listeners on the BullMQ queue that translate job lifecycle events
 * (completed / progress / failed-with-retries / failed-final) back into
 * step status updates + DAG re-evaluation. Call once at startup.
 */
export function registerQueueListeners(): void {
  jobQueueEvents.on('completed', async ({ jobId, returnvalue }: { jobId: string; returnvalue: unknown }) => {
    try {
      const result = parseResult(returnvalue);
      const step = await getStepById(jobId);
      if (!step) return;

      await updateStepStatus(step.id, result.status === 'success' ? 'success' : 'failed', {
        worker_id: result.workerId,
        exit_code: result.exitCode,
        finished_at: true,
      });

      await scheduleRun(step.run_id);
    } catch (err) {
      console.error('[dag] error handling completed job', jobId, err);
    }
  });

  // "failed" fires both for retryable failures (attemptsMade < attempts) and
  // the final failure once retries are exhausted. We distinguish the two so
  // that exponential-backoff retries don't prematurely mark the step failed.
  jobQueueEvents.on('failed', async ({ jobId, failedReason }) => {
    try {
      const step = await getStepById(jobId);
      if (!step) return;

      const job = await jobQueue.getJob(jobId);
      const attemptsMade = job?.attemptsMade ?? step.attempts + 1;
      const maxAttempts = job?.opts.attempts ?? step.max_attempts;
      const info = parseFailure(failedReason);

      if (attemptsMade >= maxAttempts) {
        await updateStepStatus(step.id, 'failed', {
          worker_id: info.workerId,
          exit_code: info.exitCode,
          attempts: attemptsMade,
          finished_at: true,
        });
        await scheduleRun(step.run_id);
      } else {
        // Will be retried automatically by BullMQ after the backoff delay.
        await updateStepStatus(step.id, 'queued', { attempts: attemptsMade });
        broadcastRunUpdate(step.run_id, { retry: { stepId: step.id, attempt: attemptsMade, maxAttempts } });
      }
    } catch (err) {
      console.error('[dag] error handling failed job', jobId, err);
    }
  });

  console.log('[dag] queue listeners registered');
}

function parseResult(returnvalue: unknown): JobResult {
  if (typeof returnvalue === 'string') {
    try {
      return JSON.parse(returnvalue) as JobResult;
    } catch {
      /* fall through */
    }
  }
  return returnvalue as JobResult;
}

function parseFailure(failedReason: string | undefined): { exitCode: number | null; workerId: string | null } {
  if (!failedReason) return { exitCode: null, workerId: null };
  try {
    const parsed = JSON.parse(failedReason);
    return { exitCode: parsed.exitCode ?? null, workerId: parsed.workerId ?? null };
  } catch {
    return { exitCode: null, workerId: null };
  }
}
