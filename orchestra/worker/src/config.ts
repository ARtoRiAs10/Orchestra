import dotenv from 'dotenv';
import os from 'os';
dotenv.config();

export const config = {
  masterUrl: process.env.MASTER_URL || 'http://localhost:4000',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  concurrency: parseInt(process.env.CONCURRENCY || '2', 10),
  heartbeatIntervalMs: parseInt(process.env.HEARTBEAT_INTERVAL_MS || '5000', 10),
  hostname: process.env.WORKER_HOSTNAME || os.hostname(),
  sshKeyDir: process.env.SSH_KEY_DIR || '/keys',
};
