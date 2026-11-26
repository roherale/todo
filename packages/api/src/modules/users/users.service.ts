import type { Profile, SignupBody, UpdateProfileBody } from '@todo/shared';
import type { Executor } from '../../common/db.js';
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

export interface UsersHooks {
  /**
   * Called inside the same transaction as the timezone change, so other modules keep their data
   * consistent: either everything is applied or nothing is.
   */
  timezoneChanged?: (userId: string, oldTimezone: string, newTimezone: string, tx: Executor) => Promise<void>;
}

/** Runs `work` in one database transaction. */
export type Transact = <T>(work: (tx: Executor) => Promise<T>) => Promise<T>;

export function createUsersService(
  repo: UsersRepository,
  allowedEmails: string,
  hooks: UsersHooks,
  transact: Transact,
) {
  const allowed = new Set(
    allowedEmails
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );

  return {
    findByWorkosId: (workosUserId: string) => repo.findByWorkosId(workosUserId),
    findById: (id: string) => repo.findById(id),

    async update(user: UserRow, body: UpdateProfileBody): Promise<Profile> {
      const updated = await transact(async (tx) => {
        const row = await repo.update(user.id, body, tx);
        if (!row) throw new HttpError(404, 'Not Found');
        if (body.timezone !== undefined && body.timezone !== user.timezone) {
          await hooks.timezoneChanged?.(user.id, user.timezone, body.timezone, tx);
        }
        return row;
      });
      return toProfile(updated);
    },

    /** Permanently removes the account after the caller typed their own email. */
    async remove(user: UserRow, confirmEmail: string): Promise<void> {
      if (confirmEmail.trim().toLowerCase() !== user.email.toLowerCase()) {
        throw new HttpError(400, 'Bad Request', 'confirmEmail: does not match your email');
      }
      await repo.delete(user.id);
    },

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
