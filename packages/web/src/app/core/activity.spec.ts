import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { screen } from '@testing-library/angular';
import { harness, http } from '../testing';
import { ActivityService } from './activity.service';

const MIN = 60_000;

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
}

function setup() {
  const h = harness({ profile: null });
  TestBed.configureTestingModule({ providers: h.providers });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  const service = TestBed.inject(ActivityService);
  service.start();
  return { h, service, navigate };
}

const click = () => document.dispatchEvent(new Event('click'));
const heartbeats = () => http().match('/api/v1/session/heartbeat');
const advance = (ms: number) => vi.advanceTimersByTimeAsync(ms);

describe('ActivityService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setVisibility('visible');
  });
  afterEach(() => {
    TestBed.inject(ActivityService).stop();
    vi.useRealTimers();
    setVisibility('visible');
  });

  it('UC-SESSION-09: with no interaction, no heartbeat is sent', async () => {
    setup();
    await advance(50 * MIN);
    expect(heartbeats()).toHaveLength(0);
  });

  it('UC-SESSION-09: after an interaction a heartbeat is sent, then at most one every 5 minutes', async () => {
    setup();
    click();
    await advance(10_000);
    const first = heartbeats();
    expect(first).toHaveLength(1);
    expect(first[0]!.request.headers.get('X-Requested-With')).toBe('todo-web');
    first[0]!.flush(null, { status: 204, statusText: 'No Content' });

    // Plenty of interaction, but not yet 5 minutes since the last heartbeat.
    for (let i = 0; i < 4; i++) {
      await advance(MIN);
      click();
    }
    expect(heartbeats()).toHaveLength(0);

    await advance(MIN + 10_000);
    const second = heartbeats();
    expect(second).toHaveLength(1);
    second[0]!.flush(null, { status: 204, statusText: 'No Content' });

    // No new interaction since the second heartbeat: nothing more is sent.
    await advance(20 * MIN);
    expect(heartbeats()).toHaveLength(0);
  });

  it('UC-SESSION-09: scrolling, key presses and the tab regaining focus count as interaction', async () => {
    setup();
    for (const trigger of [
      () => document.dispatchEvent(new Event('scroll')),
      () => document.dispatchEvent(new Event('keydown')),
      () => window.dispatchEvent(new Event('focus')),
    ]) {
      trigger();
      await advance(10_000);
      const sent = heartbeats();
      expect(sent).toHaveLength(1);
      sent[0]!.flush(null, { status: 204, statusText: 'No Content' });
      await advance(6 * MIN);
    }
  });

  it('UC-SESSION-09: a hidden tab never sends a heartbeat and its events are not interaction', async () => {
    setup();
    setVisibility('hidden');
    click();
    await advance(10 * MIN);
    expect(heartbeats()).toHaveLength(0);
    // Interaction while visible, then the tab is hidden before the next tick: still nothing.
    setVisibility('visible');
    click();
    setVisibility('hidden');
    await advance(10 * MIN);
    expect(heartbeats()).toHaveLength(0);
  });

  it('UC-SESSION-09: the tab becoming visible again counts as interaction', async () => {
    setup();
    setVisibility('hidden');
    await advance(MIN);
    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await advance(10_000);
    expect(heartbeats()).toHaveLength(1);
  });

  it('UC-SESSION-10: after 55 minutes without interaction a dialog warns of sign-out in 5 minutes', async () => {
    setup();
    await advance(54 * MIN);
    expect(screen.queryByRole('dialog')).toBeNull();
    await advance(2 * MIN);
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('signed out in 5 minutes');
  });

  it('UC-SESSION-10: "Stay signed in" sends a heartbeat and closes the dialog', async () => {
    setup();
    await advance(56 * MIN);
    (screen.getByRole('button', { name: 'Stay signed in' }) as HTMLButtonElement).click();
    await advance(1000);
    const sent = heartbeats();
    expect(sent).toHaveLength(1);
    sent[0]!.flush(null, { status: 204, statusText: 'No Content' });
    await advance(1000);
    expect(screen.queryByRole('dialog')).toBeNull();
    // The idle clock restarted, so no sign-out follows 5 minutes later.
    await advance(10 * MIN);
    http().expectNone('/auth/logout');
  });

  it('UC-SESSION-10: any other interaction also counts as activity and dismisses the warning', async () => {
    setup();
    await advance(56 * MIN);
    expect(screen.getByRole('dialog')).toBeTruthy();
    document.dispatchEvent(new Event('keydown'));
    await advance(1000);
    expect(screen.queryByRole('dialog')).toBeNull();
    await advance(10 * MIN);
    http().expectNone('/auth/logout');
    heartbeats().forEach((r) => r.flush(null, { status: 204, statusText: 'No Content' }));
  });

  it('UC-SESSION-11: after 60 minutes without interaction the app calls POST /auth/logout and shows the signed-out page', async () => {
    const { navigate } = setup();
    await advance(59 * MIN);
    http().expectNone('/auth/logout');
    await advance(2 * MIN);
    const req = http().expectOne('/auth/logout');
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get('X-Requested-With')).toBe('todo-web');
    req.flush({ logoutUrl: null });
    await advance(100);
    expect(navigate).toHaveBeenCalledWith('/signed-out');
  });

  it('UC-SESSION-11: when the provider gives a sign-out URL, the browser goes there', async () => {
    const { h } = setup();
    await advance(61 * MIN);
    http().expectOne('/auth/logout').flush({ logoutUrl: 'https://auth.example.test/logout?session_id=s' });
    await advance(100);
    expect(h.assigned).toEqual(['https://auth.example.test/logout?session_id=s']);
  });

  it('UC-SESSION-11: tracking stops after sign-out, so no further requests are made', async () => {
    setup();
    await advance(61 * MIN);
    http().expectOne('/auth/logout').flush({ logoutUrl: null });
    click();
    await advance(30 * MIN);
    http().expectNone(() => true);
  });
});
