import { beforeEach, describe, expect, it, vi } from "vitest";
const { sql, api } = vi.hoisted(() => ({ sql: vi.fn(), api: vi.fn() }));
vi.mock("./sql", () => ({ default: sql }));
vi.mock("./blackbaud", () => ({ blackbaudApiFetch: api }));
import { prepareNewRecordReview, reviewLocalImportDuplicate, reviewedCreationBlocker } from "./reviewedConstituentCreate";
import { checkClearNonmatch } from "./safeConstituentCreate";

describe("review all local holds then confirm new constituent", () => {
  let row, others;
  const args = () => ({ row, runId: "42", user: { id: "7" }, origin: "https://example.com" });
  beforeEach(() => {
    row = { id: "9", status: "Needs Review", preview: { input: { duplicateCheckVersion: 1, firstName: "Jane", lastName: "Dolphin", email: "shared@example.com" } } };
    others = [21, 22].map((id) => ({ id, run_id: 42, row_number: id - 10, status: "Ready", input: { duplicateCheckVersion: 1, firstName: `Other${id}`, lastName: "Person", email: "shared@example.com" } }));
    sql.mockReset().mockImplementation(async (strings, ...values) => {
      const query = strings.join(" ");
      if (query.includes("UNION ALL")) return others;
      if (query.includes("UPDATE constituency_import_rows SET preview")) { row = { ...row, preview: JSON.parse(values[0]) }; return [{ id: "9" }]; }
      throw new Error("Unexpected database operation");
    });
    api.mockReset().mockResolvedValue({ results: [], count: 0 });
  });
  it("persists each separate-person decision and exposes confirmation only after all checks complete", async () => {
    for (const id of ["21", "22"]) {
      expect((await prepareNewRecordReview(args())).status).toBe(200);
      expect(row.preview.newRecordReview.status).toBe("blocked");
      const duplicate = row.preview.localDuplicate;
      expect(duplicate.rowId).toBe(id);
      expect((await reviewLocalImportDuplicate({ ...args(), body: { blockerFingerprint: duplicate.fingerprint } })).status).toBe(200);
      const review = row.preview.localDuplicateReview;
      expect((await reviewLocalImportDuplicate({ ...args(), reject: true, body: { blockerFingerprint: duplicate.fingerprint, reviewToken: review.token, confirmed: true, reviewNote: "Verified different people sharing the same email address." } })).status).toBe(200);
      expect(row.preview.newRecordReview).toBeNull();
    }
    expect(row.preview.reviewedLocalDuplicates).toHaveLength(2);
    expect(api).not.toHaveBeenCalled();
    await prepareNewRecordReview(args());
    expect(row.preview.newRecordReview.status).toBe("clear");
    expect(api).toHaveBeenCalledTimes(2);
    const confirm = { confirmed: true, reviewToken: row.preview.newRecordReview.token, reviewNote: "Compared all matches and holds; a separate new person." };
    expect(reviewedCreationBlocker(row, confirm)).toBeNull();
    expect(reviewedCreationBlocker(row, { ...confirm, confirmed: false })).toContain("Explicitly confirm");
    // Even after a clear token, the final creation check discovers new blockers.
    others.push({ id: 23, input: { email: "shared@example.com" } });
    const onLocalDuplicate = vi.fn();
    expect(await checkClearNonmatch({ input: row.preview.input, rowId: "9", runId: "42", credentials: {}, reviewedLocalDuplicates: row.preview.reviewedLocalDuplicates, onLocalDuplicate })).toContain("Another import row");
    expect(onLocalDuplicate).toHaveBeenCalledWith(expect.objectContaining({ rowId: "23" }));
    expect(api.mock.calls.every(([, options]) => !options.method)).toBe(true);
  });
});
