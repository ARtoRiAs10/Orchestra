# Orchestra

A distributed CI/CD orchestration + configuration-management platform with
a SaaS-style billing layer.

A **master/control plane** (Node/Express + TypeScript + Postgres +
BullMQ/Redis) accepts pipeline definitions written as YAML DAGs, schedules
their steps as jobs on a shared queue, and tracks status/logs. A fleet of
**worker agents** register themselves, send heartbeats, pull jobs off the
queue, execute them either locally (shell) or remotely over **SSH**
(config management / Ansible-style, including a "check mode" dry-run), and
stream logs back over WebSockets in real time. A **Next.js + shadcn/ui**
dashboard (auth via **Clerk**) visualizes pipeline runs, live logs, and
worker fleet health, and includes a billing page backed by **Razorpay**
with plan-based rate limiting (Free / Pro / Team).

## Architecture

```
                ┌─────────────────────────┐
                │   Next.js + shadcn/ui    │  Clerk session (JWT)
                │  (frontend/, port 3000)  │  attached as Bearer token
                └────────────┬─────────────┘
                              │ REST + Socket.IO
                              ▼
                     ┌────────────────────┐
   YAML pipeline --> │   Master (API)     │ <-- Postgres (pipelines, runs,
   (DAG of steps)    │  - REST API        │      steps, logs, workers,
                      │  - Clerk auth      │      users, subscriptions,
                      │  - rate limiting   │      billing_orders)
                      │  - DAG scheduler   │
                      │  - Razorpay webhook│
                      │  - Socket.IO hub   │
                      └─────────┬──────────┘
                                 │ BullMQ (Redis)
                 ┌───────────────┼───────────────┐
                 ▼               ▼               ▼
           ┌──────────┐   ┌──────────┐    ┌──────────┐
           │ Worker 1 │   │ Worker 2 │    │ Worker N │   (stateless,
           │heartbeat │   │heartbeat │    │heartbeat │    horizontally
           │ shell/SSH│   │ shell/SSH│    │ shell/SSH│    scalable)
           └──────────┘   └──────────┘    └──────────┘
                 │               │               │
                 └────── logs (Socket.IO) ────────┘
```

### Auth, billing, and rate limiting

| Concept | Where it lives |
|---|---|
| Sign-in/sign-up, session management | Clerk (`frontend/src/middleware.ts` protects all routes except `/sign-in`, `/sign-up`) |
| Session verification on the API | `master/src/middleware/auth.ts` - verifies the Clerk JWT Bearer token with `@clerk/backend`, attaches `req.userId`, auto-provisions a `users` + free `subscriptions` row on first sight |
| Plan tiers (Free / Pro / Team) | `master/src/billing/plans.ts` (limits) mirrored in `frontend/src/lib/plans.ts` (pricing/display) |
| Plan-limit enforcement | `master/src/billing/billingService.ts` `assertCanStartRun()` - checked in `POST /api/pipelines/:id/runs` before a run is created |
| Razorpay checkout | `frontend/src/app/api/billing/checkout/route.ts` creates a Razorpay order, records it as "pending" via `POST /api/billing/orders` |
| Razorpay webhook (activates plan) | `master/src/routes/billing.ts` `POST /api/billing/webhook` - verifies the `X-Razorpay-Signature` HMAC against the raw body, then activates the plan for 30 days |
| Global rate limiting | `express-rate-limit` in `master/src/middleware/rateLimit.ts`, applied to every request |
| Per-user/plan rate limiting | Redis fixed-window counter in `master/src/middleware/rateLimit.ts` `perUserRateLimiter`, applied to `POST /api/pipelines/:id/runs` (10/60/200 req/min for Free/Pro/Team) |

### Fault tolerance & scaling, mapped to the implementation

| Concept | Where it lives |
|---|---|
| Job retries with exponential backoff | BullMQ `attempts` + `backoff` per step (`max_attempts` / `backoff_ms` in the pipeline YAML), handled in `master/src/dag.ts` |
| Stalled-job recovery if a worker dies mid-task | BullMQ's built-in stalled-job detection automatically re-queues jobs whose lock expires |
| Worker fleet health via heartbeats | `master/src/jobs/heartbeatMonitor.ts` sweeps `workers.last_heartbeat`; workers POST `/api/workers/:id/heartbeat` every `HEARTBEAT_INTERVAL_MS` |
| DAG-based pipeline execution with parallelism | `master/src/dag.ts` `scheduleRun()` - enqueues every step whose dependencies are all `success`, cascades `skipped` status when a dependency fails |
| Remote config management / Ansible-style execution | `worker/src/sshExecutor.ts` - SSH exec per step, plus `check: true` dry-run mode |
| Distributed log streaming | Socket.IO `/agents` namespace (worker -> master) and `/dashboard` namespace (master -> browser), persisted to the `logs` table |
| Horizontal scaling | Workers are stateless containers; `docker compose up --scale worker=N` adds capacity |

## Repo layout

```
orchestra/
├── frontend/             # Next.js 14 (App Router) + shadcn/ui + Clerk + Razorpay checkout
├── master/               # Control plane: API, scheduler, Postgres, Socket.IO hub, billing/auth/rate-limit
├── worker/               # Agent: BullMQ worker, shell/SSH executors, heartbeats
├── example-pipelines/    # Sample YAML pipelines
├── keys/                 # Mount SSH private keys here for worker containers
└── docker-compose.yml
```

## Prerequisites

- Docker + Docker Compose (for the full stack), or Node.js 20+ for local dev
- A free [Clerk](https://clerk.com) application (for auth) - copy the publishable + secret key
- A [Razorpay](https://razorpay.com) test account (for billing) - copy the Key ID + Key Secret, and create a webhook pointing at `/api/billing/webhook` with secret `RAZORPAY_WEBHOOK_SECRET`, subscribed to the `payment.captured` event

> Don't have Clerk/Razorpay keys yet and just want to try the orchestrator?
> Set `AUTH_OPTIONAL=true` on the master (see `master/.env.example`) to skip
> auth entirely during local development - every request is treated as a
> single fixed dev user. Billing/Razorpay features won't work without real
> keys, but pipelines/DAG/logs/fleet will.

## Quick start (Docker Compose)

```bash
cd orchestra

# 1. Copy and fill in the root env file (Clerk + Razorpay keys, shared across services)
cp .env.example .env
# edit .env with your real keys

# 2. Build and start everything (postgres, redis, master, 1 worker, frontend)
docker compose up --build -d

# 3. (Optional) scale the worker fleet to 3 nodes
docker compose up --build -d --scale worker=3

# 4. Open the dashboard
#    http://localhost:3000  -> redirects to Clerk sign-in, then /pipelines
```

Check everything is healthy:

```bash
curl http://localhost:4000/api/health
# {"ok":true}
```

### Run the example pipeline

The easiest way is through the dashboard at `http://localhost:3000/pipelines`:
sign in, click "New pipeline", paste in the contents of
`example-pipelines/simple.yaml`, create it, then click "Run". You'll land on
the run page and watch the DAG cards change color in real time; click a step
to stream its logs.

To do the same thing via the API directly (useful for scripting), you need a
Clerk session JWT - the simplest way to grab one for testing is to open your
browser's devtools while logged into the dashboard, run
`await window.Clerk.session.getToken()` in the console, and use it below:

```bash
TOKEN="<paste the JWT here>"

curl -s http://localhost:4000/api/pipelines \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "$(jq -Rs '{yaml: .}' < example-pipelines/simple.yaml)" | tee /tmp/pipeline.json

PIPELINE_ID=$(jq -r .id /tmp/pipeline.json)

curl -s -X POST http://localhost:4000/api/pipelines/$PIPELINE_ID/runs \
  -H "Authorization: Bearer $TOKEN" | tee /tmp/run.json
RUN_ID=$(jq -r .runId /tmp/run.json)

curl -s http://localhost:4000/api/runs/$RUN_ID -H "Authorization: Bearer $TOKEN" \
  | jq '.status, .steps[] | {step_id, status}'
```

### Try the SSH / config-management pipeline

1. Drop a private key for your target host into `./keys/id_rsa` (this directory
   is mounted read-only into every worker container at `/keys`).
2. Edit `example-pipelines/deploy-with-ssh.yaml` with your target host's
   `hostname` / `username`.
3. Create + run it the same way as above. The first step runs in `check: true`
   mode, so it only **logs** the command (`df -h /`) without executing it -
   Ansible-style dry run. The remaining steps actually SSH in and run.

### Try the billing flow

1. From the dashboard, go to **Billing**, click "Upgrade to Pro".
2. The Razorpay checkout modal opens (test mode - use Razorpay's [test card
   numbers](https://razorpay.com/docs/payments/payments/test-card-upi-details/)).
3. On successful payment, Razorpay calls your webhook (`POST
   /api/billing/webhook`), which verifies the signature and activates the
   Pro plan for 30 days - refresh the Billing page to see the new limits.
4. Trigger more runs than the Free plan allowed (1 concurrent / 5 per day) to
   see the 429 plan-limit error before upgrading.

> Webhooks need a publicly reachable URL. For local testing, tunnel the
> master with something like `ngrok http 4000` and point the Razorpay
> webhook at `https://<ngrok-id>.ngrok.app/api/billing/webhook`.

## Running locally without Docker

You need Postgres and Redis running locally (or point `DATABASE_URL` /
`REDIS_URL` at remote instances).

```bash
# Postgres + Redis via Docker, everything else on the host
docker run -d --name orchestra-pg -p 5432:5432 \
  -e POSTGRES_USER=orchestra -e POSTGRES_PASSWORD=orchestra -e POSTGRES_DB=orchestra \
  postgres:16-alpine
docker run -d --name orchestra-redis -p 6379:6379 redis:7-alpine

# Master
cd master
cp .env.example .env
# fill in CLERK_SECRET_KEY (and Razorpay vars if testing billing), or set
# AUTH_OPTIONAL=true to skip auth entirely for local testing
npm install
npm run dev          # ts-node-dev, hot reload on :4000

# Worker (in a second terminal)
cd worker
cp .env.example .env
npm install
npm run dev

# Frontend (in a third terminal)
cd frontend
cp .env.example .env.local
# fill in NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY, RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET
npm install
npm run dev           # Next.js dev server on :3000
```

Open `http://localhost:3000`, sign in/up via Clerk, and you're in.

Run a second worker by starting another `npm run dev` in `worker/` (set
`WORKER_HOSTNAME=worker-2` in its `.env` to distinguish it on the dashboard).

## Pipeline YAML format

```yaml
name: my-pipeline
steps:
  - id: build                # unique step id, referenced by depends_on
    name: Build the app       # optional display name (defaults to id)
    command: "npm run build"  # shell command (local) or remote command (with host:)
    depends_on: [checkout]     # optional list of step ids that must succeed first
    max_attempts: 3            # optional, default 3 - BullMQ retry attempts
    backoff_ms: 2000           # optional, default 2000 - exponential backoff base delay

  - id: deploy
    command: "sudo systemctl restart myapp"
    depends_on: [build]
    host:                      # if present, command runs over SSH instead of locally
      hostname: 10.0.0.5
      username: ubuntu
      privateKeyPath: id_rsa   # resolved relative to SSH_KEY_DIR (/keys) on the worker
      # privateKey: "-----BEGIN OPENSSH PRIVATE KEY-----..."  # or inline key
      # password: "..."        # or password auth
      check: true              # Ansible-style dry run: logs the command, doesn't execute it
```

Steps with no shared dependencies run **in parallel** across the worker pool
(as many as there are available workers/concurrency slots). A step is
skipped if any of its dependencies fail, and that skip cascades to its own
dependents.

## REST API reference

All endpoints except `/api/health`, `/api/workers/register`, and
`/api/workers/:id/heartbeat` require an `Authorization: Bearer <clerk-jwt>`
header (verified server-side against your Clerk app).

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/health` | none | Liveness check |
| `POST` | `/api/pipelines` | required | Create a pipeline. Body: `{ "name"?: string, "yaml": string }` |
| `GET` | `/api/pipelines` | required | List your pipelines |
| `GET` | `/api/pipelines/:id` | required | Get a pipeline (incl. parsed definition) |
| `GET` | `/api/pipelines/:id/runs` | required | List runs for a pipeline |
| `POST` | `/api/pipelines/:id/runs` | required | Trigger a new run -> `{ "runId": "..." }`. Returns `429` if your plan's concurrent-run or daily-run limit is exceeded |
| `GET` | `/api/runs/:id` | required | Run status + all steps |
| `GET` | `/api/runs/:id/logs?stepId=` | required | Logs for a run (optionally filtered to one step) |
| `GET` | `/api/billing/subscription` | required | Current plan + live usage counters |
| `POST` | `/api/billing/orders` | required | Records a pending Razorpay order (called by the frontend's checkout route) |
| `POST` | `/api/billing/webhook` | Razorpay signature | Razorpay webhook receiver - activates a plan on `payment.captured` |
| `POST` | `/api/workers/register` | none | Worker self-registration -> `{ "id": "..." }` |
| `POST` | `/api/workers/:id/heartbeat` | none | Worker heartbeat |
| `GET` | `/api/workers` | required | Fleet health |

### Socket.IO namespaces

- `/agents` - workers emit `log` events `{ runId, stepId, stream, message, ts }`.
- `/dashboard` - browsers `subscribe`/`unsubscribe` to `run:<runId>` rooms and
  receive `log`, `run-update` (`{ steps: [...] }`), and `fleet-update`
  (`{ workers: [...] }`) events.

## Auth: Clerk vs. plain JWT

This build uses **Clerk** rather than hand-rolled JWT auth, by request - it
gets you sign-in/sign-up UI, session management, and token verification for
free, and the Express middleware (`master/src/middleware/auth.ts`) is a thin
20-line wrapper around `@clerk/backend`'s `verifyToken()`. If you'd rather
not depend on Clerk: that middleware is the only place Clerk-specific code
lives on the backend (plus the `ClerkProvider`/`clerkMiddleware`/`<SignIn>`
components on the frontend) - swapping it for plain JWT means replacing
`verifyToken()` with `jsonwebtoken.verify()` against your own secret/issuer,
and replacing Clerk's hosted sign-in pages with your own login form that
calls a `/api/auth/login` endpoint you'd add to the master. Everything
downstream (rate limiting, billing, plan limits) only depends on `req.userId`
being set to a stable string, so it's agnostic to how that string was
verified.

## Extending it

- **More executors**: add a new module next to `worker/src/sshExecutor.ts`
  (e.g. a Docker/Kubernetes exec executor) and dispatch on a new field in the
  step definition.
- **Cron-triggered pipelines**: add a `node-cron` job in the master that calls
  the same `createRun` + `scheduleRun` functions used by the `POST
  /api/pipelines/:id/runs` route.
- **Per-step environment variables / secrets**: extend `PipelineStepDef` and
  `JobPayload` with an `env` map and pass it through to `runLocal`/`runSSH`.
- **Persisted "dead worker" job recovery at the app level**: currently BullMQ's
  stalled-job detection handles this; `heartbeatMonitor.ts` is a natural place
  to add additional app-level recovery (e.g. force-failing steps whose worker
  has been dead for a long time).
- **Go + asynq backend**: a planned follow-up rewrites the master in Go using
  [asynq](https://github.com/hibiken/asynq) (the closest equivalent to
  BullMQ - Redis-backed, supports retries/backoff/scheduled jobs) in place of
  Express + BullMQ, keeping the same Postgres schema and REST contract so the
  Next.js frontend doesn't need to change.
