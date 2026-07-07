import { Router } from 'express';
import { registerWorker, heartbeat, listWorkers } from '../services/workerService';
import { broadcastFleetUpdate } from '../socket';
import { requireAuth } from '../middleware/auth';

export const workersRouter = Router();

// Called once by a worker process on startup. Returns a stable worker id
// that the worker includes in subsequent heartbeats. Not behind requireAuth -
// worker agents don't have Clerk user sessions, only the global IP rate
// limiter (registered in index.ts) applies here.
workersRouter.post('/register', async (req, res) => {
  const { hostname, capabilities } = req.body as { hostname?: string; capabilities?: unknown };
  if (!hostname) return res.status(400).json({ error: '"hostname" is required' });

  const id = await registerWorker(hostname, capabilities);
  broadcastFleetUpdate({ workers: await listWorkers() });
  res.status(201).json({ id });
});

// Called periodically (every few seconds) by each worker. Also not behind requireAuth.
workersRouter.post('/:id/heartbeat', async (req, res) => {
  const ok = await heartbeat(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Unknown worker id' });
  res.json({ ok: true });
});

// Fleet health overview for the dashboard - requires a logged-in user.
workersRouter.get('/', requireAuth, async (_req, res) => {
  res.json(await listWorkers());
});
