import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { ProblemSchema } from '@todo/shared';
import { buildTestApp } from '../../test/helpers.js';
import { HttpError } from './errors.js';

describe('HttpError handling', () => {
  const ctx = buildTestApp((app) => {
    app.get('/teapot', () => {
      throw new HttpError(418, "I'm a teapot", 'short and stout');
    });
    app.get('/plain', () => {
      throw new HttpError(409, 'Conflict');
    });
  });

  it('UC-OPS-02: maps an HttpError with detail to problem+json carrying the request id', async () => {
    const res = await request(ctx.app).get('/teapot');
    const problem = ProblemSchema.parse(res.body);
    expect(res.status).toBe(418);
    expect(problem.detail).toBe('short and stout');
    expect(problem.requestId).toBe(res.headers['x-request-id']);
  });

  it('UC-OPS-02: omits detail when the HttpError has none', async () => {
    const res = await request(ctx.app).get('/plain');
    expect(res.status).toBe(409);
    expect(res.body).not.toHaveProperty('detail');
  });
});
