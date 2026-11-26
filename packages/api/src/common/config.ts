import { z } from 'zod';

const ConfigSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(8080),
    DATABASE_URL: z.string().min(1),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    /** The app's own origin, used to build the sign-up link. */
    APP_ORIGIN: z.string().url().default('http://localhost:8080'),
    /** Comma-separated emails allowed to sign up. */
    ALLOWED_SIGNUP_EMAILS: z.string().default(''),
    WORKOS_ISSUER: z.string().url().optional(),
    WORKOS_AUDIENCE: z.string().min(1).optional(),
    WORKOS_JWKS_URL: z.string().url().optional(),
    WORKOS_API_KEY: z.string().min(1).optional(),
    /** The web app's own client id. Bearer tokens carrying it are refused (UC-SESSION-24). */
    WORKOS_CLIENT_ID: z.string().min(1).optional(),
    /** 32 bytes, base64-encoded. Encrypts the stored refresh tokens. */
    SESSION_ENCRYPTION_KEY: z
      .string()
      .refine((v) => Buffer.from(v, 'base64').length === 32, { message: 'must be 32 bytes, base64-encoded' })
      .optional(),
    SESSION_KEY_VERSION: z.coerce.number().int().min(1).default(1),
    /** The OAuth client id of the CLI; other Bearer clients are treated as MCP clients. */
    CLI_CLIENT_ID: z.string().min(1).optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    for (const name of ['WORKOS_ISSUER', 'WORKOS_AUDIENCE', 'WORKOS_JWKS_URL', 'WORKOS_API_KEY', 'WORKOS_CLIENT_ID', 'SESSION_ENCRYPTION_KEY'] as const) {
      if (!env[name]) ctx.addIssue({ code: 'custom', path: [name], message: 'required in production' });
    }
    if (env.ALLOWED_SIGNUP_EMAILS.trim() === '') {
      ctx.addIssue({ code: 'custom', path: ['ALLOWED_SIGNUP_EMAILS'], message: 'required in production' });
    }
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
