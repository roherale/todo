/** What the app needs from the external identity provider for the web sign-in flow. */
export interface IdentityProvider {
  /** The provider's sign-in page for this `state`. */
  authorizationUrl(state: string): string;
  /** Exchanges the one-time code from the callback. Rejects when the provider refuses it. */
  exchangeCode(code: string): Promise<{ sub: string; email: string; refreshToken: string }>;
  /** Exchanges a refresh token for a rotated one. Rejects when the provider refuses it. */
  refresh(refreshToken: string): Promise<string>;
  /** Where to send the browser to end the provider's own session, if it can be worked out. */
  logoutUrl(refreshToken: string): Promise<string | undefined>;
}
