import type { Profile, SignupBody } from '@todo/shared';
import { HttpError } from '../../common/errors.js';
import type { UserRow, UsersRepository } from './users.repository.js';

/** Who the token says the caller is. */
export interface Identity {
  sub: string;
  email?: string | undefined;
}

export function toProfile(row: UserRow): Profile {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    timezone: row.timezone,
    pageSize: row.pageSize,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function createUsersService(repo: UsersRepository, allowedEmails: string) {
  const allowed = new Set(
    allowedEmails
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );

  return {
    findByWorkosId: (workosUserId: string) => repo.findByWorkosId(workosUserId),

    async signup(identity: Identity, body: SignupBody): Promise<Profile> {
      const email = identity.email?.trim();
      if (!email || !allowed.has(email.toLowerCase())) {
        throw new HttpError(403, 'Sign-up is closed', 'This email is not allowed to sign up', {
          type: '/problems/signup-closed',
        });
      }
      const row = await repo.create({
        workosUserId: identity.sub,
        email,
        displayName: body.displayName,
        avatarUrl: body.avatarUrl ?? null,
        timezone: body.timezone,
      });
      if (!row) throw new HttpError(409, 'Conflict', 'A profile already exists');
      return toProfile(row);
    },
  };
}

export type UsersService = ReturnType<typeof createUsersService>;
