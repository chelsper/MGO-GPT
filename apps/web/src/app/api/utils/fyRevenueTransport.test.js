// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ user: vi.fn(), connection: vi.fn(), read: vi.fn(), execute: vi.fn() }));
vi.mock("./sql", () => ({ default: vi.fn(() => { throw new Error("Live SQL forbidden"); }) }));
vi.mock("./reportRefresh", () => ({ getReportRefreshUser: m.user }));
vi.mock("./blackbaud", () => ({ blackbaudApiFetch: m.read, getBlackbaudConnection: m.connection }));
vi.mock("./savedQueryExecution", () => ({ executeSavedQueryResults: m.execute }));
import { revenueTransport } from "./fyRevenueGoals";
beforeEach(() => { vi.clearAllMocks(); m.user.mockResolvedValue({ id: 7, role: "advancement_services" }); m.connection.mockResolvedValue({ connected_at: "now" }); });
it("uses the active shared-account helper contract and fixed query, never the viewer connection", async () => {
  const transport = await revenueTransport("https://app.example");
  await transport.metadata(); await transport.execute();
  expect(m.connection).toHaveBeenCalledWith(7);
  expect(m.read).toHaveBeenCalledWith("/query/queries/31074", expect.objectContaining({ userId: 7, authUserId: 7, maxRetries: 0 }));
  expect(m.execute).toHaveBeenCalledWith(expect.objectContaining({ queryId: "31074", user: { id: 7, role: "advancement_services" } }));
});
it.each([null, { id: 7, role: "mgo" }, { id: 7, role: "admin", active: false }])("rejects an unauthorized shared account", async user => {
  m.user.mockResolvedValue(user); await expect(revenueTransport("https://app.example")).rejects.toMatchObject({ status: 409 });
  expect(m.read).not.toHaveBeenCalled(); expect(m.execute).not.toHaveBeenCalled();
});
it("requires an established shared connection", async () => {
  m.connection.mockResolvedValue(null); await expect(revenueTransport("https://app.example")).rejects.toMatchObject({ status: 409 });
});
it("uses the same shared connection for the allowlisted cash query only", async () => {
  const transport = await revenueTransport("https://app.example", "31075");
  await transport.metadata(); await transport.execute();
  expect(m.read).toHaveBeenCalledWith("/query/queries/31075", expect.objectContaining({ userId: 7, maxRetries: 0 }));
  expect(m.execute).toHaveBeenCalledWith(expect.objectContaining({ queryId: "31075" }));
  await expect(revenueTransport("https://app.example", "99999")).rejects.toThrow();
  expect(m.execute).toHaveBeenCalledTimes(1);
});
it("reads only known gift and installment endpoints, without writes or inline retries", async () => {
  const transport = await revenueTransport("https://app.example", "31076");
  await transport.metadata(); await transport.pledge("123", "gift"); await transport.pledge("123", "installments");
  expect(m.read.mock.calls.map(call => call[0])).toEqual(["/query/queries/31076", "/gift/v1/gifts/123", "/gft-gifts/v2/gifts/123/installments"]);
  for (const [, options] of m.read.mock.calls) { expect(options).toMatchObject({ userId: 7, authUserId: 7, maxRetries: 0 }); expect(options.method).toBeUndefined(); }
  expect(() => transport.pledge("../bad", "gift")).toThrow(); expect(() => transport.pledge("123", "delete")).toThrow();
});
it("does not expand the original cash queries' capabilities or accept unknown query IDs", async () => {
  expect(await revenueTransport("https://app.example", "31074")).not.toHaveProperty("pledge");
  expect(await revenueTransport("https://app.example", "31075")).not.toHaveProperty("pledge");
  await expect(revenueTransport("https://app.example", "1")).rejects.toThrow("Unknown");
});
