export const PENDING_COOKIE = '__Host-pending-signup';
export const PENDING_TTL_MS = 15 * 60_000;

export interface Sealer {
  seal(plain: string): string;
  /** Throws when the value was tampered with or was not sealed by us. */
  open(sealed: string): string;
}

export interface PendingIdentity {
  sub: string;
  email: string;
}

/** The sealed cookie that carries a verified identity from the callback to sign-up. No tokens. */
export function createPendingSignup(sealer: Sealer, now: () => Date) {
  return {
    create(identity: PendingIdentity): string {
      return sealer.seal(JSON.stringify({ sub: identity.sub, email: identity.email, exp: now().getTime() + PENDING_TTL_MS }));
    },
    /** The identity inside, or undefined when the cookie is tampered with or expired. */
    read(value: string): PendingIdentity | undefined {
      try {
        const data = JSON.parse(sealer.open(value)) as { sub?: unknown; email?: unknown; exp?: unknown };
        if (typeof data.sub !== 'string' || typeof data.email !== 'string' || typeof data.exp !== 'number') return undefined;
        if (data.exp <= now().getTime()) return undefined;
        return { sub: data.sub, email: data.email };
      } catch {
        return undefined;
      }
    },
  };
}

export type PendingSignup = ReturnType<typeof createPendingSignup>;
