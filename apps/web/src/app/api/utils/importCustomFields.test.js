import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("./blackbaud", () => ({ blackbaudApiFetch: vi.fn() }));
vi.mock("./sql", () => ({ default: vi.fn() }));
import { applyImportCustomField, importCustomFieldCatalog, prepareImportCustomField, readImportCustomFields } from "./importCustomFields";
import { customFieldWrite } from "@/utils/importCustomFields";

const input = { category: "Prospect Research", value: "The Center", date: "2026-11-13", comment: "Reviewed" };
const category = { name: input.category, dataType: "Text" };
const context = { user: { id: 7 }, origin: "https://example.com", constituentId: "123" };
const record = { id: "88", parent_id: "123", category: input.category, value: input.value, date: input.date, comment: input.comment };
const row = { id: 9, matched_blackbaud_constituent_id: "123", preview: { input: { customField: input } } };
const args = () => ({ request: new Request("https://example.com/import"), user: context.user, row, write: customFieldWrite(input, category, [], []) });
let fetcher, db, fields, posted, claims;
beforeEach(() => {
  fields = []; posted = false; claims = [];
  db = vi.fn(async (strings, ...values) => {
    const query = strings.join("?");
    if (query.includes("INSERT INTO")) {
      if (claims.length) return [];
      claims.push(values); return [{ row_id: row.id }];
    }
    if (query.includes("DELETE FROM")) claims = [];
    return [];
  });
  fetcher = vi.fn(async (path, options = {}) => {
    if (options.method === "POST") { posted = true; fields = [record]; return { id: record.id }; }
    if (path.endsWith("categories/details")) return [{ category: category.name, type: category.dataType }];
    if (path.endsWith("categories/values")) return [input.value];
    if (path.endsWith("/123/customfields")) return { count: fields.length, value: fields };
    throw new Error(`Unexpected test request ${path}`);
  });
});
describe("NXT custom field import safety", () => {
  it("adds exactly once with typed data, then reads back before success", async () => {
    expect(await applyImportCustomField(args(), fetcher, db)).toMatchObject({ status: "applied", action: "add", customFieldId: "88" });
    const writes = fetcher.mock.calls.filter(([, options]) => options.method);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toEqual(["/constituent/v1/constituents/customfields", expect.objectContaining({ method: "POST", maxRetries: 0, body: { constituent_id: "123", category: input.category, text_value: input.value, date: input.date, comment: input.comment } })]);
    expect(claims).toHaveLength(0);
  });
  it("skips the exact field without posting", async () => {
    fields = [record];
    expect(await applyImportCustomField(args(), fetcher, db)).toMatchObject({ status: "applied", action: "skip_existing" });
    expect(posted).toBe(false);
  });
  it("holds conflicting values without posting or replacing anything", async () => {
    fields = [{ ...record, value: "Other" }];
    expect(await applyImportCustomField(args(), fetcher, db)).toMatchObject({ status: "manual_required" });
    expect(posted).toBe(false);
    expect(db).not.toHaveBeenCalled();
  });
  it("uses a durable claim to stop concurrent imports", async () => {
    claims = [["123", "prospectresearch", 10]];
    expect(await applyImportCustomField(args(), fetcher, db)).toMatchObject({ status: "manual_required", message: expect.stringContaining("original import") });
    expect(posted).toBe(false);
    expect(claims).toHaveLength(1);
  });
  it("checks again after acquiring the claim and holds an intervening conflict", async () => {
    db.mockImplementationOnce(async () => { fields = [{ ...record, value: "Changed" }]; return [{ row_id: 9 }]; });
    expect(await applyImportCustomField(args(), fetcher, db)).toMatchObject({ status: "manual_required" });
    expect(posted).toBe(false);
    expect(db.mock.calls.some(([strings]) => strings.join("").includes("DELETE"))).toBe(true);
  });
  it.each(["value", "date", "comment", "category"])("rejects a changed saved %s", async (key) => {
    const parameters = args(); parameters.write[key] = "changed";
    expect((await applyImportCustomField(parameters, fetcher, db)).status).toBe("manual_required");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("holds changed category metadata before a write", async () => {
    const original = fetcher.getMockImplementation();
    fetcher.mockImplementation((path, options) => path.endsWith("categories/details") ? [{ category: category.name, type: "Table" }] : original(path, options));
    expect((await applyImportCustomField(args(), fetcher, db)).status).toBe("manual_required");
    expect(posted).toBe(false);
  });
  it.each([400, 401, 403, 404, 409, 422, 429])("releases a confirmed rejected POST (%s), without retrying", async (httpStatus) => {
    const original = fetcher.getMockImplementation();
    fetcher.mockImplementation((path, options) => options?.method === "POST" ? Promise.reject(Object.assign(new Error("Rejected"), { httpStatus })) : original(path, options));
    await expect(applyImportCustomField(args(), fetcher, db)).rejects.toMatchObject({ httpStatus });
    expect(claims).toHaveLength(0);
    expect(fetcher.mock.calls.filter(([, options]) => options.method === "POST")).toHaveLength(1);
  });
  it.each([0, 500, 502])("retains the claim for uncertain POST (%s) and never repeats it", async (httpStatus) => {
    const original = fetcher.getMockImplementation();
    fetcher.mockImplementation((path, options) => options?.method === "POST" ? Promise.reject(Object.assign(new Error("Uncertain"), { httpStatus })) : original(path, options));
    await expect(applyImportCustomField(args(), fetcher, db)).rejects.toMatchObject({ importWriteUnconfirmed: true, retrySafe: false });
    expect(claims).toHaveLength(1);
    expect((await applyImportCustomField(args(), fetcher, db)).status).toBe("manual_required");
    expect(fetcher.mock.calls.filter(([, options]) => options.method === "POST")).toHaveLength(1);
  });
  it.each(["no-id", "missing", "duplicate", "read-forbidden"])("holds an accepted but unverified addition: %s", async (failure) => {
    const original = fetcher.getMockImplementation();
    fetcher.mockImplementation(async (path, options) => {
      if (posted && path.endsWith("/123/customfields")) {
        if (failure === "read-forbidden") throw Object.assign(new Error("Forbidden read"), { httpStatus: 403 });
        return { value: failure === "duplicate" ? [record, { ...record, id: "89" }] : [] };
      }
      const result = await original(path, options);
      return options?.method === "POST" && failure === "no-id" ? {} : result;
    });
    await expect(applyImportCustomField(args(), fetcher, db)).rejects.toMatchObject({ importWriteUnconfirmed: true, retrySafe: false });
    expect(claims).toHaveLength(1);
  });
  it.each([{}, { value: [], count: 1 }, { value: [], next_link: "next" }, { value: [], next: "next" }, { value: [], links: { next: "next" } }, { value: [record, record] }, { value: [{ ...record, parent_id: "999" }] }, { value: [{ ...record, constituent_id: "999" }] }, { value: [{ ...record, id: "" }] }])("fails closed on incomplete or conflicting current fields: %j", async (payload) => {
    await expect(readImportCustomFields(context, vi.fn().mockResolvedValue(payload))).rejects.toThrow();
  });
  it("excludes protected, unsupported, and inactive categories", async () => {
    const catalog = await importCustomFieldCatalog(context, vi.fn().mockResolvedValue([
      { category: "Relationship Originator", type: "Text" }, { category: "MGOGPT", type: "Table" },
      { category: "Retired", type: "Text", inactive: true }, { category: "Person", type: "Constituent" }, { category: "Allowed", type: "Text" },
    ]));
    expect(catalog.map((item) => item.name)).toEqual(["Allowed"]);
  });
  it.each([[{ category: "One", type: "Text" }, { category: "one", type: "Text" }], [{}]].map((payload) => [payload]))("rejects ambiguous catalog rows", async (payload) => {
    await expect(importCustomFieldCatalog(context, vi.fn().mockResolvedValue(payload))).rejects.toThrow();
  });
  it("does not create new table values", async () => {
    const original = fetcher.getMockImplementation();
    fetcher.mockImplementation((path, options) => path.endsWith("categories/details") ? [{ category: category.name, type: "Table" }] : original(path, options));
    await expect(prepareImportCustomField({ ...input, value: "New choice" }, context, fetcher)).rejects.toThrow(/existing/);
    expect(posted).toBe(false);
  });
});
