import axios from 'axios';
import IORedis from 'ioredis';
import { Worker, Job } from 'bullmq';
import { config } from './config';
import { connectLogSocket, emitLog } from './socket';
import { runLocal } from './executor';
import { runSSH } from './sshExecutor';
import { JobPayload, JobResult } from './types';

const QUEUE_NAME = 'orchestra-jobs';

async function main() {
  const workerId = await registerWithMaster();
  console.log(`[worker] registered as ${workerId} (${config.hostname})`);

  startHeartbeat(workerId);
  connectLogSocket();

  const connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });

  const worker = new Worker<JobPayload, JobResult>(
    QUEUE_NAME,
    async (job: Job<JobPayload>) => processJob(job, workerId),
    { connection, concurrency: config.concurrency }
  );

  worker.on('error', (err) => console.error('[worker] error', err));

  console.log(`[worker] listening for jobs (concurrency=${config.concurrency})`);
}

async function registerWithMaster(): Promise<string> {
  const { data } = await axios.post(`${config.masterUrl}/api/workers/register`, {
    hostname: config.hostname,
    capabilities: { concurrency: config.concurrency },
  });
  return data.id as string;
}

function startHeartbeat(workerId: string): void {
  const beat = async () => {
    try {
      await axios.post(`${config.masterUrl}/api/workers/${workerId}/heartbeat`);
    } catch (err: any) {
      console.warn('[worker] heartbeat failed', err.message);
    }
  };
  beat();
  setInterval(beat, config.heartbeatIntervalMs);
}

/**
 * Execute a single pipeline step.
 *
 * On a non-zero exit code we THROW (rather than returning a "failed" result)
 * so that BullMQ's attempts/backoff mechanism kicks in and the step is
 * retried on this or another worker before being marked permanently failed.
 */
async function processJob(job: Job<JobPayload>, workerId: string): Promise<JobResult> {
  const { runId, stepDbId, stepId, command, host, check } = job.data;
  const log = (stream: 'stdout' | 'stderr' | 'system', message: string) =>
    emitLog(runId, stepDbId, stream, message);

  log('system', `[worker ${workerId}] starting step "${stepId}" (attempt ${job.attemptsMade + 1}/${job.opts.attempts})`);

  const target = host ? { ...host, check: check ?? host.check } : undefined;
  const { exitCode } = target ? await runSSH(target, command, log) : await runLocal(command, log);

  if (exitCode === 0) {
    log('system', `step "${stepId}" succeeded`);
    return { status: 'success', exitCode, workerId };
  }

  log('system', `step "${stepId}" failed with exit code ${exitCode}`);
  throw new Error(JSON.stringify({ exitCode, workerId }));
}

main().catch((err) => {
  console.error('[worker] fatal startup error', err);
  process.exit(1);
});
