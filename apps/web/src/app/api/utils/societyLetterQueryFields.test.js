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
  it("suggests explicit organization contact labels without using them as constituent names", async () => {
    getBlackbaudSavedQueryById.mockResolvedValue({
      select_fields: [
        field("Constituency Code"),
        field("Contact Type", "Contact Type", "relationships"),
        field("Contact First Name", "First Name", "relationships"),
        field("Contact Last Name", "Last Name", "relationships"),
        field("Main Contact First Name", "First Name", "relationships"),
        field("Society Letter Contact Last Name", "Last Name", "relationships"),
      ],
    });
    const result = await inspectLetterQueryFields(
      { queryId: "31043" },
      context,
    );
    expect(result.suggestedColumns).toEqual({
      constituencyCode: "Constituency Code",
      contactType: "Contact Type",
      contactFirstName: "Contact First Name",
      contactLastName: "Contact Last Name",
      mainContactFirstName: "Main Contact First Name",
      societyContactLastName: "Society Letter Contact Last Name",
    });
  });
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
  it("recognizes separate preferred street and postal fields without guessing relationships", async () => {
    getBlackbaudSavedQueryById.mockResolvedValue({
      select_fields: [
        field("Preferred Street Line 1"),
        field("Preferred street line 2"),
        field("Preferred City"),
        field("Preferred State"),
        field("Preferred ZIP Code"),
        field("Preferred Country"),
        field("Spouse Address Line 1"),
        field("Constituent ID"),
      ],
    });
    const result = await inspectLetterQueryFields(
      { queryId: "31043" },
      context,
    );
    expect(result.suggestedColumns).toEqual({
      address1: "Preferred Street Line 1",
      address2: "Preferred street line 2",
      city: "Preferred City",
      state: "Preferred State",
      postalCode: "Preferred ZIP Code",
      country: "Preferred Country",
    });
  });
  it("leaves ambiguous preferred-address choices for the reviewer", async () => {
    getBlackbaudSavedQueryById.mockResolvedValue({
      select_fields: [
        field("Preferred Address Line 1"),
        field("Preferred Street Line 1"),
        field("Preferred ZIP"),
        field("Preferred ZIP Code"),
      ],
    });
    const result = await inspectLetterQueryFields(
      { queryId: "31043" },
      context,
    );
    expect(result.suggestedColumns).toEqual({});
  });
  it("fails closed when no output metadata is available", async () => {
    getBlackbaudSavedQueryById.mockResolvedValue({});
    await expect(
      inspectLetterQueryFields({ queryId: "1" }, context),
    ).rejects.toThrow(/No usable output fields/);
  });
  it("recognizes main and spouse names by query metadata even with custom labels", async () => {
    getBlackbaudSavedQueryById.mockResolvedValue({
      select_fields: [
        field("Main given", "First Name"),
        field("Main surname", "Last Name"),
        field("Partner given", "First Name", "10516"),
        field("Partner surname", "Last Name", "10516"),
        field("Relationship first name", "First Name", "other"),
      ],
    });
    const result = await inspectLetterQueryFields(
      { queryId: "31043" },
      context,
    );
    expect(result.suggestedColumns).toEqual({
      firstName: "Main given",
      lastName: "Main surname",
      spouseFirstName: "Partner given",
      spouseLastName: "Partner surname",
    });
  });
  it("does not guess name mappings from ambiguous or misleading labels", async () => {
    getBlackbaudSavedQueryById.mockResolvedValue({
      select_fields: [
        field("Main given A", "First Name"),
        field("Main given B", "First Name"),
        field("Spouse First Name", "First Name", "other"),
        field("Last Name", "Last Name", ""),
      ],
    });
    const result = await inspectLetterQueryFields(
      { queryId: "31043" },
      context,
    );
    expect(result.suggestedColumns).toEqual({});
  });
  it("recognizes preferred names by main/spouse metadata and explicit organization contact labels", async () => {
    getBlackbaudSavedQueryById.mockResolvedValue({
      select_fields: [
        field("Greeting name", "Preferred Name"),
        field("Partner greeting", "Preferred Name", "10516"),
        field("Key Indicator"),
        field("Main Contact Preferred Name", "Preferred Name", "relationships"),
        field("Unrelated preferred", "Preferred Name", "relationships"),
      ],
    });
    const result = await inspectLetterQueryFields(
      { queryId: "31043" },
      context,
    );
    expect(result.suggestedColumns).toEqual({
      preferredName: "Greeting name",
      spousePreferredName: "Partner greeting",
      keyIndicator: "Key Indicator",
      mainContactPreferredName: "Main Contact Preferred Name",
    });
  });
});
