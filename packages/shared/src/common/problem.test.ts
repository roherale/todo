import { describe, expect, it } from 'vitest';
import { ProblemSchema } from './problem.js';

describe('ProblemSchema', () => {
  it('accepts a complete problem body', () => {
    const parsed = ProblemSchema.parse({
      type: 'about:blank',
      title: 'Not Found',
      status: 404,
      requestId: 'abc',
    });
    expect(parsed.status).toBe(404);
  });

  it('rejects a body without requestId', () => {
    const result = ProblemSchema.safeParse({ type: 'about:blank', title: 'x', status: 500 });
    expect(result.success).toBe(false);
  });
});
