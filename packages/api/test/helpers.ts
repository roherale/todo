import { Writable } from 'node:stream';
import { eq } from 'drizzle-orm';
import type { Express } from 'express';
import { createApp } from '../src/app.js';
import { loadConfig, type Config } from '../src/common/config.js';
import { createDatabase, type Database } from '../src/common/db.js';
import { createLogger } from '../src/common/logger.js';
import { uuidv7 } from '../src/common/uuid7.js';
import { createTestSigner } from '../src/modules/auth/index.js';
import { users } from '../src/modules/users/index.js';
import { TEST_DATABASE_URL } from './urls.js';

export { TEST_DATABASE_URL };

export const ISSUER = 'https://auth.test.example';
export const AUDIENCE = 'test-audience';
/** Emails ending in this domain may sign up in tests. */
export const TEST_DOMAIN = 'example.test';

/** One signer for the whole test process; its public keys are what the test-mode API trusts. */
export const signer = createTestSigner({ issuer: ISSUER, audience: AUDIENCE });

export function testConfig(overrides: Record<string, string> = {}): Config {
  return loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: TEST_DATABASE_URL,
    LOG_LEVEL: 'debug',
    WORKOS_ISSUER: ISSUER,
    WORKOS_AUDIENCE: AUDIENCE,
    ALLOWED_SIGNUP_EMAILS: 'new-user@example.test,Test-A@Example.com',
    ...overrides,
  });
}

/** Collects log lines written by a real pino logger. */
export function captureLogs() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _enc, cb) {
      lines.push(chunk.toString());
      cb();
    },
  });
  return { lines, logger: createLogger('debug', stream) };
}

export function buildTestApp(extend?: (app: Express) => void, config: Config = testConfig()) {
  const database: Database = createDatabase(TEST_DATABASE_URL);
  const logs = captureLogs();
  const app = createApp({
    logger: logs.logger,
    ping: database.ping,
    db: database.db,
    config,
    testKeys: signer.jwks,
    extend,
  });
  return { app, database, logs, config };
}

export const workosIdOf = (userId: string) => `test|${userId}`;
export const emailOf = (userId: string) => `${userId}@${TEST_DOMAIN}`;

/** Request headers for a signed-up user, using a token the real verifier checks. */
export function bearer(userId: string, extra: Record<string, string> = {}): Record<string, string> {
  const token = signer.signToken({ sub: workosIdOf(userId), email: emailOf(userId) });
  return { authorization: `Bearer ${token}`, ...extra };
}

/** Creates a signed-up user row directly and returns its id. */
export async function createUser(
  database: Database,
  profile: { timezone?: string; pageSize?: number } = {},
): Promise<string> {
  const id = uuidv7();
  await database.db.insert(users).values({
    id,
    workosUserId: workosIdOf(id),
    email: emailOf(id),
    displayName: 'Test User',
    timezone: profile.timezone ?? 'UTC',
    pageSize: profile.pageSize ?? 10,
  });
  return id;
}

export async function setProfile(database: Database, userId: string, profile: { pageSize?: number; timezone?: string }) {
  await database.db.update(users).set(profile).where(eq(users.id, userId));
}
