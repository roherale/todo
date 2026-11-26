import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { createSessionsController } from './sessions.controller.js';
import { createSessionsRepository } from './sessions.repository.js';
import { createSessionsRouter } from './sessions.routes.js';
import { createSessionsService, type SessionsDeps } from './sessions.service.js';

export { sessions } from './sessions.table.js';
export { parseSessionKey, sha256, newCookieValue, encryptForUser, decryptForUser, type SessionKey } from './session-crypto.js';
export type { SessionContext, SessionsService, BearerClaims } from './sessions.service.js';

export function createSessionsModule({ db, ...deps }: { db: NodePgDatabase } & Omit<SessionsDeps, 'repo'>) {
  const service = createSessionsService({ repo: createSessionsRepository(db), ...deps });
  return { router: createSessionsRouter(createSessionsController(service)), service };
}
