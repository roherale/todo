import type { Command } from 'commander';
import { resolveSettings } from '../common/config.js';
import { CliError } from '../common/errors.js';
import { discover, createLoopbackLogin } from '../common/oauth.js';
import type { Deps } from '../common/context.js';

export function registerAuth(program: Command, deps: Deps): void {
  program
    .command('login')
    .description('Sign in through your browser')
    .option('--api-url <url>', 'the address of the todo API; remembered for next time')
    .option('--client-id <id>', 'the CLI client id; remembered for next time')
    .action(async (opts: { apiUrl?: string; clientId?: string }) => {
      if (opts.apiUrl || opts.clientId) {
        deps.config.write({
          ...(opts.apiUrl ? { apiUrl: opts.apiUrl.replace(/\/+$/, '') } : {}),
          ...(opts.clientId ? { clientId: opts.clientId } : {}),
        });
      }
      const { apiUrl, clientId } = resolveSettings(deps.config, deps.env);
      if (!apiUrl) throw new CliError('Tell me where the API is: todo login --api-url <url>');
      if (!clientId) throw new CliError('No client id is set. Run `todo login --client-id <id>` or set TODO_CLI_CLIENT_ID.');

      const discovery = await discover(apiUrl, deps.fetch);
      deps.io.out('Opening your browser to sign in...');
      const flow = createLoopbackLogin({
        discovery,
        clientId,
        fetch: deps.fetch,
        openBrowser: (url) => {
          deps.io.out(`If it does not open, visit: ${url}`);
          return deps.openBrowser(url);
        },
      });
      // The tokens go straight to the keychain. They are never printed or written to a file.
      await deps.tokens.save(await flow.login());
      deps.io.out('Logged in.');
    });

  program
    .command('logout')
    .description('Remove the stored sign-in from this computer')
    .action(async () => {
      await deps.tokens.clear();
      deps.io.out('Logged out.');
    });
}
