import express, { Router } from 'express';
import type { TasksController } from './tasks.controller.js';

export function createTasksRouter(c: TasksController): Router {
  const router = Router();
  router.use(express.json());
  router.post('/tasks', c.create);
  router.get('/tasks', c.list);
  router.get('/tasks/:ref', c.get);
  router.patch('/tasks/:ref', c.update);
  router.delete('/tasks/:ref', c.remove);
  router.post('/tasks/:ref/restore', c.restore);
  router.get('/trash', c.listTrash);
  router.delete('/trash', c.emptyTrash);
  return router;
}
