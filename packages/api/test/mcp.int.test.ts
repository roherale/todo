import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import type { Task } from '@todo/shared';
import { COOKIE_NAME, bearer, buildTestApp, createClock, createUser, createWebSession, emailOf, signer, workosIdOf } from './helpers.js';

const ctx = buildTestApp();
const servers: Server[] = [];
const clients: Client[] = [];
let baseUrl = '';

const ready = new Promise<void>((resolve) => {
  const server = ctx.app.listen(0, '127.0.0.1', () => {
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    resolve();
  });
  servers.push(server);
});

afterAll(async () => {
  await Promise.all(clients.map((c) => c.close().catch(() => undefined)));
  servers.forEach((s) => s.close());
  await ctx.database.pool.end();
});

interface ToolResult {
  isError?: boolean;
  content: { type: string; text: string }[];
}

async function connect(userId: string, headers: Record<string, string> = bearer(userId)): Promise<Client> {
  await ready;
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), { requestInit: { headers } }));
  clients.push(client);
  return client;
}

const call = async (client: Client, name: string, args: Record<string, unknown> = {}) =>
  (await client.callTool({ name, arguments: args })) as unknown as ToolResult;
interface Data {
  [key: string]: unknown;
  id: string;
  number: number;
  items: Task[];
  deletedAt: string | null;
  completedAt: string | null;
}
const data = (result: ToolResult) => JSON.parse(result.content[0]!.text) as Data;

const EXPECTED_TOOLS = [
  'create_task',
  'empty_trash',
  'get_profile',
  'get_task',
  'list_tasks',
  'list_trash',
  'purge_task',
  'restore_task',
  'trash_task',
  'update_task',
];

describe('tools', () => {
  it('UC-MCP-01: tools/list returns exactly the ten tools, with none to edit the profile or delete the account', async () => {
    const client = await connect(await createUser(ctx.database));
    const names = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual(EXPECTED_TOOLS);
    expect(names.some((n) => /profile|account|delete_user/.test(n) && n !== 'get_profile')).toBe(false);
  });

  it('UC-MCP-02: read tools are marked read-only and the destructive tools are marked destructive', async () => {
    const client = await connect(await createUser(ctx.database));
    const tools = Object.fromEntries((await client.listTools()).tools.map((t) => [t.name, t.annotations ?? {}]));
    for (const name of ['list_tasks', 'get_task', 'list_trash', 'get_profile']) expect(tools[name]?.readOnlyHint, name).toBe(true);
    for (const name of ['purge_task', 'empty_trash']) expect(tools[name]?.destructiveHint, name).toBe(true);
    for (const name of ['create_task', 'update_task', 'trash_task', 'restore_task']) {
      expect(tools[name]?.readOnlyHint, name).not.toBe(true);
      expect(tools[name]?.destructiveHint, name).not.toBe(true);
    }
  });

  it('UC-MCP-03: the server is stateless: no session id is issued, and separate requests work without one', async () => {
    await ready;
    const user = await createUser(ctx.database);
    const headers = { ...bearer(user), 'content-type': 'application/json', accept: 'application/json, text/event-stream' };
    const init = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'x', version: '1' } } }),
    });
    expect(init.status).toBe(200);
    expect(init.headers.get('mcp-session-id')).toBeNull();
    const first = await fetch(`${baseUrl}/mcp`, { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) });
    const second = await fetch(`${baseUrl}/mcp`, { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/list' }) });
    for (const res of [first, second]) {
      expect(res.status).toBe(200);
      expect(res.headers.get('mcp-session-id')).toBeNull();
      expect(((await res.json()) as { result: { tools: unknown[] } }).result.tools).toHaveLength(10);
    }
  });

  it('UC-MCP-03: GET and DELETE (streams and session ends) are not served', async () => {
    await ready;
    const headers = bearer(await createUser(ctx.database));
    expect((await fetch(`${baseUrl}/mcp`, { headers })).status).toBe(405);
    expect((await fetch(`${baseUrl}/mcp`, { method: 'DELETE', headers })).status).toBe(405);
  });

  it('UC-MCP-04: create_task gives the same result as the REST endpoint, and a bad title the same error as UC-TASK-03', async () => {
    const user = await createUser(ctx.database);
    const client = await connect(user);
    const created = data(await call(client, 'create_task', { title: '  From MCP  ', notes: 'n' }));
    const viaRest = (await request(ctx.app).get(`/api/v1/tasks/${created['id']}`).set(bearer(user))).body as Task;
    expect(viaRest).toEqual(created);
    expect(created).toMatchObject({ title: 'From MCP', status: 'new', number: 1, ownerId: user });

    for (const title of ['', '   ', 'a'.repeat(201)]) {
      const res = await call(client, 'create_task', { title });
      expect(res.isError, JSON.stringify(title)).toBe(true);
      expect(res.content[0]!.text).toContain('title');
    }
    const rest = await request(ctx.app).post('/api/v1/tasks').set(bearer(user)).send({ title: '' });
    expect(rest.status).toBe(400);
    expect((await call(client, 'create_task', { title: '' })).content[0]!.text).toContain(rest.body.detail);
  });

  it('UC-MCP-04: list, update, trash, restore and empty behave like their REST endpoints', async () => {
    const user = await createUser(ctx.database);
    const client = await connect(user);
    const a = data(await call(client, 'create_task', { title: 'first' }));
    const b = data(await call(client, 'create_task', { title: 'second', status: 'queued' }));
    expect(data(await call(client, 'list_tasks')).items.map((t) => t.id)).toEqual([b['id'], a['id']]);
    expect(data(await call(client, 'list_tasks', { status: 'queued' })).items.map((t) => t.id)).toEqual([b['id']]);

    const updated = data(await call(client, 'update_task', { ref: b['id'], title: 'renamed', status: 'completed', dueAt: '2026-11-28T15:00:00-06:00' }));
    expect(updated).toMatchObject({ title: 'renamed', status: 'completed', dueAt: '2026-11-28T21:00:00.000Z' });
    expect(updated['completedAt']).not.toBeNull();
    const bad = await call(client, 'update_task', { ref: b['id'], status: 'done' });
    expect(bad.isError).toBe(true);
    const noTz = await call(client, 'update_task', { ref: b['id'], dueAt: '2026-11-28T15:00:00' });
    expect(noTz.isError).toBe(true);

    expect(data(await call(client, 'trash_task', { ref: a['id'] }))).toEqual({ trashed: true });
    expect(data(await call(client, 'list_trash')).items.map((t) => t.id)).toEqual([a['id']]);
    expect(data(await call(client, 'restore_task', { ref: a['id'] }))['deletedAt']).toBeNull();
    const again = await call(client, 'restore_task', { ref: a['id'] });
    expect(again.isError).toBe(true);
    expect(again.content[0]!.text).toContain('not in the trash');

    await call(client, 'trash_task', { ref: a['id'] });
    expect(data(await call(client, 'empty_trash', { confirm: true }))).toEqual({ deleted: 1 });
  });

  it('UC-MCP-05: tools accept a UUID, a number or #number as the task ref', async () => {
    const client = await connect(await createUser(ctx.database));
    const task = data(await call(client, 'create_task', { title: 'findable' }));
    for (const ref of [task['id'], task['number'], String(task['number']), `#${task['number']}`]) {
      const res = await call(client, 'get_task', { ref });
      expect(res.isError, String(ref)).toBeFalsy();
      expect(data(res)['id']).toBe(task['id']);
    }
    for (const ref of ['#999', 'nonsense', randomUUID()]) {
      expect((await call(client, 'get_task', { ref })).isError, ref).toBe(true);
    }
    expect(data(await call(client, 'trash_task', { ref: `#${task['number']}` }))).toEqual({ trashed: true });
  });

  it('UC-MCP-06: purge_task and empty_trash without confirm: true return a tool error and delete nothing', async () => {
    const user = await createUser(ctx.database);
    const client = await connect(user);
    const task = data(await call(client, 'create_task', { title: 'keep me' }));
    await call(client, 'trash_task', { ref: task['id'] });
    for (const args of [{}, { confirm: false }, { confirm: 'true' }]) {
      const purge = await call(client, 'purge_task', { ref: task['id'], ...args });
      const empty = await call(client, 'empty_trash', args);
      expect(purge.isError, JSON.stringify(args)).toBe(true);
      expect(empty.isError, JSON.stringify(args)).toBe(true);
      expect(purge.content[0]!.text).toContain('confirm: true');
    }
    expect((await request(ctx.app).get(`/api/v1/tasks/${task['id']}`).set(bearer(user))).status).toBe(200);
    expect(data(await call(client, 'list_trash')).items).toHaveLength(1);
  });

  it('UC-MCP-06: with confirm: true, purge_task deletes a trashed task', async () => {
    const user = await createUser(ctx.database);
    const client = await connect(user);
    const task = data(await call(client, 'create_task', { title: 'bye' }));
    await call(client, 'trash_task', { ref: task['id'] });
    expect(data(await call(client, 'purge_task', { ref: task['id'], confirm: true }))).toEqual({ deleted: true });
    expect((await request(ctx.app).get(`/api/v1/tasks/${task['id']}`).set(bearer(user))).status).toBe(404);
  });

  it('UC-MCP-07: purge_task on a task not in the trash is a tool error and leaves the task unchanged', async () => {
    const user = await createUser(ctx.database);
    const client = await connect(user);
    const task = data(await call(client, 'create_task', { title: 'alive' }));
    const res = await call(client, 'purge_task', { ref: task['id'], confirm: true });
    expect(res.isError).toBe(true);
    expect(res.content[0]!.text).toContain('Conflict');
    expect(data(await call(client, 'get_task', { ref: task['id'] }))).toEqual(task);
  });

  it('UC-MCP-08: if the caller has not signed up, every tool returns an error containing the sign-up URL', async () => {
    const sub = `test|mcp-new-${randomUUID()}`;
    const client = await connect('unused', { authorization: `Bearer ${signer.signToken({ sub, email: 'nobody@example.test' })}` });
    const tools = (await client.listTools()).tools.map((t) => t.name);
    expect(tools).toHaveLength(10);
    for (const name of tools) {
      const res = await call(client, name, { ref: 1, title: 'x', confirm: true });
      expect(res.isError, name).toBe(true);
      expect(res.content[0]!.text, name).toContain(`${ctx.config.APP_ORIGIN}/signup`);
    }
  });

  it('UC-MCP-09: create_task and update_task tell the model to call get_profile and to send dueAt with an offset', async () => {
    const client = await connect(await createUser(ctx.database));
    const tools = Object.fromEntries((await client.listTools()).tools.map((t) => [t.name, t.description ?? '']));
    for (const name of ['create_task', 'update_task']) {
      expect(tools[name], name).toContain('get_profile');
      expect(tools[name], name).toMatch(/offset/);
      expect(tools[name], name).toContain('dueAt');
    }
  });

  it('UC-MCP-10: get_profile returns displayName, email and timezone, and never workosUserId', async () => {
    const user = await createUser(ctx.database, { timezone: 'Asia/Tokyo' });
    const client = await connect(user);
    const res = await call(client, 'get_profile');
    expect(data(res)).toEqual({ displayName: 'Test User', email: emailOf(user), timezone: 'Asia/Tokyo' });
    expect(res.content[0]!.text).not.toContain(workosIdOf(user));
  });
});

describe('isolation through MCP', () => {
  it('UC-ISO-06: every tool that takes a task ref returns not found for another user\'s task, and lists never include it', async () => {
    const a = await createUser(ctx.database);
    const b = await createUser(ctx.database);
    const clientA = await connect(a);
    const clientB = await connect(b);
    // B owns number 1 too, so use A's number 2 and 3, which B does not have.
    await call(clientA, 'create_task', { title: 'a-filler' });
    const live = data(await call(clientA, 'create_task', { title: 'a-live' }));
    const trashed = data(await call(clientA, 'create_task', { title: 'a-trashed' }));
    await call(clientA, 'trash_task', { ref: trashed['id'] });
    await call(clientB, 'create_task', { title: 'b-only' });

    for (const task of [live, trashed]) {
      for (const ref of [task['id'], task['number'], `#${task['number']}`]) {
        for (const [name, extra] of [
          ['get_task', {}],
          ['update_task', { title: 'hacked' }],
          ['trash_task', {}],
          ['restore_task', {}],
          ['purge_task', { confirm: true }],
        ] as const) {
          const res = await call(clientB, name, { ref, ...extra });
          expect(res.isError, `${name} ${String(ref)}`).toBe(true);
          expect(res.content[0]!.text, `${name} ${String(ref)}`).toContain('Not Found');
        }
      }
    }
    for (const name of ['list_tasks', 'list_trash']) {
      const ids = data(await call(clientB, name)).items.map((t) => t.id);
      expect(ids).not.toContain(live['id']);
      expect(ids).not.toContain(trashed['id']);
    }
    expect(data(await call(clientB, 'empty_trash', { confirm: true }))).toEqual({ deleted: 0 });
    expect(data(await call(clientA, 'get_task', { ref: trashed['id'] }))['deletedAt']).not.toBeNull();
    expect(data(await call(clientA, 'get_task', { ref: live['id'] }))).toEqual(live);
  });
});

describe('authentication at /mcp', () => {
  const challenge = () => `Bearer resource_metadata="${ctx.config.APP_ORIGIN}/.well-known/oauth-protected-resource"`;
  const post = (headers: Record<string, string> = {}) =>
    request(ctx.app).post('/mcp').set({ accept: 'application/json, text/event-stream', ...headers }).send({ jsonrpc: '2.0', id: 1, method: 'tools/list' });

  it('UC-AUTH-06: a request without a valid token gets 401 with a WWW-Authenticate header naming the metadata URL', async () => {
    const cases: Record<string, string>[] = [
      {},
      { authorization: 'Bearer not-a-token' },
      { authorization: `Bearer ${signer.signToken({ sub: 'x', expiresIn: -60 })}` },
      { authorization: `Bearer ${signer.signToken({ sub: 'x', audience: 'someone-else' })}` },
    ];
    for (const headers of cases) {
      const res = await post(headers);
      expect(res.status, JSON.stringify(headers)).toBe(401);
      expect(res.headers['www-authenticate']).toBe(challenge());
    }
    const get = await request(ctx.app).get('/mcp');
    expect(get.status).toBe(401);
    expect(get.headers['www-authenticate']).toBe(challenge());
  });

  it('UC-AUTH-06: a web session cookie is not accepted at /mcp', async () => {
    const user = await createUser(ctx.database);
    const cookie = await createWebSession(ctx.database, user);
    const res = await post({ cookie: `${COOKIE_NAME}=${cookie}`, 'x-requested-with': 'todo-web' });
    expect(res.status).toBe(401);
    expect(res.headers['www-authenticate']).toBe(challenge());
  });

  it('UC-AUTH-07: the protected-resource metadata needs no auth and names this server and its authorization server', async () => {
    const res = await request(ctx.app).get('/.well-known/oauth-protected-resource');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ resource: `${ctx.config.APP_ORIGIN}/mcp`, authorization_servers: [ctx.config.WORKOS_ISSUER] });
  });

  it('UC-SESSION-05: an MCP request refused for an idle or too-old session gets 401 with the WWW-Authenticate header', async () => {
    const clock = createClock(new Date('2026-12-01T10:00:00Z'));
    const timed = buildTestApp(undefined, undefined, { clock });
    try {
      const user = await createUser(timed.database);
      const headers = { accept: 'application/json, text/event-stream' };
      const idle = signer.signToken({ sub: workosIdOf(user), email: emailOf(user), clientId: 'claude' });
      const send = (token: string) =>
        request(timed.app).post('/mcp').set({ ...headers, authorization: `Bearer ${token}` }).send({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
      expect((await send(idle)).status).toBe(200);
      clock.advance(24 * 3_600_000 + 1000);
      const refusedIdle = await send(idle);
      expect(refusedIdle.status).toBe(401);
      expect(refusedIdle.headers['www-authenticate']).toBe(challenge());

      const old = signer.signToken({ sub: workosIdOf(user), email: emailOf(user), clientId: 'claude' });
      expect((await send(old)).status).toBe(200);
      for (let i = 0; i < 61; i++) {
        clock.advance(12 * 3_600_000);
        if (i < 60) expect((await send(old)).status, `step ${i}`).toBe(200);
      }
      const refusedOld = await send(old);
      expect(refusedOld.status).toBe(401);
      expect(refusedOld.headers['www-authenticate']).toBe(challenge());
    } finally {
      await timed.database.pool.end();
    }
  });
});
