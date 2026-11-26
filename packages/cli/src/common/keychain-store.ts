import { Entry } from '@napi-rs/keyring';
import type { StoredTokens, TokenStore } from './token-store.js';

const SERVICE = 'todo-cli';

/** Tokens live in the operating system's keychain, never in a file. */
export function createKeychainTokenStore(account = 'default'): TokenStore {
  const entry = () => new Entry(SERVICE, account);
  return {
    load() {
      const raw = entry().getPassword();
      if (!raw) return Promise.resolve(undefined);
      try {
        const parsed = JSON.parse(raw) as Partial<StoredTokens>;
        return Promise.resolve(parsed.accessToken && parsed.refreshToken ? { accessToken: parsed.accessToken, refreshToken: parsed.refreshToken } : undefined);
      } catch {
        return Promise.resolve(undefined);
      }
    },
    save(tokens) {
      entry().setPassword(JSON.stringify(tokens));
      return Promise.resolve();
    },
    clear() {
      entry().deletePassword();
      return Promise.resolve();
    },
  };
}
