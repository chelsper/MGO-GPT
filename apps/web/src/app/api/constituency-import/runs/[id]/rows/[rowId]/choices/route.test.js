import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const ensureAppSchemaMock = vi.fn();
const getWorkspaceUserMock = vi.fn();
const sqlMock = vi.fn();

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: ensureAppSchemaMock }));
vi.mock("@/app/api/utils/getWorkspaceUser", () => ({ default: getWorkspaceUserMock }));
vi.mock("@/app/api/utils/sql", () => ({ default: sqlMock }));

function makeRow() {
  return {
    id: "9",
    run_id: "42",
    status: "Needs Review",
    matched_blackbaud_constituent_id: "543503",
    preview: {
      input: { emailUpdates: [] },
      match: { blackbaudConstituentId: "543503", lookupId: "543503" },
      currentContacts: {
        emails: [
          { id: "email-primary", address: "old@example.com", type: "Email - JU", primary: true },
          { id: "email-new", address: "new@example.com", type: "Preferred Email 1", primary: false },
        ],
        phones: [],
        addresses: [],
      },
      contactSnapshotStatus: { emails: true, phones: true, addresses: true },
      contactsSnapshotLoaded: true,
      deferredHydration: { contacts: true },
      writePlan: [
        {
          type: "contact_detail_review",
          action: "load_current",
          requiresReview: true,
          deferredHydration: true,
        },
      ],
    },
    requested_writes: [
      {
        type: "contact_detail_review",
        action: "load_current",
        requiresReview: true,
        deferredHydration: true,
      },
    ],
  };
}

function makeAddressSkipRow() {
  const row = makeRow();
  row.preview = {
    ...row.preview,
    input: {
      addressUpdates: [
        {
          addressLine1: "1675 Lakemont Avenue",
          city: "Orlando",
          state: "FL",
          postalCode: "32814",
          addressType: "Home",
        },
      ],
    },
    currentContacts: { emails: [], phones: [], addresses: [] },
    contactSnapshotStatus: { emails: false, phones: false, addresses: false },
    contactsSnapshotLoaded: false,
  };
  return row;
}

function makeRequest(body) {
  return new Request(
    "https://example.com/api/constituency-import/runs/42/rows/9/choices",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
  );
}

describe("constituency import review choices route", () => {
  beforeEach(() => {
    authMock.mockReset();
    ensureAppSchemaMock.mockReset();
    getWorkspaceUserMock.mockReset();
    sqlMock.mockReset();

    authMock.mockResolvedValue({ user: { email: "reviewer@example.com" } });
    ensureAppSchemaMock.mockResolvedValue();
    getWorkspaceUserMock.mockResolvedValue({
      sessionUser: { id: 7, email: "reviewer@example.com", role: "reviewer" },
    });
  });

  it("persists an existing-email primary selection without calling NXT or rebuilding the import", async () => {
    const { POST } = await import("./route.js");
    sqlMock
      .mockResolvedValueOnce([makeRow()])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ status: "Ready" }])
      .mockResolvedValueOnce([]);

    const response = await POST(
      makeRequest({
        saveContactDecisions: true,
        contactDecisions: {
          email: {
            __section: {
              existingPrimaryTargetId: "email-new",
              demotedPrimaryType: "Former email",
            },
          },
        },
      }),
      { params: { id: "42", rowId: "9" } },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe("Ready");
    expect(payload.writePlan).toEqual([
      expect.objectContaining({
        type: "email_address",
        action: "set_primary",
        targetId: "email-new",
        existingPrimaryId: "email-primary",
        demoteExistingPrimary: true,
        demotedPrimaryType: "Former email",
      }),
    ]);

    const updateCall = sqlMock.mock.calls.find(([strings]) =>
      strings.join("").includes("UPDATE constituency_import_rows"),
    );
    expect(updateCall).toBeTruthy();
    const savedPreview = JSON.parse(updateCall[2]);
    expect(savedPreview.contactReviewDecisions).toMatchObject({
      email: { __section: { existingPrimaryTargetId: "email-new" } },
    });
    expect(savedPreview.deferredHydration).toBeNull();
  });

  it("clears a deferred address review when the reviewer selects take no action", async () => {
    const { POST } = await import("./route.js");
    sqlMock
      .mockResolvedValueOnce([makeAddressSkipRow()])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ status: "Skipped" }])
      .mockResolvedValueOnce([]);

    const response = await POST(
      makeRequest({
        saveContactDecisions: true,
        contactDecisions: {
          address: {
            0: { mode: "skip" },
          },
        },
      }),
      { params: { id: "42", rowId: "9" } },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe("Skipped");
    expect(payload.writePlan).toEqual([]);
    expect(payload.preview.deferredHydration).toBeNull();

    const updateCall = sqlMock.mock.calls.find(([strings]) =>
      strings.join("").includes("UPDATE constituency_import_rows"),
    );
    const savedPreview = JSON.parse(updateCall[2]);
    expect(savedPreview.contactReviewDecisions).toMatchObject({
      address: { 0: { mode: "skip" } },
    });
    expect(savedPreview.writePlan).toEqual([]);
  });
});
