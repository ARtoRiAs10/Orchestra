'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowLeft, Loader2, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { StatusBadge } from '@/components/orchestra/status-badge';
import { useOrchestraApi } from '@/lib/client-api';
import type { Pipeline, RunSummary } from '@/lib/types';

function formatTime(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

export function PipelineDetail({ pipeline, initialRuns }: { pipeline: Pipeline; initialRuns: RunSummary[] }) {
  const router = useRouter();
  const { apiJson } = useOrchestraApi();
  const [runs, setRuns] = useState(initialRuns);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function triggerRun() {
    setBusy(true);
    setError(null);
    try {
      const { runId } = await apiJson<{ runId: string }>(`/api/pipelines/${pipeline.id}/runs`, { method: 'POST' });
      router.push(`/runs/${runId}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to start run');
      setBusy(false);
    }
  }

  const steps = pipeline.definition?.steps ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/pipelines"
            className="mb-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to pipelines
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">{pipeline.name}</h1>
          <p className="text-sm text-muted-foreground">
            {steps.length} steps · created {formatTime(pipeline.created_at)}
          </p>
        </div>
        <Button onClick={triggerRun} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          Run pipeline
        </Button>
      </div>

      {error && (
        <Card className="border-destructive/50 bg-destructive/10">
          <CardContent className="flex items-center gap-2 py-4 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" /> {error}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Pipeline definition</CardTitle>
          <CardDescription>
            Steps run in dependency order; steps with no shared dependencies run in parallel on the worker fleet.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {steps.map((step) => (
            <div key={step.id} className="rounded-md border border-border px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium">{step.name || step.id}</span>
                <span className="font-mono text-xs text-muted-foreground">{step.id}</span>
              </div>
              <div className="mt-1 break-all font-mono text-xs text-muted-foreground">{step.command}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {step.depends_on?.length ? `depends on: ${step.depends_on.join(', ')}` : 'no dependencies'}
                {step.host ? ' · remote host' : ' · local shell'}
                {step.check ? ' · check mode' : ''}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Run history</CardTitle>
          <CardDescription>{runs.length} recorded runs</CardDescription>
        </CardHeader>
        <CardContent>
          {runs.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No runs yet. Trigger one above.</p>
          ) : (
            <div className="divide-y divide-border">
              {runs.map((run) => (
                <div key={run.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={run.status} />
                      <span className="text-sm font-medium">Run {run.id.slice(0, 8)}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Started {formatTime(run.started_at)} · Finished {formatTime(run.finished_at)}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/runs/${run.id}`}>Open</Link>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}