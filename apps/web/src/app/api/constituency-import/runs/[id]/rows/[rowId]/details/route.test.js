import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const ensureAppSchemaMock = vi.fn();
const getWorkspaceUserMock = vi.fn();
const sqlMock = vi.fn();
const getBlackbaudConstituentByIdMock = vi.fn();
const isBlackbaudQuotaExceededErrorMock = vi.fn();

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: ensureAppSchemaMock }));
vi.mock("@/app/api/utils/getWorkspaceUser", () => ({ default: getWorkspaceUserMock }));
vi.mock("@/app/api/utils/sql", () => ({ default: sqlMock }));
vi.mock("@/app/api/utils/blackbaud", () => ({
  blackbaudApiFetch: vi.fn(),
  getBlackbaudConstituentById: getBlackbaudConstituentByIdMock,
  isBlackbaudQuotaExceededError: isBlackbaudQuotaExceededErrorMock,
}));

function makeRow() {
  const deferredWrite = {
    type: "profile_detail_review",
    action: "load_current",
    requiresReview: true,
    deferredHydration: true,
    fieldDecisions: {},
  };
  return {
    id: "9",
    run_id: "42",
    status: "Needs Review",
    matched_blackbaud_constituent_id: "543503",
    preview: {
      input: {
        nameUpdate: { firstName: "Victoria", lastName: "Richards", preferredName: "Victoria" },
        individualProfileUpdate: { title: "Ms.", gender: "White" },
      },
      match: { blackbaudConstituentId: "543503", lookupId: "543503" },
      deferredHydration: { detail: true },
      writePlan: [deferredWrite],
      reasons: ["Open this row to load the current NXT name and profile values before reviewing CSV changes."],
    },
    requested_writes: [deferredWrite],
    blackbaud_result: null,
  };
}

function makeRequest(body) {
  return new Request(
    "https://example.com/api/constituency-import/runs/42/rows/9/details",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
  );
}

describe("constituency import row detail route", () => {
  beforeEach(() => {
    authMock.mockReset();
    ensureAppSchemaMock.mockReset();
    getWorkspaceUserMock.mockReset();
    sqlMock.mockReset();
    getBlackbaudConstituentByIdMock.mockReset();
    isBlackbaudQuotaExceededErrorMock.mockReset();

    authMock.mockResolvedValue({ user: { email: "reviewer@example.com" } });
    ensureAppSchemaMock.mockResolvedValue();
    getWorkspaceUserMock.mockResolvedValue({
      sessionUser: { id: 7, email: "reviewer@example.com", role: "reviewer" },
    });
    isBlackbaudQuotaExceededErrorMock.mockReturnValue(false);
  });

  it("hydrates a deferred profile with the actual NXT snapshot instead of blank placeholder values", async () => {
    const { POST } = await import("./route.js");
    sqlMock
      .mockResolvedValueOnce([makeRow()])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ status: "Ready" }])
      .mockResolvedValueOnce([]);
    getBlackbaudConstituentByIdMock.mockResolvedValue({
      raw: {
        type: "Individual",
        first: "Victoria",
        last: "Richards",
        preferred_name: "Victoria",
        title: "Dr.",
        gender: "Female",
      },
    });

    const response = await POST(makeRequest({ scopes: ["profile"] }), {
      params: { id: "42", rowId: "9" },
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe("Ready");
    expect(getBlackbaudConstituentByIdMock).toHaveBeenCalledWith(
      expect.objectContaining({ constituentId: "543503" }),
    );

    const updateCall = sqlMock.mock.calls.find(([strings]) =>
      strings.join("").includes("UPDATE constituency_import_rows"),
    );
    expect(updateCall).toBeTruthy();
    const savedPreview = JSON.parse(updateCall[2]);
    const savedWrites = JSON.parse(updateCall[3]);
    expect(savedPreview.profileSnapshot).toMatchObject({ title: "Dr.", gender: "Female" });
    expect(savedPreview.deferredHydration).toBeNull();
    expect(savedWrites).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "constituent_profile",
          current: expect.objectContaining({ title: "Dr.", gender: "Female" }),
          title: "Ms.",
          gender: "White",
        }),
      ]),
    );
    expect(savedWrites).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "profile_detail_review" })]),
    );
  });
});
