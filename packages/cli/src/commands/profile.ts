import type { Command } from 'commander';
import { fetchProfile, signedIn, type Deps } from '../common/context.js';
import { formatProfile } from '../common/format.js';

/** Read-only: the CLI has no command to edit the profile or delete the account. */
export function registerProfile(program: Command, deps: Deps): void {
  program
    .command('profile')
    .description('Show your profile')
    .action(async () => {
      const client = await signedIn(deps);
      for (const line of formatProfile(await fetchProfile(client))) deps.io.out(line);
    });
}
