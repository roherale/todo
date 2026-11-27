import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../src/common/db.js';
import { createTasksModule } from '../src/modules/tasks/index.js';
import { users, createUsersModule } from '../src/modules/users/index.js';
import { TEST_DATABASE_URL, createUser } from './helpers.js';

const database = createDatabase(TEST_DATABASE_URL);
afterAll(async () => {
  await database.pool.end();
});

describe('timezone change is all or nothing', () => {
  it('UC-PROFILE-07: if the task update fails partway, neither the timezone nor any due date changes', async () => {
    const tasks = createTasksModule({ db: database.db });
    const ownerId = await createUser(database, { timezone: 'America/Mexico_City' });
    const owner = { id: ownerId, timezone: 'America/Mexico_City' };
    const made = [];
    for (const day of ['2026-11-28', '2026-12-01', '2026-12-25']) {
      made.push(await tasks.service.create(owner, { title: day, status: 'new', dueAt: `${day}T00:00:00-06:00`, dueAllDay: true }));
    }

    // Real task updates run first, then the failure strikes: something is already written when it throws.
    const failing = createUsersModule({
      db: database.db,
      allowedSignupEmails: '',
      hooks: {
        async timezoneChanged(id, from, to, tx) {
          await tasks.service.keepAllDayDates(id, from, to, tx);
          throw new Error('injected failure after the task updates');
        },
      },
    });
    const [row] = await database.db.select().from(users).where(eq(users.id, ownerId));
    await expect(failing.service.update(row!, { timezone: 'Asia/Tokyo' })).rejects.toThrow('injected failure');

    const [after] = await database.db.select().from(users).where(eq(users.id, ownerId));
    expect(after?.timezone).toBe('America/Mexico_City');
    expect(after?.updatedAt).toEqual(row?.updatedAt);
    for (const task of made) {
      const current = await tasks.service.get(owner, task.id);
      expect(current.dueAt).toBe(task.dueAt);
      expect(current.updatedAt).toBe(task.updatedAt);
    }
  });

  it('UC-PROFILE-07: when nothing fails, the timezone and every all-day date change together', async () => {
    const tasks = createTasksModule({ db: database.db });
    const ownerId = await createUser(database, { timezone: 'America/Mexico_City' });
    const owner = { id: ownerId, timezone: 'America/Mexico_City' };
    const task = await tasks.service.create(owner, { title: 'x', status: 'new', dueAt: '2026-11-28T00:00:00-06:00', dueAllDay: true });
    const working = createUsersModule({
      db: database.db,
      allowedSignupEmails: '',
      hooks: { timezoneChanged: (id, from, to, tx) => tasks.service.keepAllDayDates(id, from, to, tx) },
    });
    const [row] = await database.db.select().from(users).where(eq(users.id, ownerId));
    const profile = await working.service.update(row!, { timezone: 'Asia/Tokyo' });
    expect(profile.timezone).toBe('Asia/Tokyo');
    expect((await tasks.service.get(owner, task.id)).dueAt).toBe('2026-11-28T14:59:59.000Z');
  });
});
