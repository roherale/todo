import { TestBed } from '@angular/core/testing';
import { Router, type ActivatedRouteSnapshot, type RouterStateSnapshot } from '@angular/router';
import { firstValueFrom, isObservable, type Observable } from 'rxjs';
import { harness, http, profile } from '../testing';
import { profileGuard } from './guards';
import { ProfileStore } from './profile.store';

const run = () => TestBed.runInInjectionContext(() => profileGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot));

describe('profileGuard', () => {
  it('UC-WEB-01: a visitor who is not logged in is sent to /auth/login', async () => {
    const h = harness({ profile: null });
    TestBed.configureTestingModule({ providers: h.providers });
    const result = run();
    expect(isObservable(result)).toBe(true);
    const pending = firstValueFrom(result as Observable<boolean>);
    http().expectOne('/api/v1/profile').flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(await pending).toBe(false);
    expect(h.assigned).toEqual(['/auth/login']);
  });

  it('UC-WEB-01: a signed-in user is let through, and the profile is kept', async () => {
    const h = harness({ profile: null });
    TestBed.configureTestingModule({ providers: h.providers });
    const pending = firstValueFrom(run() as Observable<boolean>);
    http().expectOne('/api/v1/profile').flush(profile);
    expect(await pending).toBe(true);
    expect(TestBed.inject(ProfileStore).profile()?.email).toBe(profile.email);
    expect(run()).toBe(true);
  });

  it('UC-WEB-02: a user without a profile is sent to /signup', async () => {
    const h = harness({ profile: null });
    TestBed.configureTestingModule({ providers: h.providers });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const pending = firstValueFrom(run() as Observable<boolean>);
    http().expectOne('/api/v1/profile').flush({ type: '/problems/signup-required' }, { status: 403, statusText: 'Forbidden' });
    expect(await pending).toBe(false);
    expect(navigate).toHaveBeenCalledWith('/signup');
  });
});
