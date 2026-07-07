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
