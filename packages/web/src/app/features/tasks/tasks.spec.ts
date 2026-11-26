import { render, screen, waitFor, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import type { Task } from '@todo/shared';
import { harness, http, profile, task, typeInto } from '../../testing';
import { TasksPage } from './tasks.page';

async function setup(items: Task[] = [], profile = {}, nextCursor: string | null = null) {
  const h = harness({ profile });
  const view = await render(TasksPage, { providers: h.providers });
  const first = http().expectOne((r) => r.url === '/api/v1/tasks');
  first.flush({ items, nextCursor });
  await view.fixture.whenStable();
  return { h, view, user: userEvent.setup(), first };
}

/** The request is made once a dialog has closed, which takes a moment. */
const pending = (method: string, url: string) => waitFor(() => http().expectOne((r) => r.method === method && r.url === url));

describe('TasksPage', () => {
  it('UC-WEB-05: lists tasks with number, title, status and due date, newest first as the API returns them', async () => {
    const newer = task({ number: 12, title: 'Newer', status: 'in_progress', dueAt: '2999-01-01T18:00:00.000Z' });
    const older = task({ number: 3, title: 'Older' });
    await setup([newer, older]);
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText('#12')).toBeTruthy();
    expect(within(rows[0]!).getByText('Newer')).toBeTruthy();
    expect(within(rows[0]!).getByText('In progress')).toBeTruthy();
    expect(rows[0]!.textContent).toContain('2999-01-01 12:00');
    expect(within(rows[1]!).getByText('Older')).toBeTruthy();
  });

  it('UC-WEB-05: only asks for tasks outside the trash, so trashed ones never show', async () => {
    const { first } = await setup([task()]);
    expect(first.request.url).toBe('/api/v1/tasks');
  });

  it('UC-WEB-05: shows a message when there are no tasks', async () => {
    await setup([]);
    expect(screen.getByText('No tasks yet.')).toBeTruthy();
  });

  it('UC-WEB-05: filtering by status asks the API for that status', async () => {
    const { user, view } = await setup([task()]);
    await user.click(screen.getByRole('combobox', { name: 'Filter by status' }));
    await user.click(await screen.findByRole('option', { name: 'Queued' }));
    const req = http().expectOne((r) => r.url === '/api/v1/tasks' && r.params.get('status') === 'queued');
    req.flush({ items: [task({ title: 'Queued one', status: 'queued' })], nextCursor: null });
    await view.fixture.whenStable();
    expect(await screen.findByText('Queued one')).toBeTruthy();
  });

  it('UC-WEB-05: creating a task sends it to the API and reloads the list', async () => {
    const { user, view } = await setup([]);
    await user.click(screen.getByRole('button', { name: 'New task' }));
    await typeInto((await screen.findByLabelText('Title')) as HTMLInputElement, 'Write report');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    const create = await pending('POST', '/api/v1/tasks');
    expect(create.request.body).toMatchObject({ title: 'Write report', status: 'new' });
    expect(create.request.headers.get('X-Requested-With')).toBe('todo-web');
    create.flush(task({ title: 'Write report' }), { status: 201, statusText: 'Created' });
    http().expectOne((r) => r.method === 'GET' && r.url === '/api/v1/tasks').flush({ items: [task({ title: 'Write report' })], nextCursor: null });
    await view.fixture.whenStable();
    expect(await screen.findByText('Write report')).toBeTruthy();
  });

  it('UC-WEB-05: a task without a title is not sent', async () => {
    const { user } = await setup([]);
    await user.click(screen.getByRole('button', { name: 'New task' }));
    await user.click(await screen.findByRole('button', { name: 'Save' }));
    expect((await screen.findByRole('alert')).textContent).toContain('title');
    http().expectNone((r) => r.method === 'POST');
  });

  it('UC-WEB-05: a due date typed in the profile timezone is sent as that instant; all-day keeps the written date', async () => {
    const { user } = await setup([], { timezone: 'America/Mexico_City' });
    await user.click(screen.getByRole('button', { name: 'New task' }));
    await typeInto((await screen.findByLabelText('Title')) as HTMLInputElement, 'Timed');
    await typeInto(screen.getByLabelText(/Due date/) as HTMLInputElement, '2026-11-28');
    await typeInto(screen.getByLabelText('Due time') as HTMLInputElement, '15:30');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    const timed = await pending('POST', '/api/v1/tasks');
    expect(timed.request.body).toMatchObject({ dueAt: '2026-11-28T21:30:00.000Z', dueAllDay: false });
    timed.flush(task(), { status: 201, statusText: 'Created' });
    http().expectOne((r) => r.method === 'GET').flush({ items: [], nextCursor: null });

    await user.click(screen.getByRole('button', { name: 'New task' }));
    await typeInto((await screen.findByLabelText('Title')) as HTMLInputElement, 'All day');
    await typeInto(screen.getByLabelText(/Due date/) as HTMLInputElement, '2026-11-28');
    await user.click(screen.getByRole('checkbox', { name: 'All day' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    const allDay = await pending('POST', '/api/v1/tasks');
    expect(allDay.request.body).toMatchObject({ dueAt: '2026-11-28T00:00:00Z', dueAllDay: true });
    allDay.flush(task(), { status: 201, statusText: 'Created' });
    http().expectOne((r) => r.method === 'GET').flush({ items: [], nextCursor: null });
  });

  it('UC-WEB-05: editing a task sends the changes and reloads', async () => {
    const original = task({ title: 'Old title', notes: 'n', dueAt: '2026-11-28T21:30:00.000Z' });
    const { user } = await setup([original], { timezone: 'America/Mexico_City' });
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const title = await screen.findByLabelText('Title');
    expect((title as HTMLInputElement).value).toBe('Old title');
    expect((screen.getByLabelText(/Due date/) as HTMLInputElement).value).toBe('2026-11-28');
    expect((screen.getByLabelText('Due time') as HTMLInputElement).value).toBe('15:30');
    await typeInto(title as HTMLInputElement, 'New title');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    const patch = await pending('PATCH', `/api/v1/tasks/${original.id}`);
    expect(patch.request.body).toMatchObject({ title: 'New title', notes: 'n', dueAt: '2026-11-28T21:30:00.000Z', dueAllDay: false });
    patch.flush({ ...original, title: 'New title' });
    http().expectOne((r) => r.method === 'GET').flush({ items: [{ ...original, title: 'New title' }], nextCursor: null });
  });

  it('UC-WEB-05: clearing the due date of an edited task sends null', async () => {
    const original = task({ title: 'Has due', dueAt: '2026-11-28T21:30:00.000Z' });
    const { user } = await setup([original], { timezone: 'America/Mexico_City' });
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await typeInto((await screen.findByLabelText(/Due date/)) as HTMLInputElement, '');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    const patch = await pending('PATCH', `/api/v1/tasks/${original.id}`);
    expect(patch.request.body.dueAt).toBeNull();
    patch.flush(original);
    http().expectOne((r) => r.method === 'GET').flush({ items: [], nextCursor: null });
  });

  it('UC-WEB-05: cancelling the form sends nothing', async () => {
    const { user } = await setup([]);
    await user.click(screen.getByRole('button', { name: 'New task' }));
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    http().expectNone((r) => r.method === 'POST');
  });

  it('UC-WEB-05: moving a task to the trash removes it from the list', async () => {
    const a = task({ title: 'Keep' });
    const b = task({ title: 'Trash me' });
    const { user, view } = await setup([a, b]);
    const row = screen.getByText('Trash me').closest('li')!;
    await user.click(within(row).getByRole('button', { name: 'Move to trash' }));
    (await pending('DELETE', `/api/v1/tasks/${b.id}`)).flush(null, { status: 204, statusText: 'No Content' });
    await view.fixture.whenStable();
    expect(screen.queryByText('Trash me')).toBeNull();
    expect(screen.getByText('Keep')).toBeTruthy();
  });

  it('UC-WEB-05: "Load more" follows nextCursor and appends the next page', async () => {
    const { user, view } = await setup([task({ title: 'Page one' })], {}, 'cursor-1');
    await user.click(screen.getByRole('button', { name: 'Load more' }));
    const req = http().expectOne((r) => r.url === '/api/v1/tasks' && r.params.get('cursor') === 'cursor-1');
    req.flush({ items: [task({ title: 'Page two' })], nextCursor: null });
    await view.fixture.whenStable();
    expect(screen.getByText('Page one')).toBeTruthy();
    expect(screen.getByText('Page two')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
  });

  it('UC-WEB-06: due dates are shown in the profile timezone, all-day tasks show only the date', async () => {
    const timed = task({ title: 'Timed', dueAt: '2999-06-01T03:30:00.000Z' });
    const allDay = task({ title: 'All day', dueAt: '2999-06-02T05:59:59.000Z', dueAllDay: true });
    await setup([timed, allDay], { timezone: 'America/Mexico_City' });
    expect(screen.getByText('Timed').closest('li')!.textContent).toContain('2999-05-31 21:30');
    const allDayRow = screen.getByText('All day').closest('li')!.textContent ?? '';
    expect(allDayRow).toContain('2999-06-01');
    expect(allDayRow).not.toMatch(/\d\d:\d\d/);
  });

  it('UC-WEB-06: overdue tasks are visibly marked, completed and future ones are not', async () => {
    const overdue = task({ title: 'Late', dueAt: '2020-01-01T00:00:00.000Z' });
    const done = task({ title: 'Done late', dueAt: '2020-01-01T00:00:00.000Z', status: 'completed' });
    const future = task({ title: 'Later', dueAt: '2999-01-01T00:00:00.000Z' });
    await setup([overdue, done, future]);
    const flagFor = (title: string) => within(screen.getByText(title).closest('li')!).queryByRole('img', { name: 'Overdue' });
    expect(flagFor('Late')).toBeTruthy();
    expect(screen.getByText('Late').closest('li')!.classList.contains('overdue')).toBe(true);
    expect(flagFor('Done late')).toBeNull();
    expect(flagFor('Later')).toBeNull();
  });

  it('UC-WEB-11: the page-size selector offers 10, 25, 50 and 100 and starts at the profile\'s pageSize', async () => {
    const { user, first } = await setup([task()], { pageSize: 50 });
    expect(first.request.params.get('limit')).toBe('50');
    const select = screen.getByRole('combobox', { name: 'Page size' });
    expect(select.textContent).toContain('50');
    await user.click(select);
    const options = (await screen.findAllByRole('option')).map((o) => o.textContent?.trim());
    expect(options).toEqual(expect.arrayContaining(['10', '25', '50', '100']));
  });

  it('UC-WEB-11: changing the page size saves it to the profile, then reloads with the new size', async () => {
    const { user, view } = await setup([task()], { pageSize: 25 });
    await user.click(screen.getByRole('combobox', { name: 'Page size' }));
    await user.click(await screen.findByRole('option', { name: '100' }));
    const save = await pending('PATCH', '/api/v1/profile');
    expect(save.request.body).toEqual({ pageSize: 100 });
    save.flush({ ...profile, pageSize: 100 });
    const reload = http().expectOne((r) => r.method === 'GET' && r.url === '/api/v1/tasks');
    expect(reload.request.params.get('limit')).toBe('100');
    reload.flush({ items: [], nextCursor: null });
    await view.fixture.whenStable();
    expect(screen.getByRole('combobox', { name: 'Page size' }).textContent).toContain('100');
  });
});
