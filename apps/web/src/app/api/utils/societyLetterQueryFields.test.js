import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("./blackbaud", () => ({ getBlackbaudSavedQueryById: vi.fn() }));
import { getBlackbaudSavedQueryById } from "./blackbaud";
import { inspectLetterQueryFields } from "./societyLetterQueryFields";
const context = { user: { id: 7 }, origin: "https://example.org" };
const field = (name, meaning = name, root = "296") => ({
  query_field: {
    selected_field_name: name,
    available_field_name: meaning,
    node_path: [{ id: root }],
  },
});
beforeEach(() => vi.resetAllMocks());
describe("society query field inspection", () => {
  it("reads metadata only and recognizes identity by meaning, not numeric-looking column labels", async () => {
    getBlackbaudSavedQueryById.mockResolvedValue({
      select_fields: [
        field("Main record", "System Record ID"),
        field("Spouse record", "System Record ID", "10516"),
        field("Primary Addressee"),
        field("System Record ID", "Constituent ID"),
      ],
    });
    const result = await inspectLetterQueryFields(
      { queryId: "31043" },
      context,
    );
    expect(result.suggestedColumns).toEqual({
      constituentId: "Main record",
      spouseId: "Spouse record",
      addressee: "Primary Addressee",
    });
    expect(getBlackbaudSavedQueryById).toHaveBeenCalledExactlyOnceWith({
      queryId: "31043",
      userId: 7,
      origin: context.origin,
    });
  });
  it("does not suggest duplicate column names or ambiguous system ID fields", async () => {
    getBlackbaudSavedQueryById.mockResolvedValue({
      select_fields: [
        field("A", "System Record ID"),
        field("B", "System Record ID"),
        field("Primary Addressee"),
        field("Primary Addressee"),
      ],
    });
    const result = await inspectLetterQueryFields({ queryId: "1" }, context);
    expect(result.fields).toEqual(["A", "B"]);
    expect(result.suggestedColumns).toEqual({});
  });
  it("rejects invalid query IDs before API access", async () => {
    await expect(
      inspectLetterQueryFields({ queryId: "../1" }, context),
    ).rejects.toThrow(/query ID/);
    expect(getBlackbaudSavedQueryById).not.toHaveBeenCalled();
  });
  it("fails closed when no output metadata is available", async () => {
    getBlackbaudSavedQueryById.mockResolvedValue({});
    await expect(
      inspectLetterQueryFields({ queryId: "1" }, context),
    ).rejects.toThrow(/No usable output fields/);
  });
});
