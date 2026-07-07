import { config } from '../config';
import { markDeadWorkers, listWorkers } from '../services/workerService';
import { broadcastFleetUpdate } from '../socket';

/**
 * Periodically sweeps the worker registry for missed heartbeats.
 *
 * In-flight jobs owned by a worker that goes silent are recovered by
 * BullMQ's stalled-job detection (the job's lock expires and it is
 * automatically re-queued for another worker, up to each step's
 * max_attempts) - this monitor's job is purely fleet-health visibility
 * for the dashboard.
 */
export function startHeartbeatMonitor(): void {
  setInterval(async () => {
    try {
      const deadIds = await markDeadWorkers(config.heartbeatTimeoutMs);
      if (deadIds.length > 0) {
        console.warn(`[heartbeat] marked workers dead: ${deadIds.join(', ')}`);
      }
      broadcastFleetUpdate({ workers: await listWorkers() });
    } catch (err) {
      console.error('[heartbeat] sweep failed', err);
    }
  }, config.heartbeatSweepIntervalMs);

  console.log(
    `[heartbeat] monitor started (timeout=${config.heartbeatTimeoutMs}ms, interval=${config.heartbeatSweepIntervalMs}ms)`
  );
}
