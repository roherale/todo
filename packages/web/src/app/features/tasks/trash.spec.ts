import { render, screen, waitFor, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import type { Task } from '@todo/shared';
import { harness, http, pressKey, task } from '../../testing';
import { TrashPage } from './trash.page';

async function setup(items: Task[], nextCursor: string | null = null) {
  const h = harness();
  const view = await render(TrashPage, { providers: h.providers });
  const first = http().expectOne((r) => r.url === '/api/v1/trash');
  first.flush({ items, nextCursor });
  await view.fixture.whenStable();
  return { view, user: userEvent.setup(), first };
}

const none = () => http().expectNone(() => true);

describe('TrashPage', () => {
  it('UC-WEB-07: lists the tasks in the trash', async () => {
    const { first } = await setup([task({ title: 'Old thing' }), task({ title: 'Other thing' })]);
    expect(first.request.params.get('limit')).toBe('25');
    expect(screen.getByText('Old thing')).toBeTruthy();
    expect(screen.getByText('Other thing')).toBeTruthy();
  });

  it('UC-WEB-07: says so when the trash is empty, and disables Empty trash', async () => {
    await setup([]);
    expect(screen.getByText('The trash is empty.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Empty trash' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('UC-WEB-07: Restore sends a restore request and takes the task out of the list', async () => {
    const t = task({ title: 'Bring me back' });
    const { user, view } = await setup([t]);
    await user.click(screen.getByRole('button', { name: 'Restore' }));
    const req = http().expectOne((r) => r.method === 'POST' && r.url === `/api/v1/tasks/${t.id}/restore`);
    req.flush(t);
    await view.fixture.whenStable();
    expect(screen.queryByText('Bring me back')).toBeNull();
  });

  it('UC-WEB-07: Delete permanently opens a confirmation, and cancelling sends no request', async () => {
    const t = task({ title: 'Doomed' });
    const { user } = await setup([t]);
    await user.click(screen.getByRole('button', { name: 'Delete permanently' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/cannot be undone/)).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    none();
    expect(screen.getByText('Doomed')).toBeTruthy();
  });

  it('UC-WEB-07: confirming Delete permanently sends the permanent delete and removes the row', async () => {
    const t = task({ title: 'Doomed' });
    const { user, view } = await setup([t]);
    await user.click(screen.getByRole('button', { name: 'Delete permanently' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete permanently' }));
    const req = await waitFor(() => http().expectOne((r) => r.method === 'DELETE' && r.url === `/api/v1/tasks/${t.id}`));
    expect(req.request.params.get('permanent')).toBe('true');
    expect(req.request.headers.get('X-Requested-With')).toBe('todo-web');
    req.flush(null, { status: 204, statusText: 'No Content' });
    await view.fixture.whenStable();
    expect(screen.queryByText('Doomed')).toBeNull();
  });

  it('UC-WEB-07: Empty trash opens a confirmation, and cancelling sends no request', async () => {
    const { user } = await setup([task({ title: 'A' }), task({ title: 'B' })]);
    await user.click(screen.getByRole('button', { name: 'Empty trash' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    none();
    expect(screen.getByText('A')).toBeTruthy();
  });

  it('UC-WEB-07: confirming Empty trash sends the request and clears the list', async () => {
    const { user, view } = await setup([task({ title: 'A' }), task({ title: 'B' })]);
    await user.click(screen.getByRole('button', { name: 'Empty trash' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Empty trash' }));
    const req = await waitFor(() => http().expectOne((r) => r.method === 'DELETE' && r.url === '/api/v1/trash'));
    req.flush({ deleted: 2 });
    await view.fixture.whenStable();
    expect(screen.queryByText('A')).toBeNull();
    expect(screen.getByText('The trash is empty.')).toBeTruthy();
  });

  it('UC-WEB-07: Escape on a confirmation also counts as cancelling', async () => {
    const { user } = await setup([task({ title: 'A' })]);
    await user.click(screen.getByRole('button', { name: 'Delete permanently' }));
    await pressKey(await screen.findByRole('dialog'), 'Escape');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    none();
  });

  it('UC-WEB-07: "Load more" pages through the trash', async () => {
    const { user, view } = await setup([task({ title: 'First' })], 'c1');
    await user.click(screen.getByRole('button', { name: 'Load more' }));
    http().expectOne((r) => r.url === '/api/v1/trash' && r.params.get('cursor') === 'c1').flush({ items: [task({ title: 'Second' })], nextCursor: null });
    await view.fixture.whenStable();
    expect(screen.getByText('First')).toBeTruthy();
    expect(screen.getByText('Second')).toBeTruthy();
  });
});
