export interface HostTarget {
  hostname: string;
  port?: number;
  username: string;
  // Either a path to a private key (mounted into the worker container/host)
  // or the raw private key contents. privateKey takes precedence.
  privateKeyPath?: string;
  privateKey?: string;
  password?: string;
}

export interface PipelineStepDef {
  id: string;
  name?: string;
  command: string;
  depends_on?: string[];
  host?: HostTarget;
  max_attempts?: number;
  backoff_ms?: number;
  check?: boolean; // dry-run / Ansible "check mode"
}

export interface PipelineDef {
  name: string;
  steps: PipelineStepDef[];
}

export type StepStatus =
  | 'pending'
  | 'queued'
  | 'running'
  | 'success'
  | 'failed'
  | 'skipped';

export type RunStatus = 'pending' | 'running' | 'success' | 'failed';

export interface JobPayload {
  runId: string;
  stepDbId: string;
  stepId: string;
  command: string;
  host?: HostTarget;
  check?: boolean;
}

export interface JobResult {
  status: 'success' | 'failed';
  exitCode: number;
  workerId: string;
}
