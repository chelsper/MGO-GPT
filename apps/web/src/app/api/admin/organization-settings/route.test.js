import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), user: vi.fn(), get: vi.fn(), history: vi.fn(), save: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/getOrCreateUser", () => ({ default: mocks.user }));
vi.mock("@/app/api/utils/organizationSettings", async importOriginal => ({ ...await importOriginal(), getOrganizationConfiguration: mocks.get, getOrganizationSettingsHistory: mocks.history, saveOrganizationSettings: mocks.save }));
import { GET, PUT } from "./route";
import { DEFAULT_ORGANIZATION_SETTINGS as settings } from "@/utils/organizationSettings";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { email: 'admin@example.test', role: 'admin' } });
  mocks.user.mockResolvedValue({ id: 7, role: 'admin', active: true });
  mocks.get.mockResolvedValue({ settings, revision: 'version-1' });
  mocks.history.mockResolvedValue([]);
  mocks.save.mockResolvedValue({ settings, revision: 'version-2' });
});
const request = body => new Request('https://app.test/api/admin/organization-settings?workspaceId=999', { method: 'PUT', body: JSON.stringify(body) });

it("requires actual permitted roles and private no-store responses", async () => {
  mocks.auth.mockResolvedValueOnce(null);
  expect((await GET()).status).toBe(401);
  for (const user of [{ id:7, role:'mgo' }, { id:7, role:'executive' }, { id:7, role:'admin', active:false }]) {
    mocks.user.mockResolvedValueOnce(user);
    const response = await PUT(request({ settings, expectedRevision:'v' }));
    expect(response.status).toBe(403);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  }
  expect(mocks.save).not.toHaveBeenCalled();
});

it("reads configuration/history for a manager and attributes writes to the authenticated account", async () => {
  expect((await GET()).headers.get('Cache-Control')).toBe('private, no-store');
  const response = await PUT(request({ settings, expectedRevision:'version-1', userId:999 }));
  expect(response.status).toBe(200);
  expect(mocks.save).toHaveBeenCalledWith({ settings, userId:7, expectedRevision:'version-1' });
});

it("preserves conflict status and sanitizes unexpected failures", async () => {
  mocks.save.mockRejectedValueOnce(Object.assign(new Error('Reload saved profile'), { status:409 }));
  expect((await PUT(request({ settings }))).status).toBe(409);
  mocks.save.mockRejectedValueOnce(new Error('private database credential'));
  const response = await PUT(request({ settings }));
  expect(response.status).toBe(500);
  expect(JSON.stringify(await response.json())).not.toContain('private database credential');
});

it("rejects unsupported mappings before attempting a save", async () => {
  expect((await PUT(request({ settings: { ...settings, pledgeQueryId:'999' } }))).status).toBe(400);
  expect(mocks.save).not.toHaveBeenCalled();
});
