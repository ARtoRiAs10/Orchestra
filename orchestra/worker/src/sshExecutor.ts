import fs from 'fs';
import path from 'path';
import { Client } from 'ssh2';
import { config } from './config';
import { HostTarget, LogFn } from './types';
import { streamLines } from './executor';

/**
 * Run a command on a remote host over SSH, streaming stdout/stderr via `log`.
 *
 * If `host.check` is set (Ansible "check mode" equivalent), the command is
 * not executed - we just report what *would* run, so pipelines can be dry-run
 * against production hosts safely.
 */
export function runSSH(host: HostTarget, command: string, log: LogFn): Promise<{ exitCode: number }> {
  if (host.check) {
    log('system', `[check mode] would run on ${host.username}@${host.hostname}: ${command}`);
    return Promise.resolve({ exitCode: 0 });
  }

  return new Promise((resolve) => {
    const conn = new Client();

    conn.on('ready', () => {
      log('system', `connected to ${host.username}@${host.hostname}`);
      conn.exec(command, (err, stream) => {
        if (err) {
          log('system', `exec error: ${err.message}`);
          conn.end();
          return resolve({ exitCode: 1 });
        }

        log('system', `$ ${command}`);

        stream.on('close', (code: number | null) => {
          const exitCode = code ?? 1;
          log('system', `remote process exited with code ${exitCode}`);
          conn.end();
          resolve({ exitCode });
        });

        stream.on('data', (chunk: Buffer) => streamLines(chunk, (line) => log('stdout', line)));
        stream.stderr.on('data', (chunk: Buffer) => streamLines(chunk, (line) => log('stderr', line)));
      });
    });

    conn.on('error', (err) => {
      log('system', `ssh connection error: ${err.message}`);
      resolve({ exitCode: 1 });
    });

    conn.connect({
      host: host.hostname,
      port: host.port || 22,
      username: host.username,
      privateKey: resolvePrivateKey(host),
      password: host.password,
    });
  });
}

function resolvePrivateKey(host: HostTarget): Buffer | undefined {
  if (host.privateKey) return Buffer.from(host.privateKey);
  if (host.privateKeyPath) {
    const resolved = path.isAbsolute(host.privateKeyPath)
      ? host.privateKeyPath
      : path.join(config.sshKeyDir, host.privateKeyPath);
    return fs.readFileSync(resolved);
  }
  return undefined;
}
