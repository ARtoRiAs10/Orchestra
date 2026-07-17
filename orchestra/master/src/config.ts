import path from 'path';
import dotenv from 'dotenv';

// Load .env from the master/ directory regardless of where the process was
// started from. __dirname is master/src/, so we go up one level.
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

// Debug: print whether key vars loaded (shows up in npm run dev output)
const loaded = {
  CLERK_SECRET_KEY: !!process.env.CLERK_SECRET_KEY,
  DATABASE_URL: !!process.env.DATABASE_URL,
  REDIS_URL: !!process.env.REDIS_URL,
};
console.log('[config] env loaded:', loaded);

// Frontend origin — used as authorizedParty when verifying Clerk JWTs, and
// as the CORS origin the browser is allowed to call this API from.
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

// GitHub Codespaces automatically injects CODESPACE_NAME and
// GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN into every process running inside
// the codespace. When present, we derive the *actual* browser-facing URL for
// the frontend (port 3000) so we don't have to hand-maintain it per codespace
// — codespace hostnames are random per environment, so a hardcoded value
// (e.g. copy-pasted from a previous session) breaks the moment you rebuild
// or start a new codespace.
const codespaceName = process.env.CODESPACE_NAME;
const forwardingDomain = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;
const codespaceFrontendUrl =
  codespaceName && forwardingDomain ? `https://${codespaceName}-3000.${forwardingDomain}` : undefined;

// Extra origins can be supplied via a comma-separated env var for any other
// environment (staging, a teammate's tunnel, a custom domain, etc.) without
// editing code.
const extraAuthorizedParties = (process.env.ORCHESTRA_EXTRA_AUTHORIZED_PARTIES || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const authorizedParties = Array.from(
  new Set(
    [frontendUrl, 'http://localhost:3000', codespaceFrontendUrl, ...extraAuthorizedParties].filter(
      (v): v is string => !!v
    )
  )
);

console.log('[config] Clerk authorizedParties:', authorizedParties);

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  databaseUrl: process.env.DATABASE_URL || 'postgres://orchestra:orchestra@localhost:5432/orchestra',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  heartbeatTimeoutMs: parseInt(process.env.HEARTBEAT_TIMEOUT_MS || '15000', 10),
  heartbeatSweepIntervalMs: parseInt(process.env.HEARTBEAT_SWEEP_INTERVAL_MS || '5000', 10),
  // '*' is fine here because auth is via an Authorization header, not
  // cookies (no `credentials: true`), so a wildcard CORS origin is safe.
  dashboardOrigin: process.env.DASHBOARD_ORIGIN || '*',

  clerkSecretKey: process.env.CLERK_SECRET_KEY || '',
  clerkPublishableKey: process.env.CLERK_PUBLISHABLE_KEY || '',
  authOptional: process.env.AUTH_OPTIONAL === 'true',

  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET || '',
  razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',

  globalRateLimitWindowMs: parseInt(process.env.GLOBAL_RATE_LIMIT_WINDOW_MS || '60000', 10),
  globalRateLimitMax: parseInt(process.env.GLOBAL_RATE_LIMIT_MAX || '300', 10),

  frontendUrl,
  // Every origin Clerk should accept a session token as having been issued
  // for. See middleware/auth.ts.
  authorizedParties,
};
