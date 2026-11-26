import { createInterface } from 'node:readline/promises';
import { CliError } from './errors.js';

/** Everything the commands need from the terminal, so tests can supply their own. */
export interface Io {
  out(line: string): void;
  err(line: string): void;
  isTTY: boolean;
  /** Asks a question and resolves with the typed line. */
  prompt(question: string): Promise<string>;
}

export function createTerminalIo(): Io {
  return {
    out: (line) => process.stdout.write(`${line}\n`),
    err: (line) => process.stderr.write(`${line}\n`),
    isTTY: Boolean(process.stdin.isTTY && process.stdout.isTTY),
    async prompt(question) {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      try {
        return await rl.question(question);
      } finally {
        rl.close();
      }
    },
  };
}

/** Asks `[y/N]`. Only `y` or `yes` goes ahead. Without a terminal, it refuses unless `--yes` was given. */
export async function confirm(io: Io, question: string, yes: boolean): Promise<boolean> {
  if (yes) return true;
  if (!io.isTTY) throw new CliError('This needs confirmation, but there is no terminal. Run it again with --yes.');
  const answer = (await io.prompt(`${question} [y/N] `)).trim().toLowerCase();
  return answer === 'y' || answer === 'yes';
}
