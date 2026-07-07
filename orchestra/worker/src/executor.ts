import { spawn } from 'child_process';
import { LogFn } from './types';

/** Run a shell command locally, streaming stdout/stderr line-by-line via `log`. */
export function runLocal(command: string, log: LogFn): Promise<{ exitCode: number }> {
  return new Promise((resolve) => {
    log('system', `$ ${command}`);

    const child = spawn(command, { shell: true });

    child.stdout.on('data', (chunk: Buffer) => streamLines(chunk, (line) => log('stdout', line)));
    child.stderr.on('data', (chunk: Buffer) => streamLines(chunk, (line) => log('stderr', line)));

    child.on('error', (err) => {
      log('system', `process error: ${err.message}`);
      resolve({ exitCode: 1 });
    });

    child.on('close', (code) => {
      const exitCode = code ?? 1;
      log('system', `process exited with code ${exitCode}`);
      resolve({ exitCode });
    });
  });
}

/** Split a chunk of output into individual lines and emit each separately. */
export function streamLines(chunk: Buffer, emit: (line: string) => void): void {
  const text = chunk.toString('utf8');
  for (const line of text.split(/\r?\n/)) {
    if (line.length > 0) emit(line);
  }
}
