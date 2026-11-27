import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Task } from '@todo/shared';
import { NOT_LOGGED_IN } from '../src/common/errors.js';
import { createProgram, run } from '../src/program.js';
import { harness, startStack, type Harness, type Stack } from './stack.js';

let stack: Stack;
beforeAll(async () => {
  stack = await startStack();
});
afterAll(async () => {
  await stack.close();
});

/** A signed-up person with working tokens, and the CLI wired to them. */
async function signedInUser(profile: { timezone?: string; pageSize?: number } = {}, options: { tty?: boolean; now?: Date } = {}) {
  const who = await stack.createUser(profile);
  const h = harness(stack, { tokens: stack.issueTokens(who), ...options });
  return { who, h, go: (...args: string[]) => run(args, h.deps) };
}

const apiCalls = (h: Harness) => h.requests.filter((r) => r.url.startsWith(stack.apiUrl));

/** What the API itself stored for the person's newest task. */
async function newestTask(h: Harness): Promise<Task> {
  const res = await fetch(`${stack.apiUrl}/api/v1/tasks`, { headers: { authorization: `Bearer ${h.tokens.current()!.accessToken}` } });
  return ((await res.json()) as { items: Task[] }).items[0]!;
}

describe('login and logout', () => {
  it('UC-CLI-01: login opens the browser with PKCE and a loopback redirect, and keeps the tokens out of files and output', async () => {
    const who = await stack.createUser();
    stack.signInAs(who);
    const h = harness(stack, { configure: false });
    const code = await run(['login', '--api-url', stack.apiUrl, '--client-id', 'cli-client'], h.deps);
    expect(code).toBe(0);

    const params = stack.log.authorizeParams.at(-1)!;
    expect(params.get('response_type')).toBe('code');
    expect(params.get('code_challenge_method')).toBe('S256');
    expect(params.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(params.get('client_id')).toBe('cli-client');
    expect(params.get('redirect_uri')).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/callback$/);
    const exchange = stack.log.tokenCalls.filter((c) => c.grant === 'authorization_code').at(-1)!;
    expect(exchange.params.get('code_verifier')).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const stored = h.tokens.current()!;
    expect(stored.accessToken).toBeTruthy();
    expect(stored.refreshToken).toBeTruthy();
    const everything = [readFileSync(h.configPath, 'utf8'), ...h.out, ...h.err].join('\n');
    for (const secret of [stored.accessToken, stored.refreshToken, exchange.params.get('code_verifier')!]) {
      expect(everything).not.toContain(secret);
    }
    expect(JSON.parse(readFileSync(h.configPath, 'utf8'))).toEqual({ apiUrl: stack.apiUrl, clientId: 'cli-client' });
  });

  it('UC-CLI-01: the authorize and token requests carry the resource the API publishes', async () => {
    const who = await stack.createUser();
    stack.signInAs(who);
    const h = harness(stack);
    const published = (await (await fetch(`${stack.apiUrl}/.well-known/oauth-protected-resource`)).json()) as { resource: string };
    expect(published.resource).toBe('https://todo.example.test/mcp');

    const authorizeCalls = stack.log.authorizeParams.length;
    const tokenCalls = stack.log.tokenCalls.length;
    expect(await run(['login'], h.deps)).toBe(0);
    expect(stack.log.authorizeParams.slice(authorizeCalls).map((p) => p.get('resource'))).toEqual([published.resource]);
    const exchanges = stack.log.tokenCalls.slice(tokenCalls);
    expect(exchanges.map((c) => c.grant)).toEqual(['authorization_code']);
    expect(exchanges[0]!.params.get('resource')).toBe(published.resource);

    // A refresh asks for the same resource, so refreshed tokens keep the audience.
    h.tokens.current()!.accessToken = stack.issueTokens(who, -120).accessToken;
    expect(await run(['profile'], h.deps)).toBe(0);
    const refresh = stack.log.tokenCalls.slice(tokenCalls).find((c) => c.grant === 'refresh_token');
    expect(refresh?.params.get('resource')).toBe(published.resource);
  });

  it('UC-CLI-01: the authorize request asks for the offline_access scope, which is what yields a refresh token', async () => {
    const who = await stack.createUser();
    stack.signInAs(who);
    const h = harness(stack);
    const before = stack.log.authorizeParams.length;
    expect(await run(['login'], h.deps)).toBe(0);
    const scope = stack.log.authorizeParams.slice(before)[0]!.get('scope')!;
    expect(scope.split(' ').sort()).toEqual(['email', 'offline_access', 'openid', 'profile']);
  });

  it('UC-CLI-01: a token response without a refresh token is reported as a missing offline_access permission', async () => {
    const who = await stack.createUser();
    stack.signInAs(who);
    const h = harness(stack);
    h.deps.fetch = async (input, init) => {
      const res = await fetch(input, init);
      if (!String(input).endsWith('/token')) return res;
      const body = (await res.json()) as Record<string, unknown>;
      delete body['refresh_token'];
      return new Response(JSON.stringify(body), { status: 200 });
    };
    expect(await run(['login'], h.deps)).toBe(1);
    expect(h.err.join('\n')).toContain('did not return a refresh token. It may be missing the offline_access permission.');
    expect(h.tokens.current()).toBeUndefined();
  });

  it('UC-CLI-01: a refused sign-in shows the server\'s error and description, and never a token or the code', async () => {
    const who = await stack.createUser();
    stack.signInAs(who);
    const h = harness(stack);
    let sent = '';
    h.deps.fetch = async (input, init) => {
      if (!String(input).endsWith('/token')) return fetch(input, init);
      sent = String(init?.body ?? '');
      return new Response(
        JSON.stringify({ error: 'invalid_target', error_description: 'The resource is not allowed\nfor this client', access_token: 'leaked-access', refresh_token: 'leaked-refresh' }),
        { status: 400 },
      );
    };
    expect(await run(['login'], h.deps)).toBe(1);
    const shown = h.err.join('\n');
    expect(shown).toContain('The sign-in server refused the request: invalid_target (The resource is not allowed for this client)');
    const code = new URLSearchParams(sent).get('code')!;
    expect(code).not.toBe('');
    for (const secret of ['leaked-access', 'leaked-refresh', code]) expect(shown).not.toContain(secret);
    expect(h.tokens.current()).toBeUndefined();
  });

  it('UC-CLI-01: a refusal without an error field keeps the plain message', async () => {
    const who = await stack.createUser();
    stack.signInAs(who);
    const h = harness(stack);
    h.deps.fetch = async (input, init) => (String(input).endsWith('/token') ? new Response('<html>nope</html>', { status: 502 }) : fetch(input, init));
    expect(await run(['login'], h.deps)).toBe(1);
    expect(h.err).toEqual(['Error: The sign-in server refused the request']);
  });

  it('UC-CLI-03: a refresh that returns no refresh token ends in "Not logged in" and stores nothing', async () => {
    const who = await stack.createUser();
    const h = harness(stack, { tokens: stack.issueTokens(who, -120) });
    h.deps.fetch = async (input, init) => {
      const res = await fetch(input, init);
      if (!String(input).endsWith('/token')) return res;
      const body = (await res.json()) as Record<string, unknown>;
      delete body['refresh_token'];
      return new Response(JSON.stringify(body), { status: 200 });
    };
    expect(await run(['ls'], h.deps)).toBe(1);
    expect(h.err).toEqual([`Error: ${NOT_LOGGED_IN}`]);
    expect(h.tokens.current()).toBeUndefined();
  });

  it('UC-CLI-01: if the API does not publish a resource, login stops with a clear message', async () => {
    const h = harness(stack);
    h.deps.fetch = async (input, init) => {
      if (String(input).endsWith('/.well-known/oauth-protected-resource')) {
        return new Response(JSON.stringify({ authorization_servers: [stack.authUrl] }), { status: 200 });
      }
      return fetch(input, init);
    };
    expect(await run(['login'], h.deps)).toBe(1);
    expect(h.err.join('\n')).toContain('which resource');
    expect(h.tokens.current()).toBeUndefined();
  });

  it('UC-CLI-01: each login uses a new random port, state and PKCE verifier', async () => {
    const who = await stack.createUser();
    const redirects = new Set<string | null>();
    const challenges = new Set<string | null>();
    for (let i = 0; i < 3; i++) {
      stack.signInAs(who);
      const h = harness(stack);
      expect(await run(['login'], h.deps)).toBe(0);
      const params = stack.log.authorizeParams.at(-1)!;
      redirects.add(params.get('redirect_uri'));
      challenges.add(params.get('code_challenge'));
    }
    expect(challenges.size).toBe(3);
    expect(redirects.size).toBeGreaterThan(1);
  });

  it('UC-CLI-01: login without an API address or client id explains what to do', async () => {
    const h = harness(stack, { configure: false });
    expect(await run(['login'], h.deps)).toBe(1);
    expect(h.err.join('\n')).toContain('todo login --api-url');
    const h2 = harness(stack, { configure: false });
    expect(await run(['login', '--api-url', stack.apiUrl], h2.deps)).toBe(1);
    expect(h2.err.join('\n')).toContain('client id');
  });

  it('UC-CLI-01: the environment overrides the saved settings', async () => {
    const who = await stack.createUser();
    stack.signInAs(who);
    const h = harness(stack, { configure: false, env: { TODO_API_URL: `${stack.apiUrl}/`, TODO_CLI_CLIENT_ID: 'cli-client' } });
    expect(await run(['login'], h.deps)).toBe(0);
    expect(h.tokens.current()).toBeTruthy();
  });

  it('UC-CLI-02: logout removes the tokens, and every command then says "Not logged in" and exits non-zero', async () => {
    const { h, go } = await signedInUser();
    expect(await go('logout')).toBe(0);
    expect(h.tokens.current()).toBeUndefined();
    for (const args of [['ls'], ['add', 'x'], ['set', '1', '--title', 'y'], ['rm', '1'], ['restore', '1'], ['trash'], ['purge', '1', '--yes'], ['profile']]) {
      h.err.length = 0;
      expect(await go(...args), args.join(' ')).toBe(1);
      expect(h.err).toEqual([`Error: ${NOT_LOGGED_IN}`]);
    }
    expect(apiCalls(h)).toHaveLength(0);
  });

  it('UC-CLI-01: a sign-in that is cancelled, or answered with the wrong state, stores nothing', async () => {
    const h = harness(stack);
    h.deps.openBrowser = async (url) => {
      const redirect = new URL(url).searchParams.get('redirect_uri')!;
      await fetch(`${redirect}?code=x&state=wrong`);
    };
    expect(await run(['login'], h.deps)).toBe(1);
    expect(h.tokens.current()).toBeUndefined();
    expect(h.err.join('\n')).toContain('Sign-in was cancelled');
  });
});

describe('tokens', () => {
  it('UC-CLI-03: an expired access token is refreshed once and the command is retried', async () => {
    const who = await stack.createUser();
    const expired = stack.issueTokens(who, -120);
    const h = harness(stack, { tokens: expired });
    const before = stack.log.tokenCalls.filter((c) => c.grant === 'refresh_token').length;
    expect(await run(['profile'], h.deps)).toBe(0);
    expect(stack.log.tokenCalls.filter((c) => c.grant === 'refresh_token').length - before).toBe(1);
    expect(h.out.join('\n')).toContain(who.email);
    // The API saw the stale token first, then the fresh one.
    expect(apiCalls(h).filter((r) => r.url.endsWith('/api/v1/profile'))).toHaveLength(2);
    expect(h.tokens.current()!.refreshToken).not.toBe(expired.refreshToken);
    // And the next command needs no refresh.
    const calls = stack.log.tokenCalls.length;
    expect(await run(['profile'], h.deps)).toBe(0);
    expect(stack.log.tokenCalls.length).toBe(calls);
  });

  it('UC-CLI-03: if refreshing fails, the CLI behaves as after logout', async () => {
    const who = await stack.createUser();
    const h = harness(stack, { tokens: stack.issueTokens(who, -120) });
    stack.revokeRefreshTokens();
    expect(await run(['ls'], h.deps)).toBe(1);
    expect(h.err).toEqual([`Error: ${NOT_LOGGED_IN}`]);
    expect(h.tokens.current()).toBeUndefined();
  });

  it('UC-CLI-03: without a client id there is nothing to refresh with, so it behaves as after logout', async () => {
    const who = await stack.createUser();
    const h = harness(stack, { tokens: stack.issueTokens(who, -120), configure: false, env: { TODO_API_URL: stack.apiUrl } });
    expect(await run(['ls'], h.deps)).toBe(1);
    expect(h.err).toEqual([`Error: ${NOT_LOGGED_IN}`]);
  });

  it('UC-CLI-03: a token the API keeps refusing after one refresh also ends in "Not logged in"', async () => {
    const who = await stack.createUser();
    const h = harness(stack, { tokens: stack.issueTokens(who, -120) });
    h.deps.fetch = (input, init) => {
      const url = String(input);
      if (url.startsWith(stack.apiUrl) && url.endsWith('/api/v1/profile')) {
        return Promise.resolve(new Response(JSON.stringify({ title: 'Unauthorized', status: 401 }), { status: 401, headers: { 'content-type': 'application/problem+json' } }));
      }
      return fetch(input, init);
    };
    expect(await run(['profile'], h.deps)).toBe(1);
    expect(h.err).toEqual([`Error: ${NOT_LOGGED_IN}`]);
    expect(h.tokens.current()).toBeUndefined();
  });

  it('UC-CLI-04: when the API says signup-required, the CLI prints the sign-up URL and exits non-zero', async () => {
    const identity = { subject: 'workos|nobody', email: 'nobody@example.test' };
    const h = harness(stack, { tokens: stack.issueTokens(identity) });
    expect(await run(['ls'], h.deps)).toBe(1);
    expect(h.err.join('\n')).toContain('https://todo.example.test/signup');
    expect(h.out).toEqual([]);
  });
});

describe('commands', () => {
  it('UC-CLI-05: add, ls, set, rm, restore, trash and profile call the matching endpoints and print readable results', async () => {
    const { h, go } = await signedInUser({ timezone: 'America/Mexico_City' });
    expect(await go('add', 'Write report', '--notes', 'first draft', '--status', 'queued')).toBe(0);
    expect(h.out.join('\n')).toBe('Added:\n#1  [queued]  Write report\n    first draft');
    expect(await go('add', 'Second')).toBe(0);

    h.out.length = 0;
    expect(await go('ls')).toBe(0);
    expect(h.out).toEqual(['#2  [new]  Second', '#1  [queued]  Write report']);
    h.out.length = 0;
    expect(await go('ls', '--status', 'queued')).toBe(0);
    expect(h.out).toEqual(['#1  [queued]  Write report']);

    h.out.length = 0;
    expect(await go('set', '#1', '--title', 'Write the report', '--status', 'in-progress')).toBe(0);
    expect(h.out.join('\n')).toContain('#1  [in progress]  Write the report');

    h.out.length = 0;
    expect(await go('rm', '2')).toBe(0);
    expect(h.out[0]).toContain('Moved #2 to the trash');
    h.out.length = 0;
    expect(await go('ls')).toBe(0);
    expect(h.out).toEqual(['#1  [in progress]  Write the report']);
    h.out.length = 0;
    expect(await go('trash')).toBe(0);
    expect(h.out).toEqual(['#2  [new]  Second']);

    h.out.length = 0;
    expect(await go('restore', '2')).toBe(0);
    expect(h.out.join('\n')).toContain('Restored:\n#2  [new]  Second');
    h.out.length = 0;
    expect(await go('trash')).toBe(0);
    expect(h.out).toEqual(['The trash is empty.']);

    h.out.length = 0;
    expect(await go('profile')).toBe(0);
    expect(h.out.join('\n')).toMatch(/Name: +CLI User\nEmail: +.*@example\.test\nTimezone: +America\/Mexico_City\nPage size: +10/);
    expect(apiCalls(h).map((r) => r.method)).toEqual(expect.arrayContaining(['GET', 'POST', 'PATCH', 'DELETE']));
  });

  it('UC-CLI-05: rm accepts #number, and the message names the task', async () => {
    const { h, go } = await signedInUser();
    await go('add', 'x');
    h.out.length = 0;
    expect(await go('rm', '#1')).toBe(0);
    expect(h.out[0]).toContain('Moved #1 to the trash');
  });

  it('UC-CLI-05: ls says so when there are no tasks, and points to the next page when there is one', async () => {
    const { h, go } = await signedInUser();
    await go('ls');
    expect(h.out).toEqual(['No tasks.']);
    for (let i = 0; i < 12; i++) await go('add', `t${i}`);
    h.out.length = 0;
    await go('ls', '--limit', '10');
    expect(h.out).toHaveLength(11);
    const more = h.out.at(-1)!;
    expect(more).toMatch(/^More: todo ls --cursor \S+$/);
    h.out.length = 0;
    await go('ls', '--limit', '10', '--cursor', more.split(' ').at(-1)!);
    expect(h.out).toHaveLength(2);
  });

  it('UC-CLI-05: trash lists a page and points to the next one', async () => {
    const { h, go } = await signedInUser();
    for (let i = 0; i < 12; i++) {
      await go('add', `t${i}`);
      await go('rm', String(i + 1));
    }
    h.out.length = 0;
    await go('trash', '--limit', '10');
    const more = h.out.at(-1)!;
    expect(more).toMatch(/^More: todo trash --cursor \S+$/);
    h.out.length = 0;
    await go('trash', '--limit', '10', '--cursor', more.split(' ').at(-1)!);
    expect(h.out).toHaveLength(2);
  });

  it('UC-CLI-05: set needs something to change, rejects a clash, and --clear-due removes the due date', async () => {
    const { h, go } = await signedInUser();
    await go('add', 'x', '--due', '2026-12-01');
    h.err.length = 0;
    expect(await go('set', '1')).toBe(1);
    expect(h.err[0]).toContain('Nothing to change');
    expect(await go('set', '1', '--due', 'today', '--clear-due')).toBe(1);
    h.out.length = 0;
    expect(await go('set', '1', '--clear-due')).toBe(0);
    expect(h.out.join('\n')).not.toContain('due');
    expect((await newestTask(h)).dueAt).toBeNull();
  });

  it('UC-CLI-05: set can change the notes and the due date, and add can start a task as completed', async () => {
    const { h, go } = await signedInUser({ timezone: 'UTC' });
    await go('add', 'x', '--status', 'completed');
    expect((await newestTask(h)).completedAt).not.toBeNull();
    expect(await go('set', '1', '--notes', 'later notes', '--due', '2026-12-24')).toBe(0);
    const task = await newestTask(h);
    expect(task.notes).toBe('later notes');
    expect(task.dueAllDay).toBe(true);
  });

  it('UC-CLI-05: an unknown status is reported before any request is sent', async () => {
    const { h, go } = await signedInUser();
    expect(await go('add', 'x', '--status', 'done')).toBe(1);
    expect(h.err[0]).toContain('Unknown status');
    expect(await go('ls', '--status', 'nope')).toBe(1);
    expect(await go('set', '1', '--status', 'nope')).toBe(1);
    expect(apiCalls(h)).toHaveLength(0);
  });

  it('UC-CLI-05: tasks that are overdue are marked in the list', async () => {
    const { h, go } = await signedInUser({ timezone: 'UTC' }, { now: new Date('2026-12-05T00:00:00Z') });
    await go('add', 'late', '--due', '2026-12-01');
    await go('add', 'later', '--due', '2026-12-30');
    await go('add', 'done late', '--due', '2026-12-01', '--status', 'completed');
    h.out.length = 0;
    await go('ls');
    expect(h.out).toEqual(['#3  [completed]  done late  (due 2026-12-01)', '#2  [new]  later  (due 2026-12-30)', '#1  [new]  late  (due 2026-12-01, overdue)']);
  });

  it('UC-CLI-05: ls --due-before filters like the API does', async () => {
    const { h, go } = await signedInUser({ timezone: 'UTC' });
    await go('add', 'soon', '--due', '2026-12-01');
    await go('add', 'far', '--due', '2026-12-30');
    h.out.length = 0;
    await go('ls', '--due-before', '2026-12-15');
    expect(h.out.map((l) => l.replace(/ +\(.*/, ''))).toEqual(['#1  [new]  soon']);
  });
});

describe('due dates', () => {
  it('UC-CLI-06: --due is converted with the profile timezone, not the machine\'s', async () => {
    const tokyo = await signedInUser({ timezone: 'Asia/Tokyo' });
    expect(await tokyo.go('add', 'timed', '--due', '2026-11-28 15:30')).toBe(0);
    expect(tokyo.h.out.join('\n')).toContain('(due 2026-11-28 15:30');
    const mexico = await signedInUser({ timezone: 'America/Mexico_City' });
    expect(await mexico.go('add', 'timed', '--due', '2026-11-28 15:30')).toBe(0);
    expect(mexico.h.out.join('\n')).toContain('(due 2026-11-28 15:30');
    // The instants the API stored differ by the zones' offsets.
    expect((await newestTask(tokyo.h)).dueAt).toBe('2026-11-28T06:30:00.000Z');
    expect((await newestTask(mexico.h)).dueAt).toBe('2026-11-28T21:30:00.000Z');
  });

  it('UC-CLI-06: a plain date is an all-day task that shows only the date', async () => {
    const { h, go } = await signedInUser({ timezone: 'America/Mexico_City' });
    expect(await go('add', 'all day', '--due', '2026-12-01')).toBe(0);
    expect(h.out.join('\n')).toContain('(due 2026-12-01');
    expect(h.out.join('\n')).not.toMatch(/\d\d:\d\d/);
    const task = await newestTask(h);
    expect(task.dueAllDay).toBe(true);
    expect(task.dueAt).toBe('2026-12-02T05:59:59.000Z');
  });

  it('UC-CLI-06: relative words work for add and set', async () => {
    const { h, go } = await signedInUser({ timezone: 'UTC' }, { now: new Date('2026-11-27T10:00:00Z') });
    await go('add', 'a', '--due', 'tomorrow');
    await go('add', 'b', '--due', 'fri 3pm');
    await go('set', '1', '--due', 'mon 9:30am');
    h.out.length = 0;
    await go('ls');
    expect(h.out.map((l) => l.replace(/\(due (.*?)(, overdue)?\)/, '$1'))).toEqual(['#2  [new]  b  2026-11-27 15:00', '#1  [new]  a  2026-11-30 09:30']);
  });

  it('UC-CLI-06: input it cannot parse gives an error and sends no request', async () => {
    const { h, go } = await signedInUser();
    for (const args of [['add', 'x', '--due', 'someday'], ['set', '1', '--due', '2026-99-99'], ['ls', '--due-before', 'soonish']]) {
      expect(await go(...args), args.join(' ')).toBe(1);
      expect(h.err.at(-1)).toContain('Cannot read the date');
    }
    expect(apiCalls(h)).toHaveLength(0);
  });
});

describe('confirmation', () => {
  async function trashed(options: { tty?: boolean } = {}) {
    const u = await signedInUser({}, options);
    await u.go('add', 'to purge');
    await u.go('rm', '1');
    u.h.requests.length = 0;
    return u;
  }
  const deletes = (h: Harness) => apiCalls(h).filter((r) => r.method === 'DELETE');

  it('UC-CLI-07: purge asks [y/N]; only y or yes goes ahead, anything else cancels and sends nothing', async () => {
    for (const answer of ['', 'n', 'no', 'maybe', 'yep', 'Y es']) {
      const { h, go } = await trashed();
      h.answers.push(answer);
      expect(await go('purge', '1'), JSON.stringify(answer)).toBe(0);
      expect(h.prompts[0]).toMatch(/\[y\/N\] $/);
      expect(h.out.at(-1)).toBe('Cancelled.');
      expect(deletes(h)).toHaveLength(0);
    }
    for (const answer of ['y', 'yes', ' YES ']) {
      const { h, go } = await trashed();
      h.answers.push(answer);
      expect(await go('purge', '#1')).toBe(0);
      expect(deletes(h)).toHaveLength(1);
      expect(deletes(h)[0]!.url).toContain('permanent=true');
      expect(h.out.at(-1)).toContain('permanently');
    }
  });

  it('UC-CLI-07: trash --empty asks too, and cancelling leaves the trash alone', async () => {
    const { h, go } = await trashed();
    h.answers.push('n');
    expect(await go('trash', '--empty')).toBe(0);
    expect(deletes(h)).toHaveLength(0);
    h.answers.push('y');
    expect(await go('trash', '--empty')).toBe(0);
    expect(deletes(h)).toHaveLength(1);
    expect(h.out.at(-1)).toBe('Deleted 1 task permanently.');
  });

  it('UC-CLI-08: --yes skips the prompt', async () => {
    const { h, go } = await trashed();
    expect(await go('purge', '1', '--yes')).toBe(0);
    expect(h.prompts).toHaveLength(0);
    expect(deletes(h)).toHaveLength(1);
    expect(await go('trash', '--empty', '--yes')).toBe(0);
    expect(h.prompts).toHaveLength(0);
    expect(h.out.at(-1)).toBe('Deleted 0 tasks permanently.');
  });

  it('UC-CLI-09: without a terminal and without --yes, purge and trash --empty refuse and exit non-zero', async () => {
    const { h, go } = await trashed({ tty: false });
    expect(await go('purge', '1')).toBe(1);
    expect(await go('trash', '--empty')).toBe(1);
    expect(h.err.filter((e) => e.includes('--yes'))).toHaveLength(2);
    expect(deletes(h)).toHaveLength(0);
    expect(h.prompts).toHaveLength(0);
    expect(await go('purge', '1', '--yes')).toBe(0);
  });
});

describe('errors and limits', () => {
  it('UC-CLI-10: API errors print as one clear line with the requestId, never raw JSON or a stack trace', async () => {
    const { h, go } = await signedInUser();
    expect(await go('add', '   ')).toBe(1);
    expect(await go('set', '999', '--title', 'x')).toBe(1);
    expect(h.err).toHaveLength(2);
    for (const line of h.err) {
      expect(line).toMatch(/^Error: .+ \(requestId: [0-9a-f-]{36}\)$/);
      expect(line).not.toMatch(/[{}]|\bat \S+\.(ts|js)|stack/);
    }
    expect(h.err[0]).toContain('title');
    expect(h.err[1]).toContain('Not Found');
  });

  it('UC-CLI-10: an unreachable API and an unexpected failure are also one line', async () => {
    const who = await stack.createUser();
    const h = harness(stack, { tokens: stack.issueTokens(who) });
    h.deps.config.write({ apiUrl: 'http://127.0.0.1:1' });
    expect(await run(['ls'], h.deps)).toBe(1);
    expect(h.err).toEqual(['Error: Could not reach the API at http://127.0.0.1:1']);

    const broken = harness(stack, { tokens: stack.issueTokens(who) });
    broken.deps.tokens.load = () => Promise.reject(new Error('keychain exploded at /srv/x.ts:9'));
    expect(await run(['ls'], broken.deps)).toBe(1);
    expect(broken.err).toEqual(['Error: something went wrong.']);
  });

  it('UC-CLI-10: a non-problem error body from the API still gives one line', async () => {
    const who = await stack.createUser();
    const h = harness(stack, { tokens: stack.issueTokens(who) });
    h.deps.fetch = () => Promise.resolve(new Response('<html>bad gateway</html>', { status: 502 }));
    expect(await run(['profile'], h.deps)).toBe(1);
    expect(h.err).toEqual(['Error: Request failed (502)']);
  });

  it('UC-CLI-11: there is no command to edit the profile or delete the account', async () => {
    const { h } = await signedInUser();
    const names = createProgram(h.deps).commands.map((c) => c.name()).sort();
    expect(names).toEqual(['add', 'login', 'logout', 'ls', 'profile', 'purge', 'restore', 'rm', 'set', 'trash']);
    const profile = createProgram(h.deps).commands.find((c) => c.name() === 'profile')!;
    expect(profile.commands).toHaveLength(0);
    expect(profile.options.map((o) => o.long)).toEqual([]);
    for (const args of [['profile', 'edit'], ['profile', '--name', 'x'], ['account', 'delete'], ['delete-account']]) {
      expect(await run(args, h.deps), args.join(' ')).not.toBe(0);
    }
    expect(apiCalls(h).filter((r) => r.method !== 'GET')).toHaveLength(0);
  });

  it('UC-CLI-12: ls and trash use the profile pageSize when --limit is not given', async () => {
    const { h, go } = await signedInUser({ pageSize: 25 });
    await go('ls');
    await go('trash');
    const lists = apiCalls(h).filter((r) => /\/api\/v1\/(tasks|trash)\?/.test(r.url));
    expect(lists.map((r) => new URL(r.url).searchParams.get('limit'))).toEqual(['25', '25']);
  });

  it('UC-CLI-12: --limit accepts only 10, 25, 50 or 100', async () => {
    const { h, go } = await signedInUser({ pageSize: 25 });
    for (const limit of ['10', '25', '50', '100']) {
      h.requests.length = 0;
      expect(await go('ls', '--limit', limit), limit).toBe(0);
      expect(apiCalls(h).some((r) => r.url.includes(`limit=${limit}`))).toBe(true);
      expect(await go('trash', '--limit', limit), limit).toBe(0);
    }
    h.requests.length = 0;
    for (const bad of ['0', '5', '30', '101', 'abc', '']) {
      expect(await go('ls', '--limit', bad), bad).toBe(1);
      expect(await go('trash', '--limit', bad), bad).toBe(1);
    }
    expect(apiCalls(h)).toHaveLength(0);
    expect(h.err.at(-1)).toContain('--limit must be one of 10, 25, 50, 100');
  });
});
