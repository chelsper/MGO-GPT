import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ page: vi.fn(), identity: vi.fn() }));
vi.mock("./constituentListProvider", () => ({
  readListPage: mocks.page,
  readListIdentity: mocks.identity,
}));
import {
  advanceListRefresh,
  listRefreshStatus,
  listSnapshotKeys,
  newListRefresh,
} from "./constituentListRefresh";
const context = {
  user: { id: 1 },
  origin: "https://example.test",
  source: { fieldCategory: "A", fieldDescription: "B" },
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.identity.mockImplementation(async ({ constituentId }) => ({
    constituentId,
    name: `Donor ${constituentId}`,
    lookupId: `L${constituentId}`,
  }));
});
it("keys snapshots by origin, list and source so changed criteria cannot relabel old members", () => {
  const report = { key: "list-demo", dataConfiguration: context.source };
  expect(listSnapshotKeys(report, context.origin)).not.toEqual(
    listSnapshotKeys(report, "https://sandbox.test"),
  );
  expect(listSnapshotKeys(report, context.origin)).not.toEqual(
    listSnapshotKeys(
      {
        ...report,
        dataConfiguration: { ...context.source, fieldDescription: "C" },
      },
      context.origin,
    ),
  );
});
it("collects pages before fetching names, deduplicates constituents and publishes only complete results", async () => {
  const job = newListRefresh();
  mocks.page
    .mockResolvedValueOnce({
      fields: [{ id: "1", parent_id: "10", value: "B" }],
      nextOffset: 1,
    })
    .mockResolvedValueOnce({
      fields: [
        { id: "2", parent_id: "10", value: "B" },
        { id: "3", parent_id: "20", value: "B" },
      ],
      nextOffset: null,
    });
  expect((await advanceListRefresh({ ...context, job })).snapshot).toBeNull();
  expect(mocks.identity).not.toHaveBeenCalled();
  expect((await advanceListRefresh({ ...context, job })).snapshot).toBeNull();
  const { snapshot } = await advanceListRefresh({ ...context, job });
  expect(snapshot.total).toBe(2);
  expect(mocks.identity).toHaveBeenCalledTimes(2);
  expect(listRefreshStatus({ snapshot, job }).refresh).not.toHaveProperty(
    "fields",
  );
});
it("bounds name enrichment at five, preserving completed names on a later failure", async () => {
  const job = {
    ...newListRefresh(),
    stage: "names",
    people: ["1", "2", "3", "4", "5", "6"],
  };
  expect((await advanceListRefresh({ ...context, job })).snapshot).toBeNull();
  expect(job.profileOffset).toBe(5);
  expect(mocks.identity).toHaveBeenCalledTimes(5);
  mocks.identity.mockRejectedValueOnce(new Error("429"));
  await expect(advanceListRefresh({ ...context, job })).rejects.toThrow("429");
  expect(job.profileOffset).toBe(5);
  expect((await advanceListRefresh({ ...context, job })).snapshot.total).toBe(
    6,
  );
});
it("does not poison checkpoints when a repeated page is rejected", async () => {
  const job = {
    ...newListRefresh(),
    fields: [{ id: "1", constituentId: "10" }],
  };
  mocks.page.mockResolvedValue({
    fields: [
      { id: "2", parent_id: "20" },
      { id: "1", parent_id: "10" },
    ],
    nextOffset: 2,
  });
  await expect(advanceListRefresh({ ...context, job })).rejects.toThrow(
    /Repeated/,
  );
  expect(job.fields).toHaveLength(1);
});
it("publishes a verified empty list without inventing names", async () => {
  mocks.page.mockResolvedValue({ fields: [], nextOffset: null });
  expect(
    (await advanceListRefresh({ ...context, job: newListRefresh() })).snapshot
      .total,
  ).toBe(0);
  expect(mocks.identity).not.toHaveBeenCalled();
});
