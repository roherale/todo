import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { createUsersController } from './users.controller.js';
import { createUsersRepository } from './users.repository.js';
import { createProfileRouter, createSignupRouter } from './users.routes.js';
import { createUsersService } from './users.service.js';

export { users } from './users.table.js';
export type { UserRow } from './users.repository.js';
export type { Identity, UsersService } from './users.service.js';

export function createUsersModule({ db, allowedSignupEmails }: { db: NodePgDatabase; allowedSignupEmails: string }) {
  const service = createUsersService(createUsersRepository(db), allowedSignupEmails);
  const controller = createUsersController(service);
  return { signupRouter: createSignupRouter(controller), profileRouter: createProfileRouter(controller), service };
}
