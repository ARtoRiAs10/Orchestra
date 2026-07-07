'use client';

import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { Server } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ORCHESTRA_SOCKET_URL } from '@/lib/client-api';
import type { WorkerRow } from '@/lib/types';

export function FleetTable({ initialWorkers }: { initialWorkers: WorkerRow[] }) {
  const [workers, setWorkers] = useState(initialWorkers);

  useEffect(() => {
    const socket = io(`${ORCHESTRA_SOCKET_URL}/dashboard`, { reconnection: true });
    socket.on('fleet-update', (payload: { workers: WorkerRow[] }) => setWorkers(payload.workers));
    return () => {
      socket.disconnect();
    };
  }, []);

  const online = workers.filter((w) => w.status === 'online').length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Worker fleet</h1>
        <p className="text-sm text-muted-foreground">
          {online} of {workers.length} workers online · heartbeats are swept every few seconds
        </p>
      </div>

      {workers.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
            <Server className="h-8 w-8" />
            <p className="text-sm">No workers registered yet. Start a worker process to join the fleet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {workers.map((w) => (
            <Card key={w.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-2">
                  <span className="truncate">{w.hostname}</span>
                  <span className={cn('h-2.5 w-2.5 rounded-full', w.status === 'online' ? 'bg-success pulse-dot' : 'bg-destructive')} />
                </CardTitle>
                <CardDescription>id {w.id.slice(0, 8)}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <Badge variant={w.status === 'online' ? 'success' : 'destructive'}>{w.status}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Last heartbeat</span>
                  <span>{new Date(w.last_heartbeat).toLocaleTimeString()}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Registered</span>
                  <span>{new Date(w.registered_at).toLocaleDateString()}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
