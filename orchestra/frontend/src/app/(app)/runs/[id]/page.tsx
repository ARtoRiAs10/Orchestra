import { apiJson } from '@/lib/api';
import { RunView } from '@/components/orchestra/run-view';
import type { Run } from '@/lib/types';

export default async function RunPage({ params }: { params: { id: string } }) {
  const run = await apiJson<Run>(`/api/runs/${params.id}`);
  return <RunView runId={params.id} initialRun={run} />;
}
