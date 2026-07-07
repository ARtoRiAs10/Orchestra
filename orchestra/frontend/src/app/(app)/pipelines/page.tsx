import { apiJson } from '@/lib/api';
import { PipelineList } from '@/components/orchestra/pipeline-list';
import type { Pipeline } from '@/lib/types';

export default async function PipelinesPage() {
  const pipelines = await apiJson<Pipeline[]>('/api/pipelines');
  return <PipelineList initialPipelines={pipelines} />;
}
