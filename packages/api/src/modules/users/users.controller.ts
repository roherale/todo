import type { RequestHandler, Response } from 'express';
import { DeleteProfileBodySchema, SignupBodySchema, UpdateProfileBodySchema } from '@todo/shared';
import { parseOrBadRequest } from '../../common/validate.js';
import { toProfile, type Identity, type UsersService } from './users.service.js';
import type { UserRow } from './users.repository.js';

export type UsersController = Record<'signup' | 'get' | 'patch' | 'remove', RequestHandler>;

export function createUsersController(service: UsersService): UsersController {
  return {
    signup(req, res, next) {
      const identity = res.locals['identity'] as Identity;
      const body = parseOrBadRequest(SignupBodySchema, req.body ?? {});
      service.signup(identity, body).then((profile) => {
        res.status(201).json(profile);
      }, next);
    },
    patch(req, res, next) {
      const body = parseOrBadRequest(UpdateProfileBodySchema, req.body ?? {});
      service.update(res.locals['user'] as UserRow, body).then((profile) => res.json(profile), next);
    },
    remove(req, res, next) {
      const { confirmEmail } = parseOrBadRequest(DeleteProfileBodySchema, req.body ?? {});
      service.remove(res.locals['user'] as UserRow, confirmEmail).then(() => res.status(204).end(), next);
    },
    get(_req, res: Response) {
      res.json(toProfile(res.locals['user'] as UserRow));
    },
  };
}
