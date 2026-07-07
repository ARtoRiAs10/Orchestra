import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db';
import { PipelineDef, RunStatus, StepStatus } from '../types';

export interface RunRow {
  id: string;
  pipeline_id: string;
  status: RunStatus;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  owner_id: string | null;
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

/** Create a run plus one row per pipeline step, all starting in "pending". */
export async function createRun(pipelineId: string, def: PipelineDef, ownerId?: string): Promise<string> {
  const runId = uuidv4();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO runs (id, pipeline_id, status, started_at, owner_id) VALUES ($1, $2, 'running', now(), $3)`,
      [runId, pipelineId, ownerId || null]
    );
    for (const step of def.steps) {
      await client.query(
        `INSERT INTO steps
           (id, run_id, step_id, name, command, depends_on, host, status, max_attempts, backoff_ms)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, $9)`,
        [
          uuidv4(),
          runId,
          step.id,
          step.name || step.id,
          step.command,
          step.depends_on || [],
          step.host ? JSON.stringify({ ...step.host, check: step.check }) : null,
          step.max_attempts ?? 3,
          step.backoff_ms ?? 2000,
        ]
      );
    }
    await client.query('COMMIT');
    return runId;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getRun(runId: string): Promise<RunRow | null> {
  const { rows } = await pool.query('SELECT * FROM runs WHERE id = $1', [runId]);
  return rows[0] || null;
}

export async function listRuns(pipelineId?: string): Promise<RunRow[]> {
  if (pipelineId) {
    const { rows } = await pool.query(
      'SELECT * FROM runs WHERE pipeline_id = $1 ORDER BY created_at DESC',
      [pipelineId]
    );
    return rows;
  }
  const { rows } = await pool.query('SELECT * FROM runs ORDER BY created_at DESC LIMIT 100');
  return rows;
}

export async function getSteps(runId: string): Promise<StepRow[]> {
  const { rows } = await pool.query(
    'SELECT * FROM steps WHERE run_id = $1 ORDER BY created_at ASC',
    [runId]
  );
  return rows;
}

export async function getStepById(stepDbId: string): Promise<StepRow | null> {
  const { rows } = await pool.query('SELECT * FROM steps WHERE id = $1', [stepDbId]);
  return rows[0] || null;
}

export async function updateStepStatus(
  stepDbId: string,
  status: StepStatus,
  extra: Partial<Pick<StepRow, 'worker_id' | 'exit_code' | 'attempts'>> & {
    started_at?: boolean;
    finished_at?: boolean;
  } = {}
): Promise<void> {
  const sets: string[] = ['status = $2'];
  const values: unknown[] = [stepDbId, status];
  let idx = 3;

  if (extra.worker_id !== undefined) {
    sets.push(`worker_id = $${idx++}`);
    values.push(extra.worker_id);
  }
  if (extra.exit_code !== undefined) {
    sets.push(`exit_code = $${idx++}`);
    values.push(extra.exit_code);
  }
  if (extra.attempts !== undefined) {
    sets.push(`attempts = $${idx++}`);
    values.push(extra.attempts);
  }
  if (extra.started_at) sets.push('started_at = now()');
  if (extra.finished_at) sets.push('finished_at = now()');

  await pool.query(`UPDATE steps SET ${sets.join(', ')} WHERE id = $1`, values);
}

export async function updateRunStatus(
  runId: string,
  status: RunStatus,
  finished = false
): Promise<void> {
  if (finished) {
    await pool.query(`UPDATE runs SET status = $2, finished_at = now() WHERE id = $1`, [runId, status]);
  } else {
    await pool.query(`UPDATE runs SET status = $2 WHERE id = $1`, [runId, status]);
  }
}

export async function getLogs(runId: string, stepDbId?: string): Promise<unknown[]> {
  if (stepDbId) {
    const { rows } = await pool.query(
      'SELECT * FROM logs WHERE run_id = $1 AND step_id = $2 ORDER BY ts ASC, id ASC',
      [runId, stepDbId]
    );
    return rows;
  }
  const { rows } = await pool.query('SELECT * FROM logs WHERE run_id = $1 ORDER BY ts ASC, id ASC', [runId]);
  return rows;
}
