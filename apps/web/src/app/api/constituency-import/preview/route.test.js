import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const ensureAppSchemaMock = vi.fn();
const getWorkspaceUserMock = vi.fn();
const blackbaudApiFetchMock = vi.fn();
const findBlackbaudConstituentByLookupIdMock = vi.fn();
const getBlackbaudConstituentByIdMock = vi.fn();
const searchBlackbaudConstituentsMock = vi.fn();

vi.mock("@/auth", () => ({
  auth: authMock,
}));

vi.mock("@/app/api/utils/ensureAppSchema", () => ({
  default: ensureAppSchemaMock,
}));

vi.mock("@/app/api/utils/getWorkspaceUser", () => ({
  default: getWorkspaceUserMock,
}));

vi.mock("@/app/api/utils/blackbaud", () => ({
  blackbaudApiFetch: blackbaudApiFetchMock,
  findBlackbaudConstituentByLookupId: findBlackbaudConstituentByLookupIdMock,
  getBlackbaudConstituentById: getBlackbaudConstituentByIdMock,
  searchBlackbaudConstituents: searchBlackbaudConstituentsMock,
}));

function makeRequest(body) {
  return new Request("https://example.com/api/constituency-import/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const mappings = {
  constituentName: "Name",
  blackbaudConstituentId: "NXT ID",
  lookupId: "Lookup ID",
  email: "Email",
  sourceConstituency: "Current Constituency",
  targetConstituency: "New Constituency",
  action: "Action",
};

describe("constituency import preview route", () => {
  beforeEach(() => {
    authMock.mockReset();
    ensureAppSchemaMock.mockReset();
    getWorkspaceUserMock.mockReset();
    blackbaudApiFetchMock.mockReset();
    findBlackbaudConstituentByLookupIdMock.mockReset();
    getBlackbaudConstituentByIdMock.mockReset();
    searchBlackbaudConstituentsMock.mockReset();

    authMock.mockResolvedValue({ user: { email: "reviewer@example.com" } });
    ensureAppSchemaMock.mockResolvedValue();
    getWorkspaceUserMock.mockResolvedValue({
      sessionUser: {
        id: 7,
        name: "Reviewer",
        email: "reviewer@example.com",
        role: "reviewer",
      },
      workspaceUser: {
        id: 7,
        name: "Reviewer",
        email: "reviewer@example.com",
        role: "reviewer",
      },
      isActing: false,
    });
  });

  it("blocks non-reviewers", async () => {
    const { POST } = await import("./route.js");
    getWorkspaceUserMock.mockResolvedValue({
      sessionUser: { id: 12, email: "mgo@example.com", role: "mgo" },
      workspaceUser: { id: 12, email: "mgo@example.com", role: "mgo" },
      isActing: false,
    });

    const response = await POST(
      makeRequest({
        rows: [{ Name: "Jane Dolphin" }],
        mappings,
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toContain("Advancement Services");
    expect(getBlackbaudConstituentByIdMock).not.toHaveBeenCalled();
  });

  it("previews a strong ID replacement as ready", async () => {
    const { POST } = await import("./route.js");
    getBlackbaudConstituentByIdMock.mockResolvedValue({
      blackbaudConstituentId: "123",
      lookupId: "A123",
      name: "Jane Dolphin",
      email: "jane@example.com",
    });
    blackbaudApiFetchMock.mockResolvedValue({
      value: [{ description: "Student" }, { description: "Friend" }],
    });

    const response = await POST(
      makeRequest({
        rows: [
          {
            Name: "Jane Dolphin",
            "NXT ID": "123",
            "Current Constituency": "Student",
            "New Constituency": "Alumni - Bachelor's Degree",
            Action: "replace",
          },
        ],
        mappings,
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.summary.ready).toBe(1);
    expect(payload.rows[0].status).toBe("Ready");
    expect(payload.rows[0].matchMethod).toBe("NXT system ID");
    expect(payload.rows[0].currentCodes).toEqual(["Student", "Friend"]);
    expect(payload.rows[0].proposedCodes).toEqual([
      "Alumni - Bachelor's Degree",
      "Friend",
    ]);
  });

  it("places graduate alumni after bachelor alumni", async () => {
    const { POST } = await import("./route.js");
    getBlackbaudConstituentByIdMock.mockResolvedValue({
      blackbaudConstituentId: "234",
      lookupId: "A234",
      name: "Sam Dolphin",
    });
    blackbaudApiFetchMock.mockResolvedValue({
      value: [{ description: "Alumni - Bachelor's Degree" }],
    });

    const response = await POST(
      makeRequest({
        rows: [
          {
            Name: "Sam Dolphin",
            "NXT ID": "234",
            "New Constituency": "Alumni - Graduate Degree",
            Action: "add",
          },
        ],
        mappings,
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.rows[0].status).toBe("Ready");
    expect(payload.rows[0].proposedCodes).toEqual([
      "Alumni - Bachelor's Degree",
      "Alumni - Graduate Degree",
    ]);
  });

  it("keeps email and name matches in review", async () => {
    const { POST } = await import("./route.js");
    searchBlackbaudConstituentsMock.mockResolvedValue([
      {
        blackbaudConstituentId: "345",
        lookupId: "A345",
        name: "Taylor Dolphin",
        email: "taylor@example.com",
      },
    ]);
    blackbaudApiFetchMock.mockResolvedValue({
      value: [{ description: "Student" }],
    });

    const response = await POST(
      makeRequest({
        rows: [
          {
            Name: "Taylor Dolphin",
            Email: "taylor@example.com",
            "Current Constituency": "Student",
            "New Constituency": "Alumni - Bachelor's Degree",
            Action: "replace",
          },
        ],
        mappings: {
          ...mappings,
          blackbaudConstituentId: "",
          lookupId: "",
        },
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.summary.needsReview).toBe(1);
    expect(payload.rows[0].status).toBe("Needs Review");
    expect(payload.rows[0].matchStatus).toBe("needs_review");
    expect(payload.rows[0].reasons.join(" ")).toContain("human review");
  });
});
