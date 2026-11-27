import { ApiError, CliError, NotLoggedInError, SignupRequiredError } from './errors.js';
import type { StoredTokens, TokenStore } from './token-store.js';

export interface ApiClientOptions {
  baseUrl: string;
  tokens: TokenStore;
  fetch: typeof fetch;
  /** Exchanges a refresh token for new tokens; rejects when the provider refuses it. */
  refresh(refreshToken: string): Promise<StoredTokens>;
}

type Query = Record<string, string | number | undefined>;

export class ApiClient {
  constructor(private readonly options: ApiClientOptions) {}

  async request<T>(method: string, path: string, init: { query?: Query; body?: unknown } = {}): Promise<T> {
    const stored = await this.options.tokens.load();
    if (!stored) throw new NotLoggedInError();
    let res = await this.send(method, path, init, stored.accessToken);
    if (res.status === 401) {
      // The access token has probably expired: refresh once, then try again.
      let fresh: StoredTokens;
      try {
        fresh = await this.options.refresh(stored.refreshToken);
      } catch {
        await this.options.tokens.clear();
        throw new NotLoggedInError();
      }
      await this.options.tokens.save(fresh);
      res = await this.send(method, path, init, fresh.accessToken);
      if (res.status === 401) {
        await this.options.tokens.clear();
        throw new NotLoggedInError();
      }
    }
    return this.read<T>(res);
  }

  private async send(method: string, path: string, init: { query?: Query; body?: unknown }, accessToken: string): Promise<Response> {
    const url = new URL(path, `${this.options.baseUrl}/`);
    for (const [key, value] of Object.entries(init.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    try {
      return await this.options.fetch(url, {
        method,
        headers: {
          authorization: `Bearer ${accessToken}`,
          accept: 'application/json',
          ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      });
    } catch {
      throw new CliError(`Could not reach the API at ${this.options.baseUrl}`);
    }
  }

  private async read<T>(res: Response): Promise<T> {
    if (res.ok) return (res.status === 204 ? undefined : await res.json()) as T;
    const body = (await res.json().catch(() => undefined)) as
      | { title?: string; detail?: string; requestId?: string; type?: string; signupUrl?: string }
      | undefined;
    if (res.status === 403 && body?.type?.endsWith('signup-required') && body.signupUrl) {
      throw new SignupRequiredError(body.signupUrl);
    }
    throw new ApiError(res.status, body?.title ?? `Request failed (${res.status})`, body?.detail, body?.requestId, body?.type);
  }
}
