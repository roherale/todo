import type { Server } from 'node:http';

/** Stops accepting connections, waits for in-flight requests, then runs `closeResources`. */
export function createShutdown(server: Server, closeResources: () => Promise<void>) {
  let done: Promise<void> | undefined;
  return () => {
    done ??= new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) return reject(err);
        closeResources().then(resolve, reject);
      });
      server.closeIdleConnections();
    });
    return done;
  };
}
