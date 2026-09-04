import { describe, expect, it } from "vitest";
import {
  MAX_DISCUSSION_CONSTITUENTS,
  groupDiscussionConstituents,
  normalizeDiscussionConstituents,
} from "./discussionConstituents";

describe("discussion constituents", () => {
  it("normalizes, deduplicates, and rejects unsafe selections", () => {
    expect(
      normalizeDiscussionConstituents([
        { blackbaudConstituentId: " 242718 ", name: " Anna Arribas ", lookupId: "A-1" },
        { blackbaudConstituentId: "242718", name: "Duplicate" },
        { blackbaudConstituentId: "not-an-id", name: "Invalid" },
        { blackbaudRecordId: "227337", name: "Rafael Arribas" },
      ]),
    ).toEqual([
      { blackbaudConstituentId: "242718", name: "Anna Arribas", lookupId: "A-1" },
      { blackbaudConstituentId: "227337", name: "Rafael Arribas", lookupId: null },
    ]);
  });

  it("caps selections and groups saved rows by discussion", () => {
    const selections = Array.from({ length: MAX_DISCUSSION_CONSTITUENTS + 5 }, (_, index) => ({
      blackbaudConstituentId: String(index + 1),
      name: `Constituent ${index + 1}`,
    }));
    expect(normalizeDiscussionConstituents(selections)).toHaveLength(
      MAX_DISCUSSION_CONSTITUENTS,
    );
    expect(
      groupDiscussionConstituents([
        {
          discussion_item_id: 7,
          constituent_id: 11,
          blackbaud_constituent_id: "101",
          name: "First Person",
        },
      ]),
    ).toEqual({
      7: [
        {
          constituent_id: 11,
          blackbaudConstituentId: "101",
          name: "First Person",
        },
      ],
    });
  });
});
