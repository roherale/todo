export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
}

/** Where the CLI keeps its tokens. The real one is the OS keychain; tests use an in-memory one. */
export interface TokenStore {
  load(): Promise<StoredTokens | undefined>;
  save(tokens: StoredTokens): Promise<void>;
  clear(): Promise<void>;
}

export function createMemoryTokenStore(initial?: StoredTokens): TokenStore & { current(): StoredTokens | undefined } {
  let tokens = initial;
  return {
    current: () => tokens,
    load: () => Promise.resolve(tokens),
    save: (t) => {
      tokens = t;
      return Promise.resolve();
    },
    clear: () => {
      tokens = undefined;
      return Promise.resolve();
    },
  };
}
