import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { RunStatus, StepStatus } from '@/lib/types';

const VARIANT_MAP: Record<string, 'muted' | 'warning' | 'default' | 'success' | 'destructive' | 'secondary'> = {
  pending: 'muted',
  queued: 'warning',
  running: 'default',
  success: 'success',
  failed: 'destructive',
  skipped: 'secondary',
};

export function StatusBadge({ status, className }: { status: RunStatus | StepStatus; className?: string }) {
  const variant = VARIANT_MAP[status] ?? 'muted';
  return (
    <Badge variant={variant} className={cn(status === 'running' && 'pulse-dot', className)}>
      {status}
    </Badge>
  );
}
