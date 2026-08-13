import { beforeEach, describe, expect, it, vi } from "vitest";
import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import sql from "@/app/api/utils/sql";
import { blackbaudApiFetch, getBlackbaudConfigIssues } from "@/app/api/utils/blackbaud";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/app/api/utils/ensureAppSchema", () => ({
  default: vi.fn(),
}));

vi.mock("@/app/api/utils/getWorkspaceUser", () => ({
  default: vi.fn(),
}));

vi.mock("@/app/api/utils/sql", () => ({
  default: vi.fn(),
}));

vi.mock("@/app/api/utils/blackbaud", () => ({
  blackbaudApiFetch: vi.fn(),
  getBlackbaudConfigIssues: vi.fn(() => []),
  listBlackbaudGifts: vi.fn(),
}));

const baseArgs = {
  educationRecords: [],
  spouseSummary: null,
  primaryBusinessRelationship: null,
  lifetimeGiving: null,
};

function entry(label, dates = {}) {
  return {
    label,
    normalized: label.toLowerCase(),
    start: dates.start || null,
    end: dates.end || null,
  };
}

describe("Blackbaud constituent summary identity language", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getBlackbaudConfigIssues.mockReturnValue([]);
  });

  it("uses gendered alumna language for bachelor's alumni", async () => {
    const { buildIdentitySentence } = await import("./route.js");

    expect(
      buildIdentitySentence({
        ...baseArgs,
        constituent: { name: "Chelsea Santoro", gender: "Female" },
        constituencyEntries: [entry("Alumni - Bachelor's Degree")],
      }),
    ).toBe("Chelsea Santoro is a JU alumna.");
  });

  it("uses Double Dolphin language instead of listing undergraduate and graduate alumni separately", async () => {
    const { buildIdentitySentence } = await import("./route.js");

    expect(
      buildIdentitySentence({
        ...baseArgs,
        constituent: { name: "Jordan Dolphin" },
        constituencyEntries: [
          entry("Alumni - Bachelor's Degree"),
          entry("Alumni - Graduate Degree"),
        ],
      }),
    ).toBe(
      "Jordan Dolphin is a Double Dolphin, having earned both undergraduate and graduate degrees from JU.",
    );
  });

  it("distinguishes current and former employees using active constituency dates", async () => {
    const { buildIdentitySentence } = await import("./route.js");

    expect(
      buildIdentitySentence({
        ...baseArgs,
        constituent: { name: "Leslie Redd" },
        constituencyEntries: [entry("Employee")],
        primaryBusinessRelationship: {
          organizationName: "Jacksonville University",
          position: "Vice President",
        },
      }),
    ).toBe("Leslie Redd is a current JU employee, serving as vice president.");

    expect(
      buildIdentitySentence({
        ...baseArgs,
        constituent: { name: "Former Employee" },
        constituencyEntries: [entry("Employee", { end: "2024-06-30" })],
      }),
    ).toBe("Former Employee previously worked at JU.");
  });

  it("uses Society of Trustees only when there is no active trustee constituency", async () => {
    const { buildIdentitySentence } = await import("./route.js");

    expect(
      buildIdentitySentence({
        ...baseArgs,
        constituent: { name: "Pat Trustee" },
        constituencyEntries: [entry("Former Trustee", { end: "2022-05-31" })],
      }),
    ).toBe("Pat Trustee is a member of JU's Society of Trustees.");

    expect(
      buildIdentitySentence({
        ...baseArgs,
        constituent: { name: "Current Trustee" },
        constituencyEntries: [
          entry("Former Trustee", { end: "2022-05-31" }),
          entry("Trustee"),
        ],
      }),
    ).toBe("Current Trustee currently serves on Jacksonville University's Board of Trustees.");
  });

  it("uses parent dates only when present on the parent constituency", async () => {
    const { buildIdentitySentence } = await import("./route.js");

    expect(
      buildIdentitySentence({
        ...baseArgs,
        constituent: { name: "Parent Current" },
        constituencyEntries: [entry("Parent - Current", { end: "2028" })],
      }),
    ).toBe(
      "Parent Current is the parent of a current JU student expected to graduate in 2028.",
    );

    expect(
      buildIdentitySentence({
        ...baseArgs,
        constituent: { name: "Parent Former" },
        constituencyEntries: [entry("Parent - Former", { start: "2021" })],
      }),
    ).toBe("Parent Former is the parent of a JU graduate from 2021.");
  });

  it("classifies friends with giving as supporters and friends without giving as prospects", async () => {
    const { buildIdentitySentence } = await import("./route.js");

    expect(
      buildIdentitySentence({
        ...baseArgs,
        constituent: { name: "Giving Friend" },
        constituencyEntries: [entry("Friend")],
        lifetimeGiving: { totalGiving: 250 },
      }),
    ).toBe("Giving Friend is a donor and supporter of JU.");

    expect(
      buildIdentitySentence({
        ...baseArgs,
        constituent: { name: "Prospect Friend" },
        constituencyEntries: [entry("Friend")],
        lifetimeGiving: { totalGiving: 0 },
      }),
    ).toBe("Prospect Friend is currently a prospect.");
  });

  it("does not invent a JU relationship sentence for sparse placeholder records", async () => {
    const { buildIdentitySentence } = await import("./route.js");

    expect(
      buildIdentitySentence({
        ...baseArgs,
        constituent: { name: "Dolphin Dasher 12 Anonymous" },
        constituencyEntries: [entry("Individual")],
        lifetimeGiving: { totalGiving: 0 },
      }),
    ).toBeNull();

    expect(
      buildIdentitySentence({
        ...baseArgs,
        constituent: { name: "Sparse Record" },
        constituencyEntries: [],
        lifetimeGiving: { totalGiving: 0 },
      }),
    ).toBeNull();
  });

  it("loads only primary contact details when contact_only is requested", async () => {
    auth.mockResolvedValue({ user: { email: "mgo@ju.edu" } });
    ensureAppSchema.mockResolvedValue();
    getWorkspaceUser.mockResolvedValue({
      workspaceUser: { id: 42 },
      sessionUser: { id: 42 },
      isActing: false,
    });
    sql.mockResolvedValue([]);
    blackbaudApiFetch.mockResolvedValue({
      id: "5044931",
      lookup_id: "5044931",
      name: "Armando M. Codina",
      email: { address: "acodina@example.com", primary: true },
      phone: { number: "904-555-0100", primary: true },
      address: {
        formatted_address: "50 Casuarina Concourse, Miami, FL 33143",
        preferred: true,
      },
    });

    const { GET } = await import("./route.js");
    const response = await GET(
      new Request(
        "https://jumgogpt.app/api/blackbaud/constituents/5044931/summary?contact_only=true",
      ),
      { params: { constituentId: "5044931" } },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      constituentId: "5044931",
      mapped: {
        constituent: {
          email: "acodina@example.com",
          phone: "904-555-0100",
          address: "50 Casuarina Concourse, Miami, FL 33143",
        },
      },
    });
    expect(blackbaudApiFetch).toHaveBeenCalledTimes(1);
  });

  it("loads only constituent identity when identity_only is requested", async () => {
    auth.mockResolvedValue({ user: { email: "mgo@ju.edu" } });
    ensureAppSchema.mockResolvedValue();
    getWorkspaceUser.mockResolvedValue({
      workspaceUser: { id: 42 },
      sessionUser: { id: 42 },
      isActing: false,
    });
    sql.mockResolvedValue([]);
    blackbaudApiFetch.mockResolvedValue({
      id: "5044931",
      lookup_id: "5044931",
      name: "Armando M. Codina",
      email: { address: "acodina@example.com", primary: true },
    });

    const { GET } = await import("./route.js");
    const response = await GET(
      new Request(
        "https://jumgogpt.app/api/blackbaud/constituents/5044931/summary?identity_only=true",
      ),
      { params: { constituentId: "5044931" } },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        constituentId: "5044931",
        mapped: {
          constituent: {
            id: "5044931",
            lookupId: "5044931",
            name: "Armando M. Codina",
            type: null,
          },
        },
      }),
    );
    expect(blackbaudApiFetch).toHaveBeenCalledTimes(1);
  });
});
