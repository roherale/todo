import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { createTasksController } from './tasks.controller.js';
import { createTasksRepository } from './tasks.repository.js';
import { createTasksRouter } from './tasks.routes.js';
import { createTasksService } from './tasks.service.js';

export type { Owner, TasksService } from './tasks.service.js';

export function createTasksModule({ db, now }: { db: NodePgDatabase; now?: () => Date }) {
  const service = createTasksService(createTasksRepository(db), now);
  return { router: createTasksRouter(createTasksController(service)), service };
}
