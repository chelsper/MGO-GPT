import { beforeEach, expect, it, vi } from "vitest";
const sql = vi.hoisted(() => vi.fn());
vi.mock("./sql", () => ({ default: sql }));
import { persistImportWriteCheckpoint } from "./importWriteCheckpoint";
beforeEach(() => sql.mockReset());
it("saves a durable checkpoint only while the same row is Applying", async () => {
  sql.mockResolvedValue([{ id: 9 }]);
  const audit = { results: [{ status: "started", writeIndex: 0 }] };
  await persistImportWriteCheckpoint({ id: 9, run_id: 42 }, audit);
  expect(sql.mock.calls[0][0].join(" ")).toContain("status = 'Applying'");
  expect(JSON.parse(sql.mock.calls[0][1])).toEqual(audit);
});
it("stops if another operation changed the row", async () => {
  sql.mockResolvedValue([]);
  await expect(persistImportWriteCheckpoint({ id: 9, run_id: 42 }, {})).rejects.toThrow("Stop and compare");
});
