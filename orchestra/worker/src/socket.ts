import { io, Socket } from 'socket.io-client';
import { config } from './config';

let socket: Socket;

export function connectLogSocket(): Socket {
  socket = io(`${config.masterUrl}/agents`, {
    reconnection: true,
    reconnectionDelay: 1000,
  });

  socket.on('connect', () => console.log(`[socket] connected to master at ${config.masterUrl}`));
  socket.on('disconnect', (reason) => console.warn(`[socket] disconnected: ${reason}`));
  socket.on('connect_error', (err) => console.error('[socket] connect_error', err.message));

  return socket;
}

/** Emit a single log line for a step. Safe to call even if the socket is briefly disconnected. */
export function emitLog(runId: string, stepId: string, stream: string, message: string): void {
  if (!socket) return;
  socket.emit('log', { runId, stepId, stream, message, ts: Date.now() });
}
