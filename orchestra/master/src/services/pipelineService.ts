import yaml from 'js-yaml';
import { PipelineDef, PipelineStepDef } from '../types';

export class PipelineValidationError extends Error {}

/** Parse a pipeline YAML string into a validated PipelineDef, throwing on cycles or bad refs. */
export function parsePipelineYaml(rawYaml: string): PipelineDef {
  let doc: unknown;
  try {
    doc = yaml.load(rawYaml);
  } catch (err: any) {
    throw new PipelineValidationError(`Invalid YAML: ${err.message}`);
  }

  if (!doc || typeof doc !== 'object') {
    throw new PipelineValidationError('Pipeline YAML must be a mapping with "name" and "steps"');
  }

  const obj = doc as Record<string, unknown>;
  if (typeof obj.name !== 'string' || !obj.name.trim()) {
    throw new PipelineValidationError('Pipeline must have a "name" field');
  }
  if (!Array.isArray(obj.steps) || obj.steps.length === 0) {
    throw new PipelineValidationError('Pipeline must have a non-empty "steps" array');
  }

  const steps: PipelineStepDef[] = obj.steps.map((raw: any, idx: number) => {
    if (!raw || typeof raw !== 'object') {
      throw new PipelineValidationError(`steps[${idx}] must be a mapping`);
    }
    if (typeof raw.id !== 'string' || !raw.id.trim()) {
      throw new PipelineValidationError(`steps[${idx}] must have a string "id"`);
    }
    if (typeof raw.command !== 'string' || !raw.command.trim()) {
      throw new PipelineValidationError(`steps[${idx}] ("${raw.id}") must have a "command"`);
    }
    const dependsOn = raw.depends_on
      ? (Array.isArray(raw.depends_on) ? raw.depends_on : [raw.depends_on])
      : [];

    return {
      id: raw.id,
      name: raw.name || raw.id,
      command: raw.command,
      depends_on: dependsOn,
      host: raw.host,
      max_attempts: typeof raw.max_attempts === 'number' ? raw.max_attempts : 3,
      backoff_ms: typeof raw.backoff_ms === 'number' ? raw.backoff_ms : 2000,
      check: !!raw.check,
    } as PipelineStepDef;
  });

  const ids = new Set(steps.map((s) => s.id));
  if (ids.size !== steps.length) {
    throw new PipelineValidationError('Duplicate step ids detected');
  }

  for (const step of steps) {
    for (const dep of step.depends_on || []) {
      if (!ids.has(dep)) {
        throw new PipelineValidationError(`Step "${step.id}" depends on unknown step "${dep}"`);
      }
    }
  }

  assertNoCycles(steps);

  return { name: obj.name, steps };
}

/** Throws if the step graph contains a cycle (DFS-based cycle detection). */
function assertNoCycles(steps: PipelineStepDef[]): void {
  const graph = new Map<string, string[]>();
  for (const step of steps) graph.set(step.id, step.depends_on || []);

  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  for (const id of graph.keys()) color.set(id, WHITE);

  const visit = (id: string, path: string[]): void => {
    color.set(id, GRAY);
    for (const dep of graph.get(id) || []) {
      const depColor = color.get(dep);
      if (depColor === GRAY) {
        throw new PipelineValidationError(
          `Cycle detected in pipeline: ${[...path, id, dep].join(' -> ')}`
        );
      }
      if (depColor === WHITE) visit(dep, [...path, id]);
    }
    color.set(id, BLACK);
  };

  for (const id of graph.keys()) {
    if (color.get(id) === WHITE) visit(id, []);
  }
}
