import { notFound } from 'next/navigation';
import { apiJson } from '@/lib/api';
import { PipelineDetail } from '@/components/orchestra/pipeline-detail';
import type { Pipeline, RunSummary } from '@/lib/types';

export default async function PipelinePage({ params }: { params: { id: string } }) {
  const pipeline = await apiJson<Pipeline>(`/api/pipelines/${params.id}`).catch(() => null);
  if (!pipeline) notFound();

  const runs = await apiJson<RunSummary[]>(`/api/pipelines/${params.id}/runs`);

  return <PipelineDetail pipeline={pipeline} initialRuns={runs} />;
}