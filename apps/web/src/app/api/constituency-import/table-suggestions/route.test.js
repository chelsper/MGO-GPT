import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const ensureAppSchemaMock = vi.fn();
const getWorkspaceUserMock = vi.fn();
const blackbaudApiFetchMock = vi.fn();

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: ensureAppSchemaMock }));
vi.mock("@/app/api/utils/getWorkspaceUser", () => ({ default: getWorkspaceUserMock }));
vi.mock("@/app/api/utils/blackbaud", () => ({ blackbaudApiFetch: blackbaudApiFetchMock }));

function makeRequest(body) {
  return new Request("https://example.com/api/constituency-import/table-suggestions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("constituency import table suggestions", () => {
  beforeEach(() => {
    authMock.mockReset();
    ensureAppSchemaMock.mockReset();
    getWorkspaceUserMock.mockReset();
    blackbaudApiFetchMock.mockReset();
    authMock.mockResolvedValue({ user: { email: "reviewer@example.com" } });
    ensureAppSchemaMock.mockResolvedValue();
    getWorkspaceUserMock.mockResolvedValue({
      sessionUser: { id: 7, email: "reviewer@example.com", role: "reviewer" },
    });
  });

  it("suggests organization-specific NXT degree values without changing the CSV value", async () => {
    const { POST } = await import("./route.js");
    blackbaudApiFetchMock.mockResolvedValue({
      value: [{ description: "Bachelor of Science" }, { description: "Master of Science" }],
    });

    const response = await POST(
      makeRequest({ fieldKey: "educationDegree", value: "Bachelors Science" }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(blackbaudApiFetchMock).toHaveBeenCalledWith(
      "/constituent/v1/educations/degrees",
      expect.objectContaining({ userId: 7, authUserId: 7 }),
    );
    expect(payload.sourceValue).toBe("Bachelors Science");
    expect(payload.suggestions[0]).toMatchObject({ value: "Bachelor of Science", exact: false });
  });

  it("does not offer a lookup for arbitrary CSV fields", async () => {
    const { POST } = await import("./route.js");
    const response = await POST(
      makeRequest({ fieldKey: "addressLine1", value: "2800 University Blvd" }),
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toContain("does not use an NXT table lookup");
    expect(blackbaudApiFetchMock).not.toHaveBeenCalled();
  });

  it("blocks MGO users", async () => {
    const { POST } = await import("./route.js");
    getWorkspaceUserMock.mockResolvedValue({
      sessionUser: { id: 9, email: "mgo@example.com", role: "mgo" },
    });

    const response = await POST(
      makeRequest({ fieldKey: "educationDegree", value: "Bachelor of Science" }),
    );

    expect(response.status).toBe(403);
    expect(blackbaudApiFetchMock).not.toHaveBeenCalled();
  });
});
