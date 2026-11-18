'use client';

import { useEffect, useState, useCallback } from 'react';
import { io, type Socket } from 'socket.io-client';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/orchestra/status-badge';
import { DagView } from '@/components/orchestra/dag-view';
import { LogPanel } from '@/components/orchestra/log-panel';
import { useOrchestraApi, ORCHESTRA_SOCKET_URL } from '@/lib/client-api';
import type { Run, RunStatus, StepRow, LogLine } from '@/lib/types';

export function RunView({ runId, initialRun }: { runId: string; initialRun: Run }) {
  const { apiJson } = useOrchestraApi();
  const [run, setRun] = useState<Run>(initialRun);
  const [selectedStep, setSelectedStep] = useState<StepRow | null>(null);
  const [logs, setLogs] = useState<LogLine[]>([]);

  const selectStep = useCallback(
    async (step: StepRow) => {
      setSelectedStep(step);
      try {
        const data = await apiJson<LogLine[]>(`/api/runs/${runId}/logs?stepId=${step.id}`);
        setLogs(data);
      } catch {
        setLogs([]);
      }
    },
    [apiJson, runId]
  );

  useEffect(() => {
    const socket: Socket = io(`${ORCHESTRA_SOCKET_URL}/dashboard`, { reconnection: true });

    socket.on('connect', () => socket.emit('subscribe', runId));

    socket.on('run-update', (payload: { steps?: StepRow[]; runStatus?: RunStatus }) => {
      setRun((prev) => ({
        ...prev,
        steps: payload.steps ?? prev.steps,
        status: payload.runStatus ?? prev.status,
      }));
    });

    socket.on('log', (line: LogLine) => {
      setSelectedStep((current) => {
        if (current && line.step_id === current.id) {
          setLogs((prev) => [...prev, line]);
        }
        return current;
      });
    });

    return () => {
      socket.emit('unsubscribe', runId);
      socket.disconnect();
    };
  }, [runId]);

  // Socket updates can be missed during a reconnect, and some managed hosts
  // buffer/proxy WebSockets. Poll as a fallback while the run is active.
  useEffect(() => {
    if (run.status !== 'running') return;
    const interval = setInterval(async () => {
      try {
        const fresh = await apiJson<Run>(`/api/runs/${runId}`);
        setRun(fresh);
      } catch {
        /* transient polling failure - the socket will retry */
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [apiJson, runId, run.status]);

  // The run row is the source of truth for the overall status; socket updates
  // and polling keep it fresh while the run is active.
  const overallStatus = run.status;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/pipelines">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Run {runId.slice(0, 8)}</h1>
            <p className="text-sm text-muted-foreground">Started {new Date(run.started_at || run.created_at).toLocaleString()}</p>
          </div>
        </div>
        <StatusBadge status={overallStatus} className="text-sm" />
      </div>

      <Card>
        <CardContent className="py-6">
          <DagView steps={run.steps} selectedStepId={selectedStep?.id ?? null} onSelectStep={selectStep} />
        </CardContent>
      </Card>

      <div className="h-80">
        <LogPanel stepLabel={selectedStep ? selectedStep.name || selectedStep.step_id : null} logs={logs} />
      </div>
    </div>
  );
}
