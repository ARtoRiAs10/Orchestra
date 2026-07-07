import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db';
import { parsePipelineYaml, PipelineValidationError } from '../services/pipelineService';
import { createRun, listRuns } from '../services/runService';
import { scheduleRun } from '../dag';
import { assertCanStartRun, PlanLimitError } from '../billing/billingService';
import { perUserRateLimiter } from '../middleware/rateLimit';

export const pipelinesRouter = Router();

// Create a new pipeline from a YAML definition, owned by the authenticated user.
pipelinesRouter.post('/', async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: 'Unauthorized' });

  const { name, yaml: rawYaml } = req.body as { name?: string; yaml?: string };
  if (!rawYaml || typeof rawYaml !== 'string') {
    return res.status(400).json({ error: 'Request body must include a "yaml" string' });
  }

  try {
    const def = parsePipelineYaml(rawYaml);
    const id = uuidv4();
    await pool.query(
      `INSERT INTO pipelines (id, name, definition, owner_id) VALUES ($1, $2, $3, $4)`,
      [id, name || def.name, JSON.stringify(def), req.userId]
    );
    return res.status(201).json({ id, name: name || def.name, definition: def });
  } catch (err) {
    if (err instanceof PipelineValidationError) {
      return res.status(400).json({ error: err.message });
    }
    console.error(err);
    return res.status(500).json({ error: 'Internal error' });
  }
});

// List pipelines owned by the authenticated user.
pipelinesRouter.get('/', async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: 'Unauthorized' });
  const { rows } = await pool.query(
    'SELECT id, name, definition, created_at FROM pipelines WHERE owner_id = $1 ORDER BY created_at DESC',
    [req.userId]
  );
  res.json(rows);
});

// Fetch a single pipeline (must be owned by the requesting user).
pipelinesRouter.get('/:id', async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: 'Unauthorized' });
  const { rows } = await pool.query('SELECT * FROM pipelines WHERE id = $1 AND owner_id = $2', [req.params.id, req.userId]);
  if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

// List runs for a pipeline owned by the requesting user.
pipelinesRouter.get('/:id/runs', async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: 'Unauthorized' });
  const { rows: pipelineRows } = await pool.query('SELECT id FROM pipelines WHERE id = $1 AND owner_id = $2', [req.params.id, req.userId]);
  if (pipelineRows.length === 0) return res.status(404).json({ error: 'Pipeline not found' });
  res.json(await listRuns(req.params.id));
});

// Trigger a new run of a pipeline. Enforces the user's plan limits (max
// concurrent runs, max runs/day) before creating the run. Creates step rows
// for the whole DAG (all "pending") and kicks off the scheduler, which
// enqueues every step whose dependencies are already satisfied.
pipelinesRouter.post('/:id/runs', perUserRateLimiter, async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: 'Unauthorized' });

  const { rows } = await pool.query('SELECT * FROM pipelines WHERE id = $1 AND owner_id = $2', [req.params.id, req.userId]);
  if (rows.length === 0) return res.status(404).json({ error: 'Pipeline not found' });

  try {
    await assertCanStartRun(req.userId);
  } catch (err) {
    if (err instanceof PlanLimitError) {
      return res.status(429).json({ error: err.message });
    }
    throw err;
  }

  const def = rows[0].definition;
  try {
    const runId = await createRun(req.params.id, def, req.userId);
    // Fire-and-forget: scheduling can take a few queries, but the run is
    // already persisted, so the client gets the runId immediately.
    scheduleRun(runId).catch((err) => console.error('[scheduleRun]', err));
    return res.status(201).json({ runId });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to start run' });
  }
});
