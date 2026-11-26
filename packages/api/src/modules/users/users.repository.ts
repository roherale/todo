import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Executor } from '../../common/db.js';
import { uuidv7 } from '../../common/uuid7.js';
import { users } from './users.table.js';

export type UserRow = typeof users.$inferSelect;

export interface NewUser {
  workosUserId: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  timezone: string;
}

/** A user row is the owner itself, so lookups here are by the user's own id or identity. */
export function createUsersRepository(db: NodePgDatabase) {
  return {
    async findByWorkosId(workosUserId: string): Promise<UserRow | undefined> {
      const [row] = await db.select().from(users).where(eq(users.workosUserId, workosUserId));
      return row;
    },

    async findById(id: string): Promise<UserRow | undefined> {
      const [row] = await db.select().from(users).where(eq(users.id, id));
      return row;
    },

    async update(
      id: string,
      changes: Partial<Pick<UserRow, 'displayName' | 'avatarUrl' | 'timezone' | 'pageSize'>>,
      executor: Executor = db,
    ): Promise<UserRow | undefined> {
      const [row] = await executor
        .update(users)
        .set({ ...changes, updatedAt: new Date() })
        .where(eq(users.id, id))
        .returning();
      return row;
    },

    /** Removes the user; their tasks and sessions go with them (cascade). */
    async delete(id: string): Promise<void> {
      await db.delete(users).where(eq(users.id, id));
    },

    /** Returns undefined when a profile for this identity already exists. */
    async create(data: NewUser): Promise<UserRow | undefined> {
      const [row] = await db
        .insert(users)
        .values({ id: uuidv7(), ...data })
        .onConflictDoNothing({ target: users.workosUserId })
        .returning();
      return row;
    },
  };
}

export type UsersRepository = ReturnType<typeof createUsersRepository>;
