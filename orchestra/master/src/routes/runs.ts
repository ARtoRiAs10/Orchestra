import { Router } from 'express';
import { getRun, getSteps, getLogs } from '../services/runService';

export const runsRouter = Router();

// Run status + all of its steps (poll this, or subscribe via socket.io for live updates).
runsRouter.get('/:id', async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: 'Unauthorized' });

  const run = await getRun(req.params.id);
  if (!run) return res.status(404).json({ error: 'Not found' });
  if ((run as any).owner_id && (run as any).owner_id !== req.userId) {
    return res.status(404).json({ error: 'Not found' });
  }

  const steps = await getSteps(req.params.id);
  res.json({ ...run, steps });
});

// Logs for a run, optionally filtered to a single step via ?stepId=<step db id>.
runsRouter.get('/:id/logs', async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: 'Unauthorized' });

  const run = await getRun(req.params.id);
  if (!run) return res.status(404).json({ error: 'Not found' });
  if ((run as any).owner_id && (run as any).owner_id !== req.userId) {
    return res.status(404).json({ error: 'Not found' });
  }

  const stepId = typeof req.query.stepId === 'string' ? req.query.stepId : undefined;
  res.json(await getLogs(req.params.id, stepId));
});
