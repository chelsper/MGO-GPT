import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ sql: vi.fn(), nxt: vi.fn(), auth: vi.fn(), user: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mock.auth }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: async () => {} }));
vi.mock("@/app/api/utils/getWorkspaceUser", () => ({ default: mock.user }));
vi.mock("@/app/api/utils/sql", () => ({ default: mock.sql }));
vi.mock("@/app/api/utils/blackbaud", () => ({ blackbaudApiFetch: mock.nxt }));
import { POST } from "./route";
import { importWritePlanKey } from "@/utils/importWriteResults";
import { isImportVerificationComplete } from "@/utils/importCompletion";

let row, live, queries, race;
const send = (body = { rowIds: ["9"], completeIfMatches: true }) => POST(new Request("https://example.test/api/constituency-import/runs/42/reconcile", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
}), { params: { id: "42" } });
const setWrites = (writes) => {
  row.requested_writes = writes;
  row.preview.writePlan = writes;
  row.blackbaud_result.writePlanKey = importWritePlanKey(writes);
};
const expectReadOnly = () => expect(mock.nxt.mock.calls.every(([, options]) => !options.method || options.method === "GET")).toBe(true);

beforeEach(() => {
  race = false; queries = [];
  mock.auth.mockReset().mockResolvedValue({ user: { email: "reviewer@example.test" } });
  mock.user.mockReset().mockResolvedValue({ sessionUser: { id: 7, email: "reviewer@example.test", role: "reviewer" } });
  const writes = [
    { type: "constituent_code", action: "add", targetConstituency: "Student", startDate: "2026-09-11", endDate: "2030-06-30" },
    { type: "email_address", action: "add", address: "JANE@EXAMPLE.EDU", emailType: "Email - JU", makePrimary: true },
    { type: "email_address", action: "add", address: "jane@example.test", emailType: "Preferred Email 1" },
    { type: "phone", action: "add", number: "904-555-1212", phoneType: "Cell Phone", makePrimary: true },
    { type: "address", action: "add", addressLine1: "100 Oak Street", city: "Jacksonville", state: "FL", postalCode: "32211", country: "US", addressType: "Home", makePrimary: true },
    { type: "education_relationship", action: "add", institution: "Jacksonville University", schoolType: "Four Year College", classYear: "2030", status: "Current Student" },
  ];
  row = {
    id: "9", run_id: "42", row_number: 1, status: "Needs Review", applied_at: "2026-09-11T15:00:00Z",
    matched_blackbaud_constituent_id: "123", matched_lookup_id: "702300", created_blackbaud_constituent_id: "123",
    create_request_started_at: "2026-09-11T14:00:00Z", quick_create_status: "created",
    blackbaud_error: "The contact was saved, but NXT has not confirmed it as primary.",
    preview: { input: {}, match: { blackbaudConstituentId: "123", lookupId: "702300", firstName: "Jane", lastName: "Dolphin", name: "Jane Dolphin" } },
    blackbaud_result: { results: writes.map((write, writeIndex) => ({ type: write.type, action: write.action, writeIndex,
      status: writeIndex === 3 ? "manual_required" : "applied", ...(writeIndex === 3 ? { partialApplied: true } : {}) })),
      attempts: [{ startedAt: "2026-09-11T15:00:00Z", results: [{ writeIndex: 0, status: "applied" }] }],
    },
  };
  setWrites(writes);
  live = {
    identity: { id: "123", lookup_id: "702300", first: "Jane", last: "Dolphin", name: "Jane Dolphin" },
    constituentcodes: { value: [{ id: "c1", description: "Student", start: { y: 2026, m: 9, d: 11 }, end: { y: 2030, m: 6, d: 30 } }] },
    emailaddresses: { value: [{ id: "e1", address: "jane@example.edu", type: "Email - JU", primary: true }, { id: "e2", address: "jane@example.test", type: "Preferred Email 1", primary: false }] },
    phones: { value: [{ id: "p1", number: "(904) 555-1212", type: "Cell Phone", primary: true }] },
    addresses: { value: [{ id: "a1", address_lines: ["100 Oak St"], city: "Jacksonville", state: "Florida", postal_code: "32211", country: "United States", type: "Home", primary: true }] },
    educations: { value: [{ id: "edu1", school: "Jacksonville University", type: "Four Year College", class_of: 2030, status: "Current Student" }] },
  };
  mock.nxt.mockReset().mockImplementation(async (path, options) => {
    if (options.method && options.method !== "GET") throw new Error("Verification must never write to NXT");
    const key = path === "/constituent/v1/constituents/123" ? "identity" : path.split("/").at(-1);
    if (!(key in live)) throw new Error(`Unexpected read: ${path}`);
    if (live[key] instanceof Error) throw live[key];
    return structuredClone(live[key]);
  });
  mock.sql.mockReset().mockImplementation(async (strings, ...values) => {
    const query = strings.join(" ");
    queries.push({ query, values });
    if (query.includes("UPDATE constituency_import_rows")) {
      const [audit, complete, , , id, runId, status, preview, writes, target, previousAudit, appliedAt] = values;
      if (race || id !== row.id || runId !== row.run_id || status !== row.status || preview !== JSON.stringify(row.preview) ||
          writes !== JSON.stringify(row.requested_writes) || target !== row.matched_blackbaud_constituent_id ||
          previousAudit !== JSON.stringify(row.blackbaud_result) || appliedAt !== row.applied_at) return [];
      row.blackbaud_result = JSON.parse(audit);
      if (complete) { row.status = "Applied"; row.blackbaud_error = null; row.applied_at ||= "2026-09-11T16:00:00Z"; }
      return [{ id: row.id, status: row.status, applied_at: row.applied_at }];
    }
    if (query.includes("UPDATE constituency_import_runs")) return [];
    if (query.includes("FROM constituency_import_runs")) return [{ id: "42" }];
    if (query.includes("FROM constituency_import_rows")) {
      const complete = values[2];
      return row.status === "Applied" && row.applied_at || complete && ["Needs Review", "Failed"].includes(row.status) ? [structuredClone(row)] : [];
    }
    throw new Error(`Unexpected SQL: ${query}`);
  });
});

describe("verify in NXT and finish an attempted standard import", () => {
  it("finishes the two-pass creation/detail case, preserving the send audit without resending", async () => {
    const original = structuredClone(row.blackbaud_result);
    const appliedAt = row.applied_at;
    const response = await send();
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.reconciliationSummary).toMatchObject({ completedRows: 1, confirmed: 6, needsReview: 0 });
    expect(payload.reconciliationSummary.message).toContain("No changes were sent to NXT");
    expect(row.status).toBe("Applied");
    expect(row.applied_at).toBe(appliedAt);
    expect(row.blackbaud_error).toBeNull();
    expect(row.blackbaud_result.results).toEqual(original.results);
    expect(row.blackbaud_result.attempts).toEqual(original.attempts);
    expect(row.blackbaud_result.completion).toMatchObject({ method: "verified_existing_nxt", completedByUserId: 7,
      previousStatus: "Needs Review", previousError: expect.stringContaining("not confirmed"), nxtWritesSent: 0 });
    expect(isImportVerificationComplete(row)).toBe(true);
    expectReadOnly();
    expect(mock.nxt.mock.calls.filter(([path]) => path.endsWith("emailaddresses"))).toHaveLength(1);
    const save = queries.find(({ query }) => query.includes("UPDATE constituency_import_rows"));
    expect(save.query).toContain("status NOT IN ('Applying', 'Creating')");
    for (const field of ["preview", "requested_writes", "matched_blackbaud_constituent_id", "blackbaud_result", "applied_at"]) {
      expect(save.query).toContain(`${field} IS NOT DISTINCT FROM`);
    }
    const summary = queries.find(({ query }) => query.includes("UPDATE constituency_import_runs"));
    expect(summary.query).toContain("status NOT IN ('Applied', 'Skipped')");
    expect(summary.query).toContain("COALESCE(r.summary");
  });

  it.each(["Needs Review", "Failed"])("can verify unknown outcomes on a known target from %s", async (status) => {
    row.status = status; row.applied_at = null;
    row.blackbaud_result.results[3].status = "unconfirmed";
    const response = await send();
    expect(response.status).toBe(200);
    expect(row.status).toBe("Applied");
    expect(row.applied_at).toBeTruthy();
    expectReadOnly();
  });

  it.each([
    ["phone not primary", () => { live.phones.value[0].primary = false; }],
    ["phone missing", () => { live.phones.value = []; }],
    ["different phone", () => { live.phones.value[0].number = "9045551213"; }],
    ["different phone type", () => { live.phones.value[0].type = "Business"; }],
    ["duplicate phones", () => { live.phones.value.push({ ...live.phones.value[0], id: "p2" }); }],
    ["another primary", () => { live.phones.value.push({ id: "p2", number: "9045559999", primary: true }); }],
    ["missing email", () => { live.emailaddresses.value.pop(); }],
    ["wrong constituency end date", () => { live.constituentcodes.value[0].end = { y: 2029, m: 6, d: 30 }; }],
    ["wrong constituency start date", () => { live.constituentcodes.value[0].start = { y: 2025, m: 9, d: 11 }; }],
    ["wrong address city", () => { live.addresses.value[0].city = "Tampa"; }],
    ["wrong address ZIP", () => { live.addresses.value[0].postal_code = "33602"; }],
    ["wrong class year", () => { live.educations.value[0].class_of = 2029; }],
    ["wrong education status", () => { live.educations.value[0].status = "Graduated"; }],
    ["wrong school type", () => { live.educations.value[0].type = "High School"; }],
    ["incomplete phone list", () => { live.phones.count = 2; }],
    ["paginated email list", () => { live.emailaddresses.next_link = "/more"; }],
    ["malformed phones", () => { live.phones = {}; }],
    ["failed NXT read", () => { live.phones = new Error("NXT connection unavailable"); }],
  ])("keeps review open for %s", async (_, change) => {
    change();
    const originalError = row.blackbaud_error;
    const response = await send();
    expect(response.status).toBe(200);
    const summary = (await response.json()).reconciliationSummary;
    expect(summary.completedRows).toBe(0);
    expect(summary.needsReview).toBeGreaterThan(0);
    expect(row.status).toBe("Needs Review");
    expect(row.blackbaud_error).toBe(originalError);
    expect(row.blackbaud_result.completion).toBeUndefined();
    expect(isImportVerificationComplete(row)).toBe(false);
    expectReadOnly();
  });

  it("verifies requested cleanup of the previous primary before finishing", async () => {
    setWrites([{ ...row.requested_writes[3], existingPrimaryId: "old", demoteExistingPrimary: true, demotedPrimaryType: "Other" }]);
    live.phones.value.push({ id: "old", number: "9045559999", type: "Cell Phone", primary: false });
    await send();
    expect(row.status).toBe("Needs Review");
    live.phones.value[1].type = "Other";
    await send();
    expect(row.status).toBe("Applied");
    expectReadOnly();
  });

  it("a second read can finish a corrected record without another send", async () => {
    live.phones.value[0].primary = false;
    await send();
    expect(row.status).toBe("Needs Review");
    live.phones.value[0].primary = true;
    await send();
    expect(row.status).toBe("Applied");
    expect(row.blackbaud_result.reconciliation.attempts).toHaveLength(2);
    expectReadOnly();
  });

  it("ordinary re-verification does not resurrect a resolved partial-write hold", async () => {
    await send();
    await send({ rowIds: ["9"] });
    expect(row.status).toBe("Applied");
    expect(isImportVerificationComplete(row)).toBe(true);
    expect(row.blackbaud_result.results[3].status).toBe("manual_required");
    expectReadOnly();
  });

  it("preserves unknown write types and organization comparisons for review", async () => {
    setWrites([{ type: "unsupported" }, { type: "organization_relationship", name: "Example" }]);
    const response = await send();
    expect((await response.json()).reconciliationSummary).toMatchObject({ completedRows: 0, needsReview: 2 });
    expect(row.status).toBe("Needs Review");
  });

  it.each(["lookup_id", "first"])("holds a changed saved identity: %s", async (field) => {
    live.identity[field] = "changed";
    await send();
    expect(row.status).toBe("Needs Review");
    expect(row.blackbaud_result.reconciliation.needsReviewCount).toBe(6);
    expect(mock.nxt).toHaveBeenCalledTimes(1);
  });

  it.each(["Ready", "Applying", "Creating", "Skipped"])("cannot finish a %s row", async (status) => {
    row.status = status;
    expect((await send()).status).toBe(409);
    expect(mock.nxt).not.toHaveBeenCalled();
  });

  it.each(["no history", "changed plan", "unknown creation", "missing target"])("rejects %s before NXT reads", async (scenario) => {
    if (scenario === "no history") row.blackbaud_result = {};
    if (scenario === "changed plan") row.requested_writes[3].number = "different";
    if (scenario === "unknown creation") row.created_blackbaud_constituent_id = null;
    if (scenario === "missing target") { row.matched_blackbaud_constituent_id = null; row.preview.match = null; }
    expect((await send()).status).toBe(409);
    expect(mock.nxt).not.toHaveBeenCalled();
  });

  it("does not falsely complete when the saved row changes during verification", async () => {
    race = true;
    expect((await send()).status).toBe(409);
    expect(row.status).toBe("Needs Review");
    expect(row.blackbaud_result.completion).toBeUndefined();
    expect(queries.some(({ query }) => query.includes("UPDATE constituency_import_runs"))).toBe(false);
    expectReadOnly();
  });

  it("requires explicit one-record completion, and does not expose held rows to the old audit-only endpoint", async () => {
    expect((await send({ rowIds: ["9", "10"], completeIfMatches: true })).status).toBe(400);
    expect((await send({ rowIds: ["9"] })).status).toBe(409);
    expect(mock.nxt).not.toHaveBeenCalled();
  });

  it.each([401, 403])("requires an authenticated reviewer: %s", async (status) => {
    if (status === 401) mock.auth.mockResolvedValue(null);
    else mock.user.mockResolvedValue({ sessionUser: { id: 7, role: "mgo" } });
    expect((await send()).status).toBe(status);
    expect(mock.sql).not.toHaveBeenCalled();
    expect(mock.nxt).not.toHaveBeenCalled();
  });
});
