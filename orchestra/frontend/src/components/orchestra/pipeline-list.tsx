'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Plus, Play, AlertCircle, GitBranch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import Link from 'next/link';
import { useOrchestraApi } from '@/lib/client-api';
import type { Pipeline } from '@/lib/types';

const PLACEHOLDER_YAML = `name: my-pipeline
steps:
  - id: checkout
    command: echo "checking out code"
  - id: build
    command: echo "building"
    depends_on: [checkout]
`;

export function PipelineList({ initialPipelines }: { initialPipelines: Pipeline[] }) {
  const router = useRouter();
  const { apiJson } = useOrchestraApi();

  const [pipelines, setPipelines] = useState(initialPipelines);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [yamlText, setYamlText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function createPipeline(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const created = await apiJson<Pipeline>('/api/pipelines', {
        method: 'POST',
        body: JSON.stringify({ name: name || undefined, yaml: yamlText }),
      });
      setPipelines((prev) => [created, ...prev]);
      setOpen(false);
      setName('');
      setYamlText('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function triggerRun(pipelineId: string) {
    setRunError(null);
    setBusy(true);
    try {
      const { runId } = await apiJson<{ runId: string }>(`/api/pipelines/${pipelineId}/runs`, { method: 'POST' });
      router.push(`/runs/${runId}`);
    } catch (err: any) {
      setRunError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pipelines</h1>
          <p className="text-sm text-muted-foreground">DAG-based CI/CD pipelines, dispatched to your worker fleet.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4" />
              New pipeline
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>New pipeline</DialogTitle>
              <DialogDescription>Define a pipeline as a YAML DAG of steps. Each step runs as a job on the worker fleet.</DialogDescription>
            </DialogHeader>
            <form onSubmit={createPipeline} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="pipeline-name">Name (optional - falls back to the YAML's name field)</Label>
                <Input id="pipeline-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="my-pipeline" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pipeline-yaml">Pipeline YAML</Label>
                <Textarea
                  id="pipeline-yaml"
                  value={yamlText}
                  onChange={(e) => setYamlText(e.target.value)}
                  placeholder={PLACEHOLDER_YAML}
                  rows={14}
                  className="font-mono text-xs"
                  required
                />
              </div>
              {error && (
                <p className="flex items-center gap-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4" /> {error}
                </p>
              )}
              <DialogFooter>
                <Button type="submit" disabled={busy}>
                  Create pipeline
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {runError && (
        <Card className="border-destructive/50 bg-destructive/10">
          <CardContent className="flex items-center gap-2 py-4 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" /> {runError}
          </CardContent>
        </Card>
      )}

      {pipelines.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
            <GitBranch className="h-8 w-8" />
            <p className="text-sm">No pipelines yet. Create one to define your first DAG.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {pipelines.map((p) => (
            <Card key={p.id}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <GitBranch className="h-4 w-4 text-primary" />
                  <Link href={`/pipelines/${p.id}`} className="hover:text-primary hover:underline">
                    {p.name}
                  </Link>
                </CardTitle>
                <CardDescription>
                  {p.definition?.steps?.length ?? 0} steps · created {new Date(p.created_at).toLocaleString()}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex items-center gap-2">
                <Button size="sm" onClick={() => triggerRun(p.id)} disabled={busy}>
                  <Play className="h-3.5 w-3.5" />
                  Run
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <Link href={`/pipelines/${p.id}`}>Details</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
