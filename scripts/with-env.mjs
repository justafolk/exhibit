import { existsSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { parseEnv } from 'node:util';

export function localEnv() {
  return {
    ...(existsSync('.env') ? parseEnv(readFileSync('.env', 'utf8')) : {}),
    ...process.env,
  };
}
if (process.argv[1]?.endsWith('/with-env.mjs')) {
  const [command, ...args] = process.argv.slice(2);
  if (!command)
    throw new Error('Usage: node scripts/with-env.mjs COMMAND [ARGS]');
  const child = spawn(command, args, { env: localEnv(), stdio: 'inherit' });
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.on(signal, () => child.kill(signal));
  child.on('error', (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  child.on('exit', (code, signal) => {
    process.exitCode = code ?? (signal ? 1 : 0);
  });
}
