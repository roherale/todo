import { WorkOS } from '@workos-inc/node';
import type { IdentityProvider } from './identity-provider.js';

/** Reads the `sid` claim of an access token that WorkOS just issued to us (no verification needed). */
function sessionIdOf(accessToken: string): string | undefined {
  const payload = accessToken.split('.')[1];
  if (!payload) return undefined;
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { sid?: unknown };
  return typeof claims.sid === 'string' ? claims.sid : undefined;
}

export function createWorkosProvider(options: {
  apiKey: string;
  clientId: string;
  redirectUri: string;
  returnTo: string;
  /** Where the SDK sends its requests; only tests change this. */
  endpoint?: { apiHostname: string; https: boolean; port: number };
}): IdentityProvider {
  const workos = new WorkOS(options.apiKey, { clientId: options.clientId, ...options.endpoint });
  const { clientId } = options;
  return {
    authorizationUrl: (state) =>
      workos.userManagement.getAuthorizationUrl({
        provider: 'authkit',
        redirectUri: options.redirectUri,
        clientId,
        state,
      }),

    async exchangeCode(code) {
      const result = await workos.userManagement.authenticateWithCode({ clientId, code });
      return { sub: result.user.id, email: result.user.email, refreshToken: result.refreshToken };
    },

    async refresh(refreshToken) {
      const result = await workos.userManagement.authenticateWithRefreshToken({ clientId, refreshToken });
      return result.refreshToken;
    },

    async logoutUrl(refreshToken) {
      try {
        const result = await workos.userManagement.authenticateWithRefreshToken({ clientId, refreshToken });
        const sessionId = sessionIdOf(result.accessToken);
        return sessionId
          ? workos.userManagement.getLogoutUrl({ sessionId, returnTo: options.returnTo })
          : undefined;
      } catch {
        return undefined;
      }
    },
  };
}
