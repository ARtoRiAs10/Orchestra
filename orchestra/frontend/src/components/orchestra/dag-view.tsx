'use client';

import { cn } from '@/lib/utils';
import { StatusBadge } from '@/components/orchestra/status-badge';
import type { StepRow } from '@/lib/types';

/** Group steps into levels where level N depends only on steps in levels < N, for a left-to-right DAG layout. */
function computeLevels(steps: StepRow[]): StepRow[][] {
  const levelOf = new Map<string, number>();
  const byStepId = new Map(steps.map((s) => [s.step_id, s]));

  const resolve = (stepId: string, seen = new Set<string>()): number => {
    if (levelOf.has(stepId)) return levelOf.get(stepId)!;
    if (seen.has(stepId)) return 0; // guard against malformed cycles
    seen.add(stepId);

    const step = byStepId.get(stepId);
    const deps = step?.depends_on || [];
    const level = deps.length === 0 ? 0 : 1 + Math.max(...deps.map((d) => resolve(d, seen)));
    levelOf.set(stepId, level);
    return level;
  };

  for (const step of steps) resolve(step.step_id);

  const maxLevel = Math.max(0, ...Array.from(levelOf.values()));
  const levels: StepRow[][] = Array.from({ length: maxLevel + 1 }, () => []);
  for (const step of steps) levels[levelOf.get(step.step_id) ?? 0].push(step);
  return levels;
}

export function DagView({ steps, selectedStepId, onSelectStep }: { steps: StepRow[]; selectedStepId: string | null; onSelectStep: (step: StepRow) => void }) {
  const levels = computeLevels(steps);

  return (
    <div className="space-y-0">
      {levels.map((level, i) => (
        <div key={i}>
          <div className="flex flex-wrap items-stretch gap-3">
            {level.map((step) => (
              <button
                key={step.id}
                onClick={() => onSelectStep(step)}
                className={cn(
                  'min-w-[180px] flex-1 rounded-lg border bg-card px-4 py-3 text-left transition-colors hover:border-primary/60',
                  selectedStepId === step.id ? 'border-primary ring-1 ring-primary' : 'border-border'
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{step.name || step.step_id}</span>
                  <StatusBadge status={step.status} />
                </div>
                <div className="mt-1 truncate font-mono text-xs text-muted-foreground">{step.command}</div>
                {step.depends_on?.length > 0 && (
                  <div className="mt-1 text-xs text-muted-foreground">depends on: {step.depends_on.join(', ')}</div>
                )}
                {step.attempts > 0 && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    attempt {step.attempts}/{step.max_attempts}
                    {step.worker_id ? ` · worker ${step.worker_id.slice(0, 8)}` : ''}
                  </div>
                )}
              </button>
            ))}
          </div>
          {i < levels.length - 1 && <div className="dag-rail mx-auto my-2 h-6 w-px" />}
        </div>
      ))}
    </div>
  );
}
