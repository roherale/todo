import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

/** Non-secret settings. Tokens never go here. */
export interface CliConfig {
  apiUrl?: string;
  clientId?: string;
}

export interface ConfigStore {
  read(): CliConfig;
  write(changes: CliConfig): void;
}

export function defaultConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(env['XDG_CONFIG_HOME'] ?? join(homedir(), '.config'), 'todo', 'config.json');
}

export function createFileConfigStore(path: string): ConfigStore {
  return {
    read() {
      try {
        const parsed = JSON.parse(readFileSync(path, 'utf8')) as CliConfig;
        return { ...(typeof parsed.apiUrl === 'string' ? { apiUrl: parsed.apiUrl } : {}), ...(typeof parsed.clientId === 'string' ? { clientId: parsed.clientId } : {}) };
      } catch {
        return {};
      }
    },
    write(changes) {
      const next = { ...this.read(), ...changes };
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
    },
  };
}

/** Environment variables override the file. */
export function resolveSettings(store: ConfigStore, env: NodeJS.ProcessEnv): CliConfig {
  const file = store.read();
  const apiUrl = env['TODO_API_URL'] ?? file.apiUrl;
  const clientId = env['TODO_CLI_CLIENT_ID'] ?? file.clientId;
  return { ...(apiUrl ? { apiUrl: apiUrl.replace(/\/+$/, '') } : {}), ...(clientId ? { clientId } : {}) };
}
