import type { RequestHandler, Response } from 'express';
import { SignupBodySchema } from '@todo/shared';
import { parseOrBadRequest } from '../../common/validate.js';
import { toProfile, type Identity, type UsersService } from './users.service.js';
import type { UserRow } from './users.repository.js';

export type UsersController = Record<'signup' | 'get', RequestHandler>;

export function createUsersController(service: UsersService): UsersController {
  return {
    signup(req, res, next) {
      const identity = res.locals['identity'] as Identity;
      const body = parseOrBadRequest(SignupBodySchema, req.body ?? {});
      service.signup(identity, body).then((profile) => {
        res.status(201).json(profile);
      }, next);
    },
    get(_req, res: Response) {
      res.json(toProfile(res.locals['user'] as UserRow));
    },
  };
}
