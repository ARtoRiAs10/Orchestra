import { Pool } from 'pg';
import { config } from './config';

export const pool = new Pool({
  connectionString: config.databaseUrl,
  // Required for Neon, Supabase, Railway and any other hosted Postgres that
  // enforces SSL. rejectUnauthorized:false accepts self-signed certs without
  // needing to install a CA bundle.
  ssl: config.databaseUrl.includes('sslmode') || config.databaseUrl.includes('neon.tech')
    ? { rejectUnauthorized: false }
    : false,
});

const MIGRATIONS_SQL = `
CREATE TABLE IF NOT EXISTS pipelines (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  definition JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS runs (
  id UUID PRIMARY KEY,
  pipeline_id UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS steps (
  id UUID PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  step_id TEXT NOT NULL,
  name TEXT,
  command TEXT NOT NULL,
  depends_on TEXT[] NOT NULL DEFAULT '{}',
  host JSONB,
  status TEXT NOT NULL DEFAULT 'pending',
  worker_id TEXT,
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  backoff_ms INT NOT NULL DEFAULT 2000,
  exit_code INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_steps_run_id ON steps(run_id);

CREATE TABLE IF NOT EXISTS workers (
  id TEXT PRIMARY KEY,
  hostname TEXT,
  status TEXT NOT NULL DEFAULT 'online',
  capabilities JSONB,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS logs (
  id BIGSERIAL PRIMARY KEY,
  run_id UUID NOT NULL,
  step_id UUID NOT NULL,
  stream TEXT NOT NULL,
  message TEXT NOT NULL,
  ts TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_logs_run_id ON logs(run_id);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'free',
  status TEXT NOT NULL DEFAULT 'active',
  razorpay_subscription_id TEXT,
  razorpay_customer_id TEXT,
  current_period_end TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS billing_orders (
  id UUID PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  razorpay_order_id TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL,
  amount INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID PRIMARY KEY,
  provider TEXT NOT NULL,
  event_id TEXT,
  event_type TEXT,
  payload JSONB,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(provider, event_id)
);

ALTER TABLE pipelines ADD COLUMN IF NOT EXISTS owner_id TEXT REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS owner_id TEXT REFERENCES users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_pipelines_owner_id ON pipelines(owner_id);
CREATE INDEX IF NOT EXISTS idx_runs_owner_id ON runs(owner_id);
`;

export async function migrate(): Promise<void> {
  await pool.query(MIGRATIONS_SQL);
  console.log('[db] migrations applied');
}





// import { Pool } from 'pg';
// import { config } from './config';

// export const pool = new Pool({
//   connectionString: config.databaseUrl,
//   // Required for Neon, Supabase, Railway and any other hosted Postgres that
//   // enforces SSL. rejectUnauthorized:false accepts self-signed certs without
//   // needing to install a CA bundle.
//   ssl: config.databaseUrl.includes('sslmode') || config.databaseUrl.includes('neon.tech')
//     ? { rejectUnauthorized: false }
//     : false,
// });

// const MIGRATIONS_SQL = `
// CREATE TABLE IF NOT EXISTS pipelines (
//   id UUID PRIMARY KEY,
//   name TEXT NOT NULL,
//   definition JSONB NOT NULL,
//   created_at TIMESTAMPTZ NOT NULL DEFAULT now()
// );

// CREATE TABLE IF NOT EXISTS runs (
//   id UUID PRIMARY KEY,
//   pipeline_id UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
//   status TEXT NOT NULL DEFAULT 'pending',
//   created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
//   started_at TIMESTAMPTZ,
//   finished_at TIMESTAMPTZ
// );

// CREATE TABLE IF NOT EXISTS steps (
//   id UUID PRIMARY KEY,
//   run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
//   step_id TEXT NOT NULL,
//   name TEXT,
//   command TEXT NOT NULL,
//   depends_on TEXT[] NOT NULL DEFAULT '{}',
//   host JSONB,
//   status TEXT NOT NULL DEFAULT 'pending',
//   worker_id TEXT,
//   attempts INT NOT NULL DEFAULT 0,
//   max_attempts INT NOT NULL DEFAULT 3,
//   backoff_ms INT NOT NULL DEFAULT 2000,
//   exit_code INT,
//   created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
//   started_at TIMESTAMPTZ,
//   finished_at TIMESTAMPTZ
// );
// CREATE INDEX IF NOT EXISTS idx_steps_run_id ON steps(run_id);

// CREATE TABLE IF NOT EXISTS workers (
//   id TEXT PRIMARY KEY,
//   hostname TEXT,
//   status TEXT NOT NULL DEFAULT 'online',
//   capabilities JSONB,
//   registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
//   last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT now()
// );

// CREATE TABLE IF NOT EXISTS logs (
//   id BIGSERIAL PRIMARY KEY,
//   run_id UUID NOT NULL,
//   step_id UUID NOT NULL,
//   stream TEXT NOT NULL,
//   message TEXT NOT NULL,
//   ts TIMESTAMPTZ NOT NULL DEFAULT now()
// );
// CREATE INDEX IF NOT EXISTS idx_logs_run_id ON logs(run_id);

// CREATE TABLE IF NOT EXISTS users (
//   id TEXT PRIMARY KEY,
//   email TEXT,
//   created_at TIMESTAMPTZ NOT NULL DEFAULT now()
// );

// CREATE TABLE IF NOT EXISTS subscriptions (
//   user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
//   plan TEXT NOT NULL DEFAULT 'free',
//   status TEXT NOT NULL DEFAULT 'active',
//   razorpay_subscription_id TEXT,
//   razorpay_customer_id TEXT,
//   current_period_end TIMESTAMPTZ,
//   updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
// );

// CREATE TABLE IF NOT EXISTS billing_orders (
//   id UUID PRIMARY KEY,
//   user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
//   razorpay_order_id TEXT NOT NULL UNIQUE,
//   plan TEXT NOT NULL,
//   amount INT NOT NULL,
//   status TEXT NOT NULL DEFAULT 'pending',
//   created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
//   paid_at TIMESTAMPTZ
// );

// CREATE TABLE IF NOT EXISTS webhook_events (
//   id UUID PRIMARY KEY,
//   provider TEXT NOT NULL,
//   event_id TEXT,
//   event_type TEXT,
//   payload JSONB,
//   received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
//   UNIQUE(provider, event_id)
// );

// ALTER TABLE pipelines ADD COLUMN IF NOT EXISTS owner_id TEXT REFERENCES users(id) ON DELETE CASCADE;
// ALTER TABLE runs ADD COLUMN IF NOT EXISTS owner_id TEXT REFERENCES users(id) ON DELETE CASCADE;
// CREATE INDEX IF NOT EXISTS idx_pipelines_owner_id ON pipelines(owner_id);
// CREATE INDEX IF NOT EXISTS idx_runs_owner_id ON runs(owner_id);
// `;

// export async function migrate(): Promise<void> {
//   await pool.query(MIGRATIONS_SQL);
//   console.log('[db] migrations applied');
// }