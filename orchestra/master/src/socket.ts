import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { config } from './config';
import { pool } from './db';

let io: Server;

export function initSocket(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: { origin: config.dashboardOrigin },
  });

  // Namespace used by worker agents to stream stdout/stderr lines
  // and to push connection-level events (connect/disconnect == fleet health hints).
  const agents = io.of('/agents');
  agents.on('connection', (socket: Socket) => {
    console.log(`[socket] agent connected: ${socket.id}`);

    socket.on('log', async (payload: { runId: string; stepId: string; stream: string; message: string; ts: number }) => {
      try {
        await pool.query(
          `INSERT INTO logs (run_id, step_id, stream, message, ts) VALUES ($1, $2, $3, $4, to_timestamp($5 / 1000.0))`,
          [payload.runId, payload.stepId, payload.stream, payload.message, payload.ts]
        );
      } catch (err) {
        console.error('[socket] failed to persist log line', err);
      }
      // Fan the log line out to any dashboard clients watching this run.
      io.of('/dashboard').to(`run:${payload.runId}`).emit('log', payload);
    });

    socket.on('disconnect', () => {
      console.log(`[socket] agent disconnected: ${socket.id}`);
    });
  });

  // Namespace used by the web dashboard for live updates.
  const dashboard = io.of('/dashboard');
  dashboard.on('connection', (socket: Socket) => {
    socket.on('subscribe', (runId: string) => {
      socket.join(`run:${runId}`);
    });
    socket.on('unsubscribe', (runId: string) => {
      socket.leave(`run:${runId}`);
    });
  });

  return io;
}

/** Broadcast a run/step status change to dashboard clients watching that run. */
export function broadcastRunUpdate(runId: string, payload: unknown): void {
  if (!io) return;
  io.of('/dashboard').to(`run:${runId}`).emit('run-update', payload);
}

/** Broadcast a worker fleet change to all dashboard clients. */
export function broadcastFleetUpdate(payload: unknown): void {
  if (!io) return;
  io.of('/dashboard').emit('fleet-update', payload);
}
