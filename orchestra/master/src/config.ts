// import path from 'path';
// import dotenv from 'dotenv';
// dotenv.config();

// export const config = {
//   port: parseInt(process.env.PORT || '4000', 10),
//   databaseUrl: process.env.DATABASE_URL || 'postgres://orchestra:orchestra@localhost:5432/orchestra',
//   redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
//   heartbeatTimeoutMs: parseInt(process.env.HEARTBEAT_TIMEOUT_MS || '15000', 10),
//   heartbeatSweepIntervalMs: parseInt(process.env.HEARTBEAT_SWEEP_INTERVAL_MS || '5000', 10),
//   dashboardOrigin: process.env.DASHBOARD_ORIGIN || '*',

//   // Clerk - used to verify the Bearer session token the frontend attaches
//   // to every API request (see src/middleware/auth.ts).
//   clerkSecretKey: process.env.CLERK_SECRET_KEY || '',
//   clerkPublishableKey: process.env.CLERK_PUBLISHABLE_KEY || '',
//   // Set to "true" to allow requests with no auth token (local dev only -
//   // falls back to a fixed dev user id). Never enable in production.
//   authOptional: process.env.AUTH_OPTIONAL === 'true',

//   // Razorpay - server-to-server webhook verification. The order itself is
//   // created by the Next.js API route; this only needs the webhook secret.
//   razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET || '',
//   razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',

//   // Rate limiting
//   globalRateLimitWindowMs: parseInt(process.env.GLOBAL_RATE_LIMIT_WINDOW_MS || '60000', 10),
//   globalRateLimitMax: parseInt(process.env.GLOBAL_RATE_LIMIT_MAX || '300', 10),
// };



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

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  databaseUrl: process.env.DATABASE_URL || 'postgres://orchestra:orchestra@localhost:5432/orchestra',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  heartbeatTimeoutMs: parseInt(process.env.HEARTBEAT_TIMEOUT_MS || '15000', 10),
  heartbeatSweepIntervalMs: parseInt(process.env.HEARTBEAT_SWEEP_INTERVAL_MS || '5000', 10),
  dashboardOrigin: process.env.DASHBOARD_ORIGIN || '*',

  clerkSecretKey: process.env.CLERK_SECRET_KEY || '',
  clerkPublishableKey: process.env.CLERK_PUBLISHABLE_KEY || '',
  authOptional: process.env.AUTH_OPTIONAL === 'true',

  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET || '',
  razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',

  globalRateLimitWindowMs: parseInt(process.env.GLOBAL_RATE_LIMIT_WINDOW_MS || '60000', 10),
  globalRateLimitMax: parseInt(process.env.GLOBAL_RATE_LIMIT_MAX || '300', 10),

  // Frontend origin — used as authorizedParty when verifying Clerk JWTs.
  // Clerk rejects tokens issued for a different origin unless you list it here.
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
};