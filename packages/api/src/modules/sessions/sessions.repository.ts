import { and, eq, isNotNull, isNull, lt, or } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { uuidv7 } from '../../common/uuid7.js';
import { sessions, type ClientType } from './sessions.table.js';

export type SessionRow = typeof sessions.$inferSelect;

export interface NewSession {
  userId: string;
  clientType: ClientType;
  idHash: string;
  refreshTokenEnc?: string | undefined;
  keyVersion?: number | undefined;
  now: Date;
}

export function createSessionsRepository(db: NodePgDatabase) {
  return {
    /** Lookup by the hash of a secret the caller presented; the row says whose it is. */
    async findByIdHash(idHash: string): Promise<SessionRow | undefined> {
      const [row] = await db.select().from(sessions).where(eq(sessions.idHash, idHash));
      return row;
    },

    /** Returns undefined when a session with this key already exists. */
    async create(data: NewSession): Promise<SessionRow | undefined> {
      const [row] = await db
        .insert(sessions)
        .values({
          id: uuidv7(),
          userId: data.userId,
          clientType: data.clientType,
          idHash: data.idHash,
          refreshTokenEnc: data.refreshTokenEnc ?? null,
          keyVersion: data.keyVersion ?? null,
          firstSeenAt: data.now,
          lastSeenAt: data.now,
        })
        .onConflictDoNothing({ target: sessions.idHash })
        .returning();
      return row;
    },

    async touch(userId: string, id: string, now: Date, refresh?: { enc: string; keyVersion: number }): Promise<void> {
      await db
        .update(sessions)
        .set({
          lastSeenAt: now,
          ...(refresh ? { refreshTokenEnc: refresh.enc, keyVersion: refresh.keyVersion } : {}),
        })
        .where(and(eq(sessions.userId, userId), eq(sessions.id, id), isNull(sessions.endedAt)));
    },

    async end(userId: string, id: string, now: Date): Promise<void> {
      await db
        .update(sessions)
        .set({ endedAt: now })
        .where(and(eq(sessions.userId, userId), eq(sessions.id, id), isNull(sessions.endedAt)));
    },

    /** Ends every active session of one user. Returns how many were ended. */
    async endAll(userId: string, now: Date): Promise<number> {
      const rows = await db
        .update(sessions)
        .set({ endedAt: now })
        .where(and(eq(sessions.userId, userId), isNull(sessions.endedAt)))
        .returning({ id: sessions.id });
      return rows.length;
    },

    /** Deletes one user's ended or expired sessions; active ones stay. */
    async deleteInactiveFor(
      userId: string,
      cutoffs: { web: Date; other: Date; webMax: Date; otherMax: Date },
    ): Promise<void> {
      await db.delete(sessions).where(and(eq(sessions.userId, userId), inactive(cutoffs)));
    },

    /** Deletes every ended or expired session of every user (deploy cleanup). */
    async deleteAllInactive(cutoffs: { web: Date; other: Date; webMax: Date; otherMax: Date }): Promise<number> {
      const rows = await db.delete(sessions).where(inactive(cutoffs)).returning({ id: sessions.id });
      return rows.length;
    },
  };
}

function inactive(c: { web: Date; other: Date; webMax: Date; otherMax: Date }) {
  return or(
    isNotNull(sessions.endedAt),
    and(eq(sessions.clientType, 'web'), or(lt(sessions.lastSeenAt, c.web), lt(sessions.firstSeenAt, c.webMax))),
    and(eq(sessions.clientType, 'cli'), or(lt(sessions.lastSeenAt, c.other), lt(sessions.firstSeenAt, c.otherMax))),
    and(eq(sessions.clientType, 'mcp'), or(lt(sessions.lastSeenAt, c.other), lt(sessions.firstSeenAt, c.otherMax))),
  );
}

export type SessionsRepository = ReturnType<typeof createSessionsRepository>;
