import { z } from 'zod';

const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  DATABASE_URL: z.string().min(1),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export type Config = z.infer<typeof ConfigSchema>;

/** Validates the environment. Throws an error that names every missing or invalid variable. */
export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const result = ConfigSchema.safeParse(env);
  if (!result.success) {
    const names = [...new Set(result.error.issues.map((i) => String(i.path[0])))];
    throw new Error(`Invalid configuration: ${names.join(', ')}`);
  }
  return result.data;
}
