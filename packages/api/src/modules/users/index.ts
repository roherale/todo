import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { createUsersMcpTools } from './users.mcp.js';
import { createUsersController } from './users.controller.js';
import { createUsersRepository } from './users.repository.js';
import { createProfileRouter, createSignupRouter } from './users.routes.js';
import { createUsersService, type UsersHooks } from './users.service.js';

export { users } from './users.table.js';
export type { UserRow } from './users.repository.js';
export type { Identity, UsersService } from './users.service.js';

export function createUsersModule({
  db,
  allowedSignupEmails,
  hooks,
}: {
  db: NodePgDatabase;
  allowedSignupEmails: string;
  hooks?: UsersHooks;
}) {
  const service = createUsersService(createUsersRepository(db), allowedSignupEmails, hooks ?? {}, (work) =>
    db.transaction((tx) => work(tx)),
  );
  const controller = createUsersController(service);
  return { mcpTools: createUsersMcpTools(), signupRouter: createSignupRouter(controller), profileRouter: createProfileRouter(controller), service };
}
