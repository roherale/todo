import { Command, CommanderError } from 'commander';
import { registerAuth } from './commands/auth.js';
import { registerProfile } from './commands/profile.js';
import { registerTasks } from './commands/tasks.js';
import type { Deps } from './common/context.js';
import { CliError } from './common/errors.js';

export function createProgram(deps: Deps): Command {
  const program = new Command('todo')
    .description('Your task list from the terminal')
    .exitOverride()
    .configureOutput({ writeOut: (s) => deps.io.out(s.trimEnd()), writeErr: (s) => deps.io.err(s.trimEnd()) });
  registerAuth(program, deps);
  registerTasks(program, deps);
  registerProfile(program, deps);
  for (const command of program.commands) command.exitOverride();
  return program;
}

/** Runs the CLI and returns the exit code. Errors become one clear line: never raw JSON or a stack trace. */
export async function run(argv: string[], deps: Deps): Promise<number> {
  try {
    await createProgram(deps).parseAsync(argv, { from: 'user' });
    return 0;
  } catch (err) {
    if (err instanceof CommanderError) return err.exitCode;
    if (err instanceof CliError) {
      deps.io.err(`Error: ${err.message}`);
      return err.exitCode;
    }
    deps.io.err('Error: something went wrong.');
    return 1;
  }
}
