export interface HostTarget {
  hostname: string;
  port?: number;
  username: string;
  privateKeyPath?: string;
  privateKey?: string;
  password?: string;
  check?: boolean;
}

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

export type LogFn = (stream: 'stdout' | 'stderr' | 'system', message: string) => void;
