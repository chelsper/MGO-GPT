import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const ensureAppSchemaMock = vi.fn();
const getWorkspaceUserMock = vi.fn();
const sqlMock = vi.fn();
const blackbaudApiFetchMock = vi.fn();
const getBlackbaudConstituentByIdMock = vi.fn();
const isBlackbaudQuotaExceededErrorMock = vi.fn();

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: ensureAppSchemaMock }));
vi.mock("@/app/api/utils/getWorkspaceUser", () => ({ default: getWorkspaceUserMock }));
vi.mock("@/app/api/utils/sql", () => ({ default: sqlMock }));
vi.mock("@/app/api/utils/blackbaud", () => ({
  blackbaudApiFetch: blackbaudApiFetchMock,
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

function makeContactRow({ includePhone = false } = {}) {
  const deferredWrite = {
    type: "contact_detail_review",
    action: "load_current",
    requiresReview: true,
    deferredHydration: true,
    contactDecisions: {},
  };
  return {
    id: "9",
    run_id: "42",
    status: "Needs Review",
    matched_blackbaud_constituent_id: "543503",
    preview: {
      input: {
        emailUpdates: [{ address: "new@example.com", type: "Personal", makePrimary: false }],
        ...(includePhone
          ? {
              phoneUpdates: [
                { number: "904-555-0100", type: "Mobile", makePrimary: false },
              ],
            }
          : {}),
      },
      match: { blackbaudConstituentId: "543503", lookupId: "543503" },
      currentContacts: { emails: [], phones: [], addresses: [] },
      contactSnapshotStatus: { emails: false, phones: false, addresses: false },
      deferredHydration: { contacts: true },
      writePlan: [deferredWrite],
      reasons: ["Open this row to load the current NXT email, phone, and address values before reviewing CSV changes."],
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
    blackbaudApiFetchMock.mockReset();
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
        response: {
          constituent: {
            type: "Individual",
            first: "Victoria",
            last: "Richards",
            preferred_name: "Victoria",
            title: "Dr.",
            gender: "Female",
          },
        },
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
    expect(savedPreview.profileSnapshot).toMatchObject({
      response: {
        constituent: { title: "Dr.", gender: "Female" },
      },
    });
    expect(savedPreview.profileSnapshotLoaded).toBe(true);
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

  it("clears a stale saved quota pause after a scoped profile refresh succeeds", async () => {
    const { POST } = await import("./route.js");
    const row = makeRow();
    const quotaMessage =
      "Blackbaud call-volume quota is temporarily unavailable. This row was saved safely without attempting further NXT calls.";
    row.match_method = "NXT checks paused";
    row.preview.nxtChecksPaused = true;
    row.preview.matchMethod = "NXT checks paused";
    row.preview.reasons = [quotaMessage];
    row.blackbaud_result = { provider: quotaMessage };
    row.blackbaud_error = quotaMessage;
    sqlMock
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ status: "Ready" }])
      .mockResolvedValueOnce([]);
    getBlackbaudConstituentByIdMock.mockResolvedValue({
      blackbaudConstituentId: "543503",
      lookupId: "543503",
      raw: {
        id: "543503",
        type: "Individual",
        first: "Victoria",
        last: "Richards",
      },
    });

    const response = await POST(makeRequest({ scopes: ["profile"] }), {
      params: { id: "42", rowId: "9" },
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.complete).toBe(true);
    const updateCall = sqlMock.mock.calls.find(([strings]) =>
      strings.join("").includes("UPDATE constituency_import_rows"),
    );
    const savedPreview = JSON.parse(updateCall[2]);
    const savedResult = JSON.parse(updateCall[4]);
    expect(savedPreview).toMatchObject({
      nxtChecksPaused: false,
      quotaRecoveryRequired: false,
      matchStatus: "matched",
      matchMethod: "Saved match refreshed",
      match: { blackbaudConstituentId: "543503" },
    });
    expect(savedPreview.reasons.join(" ")).not.toContain("quota");
    expect(savedPreview.intentDisposition).toBeNull();
    expect(JSON.stringify(savedResult)).not.toContain("quota");
  });

  it("hydrates the real NXT education rows for recovered education reviews", async () => {
    const { POST } = await import("./route.js");
    const row = makeRow();
    row.preview = {
      input: {
        educationRelationship: {
          action: "review-update",
          institution: "Jacksonville University",
          degree: "Bachelor of Arts",
        },
      },
      match: { blackbaudConstituentId: "543503", lookupId: "543503" },
      deferredHydration: { detail: true, educations: true },
      writePlan: [
        {
          type: "profile_detail_review",
          action: "load_current",
          requiresReview: true,
          deferredHydration: true,
        },
        {
          type: "education_relationship",
          action: "review_existing",
          requiresReview: true,
          deferredHydration: true,
        },
      ],
    };
    row.requested_writes = row.preview.writePlan;
    sqlMock
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ status: "Needs Review" }])
      .mockResolvedValueOnce([]);
    getBlackbaudConstituentByIdMock.mockResolvedValue({
      blackbaudConstituentId: "543503",
      raw: {
        id: "543503",
        type: "Individual",
        first: "Victoria",
        last: "Richards",
      },
    });
    blackbaudApiFetchMock.mockResolvedValue({
      value: [
        {
          id: "education-1",
          school: "Jacksonville University",
          degrees: [{ description: "Bachelor of Science" }],
        },
      ],
    });

    const response = await POST(makeRequest({ scopes: ["profile", "educations"] }), {
      params: { id: "42", rowId: "9" },
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ complete: true, failedScopes: [] });
    expect(blackbaudApiFetchMock).toHaveBeenCalledWith(
      "/constituent/v1/constituents/543503/educations",
      expect.objectContaining({ userId: 7 }),
    );
    const updateCall = sqlMock.mock.calls.find(([strings]) =>
      strings.join("").includes("UPDATE constituency_import_rows"),
    );
    const savedPreview = JSON.parse(updateCall[2]);
    const savedWrites = JSON.parse(updateCall[3]);
    expect(savedPreview).toMatchObject({
      currentEducations: [expect.objectContaining({ id: "education-1" })],
      deferredHydration: null,
    });
    expect(savedWrites).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "education_relationship",
          action: "review_existing",
          requiresReview: true,
        }),
      ]),
    );
  });

  it("hydrates deferred constituency rows before asking the reviewer to select a replacement", async () => {
    const { POST } = await import("./route.js");
    const row = makeRow();
    row.preview = {
      input: {
        sourceConstituency: "Student",
        targetConstituency: "Alumni - Bachelor's Degree",
        action: "replace",
      },
      match: { blackbaudConstituentId: "543503", lookupId: "543503" },
      deferredHydration: { codes: true },
      writePlan: [
        {
          type: "constituent_code_detail_review",
          action: "load_current",
          requiresReview: true,
          deferredHydration: true,
        },
      ],
      reasons: [
        "Open this row to load the current NXT constituencies before reviewing this constituency change.",
      ],
    };
    row.requested_writes = row.preview.writePlan;
    sqlMock
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ status: "Needs Review" }])
      .mockResolvedValueOnce([]);
    blackbaudApiFetchMock.mockResolvedValue({
      value: [
        {
          id: "student-code-1",
          description: "Student",
          date_from: "2020-08-15",
        },
      ],
    });

    const response = await POST(makeRequest({ scopes: ["codes"] }), {
      params: { id: "42", rowId: "9" },
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe("Needs Review");
    expect(blackbaudApiFetchMock).toHaveBeenCalledWith(
      "/constituent/v1/constituents/543503/constituentcodes",
      expect.objectContaining({ userId: 7 }),
    );

    const updateCall = sqlMock.mock.calls.find(([strings]) =>
      strings.join("").includes("UPDATE constituency_import_rows"),
    );
    const savedPreview = JSON.parse(updateCall[2]);
    const savedWrites = JSON.parse(updateCall[3]);
    expect(savedPreview).toMatchObject({
      codesSnapshotLoaded: true,
      deferredHydration: null,
      currentCodeDetails: [
        expect.objectContaining({ id: "student-code-1", label: "Student" }),
      ],
    });
    expect(savedWrites).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "constituent_code",
          action: "replace",
          sourceCandidates: [
            expect.objectContaining({ id: "student-code-1", label: "Student" }),
          ],
        }),
      ]),
    );
    expect(savedWrites).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "constituent_code_detail_review" })]),
    );
  });

  it("reads constituent-code collections nested under a connector data wrapper", async () => {
    const { POST } = await import("./route.js");
    const row = makeRow();
    row.preview = {
      input: {
        sourceConstituency: "Student",
        targetConstituency: "Alumni - Bachelor's Degree",
        action: "replace",
      },
      match: { blackbaudConstituentId: "543503", lookupId: "543503" },
      deferredHydration: { codes: true },
      writePlan: [
        {
          type: "constituent_code_detail_review",
          action: "load_current",
          requiresReview: true,
          deferredHydration: true,
        },
      ],
    };
    row.requested_writes = row.preview.writePlan;
    sqlMock
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ status: "Needs Review" }])
      .mockResolvedValueOnce([]);
    blackbaudApiFetchMock.mockResolvedValue({
      data: {
        items: [{ id: "student-code-1", description: "Student", date_from: "2020-08-15" }],
      },
    });

    const response = await POST(makeRequest({ scopes: ["codes"] }), {
      params: { id: "42", rowId: "9" },
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    const updateCall = sqlMock.mock.calls.find(([strings]) =>
      strings.join("").includes("UPDATE constituency_import_rows"),
    );
    const savedPreview = JSON.parse(updateCall[2]);
    expect(savedPreview.currentCodeDetails).toEqual([
      expect.objectContaining({ id: "student-code-1", label: "Student" }),
    ]);
  });

  it("loads only the contact section that the CSV changes", async () => {
    const { POST } = await import("./route.js");
    sqlMock
      .mockResolvedValueOnce([makeContactRow()])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ status: "Ready" }])
      .mockResolvedValueOnce([]);
    blackbaudApiFetchMock.mockResolvedValue({
      value: [{ id: "email-primary", address: "old@example.com", type: "Personal", primary: true }],
    });

    const response = await POST(makeRequest({ scopes: ["contacts"] }), {
      params: { id: "42", rowId: "9" },
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ status: "Ready", complete: true, failedScopes: [] });
    expect(blackbaudApiFetchMock).toHaveBeenCalledTimes(1);
    expect(blackbaudApiFetchMock).toHaveBeenCalledWith(
      "/constituent/v1/constituents/543503/emailaddresses",
      expect.objectContaining({ userId: 7 }),
    );

    const updateCall = sqlMock.mock.calls.find(([strings]) =>
      strings.join("").includes("UPDATE constituency_import_rows"),
    );
    const savedPreview = JSON.parse(updateCall[2]);
    const savedWrites = JSON.parse(updateCall[3]);
    expect(savedPreview.contactSnapshotStatus).toEqual({
      emails: true,
      phones: false,
      addresses: false,
    });
    expect(savedPreview.deferredHydration).toBeNull();
    expect(savedWrites).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "email_address", action: "add" })]),
    );
    expect(savedWrites).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "contact_detail_review" })]),
    );
  });

  it("keeps a partially loaded contact snapshot retryable instead of treating it as complete", async () => {
    const { POST } = await import("./route.js");
    const phoneFailure = new Error("NXT phone endpoint was unavailable.");
    sqlMock
      .mockResolvedValueOnce([makeContactRow({ includePhone: true })])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ status: "Needs Review" }])
      .mockResolvedValueOnce([]);
    blackbaudApiFetchMock
      .mockResolvedValueOnce({
        value: [{ id: "email-primary", address: "old@example.com", type: "Personal", primary: true }],
      })
      .mockRejectedValueOnce(phoneFailure);

    const response = await POST(makeRequest({ scopes: ["contacts"] }), {
      params: { id: "42", rowId: "9" },
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.complete).toBe(false);
    expect(payload.failedScopes).toEqual(["contacts"]);
    expect(blackbaudApiFetchMock).toHaveBeenCalledTimes(2);
    expect(blackbaudApiFetchMock.mock.calls.map(([path]) => path)).toEqual([
      "/constituent/v1/constituents/543503/emailaddresses",
      "/constituent/v1/constituents/543503/phones",
    ]);

    const updateCall = sqlMock.mock.calls.find(([strings]) =>
      strings.join("").includes("UPDATE constituency_import_rows"),
    );
    const savedPreview = JSON.parse(updateCall[2]);
    const savedWrites = JSON.parse(updateCall[3]);
    expect(savedPreview.contactSnapshotStatus).toEqual({
      emails: true,
      phones: false,
      addresses: false,
    });
    expect(savedPreview.deferredHydration).toMatchObject({ contacts: true });
    expect(savedWrites).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "contact_detail_review",
          pendingKinds: ["phones"],
          requiresReview: true,
        }),
      ]),
    );
  });
});
