import { HttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { harness, http } from '../testing';

describe('HTTP interceptors', () => {
  function setup() {
    const h = harness();
    TestBed.configureTestingModule({ providers: h.providers });
    return { h, client: TestBed.inject(HttpClient), router: TestBed.inject(Router) };
  }

  it('UC-WEB-01: adds X-Requested-With to every request that changes something, and to no other', () => {
    const { client } = setup();
    for (const method of ['post', 'patch', 'delete'] as const) {
      const call = method === 'delete' ? client.delete('/api/v1/x') : client[method]('/api/v1/x', {});
      call.subscribe();
      const req = http().expectOne('/api/v1/x');
      expect(req.request.headers.get('X-Requested-With'), method).toBe('todo-web');
      req.flush(null);
    }
    client.get('/api/v1/x').subscribe();
    const get = http().expectOne('/api/v1/x');
    expect(get.request.headers.has('X-Requested-With')).toBe(false);
    get.flush(null);
  });

  it('UC-WEB-01: never adds a token, and never reads or stores one', () => {
    const { client } = setup();
    const reads = vi.spyOn(Storage.prototype, 'getItem');
    const writes = vi.spyOn(Storage.prototype, 'setItem');
    client.get('/api/v1/profile').subscribe();
    const req = http().expectOne('/api/v1/profile');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
    expect(reads).not.toHaveBeenCalled();
    expect(writes).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('UC-WEB-01: a 401 sends the visitor to /auth/login', () => {
    const { h, client } = setup();
    client.get('/api/v1/profile').subscribe({ error: () => undefined });
    http().expectOne('/api/v1/profile').flush({ title: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });
    expect(h.assigned).toEqual(['/auth/login']);
  });

  it('UC-WEB-02: a signup-required response redirects to /signup', async () => {
    const { client, router } = setup();
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    client.get('/api/v1/tasks').subscribe({ error: () => undefined });
    http()
      .expectOne('/api/v1/tasks')
      .flush({ type: '/problems/signup-required', signupUrl: 'https://x/signup' }, { status: 403, statusText: 'Forbidden' });
    expect(navigate).toHaveBeenCalledWith('/signup');
  });

  it('UC-WEB-02: other 403 responses do not redirect', () => {
    const { h, client, router } = setup();
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    client.post('/api/v1/profile', {}).subscribe({ error: () => undefined });
    http().expectOne('/api/v1/profile').flush({ type: '/problems/signup-closed' }, { status: 403, statusText: 'Forbidden' });
    expect(navigate).not.toHaveBeenCalled();
    expect(h.assigned).toEqual([]);
  });

  it('UC-WEB-01: a failure from the sign-out call itself does not loop back to sign-in', () => {
    const { h, client } = setup();
    client.post('/auth/logout', {}).subscribe({ error: () => undefined });
    http().expectOne('/auth/logout').flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(h.assigned).toEqual([]);
  });
});
