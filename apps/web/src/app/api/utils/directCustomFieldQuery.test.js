import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getBlackbaudQueryAvailableFieldsMock,
  getCachedReportSnapshotWithMetadataMock,
  saveReportSnapshotMock,
} = vi.hoisted(() => ({
  getBlackbaudQueryAvailableFieldsMock: vi.fn(),
  getCachedReportSnapshotWithMetadataMock: vi.fn(),
  saveReportSnapshotMock: vi.fn(),
}));

vi.mock("@/app/api/utils/blackbaud", () => ({
  getBlackbaudQueryAvailableFields: getBlackbaudQueryAvailableFieldsMock,
}));
vi.mock("@/app/api/utils/reportCache", () => ({
  getCachedReportSnapshotWithMetadata: getCachedReportSnapshotWithMetadataMock,
  saveReportSnapshot: saveReportSnapshotMock,
}));

describe("direct custom-field query definitions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCachedReportSnapshotWithMetadataMock.mockResolvedValue(null);
    getBlackbaudQueryAvailableFieldsMock.mockImplementation(({ nodeId }) => {
      if (nodeId === 0) {
        return Promise.resolve({
          fields: [],
          nodes: [
            { id: 10, name: "Constituent Information" },
            { id: 20, name: "Custom Fields" },
          ],
        });
      }
      if (nodeId === 20) {
        return Promise.resolve({
          fields: [],
          nodes: [
            { id: 21, name: "Constituent Specific Custom Fields" },
          ],
        });
      }
      if (nodeId === 21) {
        return Promise.resolve({
          fields: [],
          nodes: [
            { id: 22, name: "Prospect Research" },
            { id: 23, name: "Unrelated Category" },
          ],
        });
      }
      if (nodeId === 22) {
        return Promise.resolve({
          fields: [
            {
              id: 4123,
              selected_field_name: "Prospect Research Description",
              allowed_filter_operators: ["Equals"],
              node_path: [
                { name: "Constituent Specific Custom Fields" },
                { name: "Prospect Research" },
              ],
            },
          ],
          nodes: [],
        });
      }
      return Promise.resolve({ fields: [], nodes: [] });
    });
  });

  it("builds an exact description filter and retains only metadata discovery", async () => {
    const { getDirectCustomFieldQueryDefinition } = await import("./directCustomFieldQuery.js");
    const query = await getDirectCustomFieldQueryDefinition({
      userId: 8,
      authUserId: 8,
      origin: "https://www.jumgogpt.app",
      fieldCategory: "Prospect Research",
      fieldDescription: "Innovation Center",
    });

    expect(query).toMatchObject({
      type_id: 18,
      suppress_duplicates: true,
      select_fields: [],
      filter_fields: [
        {
          query_field_id: 4123,
          operator: "Equals",
          filter_values: ["Innovation Center"],
        },
      ],
    });
    expect(saveReportSnapshotMock).toHaveBeenCalledWith(
      "metadata:query-api:custom-field-filter-fields:v2:prospect%20research",
      expect.objectContaining({
        fields: [expect.objectContaining({ id: 4123 })],
      }),
    );
    expect(getBlackbaudQueryAvailableFieldsMock.mock.calls.map(([args]) => args.nodeId)).toEqual([
      0,
      20,
      21,
      22,
    ]);
  });

  it("reuses category-specific metadata without another NXT discovery call", async () => {
    getCachedReportSnapshotWithMetadataMock.mockResolvedValue({
      updatedAt: new Date().toISOString(),
      payload: {
        fields: [
          {
            id: 4123,
            names: [
              "Constituent Specific Custom Fields",
              "Prospect Research",
              "Prospect Research Description",
            ],
          },
        ],
      },
    });

    const { getDirectCustomFieldQueryDefinition } = await import("./directCustomFieldQuery.js");
    const query = await getDirectCustomFieldQueryDefinition({
      userId: 8,
      authUserId: 8,
      origin: "https://www.jumgogpt.app",
      fieldCategory: "Prospect Research",
      fieldDescription: "Innovation Center",
    });

    expect(query.filter_fields[0].query_field_id).toBe(4123);
    expect(getBlackbaudQueryAvailableFieldsMock).not.toHaveBeenCalled();
    expect(getCachedReportSnapshotWithMetadataMock).toHaveBeenCalledWith(
      "metadata:query-api:custom-field-filter-fields:v2:prospect%20research",
    );
  });
});
