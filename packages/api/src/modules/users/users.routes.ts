import express, { Router } from 'express';
import type { UsersController } from './users.controller.js';

/** Sign-up: the caller has a verified token but no profile yet. */
export function createSignupRouter(c: UsersController): Router {
  const router = Router();
  router.post('/profile', express.json(), c.signup);
  return router;
}

/** Everything else needs an existing profile. */
export function createProfileRouter(c: UsersController): Router {
  const router = Router();
  router.get('/profile', c.get);
  router.patch('/profile', express.json(), c.patch);
  router.delete('/profile', express.json(), c.remove);
  return router;
}
