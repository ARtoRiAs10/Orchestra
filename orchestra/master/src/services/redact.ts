/**
 * Host targets can contain SSH private keys or passwords. Those values are
 * needed by the worker (they are read from the DB when a job is enqueued),
 * but they must never be returned by the dashboard API.
 */
export function redactHost(host: unknown): unknown {
  if (!host || typeof host !== 'object' || Array.isArray(host)) return host;

  const clone: Record<string, unknown> = { ...(host as Record<string, unknown>) };
  if (typeof clone.privateKey === 'string' && clone.privateKey.length > 0) {
    clone.privateKey = '[REDACTED]';
  }
  if (typeof clone.password === 'string' && clone.password.length > 0) {
    clone.password = '[REDACTED]';
  }
  return clone;
}

/** Redact credentials in a parsed pipeline definition for API responses. */
export function redactPipelineDefinition(definition: unknown): unknown {
  if (!definition || typeof definition !== 'object') return definition;

  const def = definition as { steps?: unknown[] };
  if (!Array.isArray(def.steps)) return definition;

  return {
    ...def,
    steps: def.steps.map((step) => {
      if (!step || typeof step !== 'object') return step;
      const record = step as Record<string, unknown>;
      if (record.host === undefined) return record;
      return { ...record, host: redactHost(record.host) };
    }),
  };
}