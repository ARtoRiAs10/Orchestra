# Deployment

## Can this be hosted on Vercel?

**Only the `orchestra/frontend` Next.js app can be hosted on Vercel.** The
`master` and `worker` services cannot run on Vercel:

- `master` is a long-running Express + Socket.IO server with BullMQ queue
  listeners, a heartbeat monitor, and a Postgres connection pool.
- `worker` is an always-on BullMQ worker that executes shell/SSH commands.
- Vercel is request/response serverless: it does not provide a persistent
  WebSocket server, background workers, a Docker daemon, or an SSH agent.

So a Vercel deployment is a valid **frontend-only** deployment. The control
plane must run somewhere that supports always-on Node processes (Render,
Railway, Fly.io, a VPS, etc.), with managed Postgres and Redis.

## Reference topology

| Piece | Where to host |
|---|---|
| `orchestra/frontend` | Vercel (Root Directory = `orchestra/frontend`) |
| `orchestra/master` | Render / Railway / Fly.io / VPS (Docker or `npm run build && npm start`) |
| `orchestra/worker` | Same always-on host as master, or separate hosts; scale horizontally |
| Postgres | Neon / Supabase / Railway / any Postgres with a `DATABASE_URL` |
| Redis | Upstash / Railway / any Redis with a `REDIS_URL` |
| Clerk | Clerk-hosted (no hosting needed) |
| Razorpay | Razorpay-hosted checkout; webhook points at the master's public URL |

## Vercel settings (frontend)

1. Import the repo and set **Root Directory** to `orchestra/frontend`.
2. Add environment variables (Vercel → Settings → Environment Variables):

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable key (build-time) |
| `CLERK_SECRET_KEY` | Clerk secret key (server components / route handlers) |
| `ORCHESTRA_API_URL` | Server-side master URL (e.g. `https://orchestra-master.onrender.com`) |
| `NEXT_PUBLIC_ORCHESTRA_API_URL` | Browser-facing master URL (build-time) |
| `NEXT_PUBLIC_ORCHESTRA_SOCKET_URL` | Browser-facing Socket.IO URL (build-time; `https://...` is fine) |
| `RAZORPAY_KEY_ID` | Razorpay checkout key id |
| `RAZORPAY_KEY_SECRET` | Razorpay checkout key secret |

`NEXT_PUBLIC_*` values are inlined at build time. If you change them, trigger a
new Vercel deployment.

3. In Clerk, add the Vercel domain to the allowed origins / sign-in URLs.
4. Point the Razorpay webhook at the **master** URL:
   `https://<master-host>/api/billing/webhook` (event: `payment.captured`).

## Master environment

Set at minimum:

```bash
PORT=4000
DATABASE_URL=postgres://...
REDIS_URL=redis://...
CLERK_SECRET_KEY=sk_...
AUTH_OPTIONAL=false

# Clerk must accept tokens issued to the Vercel frontend origin:
FRONTEND_URL=https://your-app.vercel.app
# For a custom domain, or extra origins:
# ORCHESTRA_EXTRA_AUTHORIZED_PARTIES=https://custom.example.com

# CORS + Socket.IO allowed origin:
DASHBOARD_ORIGIN=https://your-app.vercel.app

# Razorpay webhook signature verification:
RAZORPAY_WEBHOOK_SECRET=...

# Heartbeats / queue:
HEARTBEAT_TIMEOUT_MS=15000
HEARTBEAT_SWEEP_INTERVAL_MS=5000
```

If `FRONTEND_URL` / `ORCHESTRA_EXTRA_AUTHORIZED_PARTIES` does not include the
exact browser origin, Clerk token verification fails with
`Invalid JWT: azp claim not authorized` and every authenticated API call
returns 401.

## Worker environment

```bash
MASTER_URL=https://<master-host>
REDIS_URL=redis://...        # same Redis as master
CONCURRENCY=2
JOB_LOCK_DURATION_MS=300000
WORKER_HOSTNAME=worker-1
SSH_KEY_DIR=/keys
```

Mount SSH private keys read-only at `SSH_KEY_DIR` if you use `host.privateKeyPath`.
Use `restart: unless-stopped` (or your platform's equivalent) so workers
re-register after a crash.

## Vercel-specific caveats

- Do not try to deploy the repo root: there is no root `package.json`; set the
  Vercel Root Directory to `orchestra/frontend`.
- The frontend's `/api/billing/checkout` route is a normal Next.js route
  handler and works on Vercel. The actual payment activation still happens via
  the master's webhook, so the master must be publicly reachable.
- Vercel's serverless function timeout is short; keep the checkout route fast
  (it only creates a Razorpay order and records it). Long work belongs in the
  master/worker.
- A Vercel Hobby deployment is fine for demos. Production use needs an
  always-on master/worker host, managed Postgres/Redis, and monitoring.

## Local development

`docker compose up --build` still works for the full stack. The frontend's
Dockerfile now creates an empty `public/` directory if the repo does not have
one, so the image build no longer fails on `COPY --from=build /app/public`.