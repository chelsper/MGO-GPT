import { afterEach, beforeEach, expect, it, vi } from "vitest";

const { sql, refreshUser } = vi.hoisted(() => ({
  sql: vi.fn(),
  refreshUser: vi.fn(),
}));
vi.mock("./sql", () => ({ default: sql }));
vi.mock("./reportRefresh", () => ({ getReportRefreshUser: refreshUser }));
import { readSetupStatus } from "./setupStatus";

let saved;
const read = () => readSetupStatus({ viewerId: 7, isAdmin: false });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Provider calls are forbidden");
    }),
  );
  for (const key of [
    "BLACKBAUD_CLIENT_ID",
    "BLACKBAUD_CLIENT_SECRET",
    "BLACKBAUD_SUBSCRIPTION_KEY",
  ])
    vi.stubEnv(key, "secret-value");
  refreshUser.mockResolvedValue({
    id: 8,
    name: "Scheduled Admin",
    role: "admin",
  });
  saved = {
    organization_settings: [
      {
        institution_name: "Example University",
        application_name: "Example",
        short_name: "EX",
        terminology: { mgo: "Fundraiser" },
      },
    ],
    blackbaud_connections: [{ has_access: true, has_refresh: true }],
    users: [
      { role: "mgo", has_system_id: true },
      { role: "admin,mgo", has_system_id: true },
      { role: "executive", has_system_id: false },
    ],
    report_configurations: [{ dashboards: 2, enabled: 1, built_ins: 3 }],
  };
  sql.mockImplementation(async (strings) => {
    const query = strings.join(" ");
    expect(query.trim()).toMatch(/^SELECT /);
    expect(query).not.toMatch(/\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP)\b/);
    const table = query.match(/FROM (\w+)/)[1];
    if (saved[table] instanceof Error) throw saved[table];
    return saved[table];
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("reads only saved metadata and never returns credentials, IDs or constituent data", async () => {
  const data = await read();
  expect(data).toMatchObject({
    version: 1,
    viewerId: "7",
    isAdmin: false,
    sections: {
      organization: { state: "ready" },
      connection: { state: "ready" },
      fundraisers: { state: "ready" },
      sources: { state: "technical" },
      reports: { state: "ready" },
    },
  });
  expect(data.sections.fundraisers.summary).toContain("2 of 2");
  expect(data.sections.reports.summary).toContain(
    "2 custom dashboards saved (1 enabled)",
  );
  expect(data.sections.organization.details.join(" ")).toContain("Fundraiser");
  expect(JSON.stringify(data)).not.toContain("secret-value");
  expect(fetch).not.toHaveBeenCalled();
  expect(sql).toHaveBeenCalledTimes(4);
  const queries = sql.mock.calls
    .map(([strings]) => strings.join(" "))
    .join(" ");
  expect(queries).toContain("FROM users WHERE active = TRUE");
  expect(queries).not.toMatch(/SELECT \*|constituent_name|SELECT access_token/);
});

it("does not treat stored preferences or saved definitions as active reporting policies or query validation", async () => {
  const { sections } = await read();
  expect(sections.sources.details.join(" ")).toContain(
    "query 12033, Gift records, QRECID",
  );
  expect(sections.sources.details.join(" ")).toContain(
    "July 1; America/New_York; USD",
  );
  expect(sections.reports.details.join(" ")).toContain(
    "not report data, query validity, or audience correctness",
  );
  expect(sections.connection.details.join(" ")).toContain(
    "do not prove current NXT permissions",
  );
});

it("reports missing saved values without inventing completed setup", async () => {
  saved.organization_settings = [];
  saved.report_configurations = [{ dashboards: 0, enabled: 0, built_ins: 0 }];
  saved.users = [];
  refreshUser.mockResolvedValue(null);
  const { sections } = await read();
  for (const key of ["organization", "connection", "fundraisers", "reports"])
    expect(sections[key].state).toBe("needs_setup");
});

it("counts only active MGO-role workspaces and does not accept Lookup ID alone", async () => {
  saved.users = [
    { role: "mgo", has_system_id: true },
    { role: "mgo", has_system_id: false, blackbaud_lookup_id: "123" },
    { role: "admin", has_system_id: false },
  ];
  const { sections } = await read();
  expect(sections.fundraisers.state).toBe("needs_setup");
  expect(sections.fundraisers.summary).toContain("1 of 2");
});

it.each([
  { rows: [] },
  { rows: [{ has_access: true, has_refresh: false }] },
  { rows: [{ has_access: false, has_refresh: true }] },
])("does not claim a renewable connection for $rows", async ({ rows }) => {
  saved.blackbaud_connections = rows;
  expect((await read()).sections.connection.state).toBe("needs_setup");
});

it("reports missing deployment credentials without trying NXT or exposing values", async () => {
  vi.stubEnv("BLACKBAUD_SUBSCRIPTION_KEY", "");
  expect((await read()).sections.connection.state).toBe("technical");
  expect(refreshUser).not.toHaveBeenCalled();
});

it("does not accept an unsupported scheduled-account role", async () => {
  refreshUser.mockResolvedValue({ id: 8, role: "mgo" });
  expect((await read()).sections.connection.state).toBe("technical");
});

it.each([
  "organization_settings",
  "users",
  "blackbaud_connections",
  "report_configurations",
])(
  "isolates a failed %s read as unknown, not ready or empty",
  async (table) => {
    saved[table] = new Error("secret DB details");
    const data = await read();
    expect(
      Object.values(data.sections).filter(
        (section) => section.state === "unknown",
      ),
    ).toHaveLength(1);
    expect(data.sections.sources.state).toBe("technical");
    expect(JSON.stringify(data)).not.toContain("secret DB");
  },
);

it.each([undefined, null, "", true, -1, "invalid", 1.5])(
  "treats malformed aggregate %s as unknown",
  async (dashboards) => {
    saved.report_configurations = [{ dashboards, enabled: 0, built_ins: 0 }];
    expect((await read()).sections.reports.state).toBe("unknown");
  },
);

it("handles failed connection-owner metadata separately", async () => {
  refreshUser.mockRejectedValue(new Error("private failure"));
  const data = await read();
  expect(data.sections.connection.state).toBe("unknown");
  expect(data.sections.reports.state).toBe("ready");
});
