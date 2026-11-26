import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { createApp } from '../../api/src/app.js';
import { loadConfig } from '../../api/src/common/config.js';
import { createDatabase } from '../../api/src/common/db.js';
import { createLogger } from '../../api/src/common/logger.js';
import { uuidv7 } from '../../api/src/common/uuid7.js';
import { createTestSigner } from '../../api/src/modules/auth/index.js';
import { users } from '../../api/src/modules/users/index.js';
import { createFileConfigStore } from '../src/common/config.js';
import type { Deps } from '../src/common/context.js';
import type { Io } from '../src/common/io.js';
import { createMemoryTokenStore, type StoredTokens } from '../src/common/token-store.js';

const CLIENT_ID = 'cli-client';
const DATABASE_URL = process.env['TEST_DATABASE_URL'] ?? 'postgres://postgres:postgres@localhost:5433/postgres';

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

const readBody = (req: IncomingMessage) =>
  new Promise<string>((resolve) => {
    let raw = '';
    req.on('data', (c: Buffer) => (raw += c.toString()));
    req.on('end', () => resolve(raw));
  });

/** The real API in test mode, plus a local stand-in for the sign-in server (the one thing we cannot run). */
export async function startStack() {
  const grants = new Map<string, { challenge: string; subject: string; email: string }>();
  const refreshTokens = new Map<string, { subject: string; email: string }>();
  const log = { authorizeParams: [] as URLSearchParams[], tokenCalls: [] as { grant: string; params: URLSearchParams }[] };
  let nextSubject = { subject: '', email: '' };
  const late = { signer: undefined as unknown as ReturnType<typeof createTestSigner>, authUrl: '' };

  const auth = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', late.authUrl);
    if (url.pathname === '/.well-known/oauth-authorization-server') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return void res.end(JSON.stringify({ authorization_endpoint: `${late.authUrl}/authorize`, token_endpoint: `${late.authUrl}/token` }));
    }
    if (url.pathname === '/authorize') {
      log.authorizeParams.push(url.searchParams);
      const code = randomUUID();
      grants.set(code, { challenge: url.searchParams.get('code_challenge') ?? '', ...nextSubject });
      const back = new URL(url.searchParams.get('redirect_uri') ?? '');
      back.searchParams.set('code', code);
      back.searchParams.set('state', url.searchParams.get('state') ?? '');
      res.writeHead(302, { location: back.toString() });
      return void res.end();
    }
    if (url.pathname === '/token' && req.method === 'POST') {
      const params = new URLSearchParams(await readBody(req));
      const grant = params.get('grant_type') ?? '';
      log.tokenCalls.push({ grant, params });
      const issue = (who: { subject: string; email: string }) => {
        const refresh = `refresh-${randomUUID()}`;
        refreshTokens.set(refresh, who);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ access_token: late.signer.signToken({ sub: who.subject, email: who.email, clientId: CLIENT_ID }), refresh_token: refresh }));
      };
      const refuse = () => {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid_grant' }));
      };
      if (grant === 'authorization_code') {
        const found = grants.get(params.get('code') ?? '');
        const verifier = params.get('code_verifier') ?? '';
        const challenge = createHash('sha256').update(verifier).digest('base64url');
        if (!found || found.challenge !== challenge) return refuse();
        grants.delete(params.get('code') ?? '');
        return issue(found);
      }
      if (grant === 'refresh_token') {
        const who = refreshTokens.get(params.get('refresh_token') ?? '');
        if (!who) return refuse();
        refreshTokens.delete(params.get('refresh_token') ?? '');
        return issue(who);
      }
      return refuse();
    }
    res.writeHead(404).end();
  });
  const authUrl = await listen(auth);
  late.authUrl = authUrl;
  const signer = createTestSigner({ issuer: authUrl, audience: 'cli-audience' });
  late.signer = signer;

  const database = createDatabase(DATABASE_URL);
  const config = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL,
    LOG_LEVEL: 'silent',
    WORKOS_ISSUER: authUrl,
    WORKOS_AUDIENCE: 'cli-audience',
    APP_ORIGIN: 'https://todo.example.test',
    CLI_CLIENT_ID: CLIENT_ID,
  });
  const logger = createLogger('silent', new Writable({ write: (_c, _e, cb) => cb() }));
  const app = createApp({ logger, ping: database.ping, db: database.db, config, testKeys: signer.jwks });
  const api = createServer(app);
  const apiUrl = await listen(api);

  return {
    apiUrl,
    authUrl,
    log,
    signer,
    /** Creates a signed-up person and returns the identity the sign-in server will vouch for. */
    async createUser(profile: { timezone?: string; pageSize?: number } = {}) {
      const id = uuidv7();
      const subject = `workos|${id}`;
      const email = `${id}@example.test`;
      await database.db.insert(users).values({
        id,
        workosUserId: subject,
        email,
        displayName: 'CLI User',
        timezone: profile.timezone ?? 'UTC',
        pageSize: profile.pageSize ?? 10,
      });
      return { id, subject, email };
    },
    signInAs(who: { subject: string; email: string }) {
      nextSubject = who;
    },
    /** Tokens as the sign-in server would have issued them. */
    issueTokens(who: { subject: string; email: string }, expiresIn = 3600): StoredTokens {
      const refreshToken = `refresh-${randomUUID()}`;
      refreshTokens.set(refreshToken, who);
      return { accessToken: signer.signToken({ sub: who.subject, email: who.email, clientId: CLIENT_ID, expiresIn }), refreshToken };
    },
    revokeRefreshTokens() {
      refreshTokens.clear();
    },
    async close() {
      auth.close();
      api.close();
      await database.pool.end();
    },
  };
}

export type Stack = Awaited<ReturnType<typeof startStack>>;

export interface Harness {
  deps: Deps;
  out: string[];
  err: string[];
  requests: { method: string; url: string }[];
  tokens: ReturnType<typeof createMemoryTokenStore>;
  configPath: string;
  prompts: string[];
  answers: string[];
}

/** CLI dependencies wired to the stack: a memory keychain, a temp config file, and a recording fetch. */
export function harness(stack: Stack, options: { tokens?: StoredTokens; tty?: boolean; now?: Date; env?: NodeJS.ProcessEnv; configure?: boolean } = {}): Harness {
  const out: string[] = [];
  const err: string[] = [];
  const prompts: string[] = [];
  const answers: string[] = [];
  const requests: { method: string; url: string }[] = [];
  const configPath = join(mkdtempSync(join(tmpdir(), 'todo-cli-')), 'config.json');
  const config = createFileConfigStore(configPath);
  if (options.configure !== false) config.write({ apiUrl: stack.apiUrl, clientId: CLIENT_ID });
  const tokens = createMemoryTokenStore(options.tokens);
  const io: Io = {
    out: (line) => out.push(line),
    err: (line) => err.push(line),
    isTTY: options.tty ?? true,
    prompt: (question) => {
      prompts.push(question);
      return Promise.resolve(answers.shift() ?? '');
    },
  };
  const deps: Deps = {
    io,
    config,
    env: options.env ?? {},
    tokens,
    fetch: (input, init) => {
      requests.push({ method: init?.method ?? 'GET', url: String(input) });
      return fetch(input, init);
    },
    // The "browser" just follows the sign-in page's redirect back to the CLI's loopback address.
    openBrowser: async (url) => {
      await fetch(url);
    },
    now: () => options.now ?? new Date(),
  };
  return { deps, out, err, requests, tokens, configPath, prompts, answers };
}
