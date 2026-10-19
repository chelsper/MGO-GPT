// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ user: vi.fn(), connection: vi.fn(), fetch: vi.fn(), execute: vi.fn() }));
vi.mock("./reportRefresh", () => ({ getReportRefreshUser: m.user }));
vi.mock("./blackbaud", async original => ({ ...await original(), getBlackbaudConnection: m.connection, blackbaudApiFetch: m.fetch }));
vi.mock("./savedQueryExecution", () => ({ executeSavedQueryResults: m.execute }));
import { revenueTransport } from "./fyRevenueGoals";
beforeEach(() => {
  vi.clearAllMocks(); m.user.mockResolvedValue({ id: 9, role: "advancement_services" });
  m.connection.mockResolvedValue({ connected_at: "2026-01-01T00:00:00Z" });
});
it("uses the active shared-account helper contract and fixed query, never the viewer connection", async () => {
  const transport = await revenueTransport("https://app.example");
  await transport.metadata(); await transport.execute();
  expect(m.connection).toHaveBeenCalledWith(9);
  expect(m.fetch).toHaveBeenCalledWith("/query/queries/31074", expect.objectContaining({ userId: 9, authUserId: 9, maxRetries: 0 }));
  expect(m.execute).toHaveBeenCalledWith(expect.objectContaining({ queryId: "31074", user: { id: 9, role: "advancement_services" } }));
});
it.each([null, { id: 9, role: "mgo" }, { id: 9, role: "admin", active: false }])("rejects an unauthorized shared account", async user => {
  m.user.mockResolvedValue(user); await expect(revenueTransport("https://app.example")).rejects.toMatchObject({ status: 409 });
  expect(m.fetch).not.toHaveBeenCalled(); expect(m.execute).not.toHaveBeenCalled();
});
it("requires an established shared connection", async () => {
  m.connection.mockResolvedValue(null); await expect(revenueTransport("https://app.example")).rejects.toMatchObject({ status: 409 });
});
it("uses the same shared connection for the allowlisted cash query only", async () => {
  const transport = await revenueTransport("https://app.example", "31075");
  await transport.metadata(); await transport.execute();
  expect(m.fetch).toHaveBeenCalledWith("/query/queries/31075", expect.objectContaining({ userId: 9, maxRetries: 0 }));
  expect(m.execute).toHaveBeenCalledWith(expect.objectContaining({ queryId: "31075" }));
  await expect(revenueTransport("https://app.example", "99999")).rejects.toThrow();
  expect(m.execute).toHaveBeenCalledTimes(1);
});
