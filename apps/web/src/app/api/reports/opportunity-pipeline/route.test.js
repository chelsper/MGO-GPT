import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), schema: vi.fn(), user: vi.fn(), sql: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: mocks.schema }));
vi.mock("@/app/api/utils/getOrCreateUser", () => ({ default: mocks.user }));
vi.mock("@/app/api/utils/sql", () => ({ default: mocks.sql }));
import { GET, PIPELINE_ROW_LIMIT } from "./route";

const opportunity = { id: 1, user_id: 2, prospect_name: "Demo Donor", blackbaud_constituent_id: "100", title: "Scholarship", estimated_amount: "250000", expected_date: "2027-05-01", current_stage: "Cultivation", opportunity_status: "Active", latest_notes: "private notes", email: "private@example.test" };
let config;
let records;

describe("organization opportunity pipeline API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config = [];
    records = [opportunity];
    mocks.auth.mockResolvedValue({ user: { email: "admin@example.test" } });
    mocks.user.mockResolvedValue({ id: 1, role: "admin", active: true });
    mocks.sql.mockImplementation(async (strings) => {
      const query = strings.join("?");
      if (query.includes("FROM report_configurations")) return config;
      if (query.includes("FROM prospect_opportunities")) return records;
      if (query.includes("FROM users")) return [{ id: 2, name: "Other Fundraiser" }];
      throw new Error("Unexpected query");
    });
  });
  it("rejects anonymous and inactive users before reading report data", async () => {
    mocks.auth.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect(mocks.schema).not.toHaveBeenCalled();
    mocks.auth.mockResolvedValue({ user: { email: "user@example.test" } });
    mocks.user.mockResolvedValue({ id: 1, role: "admin", active: false });
    expect((await GET()).status).toBe(403);
    expect(mocks.sql).not.toHaveBeenCalled();
  });
  it.each([undefined, "unexpected"])("defaults to executive access when configuration is %s", async (visibility) => {
    config = visibility ? [{ visibility }] : [];
    mocks.user.mockResolvedValue({ id: 3, role: "mgo", active: true });
    const response = await GET();
    expect(response.status).toBe(403);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.sql).toHaveBeenCalledTimes(1);
  });
  it.each(["admin", "executive"])("allows %s to read across workspaces without exposing notes", async (role) => {
    mocks.user.mockResolvedValue({ id: 1, role, active: true });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    const payload = await response.json();
    expect(payload.source).toBe("saved_app_opportunities");
    expect(payload.opportunities[0]).toMatchObject({ amount: 250000, fiscalYear: 2027, fundraisers: [{ id: "2", name: "Other Fundraiser" }] });
    expect(JSON.stringify(payload)).not.toMatch(/private notes|private@example/);
    const query = mocks.sql.mock.calls[1][0].join("?");
    expect(query).not.toMatch(/WHERE.*(?:user_id|active)|latest_notes/);
    expect(query).toContain("LEFT JOIN constituents");
    expect(mocks.sql.mock.calls[1][1]).toBe(PIPELINE_ROW_LIMIT + 1);
  });
  it("honors an explicit user grant and configured title", async () => {
    config = [{ title: "Team Pipeline", visibility: "specific_users", specific_user_ids: [3] }];
    mocks.user.mockResolvedValue({ id: 3, role: "mgo", active: true });
    expect((await (await GET()).json()).title).toBe("Team Pipeline");
    mocks.user.mockResolvedValue({ id: 4, role: "mgo", active: true });
    expect((await GET()).status).toBe(403);
  });
  it("returns an honest empty report, not fallback or mock opportunities", async () => {
    records = [];
    const payload = await (await GET()).json();
    expect(payload.opportunities).toEqual([]);
    expect(mocks.sql).toHaveBeenCalledTimes(2);
  });
  it("rejects oversized reports instead of returning partial totals", async () => {
    records = Array(PIPELINE_ROW_LIMIT + 1).fill(opportunity);
    const response = await GET();
    expect(response.status).toBe(422);
    expect(await response.json()).not.toHaveProperty("opportunities");
    expect(mocks.sql).toHaveBeenCalledTimes(2);
  });
  it("does not disclose database/provider errors", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.sql.mockRejectedValueOnce(new Error("secret connection details"));
    const response = await GET();
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("secret");
    consoleError.mockRestore();
  });
});
