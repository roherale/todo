import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { render, screen, waitFor, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import type { Profile } from '@todo/shared';
import { harness, http, profile, typeInto } from '../../testing';
import { ProfilePage } from './profile.page';

async function setup(overrides: Partial<Profile> = {}) {
  const h = harness({ profile: overrides });
  await render(ProfilePage, { providers: h.providers });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  return { h, navigate, user: userEvent.setup() };
}

describe('ProfilePage', () => {
  it('UC-WEB-08: shows the email read-only and lets displayName, avatarUrl and timezone be edited', async () => {
    await setup({ avatarUrl: 'https://example.com/a.png' });
    const email = screen.getByLabelText('Email') as HTMLInputElement;
    expect(email.value).toBe(profile.email);
    expect(email.readOnly).toBe(true);
    expect((screen.getByLabelText('Display name') as HTMLInputElement).value).toBe('Ana Lopez');
    expect((screen.getByLabelText('Avatar URL') as HTMLInputElement).value).toBe('https://example.com/a.png');
    await userEvent.setup().click(screen.getByRole('combobox', { name: 'Timezone' }));
    expect((await screen.findByRole('option', { name: 'America/Mexico_City' })).getAttribute('aria-selected')).toBe('true');
  });

  it('UC-WEB-08: saving sends only displayName, avatarUrl and timezone, never the email', async () => {
    const { user } = await setup();
    const name = screen.getByLabelText('Display name');
    await user.clear(name);
    await user.type(name, 'Ana M. Lopez');
    await user.type(screen.getByLabelText('Avatar URL'), 'https://example.com/me.png');
    await user.click(screen.getByRole('combobox', { name: 'Timezone' }));
    await user.click(await screen.findByRole('option', { name: 'Asia/Tokyo' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    const req = http().expectOne('/api/v1/profile');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ displayName: 'Ana M. Lopez', avatarUrl: 'https://example.com/me.png', timezone: 'Asia/Tokyo' });
    req.flush({ ...profile, displayName: 'Ana M. Lopez' });
    expect(await screen.findByText('Saved.')).toBeTruthy();
  });

  it('UC-WEB-08: an empty avatar URL is sent as null, which removes the avatar', async () => {
    const { user } = await setup({ avatarUrl: 'https://example.com/a.png' });
    await user.clear(screen.getByLabelText('Avatar URL'));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    const req = http().expectOne('/api/v1/profile');
    expect(req.request.body.avatarUrl).toBeNull();
    req.flush({ ...profile, avatarUrl: null });
  });

  it('UC-WEB-08: an invalid avatar URL is reported and nothing is sent', async () => {
    const { user } = await setup();
    await user.type(screen.getByLabelText('Avatar URL'), 'http://example.com/a.png');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect((await screen.findByRole('status')).textContent).toContain('avatarUrl');
    http().expectNone(() => true);
  });

  it('UC-WEB-08: a failed save says so', async () => {
    const { user } = await setup();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    http().expectOne('/api/v1/profile').flush({}, { status: 500, statusText: 'Server Error' });
    expect(await screen.findByText('Could not save your profile.')).toBeTruthy();
  });

  it('UC-WEB-09: Delete account stays disabled until the typed text exactly matches the email', async () => {
    const { user } = await setup();
    await user.click(screen.getByRole('button', { name: 'Delete account' }));
    const dialog = await screen.findByRole('dialog');
    const confirm = within(dialog).getByRole('button', { name: 'Delete account' }) as HTMLButtonElement;
    const input = within(dialog).getByLabelText(/Type .* to confirm/);
    expect(confirm.disabled).toBe(true);
    for (const wrong of ['ana@example.test ', 'ANA@EXAMPLE.TEST', 'ana@example.tes', ' ana@example.test']) {
      await typeInto(input as HTMLInputElement, wrong);
      expect(confirm.disabled, JSON.stringify(wrong)).toBe(true);
    }
    await typeInto(input as HTMLInputElement, 'ana@example.test');
    expect(confirm.disabled).toBe(false);
    await typeInto(input as HTMLInputElement, 'ana@example.tes');
    expect(confirm.disabled).toBe(true);
  });

  it('UC-WEB-09: confirming sends the email as confirmEmail and then leaves for the signed-out page', async () => {
    const { user, navigate } = await setup();
    await user.click(screen.getByRole('button', { name: 'Delete account' }));
    const dialog = await screen.findByRole('dialog');
    await typeInto(within(dialog).getByLabelText(/Type .* to confirm/) as HTMLInputElement, 'ana@example.test');
    await user.click(within(dialog).getByRole('button', { name: 'Delete account' }));
    const req = await waitFor(() => http().expectOne((r) => r.method === 'DELETE' && r.url === '/api/v1/profile'));
    expect(req.request.body).toEqual({ confirmEmail: 'ana@example.test' });
    req.flush(null, { status: 204, statusText: 'No Content' });
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/signed-out'));
  });

  it('UC-WEB-09: cancelling the dialog deletes nothing', async () => {
    const { user } = await setup();
    await user.click(screen.getByRole('button', { name: 'Delete account' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    http().expectNone(() => true);
  });

  it('UC-WEB-12: Sign out everywhere asks first, and cancelling sends no request', async () => {
    const { user } = await setup();
    await user.click(screen.getByRole('button', { name: 'Sign out everywhere' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/ends every session/)).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    http().expectNone(() => true);
  });

  it('UC-WEB-12: confirming calls end-all and leaves for the signed-out page', async () => {
    const { user, navigate } = await setup();
    await user.click(screen.getByRole('button', { name: 'Sign out everywhere' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Sign out everywhere' }));
    const req = await waitFor(() => http().expectOne((r) => r.method === 'POST' && r.url === '/api/v1/sessions/end-all'));
    expect(req.request.headers.get('X-Requested-With')).toBe('todo-web');
    req.flush(null, { status: 204, statusText: 'No Content' });
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/signed-out'));
  });

  it('UC-WEB-10: the profile page shows initials when there is no avatar', async () => {
    await setup({ avatarUrl: null });
    expect(screen.getByText('AL')).toBeTruthy();
  });
});
