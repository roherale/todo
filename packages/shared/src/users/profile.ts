import { z } from 'zod';
import { PAGE_SIZES } from '../tasks/task.js';

const zones = new Set<string>([...Intl.supportedValuesOf('timeZone'), 'UTC']);

export const TimezoneSchema = z.string().refine((tz) => zones.has(tz), { message: 'must be an IANA timezone' });

export const AvatarUrlSchema = z
  .string()
  .max(2048)
  .refine(
    (value) => {
      try {
        return new URL(value).protocol === 'https:';
      } catch {
        return false;
      }
    },
    { message: 'must be an absolute https URL' },
  );

const DisplayNameSchema = z.string().trim().min(1).max(100);
const PageSizeSchema = z.union(PAGE_SIZES.map((n) => z.literal(n)) as unknown as [z.ZodLiteral<10>, z.ZodLiteral<25>, ...z.ZodLiteral<number>[]]);

/** `email` comes from the verified token, never from the body, so it is rejected here. */
export const SignupBodySchema = z
  .object({
    displayName: DisplayNameSchema,
    timezone: TimezoneSchema,
    avatarUrl: AvatarUrlSchema.optional(),
  })
  .strict();
export type SignupBody = z.infer<typeof SignupBodySchema>;

export const UpdateProfileBodySchema = z
  .object({
    displayName: DisplayNameSchema,
    avatarUrl: AvatarUrlSchema.nullable(),
    timezone: TimezoneSchema,
    pageSize: PageSizeSchema,
  })
  .partial()
  .strict();
export type UpdateProfileBody = z.infer<typeof UpdateProfileBodySchema>;

export const DeleteProfileBodySchema = z.object({ confirmEmail: z.string() }).strict();

export const ProfileSchema = z.object({
  id: z.string(),
  email: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  timezone: z.string(),
  pageSize: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Profile = z.infer<typeof ProfileSchema>;
