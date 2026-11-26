import type { ZodType } from 'zod';
import { HttpError } from './errors.js';

/** Parses input with a Zod schema, turning failures into a 400 problem. */
export function parseOrBadRequest<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const detail = result.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ');
    throw new HttpError(400, 'Bad Request', detail);
  }
  return result.data;
}
