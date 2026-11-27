import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { CliError } from './errors.js';
import type { StoredTokens } from './token-store.js';

/** Asked for on sign-in. `offline_access` is what makes the server issue a refresh token. */
export const LOGIN_SCOPE = 'openid profile email offline_access';

export interface Discovery {
  authorizationEndpoint: string;
  tokenEndpoint: string;
  /** The protected resource the API publishes; sent as `resource` so tokens carry its audience. */
  resource: string;
}

type Fetch = typeof fetch;

async function getJson(fetchFn: Fetch, url: string, what: string): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetchFn(url, { headers: { accept: 'application/json' } });
  } catch {
    throw new CliError(`Could not reach ${what} at ${url}`);
  }
  if (!res.ok) throw new CliError(`Could not read ${what} (${res.status})`);
  return (await res.json()) as Record<string, unknown>;
}

/** The API names its authorization server; that server's metadata names the endpoints (RFC 9728, RFC 8414). */
export async function discover(apiUrl: string, fetchFn: Fetch): Promise<Discovery> {
  const resource = await getJson(fetchFn, `${apiUrl}/.well-known/oauth-protected-resource`, 'the API\'s sign-in details');
  const resourceId = resource['resource'];
  if (typeof resourceId !== 'string' || resourceId === '') throw new CliError('The API does not say which resource to ask a token for');
  const servers = resource['authorization_servers'];
  const issuer = Array.isArray(servers) && typeof servers[0] === 'string' ? servers[0].replace(/\/+$/, '') : undefined;
  if (!issuer) throw new CliError('The API does not say which server handles sign-in');
  const meta = await getJson(fetchFn, `${issuer}/.well-known/oauth-authorization-server`, 'the sign-in server');
  const authorizationEndpoint = meta['authorization_endpoint'];
  const tokenEndpoint = meta['token_endpoint'];
  if (typeof authorizationEndpoint !== 'string' || typeof tokenEndpoint !== 'string') {
    throw new CliError('The sign-in server did not publish its endpoints');
  }
  return { authorizationEndpoint, tokenEndpoint, resource: resourceId };
}

export const base64url = (buf: Buffer) => buf.toString('base64url');
export const newVerifier = () => base64url(randomBytes(32));
export const challengeFor = (verifier: string) => base64url(createHash('sha256').update(verifier).digest());

/** The server's own diagnosis (its `error` and `error_description` fields only, never anything else from the body). */
function refusal(body: Record<string, unknown>): string {
  const clean = (value: unknown) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, 200) : '');
  const error = clean(body['error']);
  const description = clean(body['error_description']);
  if (!error) return 'The sign-in server refused the request';
  return `The sign-in server refused the request: ${error}${description ? ` (${description})` : ''}`;
}

async function tokenRequest(fetchFn: Fetch, endpoint: string, params: Record<string, string>): Promise<StoredTokens> {
  let res: Response;
  try {
    res = await fetchFn(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams(params).toString(),
    });
  } catch {
    throw new CliError('Could not reach the sign-in server');
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new CliError(refusal(body));
  const access = body['access_token'];
  const refresh = body['refresh_token'];
  if (typeof access !== 'string') throw new CliError('The sign-in server did not return an access token');
  if (typeof refresh !== 'string') {
    throw new CliError('The sign-in server did not return a refresh token. It may be missing the offline_access permission.');
  }
  return { accessToken: access, refreshToken: refresh };
}

export function refreshTokens(fetchFn: Fetch, discovery: Discovery, clientId: string, refreshToken: string): Promise<StoredTokens> {
  return tokenRequest(fetchFn, discovery.tokenEndpoint, { grant_type: 'refresh_token', refresh_token: refreshToken, client_id: clientId, resource: discovery.resource });
}

/** How a person signs in. Only the loopback flow exists; a device-code flow could implement the same interface. */
export interface LoginFlow {
  login(): Promise<StoredTokens>;
}

export interface LoopbackOptions {
  discovery: Discovery;
  clientId: string;
  fetch: Fetch;
  /** Opens the sign-in page in the person's browser. */
  openBrowser(url: string): Promise<void> | void;
  timeoutMs?: number;
}

/** Authorization code with PKCE, redirected to a loopback address on a random port (RFC 8252). */
export function createLoopbackLogin(options: LoopbackOptions): LoginFlow {
  return {
    async login() {
      const verifier = newVerifier();
      const state = base64url(randomBytes(16));
      const code = await new Promise<{ code: string; redirectUri: string }>((resolve, reject) => {
        let redirectUri = '';
        const server = createServer((req, res) => {
          const url = new URL(req.url ?? '/', 'http://127.0.0.1');
          if (url.pathname !== '/callback') {
            res.writeHead(404).end();
            return;
          }
          const got = url.searchParams.get('code');
          const ok = url.searchParams.get('state') === state && got;
          res.writeHead(ok ? 200 : 400, { 'content-type': 'text/plain; charset=utf-8' });
          res.end(ok ? 'You are signed in. You can close this tab.' : 'Sign-in failed. Go back to the terminal.');
          clearTimeout(timer);
          server.close();
          if (ok) resolve({ code: got, redirectUri });
          else reject(new CliError('Sign-in was cancelled or the response did not match'));
        });
        const timer = setTimeout(() => {
          server.close();
          reject(new CliError('Timed out waiting for the browser sign-in'));
        }, options.timeoutMs ?? 300_000);
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
          redirectUri = `http://127.0.0.1:${(server.address() as AddressInfo).port}/callback`;
          const url = new URL(options.discovery.authorizationEndpoint);
          url.searchParams.set('response_type', 'code');
          url.searchParams.set('client_id', options.clientId);
          url.searchParams.set('redirect_uri', redirectUri);
          url.searchParams.set('state', state);
          url.searchParams.set('scope', LOGIN_SCOPE);
          url.searchParams.set('resource', options.discovery.resource);
          url.searchParams.set('code_challenge', challengeFor(verifier));
          url.searchParams.set('code_challenge_method', 'S256');
          void Promise.resolve(options.openBrowser(url.toString())).catch(reject);
        });
      });
      return tokenRequest(options.fetch, options.discovery.tokenEndpoint, {
        grant_type: 'authorization_code',
        code: code.code,
        redirect_uri: code.redirectUri,
        client_id: options.clientId,
        code_verifier: verifier,
        resource: options.discovery.resource,
      });
    },
  };
}
