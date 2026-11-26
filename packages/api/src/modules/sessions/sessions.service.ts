import { HttpError } from '../../common/errors.js';
import { decryptForUser, encryptForUser, newCookieValue, sha256, type SessionKey } from './session-crypto.js';
import type { SessionRow, SessionsRepository } from './sessions.repository.js';
import type { ClientType } from './sessions.table.js';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Idle and absolute lifetimes per client type (ADR: sessions). */
export const LIMITS: Record<ClientType, { idle: number; absolute: number }> = {
  web: { idle: HOUR, absolute: DAY },
  cli: { idle: DAY, absolute: 30 * DAY },
  mcp: { idle: DAY, absolute: 30 * DAY },
};

/** `lastSeenAt` is written at most once per this interval. */
export const TOUCH_INTERVAL = MINUTE;

export interface SessionContext {
  id: string;
  userId: string;
  clientType: ClientType;
}

export interface BearerClaims {
  sub: string;
  sid?: string | undefined;
  clientId?: string | undefined;
  authTime?: number | undefined;
}

export interface SessionsDeps {
  repo: SessionsRepository;
  key: SessionKey;
  now: () => Date;
  /** Client id that identifies the CLI; any other Bearer client is treated as MCP. */
  cliClientId?: string | undefined;
  /** Exchanges a stored refresh token for a rotated one; rejects when the provider refuses it. */
  refresh?: ((refreshToken: string) => Promise<string>) | undefined;
}

const unauthorized = () => new HttpError(401, 'Unauthorized');

export function createSessionsService({ repo, key, now, cliClientId, refresh }: SessionsDeps) {
  /** Why a row can no longer be used, or undefined when it is still valid. */
  function problemWith(row: SessionRow, at: Date): 'ended' | 'idle' | 'expired' | undefined {
    if (row.endedAt) return 'ended';
    const limits = LIMITS[row.clientType];
    if (at.getTime() - row.lastSeenAt.getTime() > limits.idle) return 'idle';
    if (at.getTime() - row.firstSeenAt.getTime() > limits.absolute) return 'expired';
    return undefined;
  }

  async function ensureUsable(row: SessionRow, at: Date): Promise<void> {
    const problem = problemWith(row, at);
    if (!problem) return;
    if (problem !== 'ended') await repo.end(row.userId, row.id, at);
    throw unauthorized();
  }

  /** Writes lastSeenAt at most once a minute; web sessions also rotate their refresh token then. */
  async function touchIfDue(row: SessionRow, at: Date): Promise<void> {
    if (at.getTime() - row.lastSeenAt.getTime() < TOUCH_INTERVAL) return;
    let rotated: { enc: string; keyVersion: number } | undefined;
    if (row.clientType === 'web' && row.refreshTokenEnc && refresh) {
      try {
        const next = await refresh(decryptForUser(row.refreshTokenEnc, row.userId, key));
        rotated = { enc: encryptForUser(next, row.userId, key), keyVersion: key.version };
      } catch {
        await repo.end(row.userId, row.id, at);
        throw unauthorized();
      }
    }
    await repo.touch(row.userId, row.id, at, rotated);
  }

  const context = (row: SessionRow): SessionContext => ({ id: row.id, userId: row.userId, clientType: row.clientType });

  return {
    /** A Bearer request from a signed-up user: finds or starts the session for this sign-in. */
    async authenticateBearer(userId: string, claims: BearerClaims): Promise<SessionContext> {
      if (!claims.sid) throw unauthorized();
      const at = now();
      // The key includes the client and, when present, auth_time, so a fresh sign-in that
      // reuses a consent-level sid still gets a new session (UC-SESSION-06).
      const idHash = sha256(`${claims.clientId ?? ''}:${claims.sid}:${claims.authTime ?? ''}`);
      const existing = await repo.findByIdHash(idHash);
      if (existing) {
        if (existing.userId !== userId) throw unauthorized();
        await ensureUsable(existing, at);
        await touchIfDue(existing, at);
        return context(existing);
      }
      const clientType: ClientType = cliClientId && claims.clientId === cliClientId ? 'cli' : 'mcp';
      await repo.deleteInactiveFor(userId, cutoffs(at));
      const created = await repo.create({ userId, clientType, idHash, now: at });
      const row = created ?? (await repo.findByIdHash(idHash));
      if (!row || row.userId !== userId) throw unauthorized();
      return context(row);
    },

    /** Starts a web session at sign-in and returns the raw cookie value (shown once). */
    async startWeb(userId: string, refreshToken?: string): Promise<string> {
      const at = now();
      await repo.deleteInactiveFor(userId, cutoffs(at));
      const cookie = newCookieValue();
      await repo.create({
        userId,
        clientType: 'web',
        idHash: sha256(cookie),
        refreshTokenEnc: refreshToken ? encryptForUser(refreshToken, userId, key) : undefined,
        keyVersion: refreshToken ? key.version : undefined,
        now: at,
      });
      return cookie;
    },

    async authenticateWeb(cookie: string): Promise<SessionContext> {
      const row = await repo.findByIdHash(sha256(cookie));
      if (!row || row.clientType !== 'web') throw unauthorized();
      const at = now();
      await ensureUsable(row, at);
      await touchIfDue(row, at);
      return context(row);
    },

    /** The heartbeat always records activity, whatever the once-a-minute rule says. */
    async heartbeat(session: SessionContext): Promise<void> {
      await repo.touch(session.userId, session.id, now());
    },

    async endCurrent(session: SessionContext): Promise<void> {
      await repo.end(session.userId, session.id, now());
    },

    /** Ends all of one user's sessions: web, CLI and MCP. */
    endAll: (userId: string) => repo.endAll(userId, now()),

    /** Deploy cleanup: removes every ended or expired session. */
    cleanup: () => repo.deleteAllInactive(cutoffs(now())),
  };

  function cutoffs(at: Date) {
    const t = at.getTime();
    return {
      web: new Date(t - LIMITS.web.idle),
      webMax: new Date(t - LIMITS.web.absolute),
      other: new Date(t - LIMITS.cli.idle),
      otherMax: new Date(t - LIMITS.cli.absolute),
    };
  }
}

export type SessionsService = ReturnType<typeof createSessionsService>;
