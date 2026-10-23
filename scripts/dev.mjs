import { spawn } from 'node:child_process';
import { localEnv } from './with-env.mjs';
const env = localEnv();
env.API_PORT ??= '8080';
env.WEB_PORT ??= '5173';
env.API_ADDR = `127.0.0.1:${env.API_PORT}`;
env.EXHIBIT_STORE ??= 'demo';
// The browser's origin is the Vite port, even when the proxy rewrites Host.
env.EXHIBIT_PUBLIC_ORIGIN ??= `http://127.0.0.1:${env.WEB_PORT}`;
let stopping = false;
const children = [];
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) {
    if (child.pid) {
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {}
    }
  }
}
for (const [command, args] of [
  ['go', ['run', './services/api/cmd/server']],
  [
    'npm',
    [
      'run',
      'dev',
      '--workspace',
      '@exhibit/web',
      '--',
      '--host',
      '127.0.0.1',
      '--port',
      env.WEB_PORT,
    ],
  ],
]) {
  const child = spawn(command, args, { env, stdio: 'inherit', detached: true });
  children.push(child);
  child.on('error', (error) => {
    console.error(error.message);
    stop(1);
  });
  child.on('exit', (code) => {
    if (!stopping) stop(code || 1);
  });
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
