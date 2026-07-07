import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { config } from './config';
import { migrate } from './db';
import { initSocket } from './socket';
import { registerQueueListeners } from './dag';
import { startHeartbeatMonitor } from './jobs/heartbeatMonitor';
import { pipelinesRouter } from './routes/pipelines';
import { runsRouter } from './routes/runs';
import { workersRouter } from './routes/workers';
import { billingRouter, razorpayWebhookHandler } from './routes/billing';
import { requireAuth } from './middleware/auth';
import { globalRateLimiter } from './middleware/rateLimit';


async function main() {
  await migrate();

  const app = express();
  app.use(cors({ origin: config.dashboardOrigin }));
  app.use(globalRateLimiter);

  // Health check - no auth, no body parsing needed.
  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  // ── Razorpay webhook (raw body, NO express.json() pre-processing) ──────────
  // Must be registered BEFORE express.json() below. express.raw() captures the
  // raw bytes into req.body (a Buffer); we copy it to req.rawBody so the
  // handler can compute the HMAC over the exact bytes Razorpay sent.
  app.post(
    '/api/billing/webhook',
    express.raw({ type: 'application/json' }),
    (req, _res, next) => {
      (req as any).rawBody = req.body as Buffer;
      next();
    },
    razorpayWebhookHandler
  );

  // ── All other routes use JSON body parsing ────────────────────────────────
  app.use(express.json({ limit: '2mb' }));

  // Worker fleet: register + heartbeat are unauthenticated (worker agents don't
  // have Clerk sessions); GET /workers (fleet view) requires auth - enforced
  // inside workersRouter itself.
  app.use('/api/workers', workersRouter);

  // All end-user routes require a verified Clerk session token.
  app.use('/api/pipelines', requireAuth, pipelinesRouter);
  app.use('/api/runs', requireAuth, runsRouter);
  app.use('/api/billing', requireAuth, billingRouter);

  const httpServer = createServer(app);
  initSocket(httpServer);

  registerQueueListeners();
  startHeartbeatMonitor();

  httpServer.listen(config.port, () => {
    console.log(`[master] listening on :${config.port}`);
  });
}

main().catch((err) => {
  console.error('[master] fatal startup error', err);
  process.exit(1);
});
