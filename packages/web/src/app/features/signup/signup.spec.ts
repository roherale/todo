import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { harness, http, typeInto } from '../../testing';
import { SignupPage } from './signup.page';

async function setup(timezone = 'Europe/Madrid', prefill: { email: string; displayName: string | null } | 'fail' = { email: 'a@example.test', displayName: null }) {
  const h = harness({ timezone, profile: null });
  const view = await render(SignupPage, { providers: h.providers });
  const req = http().expectOne('/auth/pending-signup');
  if (prefill === 'fail') req.flush({}, { status: 401, statusText: 'Unauthorized' });
  else req.flush(prefill);
  await view.fixture.whenStable();
  return { h, user: userEvent.setup() };
}

describe('SignupPage', () => {
  it('UC-WEB-03: pre-fills displayName from the identity provider\'s name', async () => {
    await setup('Europe/Madrid', { email: 'ana@example.test', displayName: 'Ana Lopez' });
    expect((screen.getByLabelText('Display name') as HTMLInputElement).value).toBe('Ana Lopez');
  });

  it('UC-WEB-03: leaves displayName empty when the provider has no name or the lookup fails', async () => {
    await setup('Europe/Madrid', { email: 'ana@example.test', displayName: null });
    expect((screen.getByLabelText('Display name') as HTMLInputElement).value).toBe('');
  });

  it('UC-WEB-03: a failed lookup does not send the visitor anywhere and the form still works', async () => {
    const { h } = await setup('Europe/Madrid', 'fail');
    expect((screen.getByLabelText('Display name') as HTMLInputElement).value).toBe('');
    expect(screen.getByRole('button', { name: 'Sign up' })).toBeTruthy();
    expect(h.assigned).toEqual([]);
  });

  it('UC-WEB-03: pre-fills the timezone from the browser', async () => {
    await setup('America/Mexico_City');
    expect((screen.getByLabelText('Timezone') as HTMLInputElement).value).toBe('America/Mexico_City');
  });

  it('UC-WEB-03: validates with the shared schema before sending anything', async () => {
    const { user } = await setup();
    await typeInto(screen.getByLabelText('Timezone') as HTMLInputElement, 'x');
    await user.click(screen.getByRole('button', { name: 'Sign up' }));
    expect((await screen.findAllByRole('alert')).length).toBeGreaterThan(0);
    http().expectNone('/api/v1/profile');
  });

  it('UC-WEB-03: rejects a non-https avatar URL without sending a request', async () => {
    const { user } = await setup();
    await typeInto(screen.getByLabelText('Display name') as HTMLInputElement, 'Ana');
    await typeInto(screen.getByLabelText('Avatar URL (optional)') as HTMLInputElement, 'http://example.com/a.png');
    await user.click(screen.getByRole('button', { name: 'Sign up' }));
    expect(await screen.findByText(/avatarUrl/)).toBeTruthy();
    http().expectNone('/api/v1/profile');
  });

  it('UC-WEB-03: sends the profile, then follows the server back to sign-in', async () => {
    const { h, user } = await setup('Asia/Tokyo');
    await typeInto(screen.getByLabelText('Display name') as HTMLInputElement, 'Ana Lopez');
    await typeInto(screen.getByLabelText('Avatar URL (optional)') as HTMLInputElement, 'https://example.com/a.png');
    await user.click(screen.getByRole('button', { name: 'Sign up' }));
    const req = http().expectOne('/api/v1/profile');
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get('X-Requested-With')).toBe('todo-web');
    expect(req.request.body).toEqual({ displayName: 'Ana Lopez', timezone: 'Asia/Tokyo', avatarUrl: 'https://example.com/a.png' });
    req.flush({ id: 'u' }, { headers: { Location: '/auth/login' }, status: 201, statusText: 'Created' });
    expect(h.assigned).toEqual(['/auth/login']);
  });

  it('UC-WEB-03: omits an empty avatar URL from the request', async () => {
    const { user } = await setup();
    await typeInto(screen.getByLabelText('Display name') as HTMLInputElement, 'Ana');
    await user.click(screen.getByRole('button', { name: 'Sign up' }));
    const req = http().expectOne('/api/v1/profile');
    expect(req.request.body).not.toHaveProperty('avatarUrl');
    req.flush({}, { status: 201, statusText: 'Created' });
  });

  it('UC-WEB-04: a signup-closed response shows a "sign-ups are closed" message', async () => {
    const { user } = await setup();
    await typeInto(screen.getByLabelText('Display name') as HTMLInputElement, 'Ana');
    await user.click(screen.getByRole('button', { name: 'Sign up' }));
    http().expectOne('/api/v1/profile').flush({ type: '/problems/signup-closed' }, { status: 403, statusText: 'Forbidden' });
    expect(await screen.findByText(/Sign-ups are closed/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Sign up' })).toBeNull();
  });

  it('UC-WEB-04: any other failure shows a generic message and keeps the form', async () => {
    const { user } = await setup();
    await typeInto(screen.getByLabelText('Display name') as HTMLInputElement, 'Ana');
    await user.click(screen.getByRole('button', { name: 'Sign up' }));
    http().expectOne('/api/v1/profile').flush({ type: 'about:blank' }, { status: 400, statusText: 'Bad Request' });
    expect(await screen.findByText(/Could not create your profile/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign up' })).toBeTruthy();
  });
});
