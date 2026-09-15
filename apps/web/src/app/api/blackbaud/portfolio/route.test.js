import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const ensureAppSchemaMock = vi.fn();
const getWorkspaceUserMock = vi.fn();
const getOrCreateUserMock = vi.fn();
const sqlMock = vi.fn();
const blackbaudApiFetchMock = vi.fn();
const findBlackbaudConstituentByLookupIdMock = vi.fn();
const findBlackbaudConstituentByEmailMock = vi.fn();
const getBlackbaudConstituentByIdMock = vi.fn();
const getBlackbaudConfigIssuesMock = vi.fn();
const listBlackbaudFundraiserAssignmentsMock = vi.fn();
const searchBlackbaudConstituentsMock = vi.fn();

const savedContacts = {
  name: "Saved Donor", email: "saved@example.com", phone: "904-555-0199", address: "100 Saved Street",
};

function mockSavedPortfolio({ people, contacts = [], localRows = [], contactError = null }) {
  const cachedAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  sqlMock.mockImplementation(async (strings) => {
    const query = strings.join("?");
    if (query.includes("FROM users")) return [{
      blackbaud_portfolio_cache: {
        leadSolicitor: people, supportingSolicitor: [],
        summary: { leadCount: people.length, supportingCount: 0 },
        portfolioMeta: { assignmentDataStatus: "live" },
      },
      blackbaud_portfolio_cache_key: "v13:800", blackbaud_portfolio_cached_at: cachedAt,
    }];
    if (query.includes("WITH saved_contacts")) {
      if (contactError) throw contactError;
      return contacts;
    }
    if (query.includes("WITH local_portfolio_records")) return localRows;
    return [];
  });
  return cachedAt;
}

function expectNoNxtReads() {
  expect(blackbaudApiFetchMock).not.toHaveBeenCalled();
  expect(getBlackbaudConstituentByIdMock).not.toHaveBeenCalled();
  expect(listBlackbaudFundraiserAssignmentsMock).not.toHaveBeenCalled();
  expect(findBlackbaudConstituentByLookupIdMock).not.toHaveBeenCalled();
  expect(findBlackbaudConstituentByEmailMock).not.toHaveBeenCalled();
  expect(searchBlackbaudConstituentsMock).not.toHaveBeenCalled();
}

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({
  default: ensureAppSchemaMock,
}));
vi.mock("@/app/api/utils/getWorkspaceUser", () => ({
  default: getWorkspaceUserMock,
}));
vi.mock("@/app/api/utils/getOrCreateUser", () => ({
  default: getOrCreateUserMock,
}));
vi.mock("@/app/api/utils/sql", () => ({ default: sqlMock }));
vi.mock("@/app/api/utils/blackbaud", () => ({
  blackbaudApiFetch: blackbaudApiFetchMock,
  findBlackbaudConstituentByLookupId: findBlackbaudConstituentByLookupIdMock,
  findBlackbaudConstituentByEmail: findBlackbaudConstituentByEmailMock,
  getBlackbaudConstituentById: getBlackbaudConstituentByIdMock,
  getBlackbaudConfigIssues: getBlackbaudConfigIssuesMock,
  listBlackbaudFundraiserAssignments: listBlackbaudFundraiserAssignmentsMock,
  listBlackbaudConstituents: vi.fn(),
  searchBlackbaudConstituents: searchBlackbaudConstituentsMock,
}));

describe("Blackbaud portfolio route", () => {
  beforeEach(() => {
    authMock.mockReset();
    ensureAppSchemaMock.mockReset();
    getWorkspaceUserMock.mockReset();
    getOrCreateUserMock.mockReset();
    sqlMock.mockReset();
    blackbaudApiFetchMock.mockReset();
    findBlackbaudConstituentByLookupIdMock.mockReset();
    findBlackbaudConstituentByEmailMock.mockReset();
    getBlackbaudConstituentByIdMock.mockReset();
    getBlackbaudConfigIssuesMock.mockReset();
    listBlackbaudFundraiserAssignmentsMock.mockReset();
    searchBlackbaudConstituentsMock.mockReset();

    authMock.mockResolvedValue({ user: { email: "mgo@example.com" } });
    ensureAppSchemaMock.mockResolvedValue();
    getOrCreateUserMock.mockResolvedValue({ id: 9 });
    getBlackbaudConfigIssuesMock.mockReturnValue([]);
    getWorkspaceUserMock.mockResolvedValue({
      sessionUser: { id: 9, email: "mgo@example.com" },
      workspaceUser: {
        id: 9,
        email: "mgo@example.com",
        blackbaud_constituent_id: "800",
      },
      isActing: false,
    });
    sqlMock.mockResolvedValue([]);
    findBlackbaudConstituentByLookupIdMock.mockResolvedValue(null);
    findBlackbaudConstituentByEmailMock.mockResolvedValue(null);
    getBlackbaudConstituentByIdMock.mockResolvedValue(null);
    searchBlackbaudConstituentsMock.mockResolvedValue([]);
    listBlackbaudFundraiserAssignmentsMock.mockResolvedValue([
      {
        constituent_id: "5044931",
        type: "Secondary Solicitor",
        constituent: {
          lookup_id: "5044931",
          name: "Armando M. Codina",
        },
      },
    ]);
  });

  it("returns assignment cards without waiting for NXT details for every constituent", async () => {
    const { GET } = await import("./route.js");

    const response = await GET(
      new Request("https://example.com/api/blackbaud/portfolio"),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.supportingSolicitor[0]).toEqual(
      expect.objectContaining({
        constituentId: "5044931",
        lookupId: "5044931",
        name: "Armando M. Codina",
        assignmentTypes: ["Secondary Solicitor"],
        lifetimeGiving: {
          totalGiving: null,
          totalReceivedGiving: null,
        },
      }),
    );
    expect(payload.supportingSolicitor[0]).not.toHaveProperty("lastGift");
    // Cache lookup, local-data lookup, cached-contact lookup, and cache
    // write. The full NXT constituent summary is fetched only if the user
    // expands a card.
    expect(sqlMock).toHaveBeenCalledTimes(4);
    expect(blackbaudApiFetchMock).not.toHaveBeenCalled();
  });

  it("returns a usable stale portfolio cache immediately", async () => {
    const { GET } = await import("./route.js");
    sqlMock.mockResolvedValueOnce([
      {
        blackbaud_portfolio_cache: {
          leadSolicitor: [],
          supportingSolicitor: [
            {
              constituentId: "5044931",
              name: "Armando M. Codina",
              assignmentTypes: ["Secondary Solicitor"],
            },
          ],
          summary: { leadCount: 0, supportingCount: 1 },
        },
        blackbaud_portfolio_cache_key: "v12:800",
        blackbaud_portfolio_cached_at: new Date(
          Date.now() - 2 * 24 * 60 * 60 * 1000,
        ).toISOString(),
      },
    ]);
    const response = await GET(
      new Request("https://example.com/api/blackbaud/portfolio"),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.supportingSolicitor[0].name).toBe("Armando M. Codina");
    expect(payload.portfolioMeta).toEqual(
      expect.objectContaining({
        source: "stale-cache",
        reason: "cached-portfolio-available",
      }),
    );
    expect(blackbaudApiFetchMock).not.toHaveBeenCalled();
    expect(listBlackbaudFundraiserAssignmentsMock).not.toHaveBeenCalled();
  });

  it("reuses cached NXT contacts without loading a full summary per card", async () => {
    const { GET } = await import("./route.js");
    sqlMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          constituent_id: "5044931",
          constituent: {
                name: "Armando M. Codina",
                email: "acodina@example.com",
                phone: "904-555-0199",
                address: "50 Casuarina Concourse, Miami, FL",
          },
        },
      ])
      .mockResolvedValueOnce([]);

    const response = await GET(
      new Request("https://example.com/api/blackbaud/portfolio"),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.supportingSolicitor[0]).toEqual(
      expect.objectContaining({
        email: "acodina@example.com",
        phone: "904-555-0199",
        address: "50 Casuarina Concourse, Miami, FL",
        contactDataSource: "nxt-summary-cache",
      }),
    );
    expect(blackbaudApiFetchMock).not.toHaveBeenCalled();
  });

  it.each(["nxt-summary-cache", "nxt-portfolio-snapshot"])(
    "merges saved %s contacts into cached assignments without renewing freshness", async (source) => {
      const { GET } = await import("./route.js");
      const original = {
        constituentId: "100", name: "Assigned Donor", contactDataSource: "not-loaded",
        assignmentTypes: ["Lead Solicitor"], lifetimeGiving: { totalGiving: 1000 },
      };
      const cachedAt = mockSavedPortfolio({ people: [original], contacts: [{
        constituent_id: "100", constituent: savedContacts,
        contact_checked_at: "2026-09-15T12:00:00Z", contact_data_source: source,
      }] });
      const response = await GET(new Request("https://example.com/api/blackbaud/portfolio"));
      const payload = await response.json();
      expect(response.status).toBe(200);
      expect(payload.leadSolicitor[0]).toEqual({
        ...original, email: savedContacts.email, phone: savedContacts.phone, address: savedContacts.address,
        contactDataSource: source, contactCheckedAt: "2026-09-15T12:00:00.000Z",
      });
      expect(payload.portfolioMeta).toMatchObject({ cachedAt, source: "stale-cache" });
      expect(payload.summary).toEqual({ leadCount: 1, supportingCount: 0 });
      expect(original).not.toHaveProperty("email");
      expect(sqlMock).toHaveBeenCalledTimes(3);
      expect(sqlMock.mock.calls.some(([strings]) => strings.join("").includes("UPDATE users"))).toBe(false);
      expectNoNxtReads();
    },
  );

  it("filters incomplete and giving-only payloads before selecting the latest contact snapshot", async () => {
    const { GET } = await import("./route.js");
    mockSavedPortfolio({ people: [{ constituentId: "100", name: "Donor" }], contacts: [{
      constituent_id: "100", constituent: savedContacts, contact_checked_at: "2026-09-14T12:00:00Z",
    }] });
    const payload = await (await GET(new Request("https://example.com/api/blackbaud/portfolio"))).json();
    const [strings] = sqlMock.mock.calls.find(([parts]) => parts.join("").includes("WITH saved_contacts"));
    const query = strings.join("?");
    expect(query).toContain("payload #> '{mapped,constituent}' AS constituent");
    expect(query).toContain("summary_payload #> '{mapped,constituent}' AS constituent");
    expect(query).toContain("last_refreshed_at AS contact_checked_at");
    expect(query).toMatch(/SELECT DISTINCT ON \(constituent_id\)[\s\S]*WHERE jsonb_typeof\(constituent\) = 'object'[\s\S]*ORDER BY constituent_id, contact_checked_at DESC NULLS LAST/);
    for (const field of ["email", "phone", "address"]) {
      expect(query).toContain(`jsonb_typeof(constituent -> '${field}') IN ('string', 'null')`);
    }
    expect(query).toContain("constituent ->> 'id' = constituent_id");
    expect(payload.leadSolicitor[0].email).toBe(savedContacts.email);
    expectNoNxtReads();
  });

  it("retains authorizing-connection and workspace scope and queries only assigned IDs", async () => {
    const { GET } = await import("./route.js");
    getWorkspaceUserMock.mockResolvedValue({
      sessionUser: { id: 2, role: "admin" },
      workspaceUser: { id: 44, blackbaud_constituent_id: "800" }, isActing: true,
    });
    mockSavedPortfolio({ people: [{ constituentId: "100", name: "Donor" }] });
    await GET(new Request("https://example.com/api/blackbaud/portfolio"));
    const [strings, ...values] = sqlMock.mock.calls.find(([parts]) => parts.join("").includes("WITH saved_contacts"));
    const query = strings.join("?");
    expect(values).toEqual([44, 2, ["100"], 44, ["100"]]);
    expect(query.match(/workspace_user_id = \?/g)).toHaveLength(2);
    expect(query).toContain("auth_user_id = ?");
    expect(query.match(/constituent_id = ANY\(\?\)/g)).toHaveLength(2);
    expectNoNxtReads();
  });

  it("uses fixed bulk reads for large portfolios instead of per-constituent calls", async () => {
    const { GET } = await import("./route.js");
    mockSavedPortfolio({ people: Array.from({ length: 500 }, (_, index) => ({
      constituentId: String(index + 1), name: `Donor ${index + 1}`,
    })) });
    const payload = await (await GET(new Request("https://example.com/api/blackbaud/portfolio"))).json();
    expect(payload.leadSolicitor).toHaveLength(500);
    expect(sqlMock).toHaveBeenCalledTimes(3);
    expectNoNxtReads();
  });

  it("fills missing contacts from workspace records without requiring NXT summaries", async () => {
    const { GET } = await import("./route.js");
    mockSavedPortfolio({
      people: [{ constituentId: "100", name: "Donor", contactDataSource: "not-loaded" }],
      localRows: [{ blackbaud_constituent_id: "100", ...savedContacts }],
    });
    const payload = await (await GET(new Request("https://example.com/api/blackbaud/portfolio"))).json();
    expect(payload.leadSolicitor[0]).toMatchObject({
      email: savedContacts.email, phone: savedContacts.phone, contactDataSource: "local-workspace-record",
    });
    expect(payload.leadSolicitor[0]).not.toHaveProperty("contactCheckedAt");
    expectNoNxtReads();
  });

  it("keeps confirmed empty contacts empty instead of restoring older local values", async () => {
    const { GET } = await import("./route.js");
    mockSavedPortfolio({
      people: [{ constituentId: "100", name: "Donor", email: "old@example.com" }],
      contacts: [{ constituent_id: "100", constituent: { email: null, phone: null, address: null }, contact_checked_at: "2026-09-15T12:00:00Z" }],
      localRows: [{ blackbaud_constituent_id: "100", ...savedContacts }],
    });
    const payload = await (await GET(new Request("https://example.com/api/blackbaud/portfolio"))).json();
    expect(payload.leadSolicitor[0]).toMatchObject({ email: null, phone: null, address: null, contactDataSource: "nxt-summary-cache" });
    expectNoNxtReads();
  });

  it("preserves last-known contacts if optional database enrichment fails", async () => {
    const { GET } = await import("./route.js");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const person = { constituentId: "100", ...savedContacts, contactDataSource: "nxt-summary-cache", contactCheckedAt: "2026-09-14T12:00:00Z" };
      mockSavedPortfolio({ people: [person], contactError: new Error("Cache temporarily unavailable") });
      const payload = await (await GET(new Request("https://example.com/api/blackbaud/portfolio"))).json();
      expect(payload.leadSolicitor[0]).toEqual(person);
      expectNoNxtReads();
    } finally {
      warn.mockRestore();
    }
  });

  it("does not treat incomplete contact data as a confirmed absence", async () => {
    const { GET } = await import("./route.js");
    mockSavedPortfolio({
      people: [{ constituentId: "100", name: "Donor", email: savedContacts.email }],
      contacts: [{ constituent_id: "100", constituent: { name: "Donor" } }],
    });
    const payload = await (await GET(new Request("https://example.com/api/blackbaud/portfolio"))).json();
    expect(payload.leadSolicitor[0].email).toBe(savedContacts.email);
    expect(payload.leadSolicitor[0].contactDataSource).not.toBe("nxt-summary-cache");
    expectNoNxtReads();
  });

  it("does not regress to an older contact snapshot", async () => {
    const { GET } = await import("./route.js");
    const person = { constituentId: "100", ...savedContacts, contactDataSource: "nxt-summary-cache", contactCheckedAt: "2026-09-15T12:00:00Z" };
    mockSavedPortfolio({ people: [person], contacts: [{
      constituent_id: "100", constituent: { ...savedContacts, email: "old@example.com" }, contact_checked_at: "2026-09-14T12:00:00Z",
    }] });
    const payload = await (await GET(new Request("https://example.com/api/blackbaud/portfolio"))).json();
    expect(payload.leadSolicitor[0]).toEqual(person);
    expectNoNxtReads();
  });

  it("resolves an otherwise unnamed assignment without loading a full summary", async () => {
    const { GET } = await import("./route.js");
    listBlackbaudFundraiserAssignmentsMock.mockResolvedValue([
      {
        constituent_id: "77",
        type: "Lead Solicitor",
      },
    ]);
    getBlackbaudConstituentByIdMock.mockResolvedValue({
      name: "Alex Example",
      lookupId: "A-77",
    });

    const response = await GET(
      new Request("https://example.com/api/blackbaud/portfolio"),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.leadSolicitor[0]).toEqual(
      expect.objectContaining({
        constituentId: "77",
        name: "Alex Example",
        lookupId: "A-77",
      }),
    );
    expect(getBlackbaudConstituentByIdMock).toHaveBeenCalledWith(
      expect.objectContaining({ constituentId: "77" }),
    );
    expect(blackbaudApiFetchMock).not.toHaveBeenCalled();
  });

  it("hydrates unnamed assignments in small persisted batches", async () => {
    const { GET } = await import("./route.js");
    listBlackbaudFundraiserAssignmentsMock.mockResolvedValue(
      Array.from({ length: 5 }, (_, index) => ({
        constituent_id: String(index + 1),
        type: "Lead Solicitor",
      })),
    );
    getBlackbaudConstituentByIdMock.mockImplementation(async ({ constituentId }) => ({
      name: `Constituent ${constituentId}`,
      lookupId: `L-${constituentId}`,
    }));

    const response = await GET(
      new Request("https://example.com/api/blackbaud/portfolio"),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(getBlackbaudConstituentByIdMock).toHaveBeenCalledTimes(4);
    expect(payload.leadSolicitor).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Constituent 1" }),
        expect.objectContaining({ name: "NXT constituent 5" }),
      ]),
    );
    expect(payload.portfolioMeta).toEqual(
      expect.objectContaining({
        identityHydrationPending: true,
        unresolvedIdentityCount: 1,
      }),
    );
  });

  it("excludes deceased assignments before returning portfolio cards", async () => {
    const { GET } = await import("./route.js");
    listBlackbaudFundraiserAssignmentsMock.mockResolvedValue([
      {
        constituent_id: "11",
        type: "Lead Solicitor",
        constituent: { lookup_id: "11", name: "Active Donor" },
      },
      {
        constituent_id: "12",
        type: "Lead Solicitor",
        constituent: {
          lookup_id: "12",
          name: "Deceased Donor",
          deceased: true,
        },
      },
    ]);

    const response = await GET(
      new Request("https://example.com/api/blackbaud/portfolio"),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.leadSolicitor).toEqual([
      expect.objectContaining({ constituentId: "11", name: "Active Donor" }),
    ]);
    expect(payload.summary).toEqual(
      expect.objectContaining({ leadCount: 1, supportingCount: 0 }),
    );
  });

  it("continues unresolved NXT identities from the saved portfolio", async () => {
    const { GET } = await import("./route.js");
    listBlackbaudFundraiserAssignmentsMock.mockResolvedValue(
      Array.from({ length: 5 }, (_, index) => ({
        constituent_id: String(index + 1),
        type: "Lead Solicitor",
      })),
    );
    getBlackbaudConstituentByIdMock.mockImplementation(async ({ constituentId }) => {
      if (String(constituentId) === "1") return null;
      return {
        name: `Constituent ${constituentId}`,
        lookupId: `L-${constituentId}`,
      };
    });

    const firstResponse = await GET(
      new Request("https://example.com/api/blackbaud/portfolio"),
    );
    const firstPayload = await firstResponse.json();

    expect(firstResponse.status).toBe(200);
    expect(firstPayload.leadSolicitor).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          constituentId: "1",
          name: "NXT constituent 1",
          identityLookupRetryAt: expect.any(String),
        }),
        expect.objectContaining({ constituentId: "2", name: "Constituent 2" }),
        expect.objectContaining({ constituentId: "5", name: "NXT constituent 5" }),
      ]),
    );

    const cachedPayload = firstPayload;
    sqlMock.mockReset();
    sqlMock.mockResolvedValue([]);
    sqlMock.mockResolvedValueOnce([
      {
        blackbaud_portfolio_cache: cachedPayload,
        blackbaud_portfolio_cache_key: "v12:800",
        blackbaud_portfolio_cached_at: new Date().toISOString(),
      },
    ]);
    getBlackbaudConstituentByIdMock.mockClear();

    const secondResponse = await GET(
      new Request("https://example.com/api/blackbaud/portfolio"),
    );
    const secondPayload = await secondResponse.json();

    expect(secondResponse.status).toBe(200);
    expect(getBlackbaudConstituentByIdMock).toHaveBeenCalledTimes(1);
    expect(getBlackbaudConstituentByIdMock).toHaveBeenCalledWith(
      expect.objectContaining({ constituentId: "5" }),
    );
    expect(secondPayload.leadSolicitor).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ constituentId: "5", name: "Constituent 5" }),
      ]),
    );
    expect(secondPayload.portfolioMeta).toEqual(
      expect.objectContaining({
        source: "cache",
        identityHydrationPending: true,
        identityHydrationDeferred: false,
        unresolvedIdentityCount: 1,
      }),
    );
  });

  it("accepts a same-fundraiser cache from an earlier cache version", async () => {
    const { GET } = await import("./route.js");
    sqlMock.mockResolvedValueOnce([
      {
        blackbaud_portfolio_cache: {
          leadSolicitor: [{ constituentId: "1", name: "Cached donor" }],
          supportingSolicitor: [],
          summary: { leadCount: 1, supportingCount: 0 },
        },
        blackbaud_portfolio_cache_key: "v11:800",
        blackbaud_portfolio_cached_at: new Date().toISOString(),
      },
    ]);

    const response = await GET(
      new Request("https://example.com/api/blackbaud/portfolio"),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.leadSolicitor).toEqual([
      expect.objectContaining({ constituentId: "1", name: "Cached donor" }),
    ]);
    expect(payload.portfolioMeta).toEqual(
      expect.objectContaining({
        source: "cache",
        cacheKeyMatch: "version-compatible",
      }),
    );
    expect(listBlackbaudFundraiserAssignmentsMock).not.toHaveBeenCalled();
  });

  it("uses locally saved Top Prospects for an unverified empty cache", async () => {
    const { GET } = await import("./route.js");
    sqlMock
      .mockResolvedValueOnce([
        {
          blackbaud_portfolio_cache: {
            leadSolicitor: [],
            supportingSolicitor: [],
            summary: { leadCount: 0, supportingCount: 0 },
          },
          blackbaud_portfolio_cache_key: "v12:800",
          blackbaud_portfolio_cached_at: new Date().toISOString(),
        },
      ])
      .mockResolvedValueOnce([
        {
          blackbaud_constituent_id: "77",
          name: "Saved prospect",
          email: "saved@example.com",
          phone: "904-555-0199",
          updated_at: new Date().toISOString(),
        },
      ]);

    const response = await GET(
      new Request("https://example.com/api/blackbaud/portfolio"),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.leadSolicitor).toEqual([
      expect.objectContaining({
        constituentId: "77",
        name: "Saved prospect",
        assignmentTypes: ["Locally synced Top Prospect"],
      }),
    ]);
    expect(payload.portfolioMeta).toEqual(
      expect.objectContaining({
        source: "local-prospect-snapshot",
        assignmentDataStatus: "unavailable",
        fallbackReason: "unverified-empty-cache",
      }),
    );
    expect(listBlackbaudFundraiserAssignmentsMock).not.toHaveBeenCalled();
    expect(getBlackbaudConstituentByIdMock).not.toHaveBeenCalled();
  });

  it("uses locally saved Top Prospects instead of caching an empty portfolio after an NXT failure", async () => {
    const { GET } = await import("./route.js");
    sqlMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          blackbaud_constituent_id: "77",
          name: "Saved prospect",
          email: "saved@example.com",
          phone: "904-555-0199",
          updated_at: new Date().toISOString(),
        },
      ]);
    listBlackbaudFundraiserAssignmentsMock.mockRejectedValue(
      new Error("Out of call volume quota"),
    );

    const response = await GET(
      new Request("https://example.com/api/blackbaud/portfolio"),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.portfolioMeta).toEqual(
      expect.objectContaining({
        source: "local-prospect-snapshot",
        fallbackReason: "fundraiser-assignments-unavailable",
      }),
    );
    expect(payload.summary).toEqual({ leadCount: 1, supportingCount: 0 });
    expect(sqlMock).toHaveBeenCalledTimes(2);
  });
});
