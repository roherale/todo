import type { Profile } from '@todo/shared';
import { ApiClient } from './api-client.js';
import { resolveSettings, type ConfigStore } from './config.js';
import { CliError, NotLoggedInError } from './errors.js';
import type { Io } from './io.js';
import { discover, refreshTokens } from './oauth.js';
import type { TokenStore } from './token-store.js';

/** Everything the CLI touches outside itself. Real in `main.ts`, replaceable in tests. */
export interface Deps {
  io: Io;
  config: ConfigStore;
  env: NodeJS.ProcessEnv;
  tokens: TokenStore;
  fetch: typeof fetch;
  openBrowser(url: string): Promise<void>;
  now(): Date;
}

/** The API client for the signed-in person, or "Not logged in". */
export async function signedIn(deps: Deps): Promise<ApiClient> {
  if (!(await deps.tokens.load())) throw new NotLoggedInError();
  const settings = resolveSettings(deps.config, deps.env);
  if (!settings.apiUrl) throw new CliError('No API address is set. Run `todo login --api-url <url>` or set TODO_API_URL.');
  const { apiUrl, clientId } = settings;
  return new ApiClient({
    baseUrl: apiUrl,
    tokens: deps.tokens,
    fetch: deps.fetch,
    async refresh(refreshToken) {
      if (!clientId) throw new Error('no client id');
      return refreshTokens(deps.fetch, await discover(apiUrl, deps.fetch), clientId, refreshToken);
    },
  });
}

export const fetchProfile = (client: ApiClient) => client.request<Profile>('GET', '/api/v1/profile');
