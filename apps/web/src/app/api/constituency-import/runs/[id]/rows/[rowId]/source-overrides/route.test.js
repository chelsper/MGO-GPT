import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const ensureAppSchemaMock = vi.fn();
const getWorkspaceUserMock = vi.fn();
const sqlMock = vi.fn();

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: ensureAppSchemaMock }));
vi.mock("@/app/api/utils/getWorkspaceUser", () => ({ default: getWorkspaceUserMock }));
vi.mock("@/app/api/utils/sql", () => ({ default: sqlMock }));

function makeEducationRow() {
  return {
    id: "9",
    run_id: "42",
    status: "Needs Review",
    preview: {
      input: {
        educationRelationship: {
          institution: "Jacksonville University",
          major: "Atr",
          minor: "Writing",
        },
      },
      writePlan: [
        {
          type: "education_relationship",
          action: "update",
          targetEducationId: "60502",
          major: "Atr",
          minor: "Writing",
        },
      ],
    },
    requested_writes: [
      {
        type: "education_relationship",
        action: "update",
        targetEducationId: "60502",
        major: "Atr",
        minor: "Writing",
      },
    ],
  };
}

function makeAddressRow() {
  return {
    id: "9",
    run_id: "42",
    status: "Ready",
    preview: {
      input: {
        addressUpdates: [
          {
            addressLine1: "15795 Baxetr Creek Dr.",
            addressLine2: "",
            city: "Jacksonville",
            state: "FL",
            postalCode: "32218",
            country: "United States",
            type: "Home",
            makePrimary: true,
          },
        ],
      },
      currentContacts: { emails: [], phones: [], addresses: [] },
      contactSnapshotStatus: { emails: true, phones: true, addresses: true },
      contactsSnapshotLoaded: true,
      writePlan: [],
    },
    requested_writes: [],
  };
}

function makeRequest(body) {
  return new Request(
    "https://example.com/api/constituency-import/runs/42/rows/9/source-overrides",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
  );
}

describe("constituency import source overrides route", () => {
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

  it("persists a corrected education major without an NXT call", async () => {
    const { POST } = await import("./route.js");
    sqlMock
      .mockResolvedValueOnce([makeEducationRow()])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ status: "Needs Review" }])
      .mockResolvedValueOnce([]);

    const response = await POST(
      makeRequest({ education: { major: "Art", minor: "Writing" } }),
      { params: { id: "42", rowId: "9" } },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe("Needs Review");
    expect(payload.message).toMatch(/uploaded CSV and all NXT records remain unchanged/i);

    const updateCall = sqlMock.mock.calls.find(([strings]) =>
      strings.join("").includes("UPDATE constituency_import_rows"),
    );
    const savedPreview = JSON.parse(updateCall[2]);
    const savedWritePlan = JSON.parse(updateCall[3]);
    expect(savedPreview.input.educationRelationship.major).toBe("Art");
    expect(savedPreview.csvOverrides.education.major).toMatchObject({
      originalValue: "Atr",
      correctedValue: "Art",
      correctedByUserId: 7,
    });
    expect(savedWritePlan).toEqual([
      expect.objectContaining({ type: "education_relationship", action: "update", major: "Art" }),
    ]);
  });

  it("rebuilds the staged address write after a street-line correction", async () => {
    const { POST } = await import("./route.js");
    sqlMock
      .mockResolvedValueOnce([makeAddressRow()])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ status: "Ready" }])
      .mockResolvedValueOnce([]);

    const response = await POST(
      makeRequest({
        addressUpdates: [
          {
            addressLine1: "15795 Baxter Creek Dr.",
            addressLine2: "",
            city: "Jacksonville",
            state: "FL",
            postalCode: "32218",
            country: "United States",
          },
        ],
      }),
      { params: { id: "42", rowId: "9" } },
    );

    expect(response.status).toBe(200);
    const updateCall = sqlMock.mock.calls.find(([strings]) =>
      strings.join("").includes("UPDATE constituency_import_rows"),
    );
    const savedPreview = JSON.parse(updateCall[2]);
    const savedWritePlan = JSON.parse(updateCall[3]);
    expect(savedPreview.input.addressUpdates[0].addressLine1).toBe("15795 Baxter Creek Dr.");
    expect(savedPreview.csvOverrides.addresses["0"].addressLine1).toMatchObject({
      originalValue: "15795 Baxetr Creek Dr.",
      correctedValue: "15795 Baxter Creek Dr.",
    });
    expect(savedWritePlan).toEqual([
      expect.objectContaining({ type: "address", action: "add", addressLine1: "15795 Baxter Creek Dr." }),
    ]);
  });

  it("rejects a blank street line before saving a correction", async () => {
    const { POST } = await import("./route.js");
    sqlMock.mockResolvedValueOnce([makeAddressRow()]);

    const response = await POST(
      makeRequest({ addressUpdates: [{ addressLine1: "" }] }),
      { params: { id: "42", rowId: "9" } },
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toMatch(/Address Line 1 is required/i);
    expect(sqlMock).toHaveBeenCalledTimes(1);
  });
});
