import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as route from './route';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), user: vi.fn(), schema: vi.fn(), sql: vi.fn() }));
vi.mock('@/auth', () => ({ auth: mocks.auth }));
vi.mock('@/app/api/utils/getWorkspaceUser', () => ({ default: mocks.user }));
vi.mock('@/app/api/utils/ensureAppSchema', () => ({ default: mocks.schema }));
vi.mock('@/app/api/utils/sql', () => ({ default: mocks.sql }));
const request = (query = '') => new Request(`https://example.org/api/import-history${query}`);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { email: 'admin@example.org' } });
  mocks.user.mockResolvedValue({ sessionUser: { id: 1, role: 'admin', active: true } });
  mocks.sql.mockResolvedValue([{ successful: '2', failed: '1', records: [] }]);
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('History must not contact NXT'); }));
});
afterEach(() => vi.unstubAllGlobals());

describe('import history API', () => {
  it('has no write handlers', () => expect(Object.keys(route)).toEqual(['GET']));
  it('requires authentication before querying history', async () => {
    mocks.auth.mockResolvedValue(null);
    const result = await route.GET(request());
    expect(result.status).toBe(401);
    expect(result.headers.get('cache-control')).toBe('private, no-store');
    expect(mocks.sql).not.toHaveBeenCalled();
    expect(mocks.schema).not.toHaveBeenCalled();
  });
  it.each(['mgo', 'executive', null])('rejects unauthorized roles: %s', async (role) => {
    mocks.user.mockResolvedValue({ sessionUser: { role }, workspaceUser: { role: 'admin' } });
    expect((await route.GET(request())).status).toBe(403);
    expect(mocks.sql).not.toHaveBeenCalled();
  });
  it('rejects inactive users', async () => {
    mocks.user.mockResolvedValue({ sessionUser: { role: 'admin', active: false } });
    expect((await route.GET(request())).status).toBe(403);
  });
  it.each(['admin', 'advancement_services', 'reviewer'])('reads saved history for %s, without NXT calls', async (role) => {
    mocks.user.mockResolvedValue({ sessionUser: { role }, workspaceUser: { role: 'mgo' } });
    const result = await route.GET(request('?outcome=failed&type=family&page=2&q=example'));
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ counts: { successful: 2, failed: 1 }, page: 2, records: [] });
    expect(mocks.sql.mock.calls[0][1]).toEqual(['family', 'example', 'failed', 50, 50]);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects malformed parameters before querying', async () => {
    expect((await route.GET(request('?page=-1'))).status).toBe(400);
    expect(mocks.sql).not.toHaveBeenCalled();
  });
  it('parameterizes search text', async () => {
    const text = "O'Brien'; DROP TABLE users;--";
    await route.GET(request(`?q=${encodeURIComponent(text)}`));
    expect(mocks.sql.mock.calls[0][0]).not.toContain(text);
    expect(mocks.sql.mock.calls[0][1][1]).toBe(text);
  });
  it('returns a private failure without leaking database details or claiming empty results', async () => {
    mocks.sql.mockRejectedValue(new Error('private database details'));
    const response = await route.GET(request());
    expect(response.status).toBe(500);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const payload = await response.json();
    expect(payload.error).toContain('No import records were changed');
    expect(payload).not.toHaveProperty('counts');
    expect(JSON.stringify(payload)).not.toContain('private database details');
  });
});
