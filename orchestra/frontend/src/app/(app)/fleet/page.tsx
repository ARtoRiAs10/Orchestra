import { apiJson } from '@/lib/api';
import { FleetTable } from '@/components/orchestra/fleet-table';
import type { WorkerRow } from '@/lib/types';

export default async function FleetPage() {
  const workers = await apiJson<WorkerRow[]>('/api/workers');
  return <FleetTable initialWorkers={workers} />;
}
