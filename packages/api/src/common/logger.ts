import { pino, type DestinationStream, type Logger } from 'pino';

/** Paths that must never reach the logs, even if some code logs a whole object. */
const REDACTED = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'authorization',
  'cookie',
  'token',
  'accessToken',
  'refreshToken',
  'title',
  'notes',
  '*.title',
  '*.notes',
  '*.token',
];

export function createLogger(level: string, destination?: DestinationStream): Logger {
  return pino(
    { level, redact: { paths: REDACTED, censor: '[redacted]' }, base: undefined },
    destination,
  );
}
