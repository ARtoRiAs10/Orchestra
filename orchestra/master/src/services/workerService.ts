import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db';

export interface WorkerRow {
  id: string;
  hostname: string;
  status: string;
  capabilities: unknown;
  registered_at: string;
  last_heartbeat: string;
}

export async function registerWorker(hostname: string, capabilities: unknown): Promise<string> {
  const id = uuidv4();
  await pool.query(
    `INSERT INTO workers (id, hostname, status, capabilities, last_heartbeat)
     VALUES ($1, $2, 'online', $3, now())`,
    [id, hostname, JSON.stringify(capabilities || {})]
  );
  return id;
}

export async function heartbeat(workerId: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE workers SET last_heartbeat = now(), status = 'online' WHERE id = $1`,
    [workerId]
  );
  return (rowCount ?? 0) > 0;
}

export async function listWorkers(): Promise<WorkerRow[]> {
  const { rows } = await pool.query('SELECT * FROM workers ORDER BY registered_at ASC');
  return rows;
}

/** Mark any worker whose heartbeat is older than `timeoutMs` as "dead". Returns ids that changed. */
export async function markDeadWorkers(timeoutMs: number): Promise<string[]> {
  const { rows } = await pool.query(
    `UPDATE workers
       SET status = 'dead'
     WHERE status = 'online'
       AND last_heartbeat < now() - ($1::int * interval '1 millisecond')
     RETURNING id`,
    [timeoutMs]
  );
  return rows.map((r) => r.id);
}
