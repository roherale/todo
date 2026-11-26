import { z } from 'zod';

/** RFC 9457 problem details, as returned by every API error. */
export const ProblemSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  requestId: z.string(),
});

export type Problem = z.infer<typeof ProblemSchema>;
