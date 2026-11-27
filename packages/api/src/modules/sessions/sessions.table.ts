import { index, integer, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from '../users/index.js';

export const CLIENT_TYPES = ['web', 'cli', 'mcp'] as const;
export type ClientType = (typeof CLIENT_TYPES)[number];
export const clientTypeEnum = pgEnum('client_type', CLIENT_TYPES);

/** Exactly these columns (UC-SESSION-15): no IP address, no user agent, no plain secrets. */
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    clientType: clientTypeEnum('client_type').notNull(),
    idHash: text('id_hash').notNull().unique(),
    refreshTokenEnc: text('refresh_token_enc'),
    keyVersion: integer('key_version'),
    refreshedAt: timestamp('refreshed_at', { withTimezone: true }),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
  },
  (t) => [index('sessions_user_id_idx').on(t.userId)],
);
