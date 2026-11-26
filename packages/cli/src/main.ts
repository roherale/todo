#!/usr/bin/env node
import { spawn } from 'node:child_process';
import type { Deps } from './common/context.js';
import { createFileConfigStore, defaultConfigPath } from './common/config.js';
import { createTerminalIo } from './common/io.js';
import { createKeychainTokenStore } from './common/keychain-store.js';
import { run } from './program.js';

function openBrowser(url: string): Promise<void> {
  const [command, args]: [string, string[]] =
    process.platform === 'darwin' ? ['open', [url]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : ['xdg-open', [url]];
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: 'ignore', detached: true });
    child.on('error', () => resolve()); // the URL was printed, so the person can open it by hand
    child.unref();
    resolve();
  });
}

const deps: Deps = {
  io: createTerminalIo(),
  config: createFileConfigStore(defaultConfigPath()),
  env: process.env,
  tokens: createKeychainTokenStore(),
  fetch,
  openBrowser,
  now: () => new Date(),
};

process.exitCode = await run(process.argv.slice(2), deps);
