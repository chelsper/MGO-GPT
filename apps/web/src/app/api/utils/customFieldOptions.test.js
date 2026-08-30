import { describe, expect, it } from "vitest";
import {
  createConfiguredCustomFieldCatalog,
  createCustomFieldCatalogSnapshot,
  isCustomFieldCatalogFresh,
  normalizeCustomFieldCategoryOptions,
  normalizeCustomFieldValueOptions,
} from "./customFieldOptions";

describe("Custom field option catalog", () => {
  it("normalizes NXT categories and retains their IDs", () => {
    expect(
      normalizeCustomFieldCategoryOptions({
        value: [
          { category_id: 24, category: " Prospect Research ", data_type: "Text" },
          { id: 17, name: " Gift Officer " },
        ],
      }),
    ).toEqual([
      { id: "17", name: "Gift Officer", dataType: "" },
      { id: "24", name: "Prospect Research", dataType: "Text" },
    ]);
  });

  it("maps category values to their category and removes duplicate options", () => {
    const categories = [{ id: "24", name: "Prospect Research", dataType: "Text" }];
    expect(
      normalizeCustomFieldValueOptions(
        [
          { category_id: 24, value: " Future. Made. Phase II " },
          { category_id: "24", field_value: "Future. Made. Phase II" },
          { category: "Gift Officer", code_table_entry_name: "Priority" },
        ],
        categories,
      ),
    ).toEqual([
      { category: "Gift Officer", value: "Priority" },
      { category: "Prospect Research", value: "Future. Made. Phase II" },
    ]);
  });

  it("maps a flat category value response to the selected category", () => {
    expect(
      normalizeCustomFieldValueOptions(
        { value: ["Future. Made. Phase II", "Future. Made. Phase III"] },
        [{ id: "24", name: "Prospect Research", dataType: "CodeTable" }],
        "Prospect Research",
      ),
    ).toEqual([
      { category: "Prospect Research", value: "Future. Made. Phase II" },
      { category: "Prospect Research", value: "Future. Made. Phase III" },
    ]);
  });

  it("keeps configured report values available when NXT only provides category metadata", () => {
    const catalog = createCustomFieldCatalogSnapshot({
      categoryPayload: [{ category_id: 24, category: "Prospect Research" }],
      valuePayload: [],
      configuredRecords: [
        {
          field_category: "Prospect Research",
          field_description: "Future. Made. Phase II",
        },
      ],
    });

    expect(catalog).toEqual({
      categories: [{ id: "24", name: "Prospect Research", dataType: "" }],
      values: [{ category: "Prospect Research", value: "Future. Made. Phase II" }],
      loadedCategories: [],
    });
    expect(createConfiguredCustomFieldCatalog([])).toEqual({ categories: [], values: [] });
  });

  it("refreshes the shared catalog no more than once per day without a manual request", () => {
    const now = Date.parse("2026-08-30T18:00:00.000Z");
    expect(isCustomFieldCatalogFresh("2026-08-30T17:00:00.000Z", now)).toBe(true);
    expect(isCustomFieldCatalogFresh("2026-08-29T17:00:00.000Z", now)).toBe(false);
  });
});
