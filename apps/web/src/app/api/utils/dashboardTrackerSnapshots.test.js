import { describe, expect, it, vi } from "vitest";
vi.mock("./sql", () => ({ default: vi.fn() }));
vi.mock("./blackbaud", () => ({ blackbaudApiFetch: vi.fn() }));
import { newFundraisingTracker } from "@/utils/fundraisingTracker";
import { refreshFundraisingTracker } from "./fundraisingTracker";
import { refreshDashboardSnapshot, presentDashboardSnapshot, publicDashboardSnapshot } from "./dashboardSnapshots";
const tracker = (key, id) => ({ ...newFundraisingTracker(key), funds: [{ id, name: key }] });
const definition = { version: 1, panels: [tracker("first", "123"), tracker("second", "456")] };
const read = () => vi.fn(async (url) => url.startsWith("/fundraising/") ? { id: url.split("/").at(-1) } : { value: [], count: 0 });
const run = (configuration, cached, reader, executeQuery = vi.fn().mockResolvedValue({ value: 7 })) => refreshDashboardSnapshot({ configuration, cached, user: { id: 1 }, origin: "https://example.test", executeQuery,
  executeTracker: (args) => refreshFundraisingTracker({ ...args, read: reader }) });

describe("dashboard tracker integration", () => {
  it("presents unknown data without NXT reads, and never exposes checkpoints", async () => {
    expect(presentDashboardSnapshot(definition, null)).toMatchObject({ status: "refresh_required", trackers: [{ committedCents: null }, { receivedCents: null }] });
    const reader = read();
    const first = await run(definition, null, reader);
    expect(first).toMatchObject({ refreshStatus: "pending", remainingQueryCount: 1 });
    expect(reader).toHaveBeenCalledTimes(2);
    const publicSnapshot = publicDashboardSnapshot(first);
    expect(publicSnapshot.trackerState).toBeUndefined();
    expect(JSON.stringify(publicSnapshot)).not.toMatch(/ownerId|seen|visited/);
    expect(presentDashboardSnapshot(definition, first).trackers[1].pending).toBe(true);
    const second = await run(definition, first, reader);
    expect(second).toMatchObject({ status: "complete", refreshStatus: "complete", remainingQueryCount: 0 });
    expect(reader).toHaveBeenCalledTimes(4);
    expect(second.trackers.map((t) => t.committedCents)).toEqual([0, 0]);
  });
  it("shares the budget with queries and does not rerun completed sources on continuation", async () => {
    const query = { key: "query", layout: "metric", values: [{ key: "value", source: "query_count", queryId: "8", refreshPolicy: "refreshable" }] };
    const config = { version: 1, panels: [query, ...definition.panels] };
    const reader = read(), execute = vi.fn().mockResolvedValue({ value: 7 });
    const first = await run(config, null, reader, execute);
    expect(reader).toHaveBeenCalledTimes(1);
    expect(first.refreshStatus).toBe("pending");
    const second = await run(config, first, reader, execute);
    const third = await run(config, second, reader, execute);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(reader).toHaveBeenCalledTimes(4);
    expect(third.refreshStatus).toBe("complete");
    expect(third.values[0].value).toBe(7);
  });
  it("retains saved totals for display-only changes, and clears totals for a different fund", async () => {
    const one = { version: 1, panels: [definition.panels[0]] };
    const saved = await run(one, null, read());
    const renamed = { version: 1, panels: [{ ...one.panels[0], title: "Renamed", goal: 500000, display: "received" }] };
    expect(presentDashboardSnapshot(renamed, saved).trackers[0].receivedCents).toBe(0);
    renamed.panels[0].funds = [{ id: "999", name: "Different" }];
    expect(presentDashboardSnapshot(renamed, saved).trackers[0].receivedCents).toBeNull();
    expect(presentDashboardSnapshot(renamed, saved).status).toBe("refresh_required");
  });
  it("continues name hydration under the shared budget without re-running completed trackers", async () => {
    const reader = vi.fn(async (url) => {
      if (url.startsWith("/fundraising/")) return { id: url.split("/").at(-1) };
      if (url.startsWith("/constituent/")) return { value: [{ id: "42", name: "Example Donor" }], count: 1 };
      const fund = new URL(url, "https://example.test").searchParams.get("fund_id");
      return { value: [{ id: "1", constituent_id: "42", type: "Donation", date: "2026-10-01T00:00:00Z", amount: { value: 100 },
        gift_splits: [{ id: "11", fund_id: fund, amount: { value: 100 } }] }], count: 1 };
    });
    let snapshot = await run(definition, null, reader);
    expect(snapshot.refreshStatus).toBe("pending");
    expect(publicDashboardSnapshot(snapshot).trackers[0].donors).toBeNull();
    snapshot = await run(definition, snapshot, reader);
    expect(snapshot.trackers[0].donors[0].name).toBe("Example Donor");
    expect(snapshot.trackers[1].donors).toBeNull();
    snapshot = await run(definition, snapshot, reader);
    expect(snapshot.refreshStatus).toBe("complete");
    expect(reader).toHaveBeenCalledTimes(6);
    const visible = publicDashboardSnapshot(presentDashboardSnapshot(definition, snapshot));
    expect(visible.trackers.map((t) => t.donors[0].receivedCents)).toEqual([10000, 10000]);
    expect(JSON.stringify(visible)).not.toMatch(/trackerState|ownerId|nameIds|seen|visited/);
  });
});
