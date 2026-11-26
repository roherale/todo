import type { Request, RequestHandler, Response } from 'express';
import { CreateTaskBodySchema, ListTasksQuerySchema, UpdateTaskBodySchema } from '@todo/shared';
import { HttpError } from '../../common/errors.js';
import { parseOrBadRequest } from '../../common/validate.js';
import type { Owner, TasksService } from './tasks.service.js';

function owner(res: Response): Owner {
  const value = res.locals['owner'] as Owner | undefined;
  if (!value) throw new HttpError(401, 'Unauthorized');
  return value;
}

const ref = (req: Request) => String(req.params['ref']);

export type TasksController = Record<
  'create' | 'get' | 'update' | 'list' | 'listTrash' | 'remove' | 'restore' | 'emptyTrash',
  RequestHandler
>;

export function createTasksController(service: TasksService): TasksController {
  const handler = (fn: (req: Request, res: Response) => Promise<void>): RequestHandler => (req, res, next) => {
    fn(req, res).catch(next);
  };

  return {
    create: handler(async (req, res) => {
      const body = parseOrBadRequest(CreateTaskBodySchema, req.body ?? {});
      res.status(201).json(await service.create(owner(res), body));
    }),
    get: handler(async (req, res) => {
      res.json(await service.get(owner(res), ref(req)));
    }),
    update: handler(async (req, res) => {
      const body = parseOrBadRequest(UpdateTaskBodySchema, req.body ?? {});
      res.json(await service.update(owner(res), ref(req), body));
    }),
    list: handler(async (req, res) => {
      res.json(await service.list(owner(res), parseOrBadRequest(ListTasksQuerySchema, req.query)));
    }),
    listTrash: handler(async (req, res) => {
      res.json(await service.listTrash(owner(res), parseOrBadRequest(ListTasksQuerySchema, req.query)));
    }),
    remove: handler(async (req, res) => {
      const permanent = req.query['permanent'];
      if (permanent !== undefined && permanent !== 'true' && permanent !== 'false') {
        throw new HttpError(400, 'Bad Request', 'permanent: must be true or false');
      }
      if (permanent === 'true') await service.purge(owner(res), ref(req));
      else await service.trash(owner(res), ref(req));
      res.status(204).end();
    }),
    restore: handler(async (req, res) => {
      res.json(await service.restore(owner(res), ref(req)));
    }),
    emptyTrash: handler(async (_req, res) => {
      res.json(await service.emptyTrash(owner(res)));
    }),
  };
}
