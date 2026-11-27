import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import type { McpUser } from './common/mcp-tool.js';
import type { JSONWebKeySet } from 'jose';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Logger } from 'pino';
import type { Config } from './common/config.js';
import { createAuthModule, type IdentityProvider } from './modules/auth/index.js';
import { createMcpModule } from './modules/mcp/index.js';
import { createSessionsModule, decryptForUser, encryptForUser, parseSessionKey } from './modules/sessions/index.js';
import { createTasksModule } from './modules/tasks/index.js';
import { createUsersModule } from './modules/users/index.js';

export interface RouteDeps {
  ping: () => Promise<void>;
  logger: Logger;
  db: NodePgDatabase;
  config: Config;
  /** Test-signer keys; ignored unless `config.NODE_ENV` is `test`. */
  testKeys?: JSONWebKeySet | undefined;
  now?: (() => Date) | undefined;
  /** The identity provider for web sign-in. Without one, /auth is not mounted. */
  provider?: IdentityProvider | undefined;
  /** Overrides the provider's refresh (tests). */
  refresh?: ((refreshToken: string) => Promise<string>) | undefined;
}

export function routes({ ping, logger, db, config, testKeys, now, provider, refresh }: RouteDeps): Router {
  const router = Router();

  router.get('/health', async (_req, res) => {
    try {
      await ping();
      res.status(200).json({ status: 'ok' });
    } catch (err) {
      logger.error({ err, requestId: res.locals['requestId'] }, 'health check failed');
      res.status(503).json({ status: 'unavailable' });
    }
  });

  const tasks = createTasksModule({ db });
  const users = createUsersModule({
    db,
    allowedSignupEmails: config.ALLOWED_SIGNUP_EMAILS,
    hooks: { timezoneChanged: (id, from, to, tx) => tasks.service.keepAllDayDates(id, from, to, tx) },
  });
  const clock = now ?? (() => new Date());
  // Outside production a missing key gives each process its own, so sessions end on restart.
  const sessionKey = {
    key: config.SESSION_ENCRYPTION_KEY ? parseSessionKey(config.SESSION_ENCRYPTION_KEY) : randomBytes(32),
    version: config.SESSION_KEY_VERSION,
  };
  const sessions = createSessionsModule({
    db,
    key: sessionKey,
    now: clock,
    cliClientId: config.CLI_CLIENT_ID,
    webClientId: config.WORKOS_CLIENT_ID,
    refresh: refresh ?? (provider ? (token) => provider.refresh(token) : undefined),
  });
  const auth = createAuthModule({
    config,
    findUser: users.service.findByWorkosId,
    findUserById: users.service.findById,
    sessions: {
      bearer: (userId, claims) => sessions.service.authenticateBearer(userId, claims),
      web: (cookie) => sessions.service.authenticateWeb(cookie),
    },
    webSignIn: provider
      ? {
          provider,
          startWeb: (userId, refreshToken) => sessions.service.startWeb(userId, refreshToken),
          endWeb: (cookie) => sessions.service.endWeb(cookie),
        }
      : undefined,
    sealer: {
      seal: (plain) => encryptForUser(plain, 'pending-signup', sessionKey),
      open: (sealed) => decryptForUser(sealed, 'pending-signup', sessionKey),
    },
    now: clock,
    testKeys,
  });

  if (auth.router) router.use('/auth', auth.router);

  const v1 = Router();
  v1.use(auth.authenticate);
  v1.use(auth.finishPendingSignup, users.signupRouter); // a verified token is enough to sign up
  v1.use(auth.requireUser); // everything below needs a profile
  // Editing or deleting the account is for the web app only (UC-PROFILE-12).
  v1.patch('/profile', auth.requireWebSession);
  v1.delete('/profile', auth.requireWebSession);
  v1.use(users.profileRouter);
  v1.use(['/session', '/sessions'], auth.requireWebSession);
  v1.use(sessions.router);
  v1.use(tasks.router);
  router.use('/api/v1', v1);

  // OAuth discovery for MCP clients (UC-AUTH-07): public, and names the authorization server.
  router.get('/.well-known/oauth-protected-resource', (_req, res) => {
    res.json({ resource: `${config.APP_ORIGIN}/mcp`, authorization_servers: config.WORKOS_ISSUER ? [config.WORKOS_ISSUER] : [] });
  });

  const mcp = createMcpModule({
    tools: [...tasks.mcpTools, ...users.mcpTools],
    logger,
    signupUrl: `${config.APP_ORIGIN}/signup`,
    callerOf: (res) => res.locals['user'] as McpUser | undefined,
  });
  router.use('/mcp', auth.authenticateMcp, mcp.router);

  return router;
}
