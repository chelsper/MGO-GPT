import { beforeEach, expect, it, vi } from "vitest";
import sql from "./sql";
import { claimMaintenanceGate, reserveMaintenanceCall, releaseMaintenanceGate } from "./portfolioMaintenanceStore";
vi.mock("./sql", () => ({ default: vi.fn() }));
beforeEach(() => sql.mockReset().mockResolvedValue([]));
it("creates an additive serialized gate without altering snapshots or jobs", async () => {
  expect(await claimMaintenanceGate("https://example.org", "1")).toBeNull();
  const ddl = sql.mock.calls[0][0].join(" ");
  expect(ddl).toContain("pg_advisory_xact_lock");
  expect(ddl).toContain("CHECK (id = 1)");
  expect(ddl).not.toMatch(/DROP|DELETE|UPDATE/);
  const claim = sql.mock.calls[1][0].join(" ");
  expect(claim).toContain("u.active = TRUE");
  expect(claim).toContain("NOT j.cancel_requested");
  expect(claim).toContain("j.mode = 'nightly'");
  expect(claim).toContain("blocked_until > NOW()");
  expect(claim).toContain("lease_until <= NOW()");
});
it("reserves only against the active origin, token, workspace, item, window, and limits", async () => {
  const gate = { origin: "https://example.org", token: "test-token", workspaceUserId: "7", constituentId: "123" };
  expect(await reserveMaintenanceCall(gate)).toBe(false);
  const [parts, ...values] = sql.mock.calls[0];
  const query = parts.join(" ");
  expect(values).toEqual(expect.arrayContaining([gate.origin, gate.token, gate.workspaceUserId, gate.constituentId, 360, 60]));
  for (const required of ["lease_until > NOW()", "work_until > NOW()", "batch_calls", "call_count", "call_day", "America/New_York", "blocked_until > NOW()", "i.status = 'processing'", "NOT j.cancel_requested"]) expect(query).toContain(required);
  sql.mockResolvedValueOnce([{ call_count: 1 }]);
  expect(await reserveMaintenanceCall(gate)).toBe(true);
});
it("releases only its own lease without resetting usage", async () => {
  await releaseMaintenanceGate({ origin: "https://example.org", token: "owner" });
  const query = sql.mock.calls[0][0].join(" ");
  expect(query).toContain("lease_token =");
  expect(query).toContain("origin =");
  expect(query).not.toMatch(/call_count|call_day|DELETE/);
});
