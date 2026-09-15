import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ sql: vi.fn(), sky: vi.fn() }));
vi.mock("./sql", () => ({ default: mocks.sql }));
vi.mock("./blackbaud", () => ({
  blackbaudApiFetch: mocks.sky,
  downloadBlackbaudQueryResultWithMetadata: vi.fn(),
}));
import { pledgeScope } from "./pledgePaymentStore";
import {
  pledgePresence,
  readProspectPledgeStatus,
} from "./prospectPledgeStatus";

const origin = "https://app.example";
const job = {
  id: "run",
  source: "saved_query",
  queryId: "12033",
  discoveryComplete: true,
  status: "completed",
  startedAt: "2026-09-15T12:00:00Z",
};
const source = (overrides = {}) => ({
  user_id: 7,
  role: "admin",
  scope_key: pledgeScope(7, origin),
  job,
  ...overrides,
});
const item = (id = "1", constituentId = "100", overrides = {}) => ({
  pledge_id: id,
  run_id: "run",
  status: "success",
  payload: {
    id,
    constituentId,
    balanceCents: 300,
    refreshedAt: "2026-09-15T13:00:00Z",
    installments: [
      { date: "2026-08-01", balanceCents: 100 },
      { date: "2026-12-01", balanceCents: 200 },
    ],
    name: "Private donor",
    payments: [{ private: "payment data" }],
    ...overrides,
  },
});
beforeEach(() => vi.resetAllMocks());

describe("pledge presence projection", () => {
  it("counts gifts once across installments/tabs and counts multiple pledges without exposing details", () => {
    const result = pledgePresence(
      [item(), item(), item("2"), item("3", "999")],
      new Set(["100"]),
      job,
    );
    expect(result).toEqual({
      100: { count: 2, stale: false, verifiedAt: "2026-09-15T13:00:00.000Z" },
    });
    expect(JSON.stringify(result)).not.toMatch(
      /Private donor|payment data|balance|installments/,
    );
  });
  it("omits settled, unverified, malformed, mismatched and out-of-manifest pledges", () => {
    expect(
      pledgePresence(
        [
          item("1", "100", { balanceCents: 0, installments: [] }),
          { ...item("2"), payload: null },
          item("3", "100", { refreshedAt: "invalid" }),
          item("4", "100", {
            installments: [{ date: "bad", balanceCents: 300 }],
          }),
          item("5", "100", {
            installments: [{ date: "2026-09-15", balanceCents: 299 }],
          }),
          { ...item("6"), run_id: "old" },
          { ...item("7"), pledge_id: "999" },
        ],
        new Set(["100"]),
        job,
      ),
    ).toEqual({});
  });
  it("retains explicitly stale last-good presence and uses the oldest included verification date", () => {
    const retained = {
      ...item("2", "100", { refreshedAt: "2026-09-10T13:00:00Z" }),
      status: "failed",
    };
    expect(
      pledgePresence([item(), retained], new Set(["100"]), job)[100],
    ).toEqual({
      count: 2,
      stale: true,
      verifiedAt: "2026-09-10T13:00:00.000Z",
    });
  });
});

describe("saved report scope", () => {
  it("shares only minimal presence for the selected workspace's saved portfolio and Top Prospects", async () => {
    mocks.sql
      .mockResolvedValueOnce([source()])
      .mockResolvedValueOnce([
        {
          blackbaud_portfolio_cache: {
            leadSolicitor: [{ constituentId: "101" }],
            supportingSolicitor: [{ constituentId: "102" }],
          },
        },
      ])
      .mockResolvedValueOnce([
        { constituent_id: "100" },
        { constituent_id: "lookup-not-system" },
      ])
      .mockResolvedValueOnce([
        item(),
        item("2", "101"),
        item("3", "102"),
        item("4", "999"),
      ]);
    const result = await readProspectPledgeStatus({
      workspaceUserId: 44,
      origin,
    });
    expect(Object.keys(result.byConstituentId)).toEqual(["100", "101", "102"]);
    expect(mocks.sql.mock.calls[1].slice(1)).toEqual([44]);
    expect(mocks.sql.mock.calls[2].slice(1)).toEqual([44]);
    expect(mocks.sql.mock.calls[3].slice(1)).toEqual([
      pledgeScope(7, origin),
      "run",
      ["100", "101", "102"],
    ]);
    expect(mocks.sql.mock.calls[0][0].join("")).toContain("u.active = TRUE");
    expect(
      mocks.sql.mock.calls.every(
        ([parts]) => !/INSERT|UPDATE|DELETE/.test(parts.join("")),
      ),
    ).toBe(true);
    expect(mocks.sky).not.toHaveBeenCalled();
  });
  it("rejects other origins, non-reviewers and legacy or different query sources", async () => {
    mocks.sql.mockResolvedValueOnce([
      source({ scope_key: pledgeScope(7, "https://other.example") }),
      source({ role: "mgo" }),
      source({ job: { ...job, queryId: "999" } }),
      source({ job: { ...job, source: "all_pledges" } }),
    ]);
    expect(
      await readProspectPledgeStatus({ workspaceUserId: 44, origin }),
    ).toEqual({ queryId: "12033", available: false, byConstituentId: {} });
    expect(mocks.sql).toHaveBeenCalledTimes(1);
  });
  it("selects one latest report instead of unioning obsolete records from older users' snapshots", async () => {
    mocks.sql
      .mockResolvedValueOnce([
        source(),
        source({
          user_id: 8,
          role: "reviewer,mgo",
          scope_key: pledgeScope(8, origin),
          job: { ...job, id: "latest", startedAt: "2026-09-16T12:00:00Z" },
        }),
      ])
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([{ constituent_id: "100" }])
      .mockResolvedValueOnce([]);
    const result = await readProspectPledgeStatus({
      workspaceUserId: 44,
      origin,
    });
    expect(result.byConstituentId).toEqual({});
    expect(mocks.sql.mock.calls[3].slice(1)).toEqual([
      pledgeScope(8, origin),
      "latest",
      ["100"],
    ]);
  });
  it("does not fall back to an older report while the latest query manifest is unverified", async () => {
    mocks.sql.mockResolvedValueOnce([
      source({ job: { ...job, startedAt: "2026-09-14T12:00:00Z" } }),
      source({ job: { ...job, discoveryComplete: false } }),
    ]);
    expect(
      (await readProspectPledgeStatus({ workspaceUserId: 44, origin }))
        .available,
    ).toBe(false);
    expect(mocks.sql).toHaveBeenCalledTimes(1);
  });
  it("returns no donor data for an empty workspace", async () => {
    mocks.sql
      .mockResolvedValueOnce([source()])
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([]);
    expect(
      (await readProspectPledgeStatus({ workspaceUserId: 44, origin }))
        .byConstituentId,
    ).toEqual({});
    expect(mocks.sql).toHaveBeenCalledTimes(3);
  });
});
