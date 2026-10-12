import { LETTER_TAGS } from "../src/utils/societyLetters";

export function csvWorkspace(count = 1) {
  const period = {
    key: "2026-01-01:2026-12-31",
    start: "2026-01-01",
    end: "2026-12-31",
  };
  return {
    revision: 7,
    today: "2026-10-12",
    period,
    settings: {
      sourceMode: "society_queries",
      societyKeys: ["ood", "presidents"],
    },
    definitions: [
      { key: "ood", name: "Order of the Dolphin" },
      { key: "presidents", name: "President's Society" },
    ],
    setup: { membershipCurrent: true },
    refreshedAt: "2026-10-10T12:00:00.000Z",
    templates: [
      {
        societyKey: "ood",
        version: "a".repeat(64),
        usedFields: ["addressee", "salutation", "address"],
        mergeSettings: {
          fields: LETTER_TAGS,
          dateFormat: "long_us",
          wordBindings: { First_Name: "salutation" },
        },
        wordFields: {
          fields: [
            { name: "First_Name", suggestedField: "first_name" },
            { name: "Address", suggestedField: "address" },
          ],
        },
      },
    ],
    rows: Array.from({ length: count }, (_, index) => {
      const id = String(1000 + index);
      return {
        householdId: id,
        members: [id],
        name: `Example ${index}`,
        period,
        societyKey: "ood",
        societyName: "Order of the Dolphin",
        status: "ready",
        recipientConstituentId: id,
        addressConstituentId: id,
        firstName: "Alex",
        preferredName: "Al",
        lastName: "Example",
        addressee: `Alex Example ${index}`,
        salutation: "Al",
        address: "10 Test Street\nExample City, FL 00123",
        addressParts: {
          address_line_1: "10 Test Street",
          address_line_2: "",
          city: "Example City",
          state: "FL",
          zip: "00123",
          country: "",
        },
        recipientReview: { status: "saved" },
        documentReadiness: { status: "ready", blockers: [] },
      };
    }),
  };
}

export function csvRequest(workspace) {
  return {
    action: "export_merge_csv",
    revision: workspace.revision,
    societyKey: "ood",
    periodKey: workspace.period.key,
    letterDate: workspace.today,
    householdIds: workspace.rows
      .filter((row) => row.societyKey === "ood")
      .map((row) => row.householdId),
  };
}
