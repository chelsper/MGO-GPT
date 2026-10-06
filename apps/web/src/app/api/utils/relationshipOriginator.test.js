import { beforeEach, expect, it, vi } from "vitest";
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("./sql", () => ({ default: vi.fn() }));
vi.mock("./getOrCreateUser", () => ({ default: vi.fn() }));
vi.mock("./blackbaud", () => ({ blackbaudApiFetch: vi.fn(), getBlackbaudFundraiserById: vi.fn(),
  listBlackbaudConstituentCustomFieldCategories: vi.fn(), listBlackbaudConstituentCustomFieldCategoryValues: vi.fn() }));
import { saveOriginator, originatorReview, readOriginatorCollection, readConstituentOriginators, checkOriginatorRequest } from "./relationshipOriginator";
import { blackbaudApiFetch } from "./blackbaud";
import { originatorFingerprint } from "./relationshipOriginatorModel";
const user = { id: 1, name: "Ada", role: "mgo", active: true, blackbaud_constituent_id: "101" };
const field = { id: "71", constituentId: null, value: "Ada Fundraiser", date: "2026-07-01", comment: "keep" };
let db, read, fetcher, args, pending;
beforeEach(() => {
  pending = null;
  db = vi.fn(async (parts, ...values) => {
    const query = parts.join("?");
    if (query.includes("FROM users")) return [user, { id: 2, name: "Other", role: "mgo", active: true, blackbaud_constituent_id: "102" }];
    if (query.includes("INSERT INTO relationship_originator_changes")) {
      if (pending) return [];
      pending = { id: 4, constituent_id: values[0], owner_user_id: values[1], originator_name: values[3],
        origin_date: values[4], remote_field_id: values[7], state: "pending" };
      return [pending];
    }
    if (query.includes("SELECT * FROM relationship_originator_changes")) return pending ? [pending] : [];
    if (query.includes("state = 'confirmed'")) { pending = null; return [{ id: 4 }]; }
    return [];
  });
  read = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValue([field]);
  fetcher = vi.fn().mockResolvedValue({ id: "71" });
  args = { user, constituentId: "200", options: { userId: 1, authUserId: 1, origin: "https://app.example" },
    input: { ownerUserId: "1", originDate: "2026-07-01", fingerprint: originatorFingerprint([]) }, db, read, fetcher,
    fundraiserLookup: vi.fn().mockResolvedValue({ name: "Ada Fundraiser", fundraiserStatus: "Active" }),
    categories: vi.fn().mockResolvedValue([{ name: "Relationship Originator", type: "Text" }]),
    categoryValues: vi.fn(),
  };
});
it("creates one field using the verified NXT identity, confirms it and preserves audit history", async () => {
  await expect(saveOriginator(args)).resolves.toMatchObject({ fields: [field] });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher).toHaveBeenCalledWith("/constituent/v1/constituents/customfields", expect.objectContaining({
    method: "POST", maxRetries: 0, body: { parent_id: "200", category: "Relationship Originator", text_value: "Ada Fundraiser", date: "2026-07-01" },
  }));
  expect(db.mock.calls.some(([parts]) => parts.join("").includes("previous_fields"))).toBe(true);
});
it("uses table payloads only after checking the exact NXT table option", async () => {
  args.categories.mockResolvedValue([{ name: "Relationship Originator", type: "Table" }]);
  args.categoryValues.mockResolvedValue(["Ada Fundraiser"]);
  await saveOriginator(args);
  expect(fetcher.mock.calls[0][1].body.codetableentry_value).toBe("Ada Fundraiser");
});
it.each(["executive", "advancement_services", ""])("does not let %s claim an originator", async role => {
  await expect(saveOriginator({ ...args, user: { ...user, role } })).rejects.toMatchObject({ status: 403 });
  expect(fetcher).not.toHaveBeenCalled();
});
it("prevents MGO impersonation and editing existing attribution", async () => {
  await expect(saveOriginator({ ...args, input: { ...args.input, ownerUserId: 2 } })).rejects.toMatchObject({ status: 403 });
  args.read = vi.fn().mockResolvedValue([field]); args.input.fingerprint = originatorFingerprint([field]);
  await expect(saveOriginator(args)).rejects.toMatchObject({ status: 403 });
  expect(fetcher).not.toHaveBeenCalled();
});
it("requires an Admin correction reason and uses PATCH without overwriting NXT comments", async () => {
  args.user = { ...user, role: "admin" }; args.read = vi.fn().mockResolvedValue([field]);
  args.input.fingerprint = originatorFingerprint([field]);
  await expect(saveOriginator(args)).rejects.toThrow("reason");
  args.input.reason = "Correct introduction date";
  await saveOriginator(args);
  expect(fetcher).toHaveBeenCalledWith("/constituent/v1/constituents/customfields/71", expect.objectContaining({
    method: "PATCH", maxRetries: 0, body: { text_value: "Ada Fundraiser", date: "2026-07-01" },
  }));
});
it("rejects stale forms before making a durable claim", async () => {
  args.input.fingerprint = "stale";
  await expect(saveOriginator(args)).rejects.toThrow("changed");
  expect(fetcher).not.toHaveBeenCalled(); expect(pending).toBe(null);
});
it("rechecks NXT after claiming and cancels safely if another writer changed it", async () => {
  args.read = vi.fn().mockResolvedValueOnce([]).mockResolvedValue([field]);
  await expect(saveOriginator(args)).rejects.toThrow("changed");
  expect(fetcher).not.toHaveBeenCalled();
  expect(db.mock.calls.some(([parts, state]) => parts.join("").includes("UPDATE relationship_originator_changes") && state === "not_sent")).toBe(true);
});
it("does not create if the DB claim fails", async () => {
  args.db = vi.fn(async parts => { if (parts.join("").includes("INSERT")) throw new Error("offline"); return [user]; });
  await expect(saveOriginator(args)).rejects.toThrow(); expect(fetcher).not.toHaveBeenCalled();
});
it.each(["timeout", "400", "429"])("never replays an uncertain/rejected create (%s)", async message => {
  fetcher.mockRejectedValue(new Error(message));
  await expect(saveOriginator(args)).rejects.toThrow("will not send it again");
  args.read = vi.fn().mockResolvedValue([]);
  await expect(saveOriginator(args)).rejects.toThrow("already being checked");
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("keeps an unverified successful response locked and uses read-only verification to resolve it", async () => {
  args.read = vi.fn().mockResolvedValue([]);
  await expect(saveOriginator(args)).rejects.toThrow("may already be in NXT");
  const result = await originatorReview({ ...args, read: vi.fn().mockResolvedValue([field]) });
  expect(result.unresolved).toBe(false); expect(result.canClaim).toBe(false);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("holds the claim when verification is empty or duplicated", async () => {
  pending = { id: 4, originator_name: field.value, origin_date: field.date };
  for (const fields of [[], [field, { ...field, id: "72" }]]) {
    const result = await originatorReview({ ...args, read: vi.fn().mockResolvedValue(fields) });
    expect(result.unresolved).toBe(true); expect(result.canClaim).toBe(false);
  }
});
it("follows only complete same-endpoint pagination and avoids forwarding credentials to another host", async () => {
  const path = "/constituent/v1/constituents/customfields";
  const loader = vi.fn().mockResolvedValueOnce({ value: [{ id: "1" }], next_link: `${path}?offset=1` })
    .mockResolvedValueOnce({ value: [{ id: "2" }], count: 2 });
  expect(await readOriginatorCollection(path, {}, { category: "Relationship Originator" }, loader)).toHaveLength(2);
  for (const payload of [{ value: [], next_link: "https://evil.example/" }, { value: [], count: 1 }, {}]) {
    const load = vi.fn().mockResolvedValue(payload);
    await expect(readOriginatorCollection(path, {}, {}, load)).rejects.toThrow("incomplete");
    expect(load).toHaveBeenCalledTimes(1);
  }
});
it("rejects cross-origin writes and non-JSON submissions", () => {
  expect(() => checkOriginatorRequest(new Request("https://app.example/test", { headers: { origin: "https://other.example", "Content-Type": "application/json" } }))).toThrow();
  expect(() => checkOriginatorRequest(new Request("https://app.example/test"))).toThrow();
});
it("deduplicates identical custom-field rows without inventing an extra originator", async () => {
  const row = { id: "71", parent_id: "200", category: "Relationship Originator", value: "Ada", date: "2026-07-01" };
  blackbaudApiFetch.mockResolvedValue({ value: [row, { ...row }] });
  expect(await readConstituentOriginators("200", {})).toHaveLength(1);
});
it.each(["missing ID", "wrong constituent", "conflicting duplicate"])("rejects unsafe originator output: %s", async problem => {
  const row = { id: "71", parent_id: "200", category: "Relationship Originator", value: "Ada", date: "2026-07-01" };
  const rows = problem === "missing ID" ? [{ ...row, id: undefined }]
    : problem === "wrong constituent" ? [{ ...row, parent_id: "201" }]
      : [row, { ...row, value: "Other" }];
  blackbaudApiFetch.mockResolvedValue({ value: rows });
  await expect(readConstituentOriginators("200", {})).rejects.toThrow("conflicting constituent custom fields");
});
