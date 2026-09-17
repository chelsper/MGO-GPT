import { beforeEach, expect, it, vi } from "vitest";
import { DEFAULT_ORGANIZATION_SETTINGS as defaults, getOrganizationConfiguration, getOrganizationSettingsHistory, saveOrganizationSettings } from "./organizationSettings";

const revision = "2026-09-17T16:00:00.000123Z";
let sql;
beforeEach(() => { sql = vi.fn().mockResolvedValue([{ ...defaults, revision }]); });
const save = (settings = { ...defaults, applicationName: "Test Hub" }, version = revision) =>
  saveOrganizationSettings({ settings, userId: 7, expectedRevision: version, sqlClient: sql });

it("reports stored profile and release-managed policy separately", async () => {
  sql.mockResolvedValueOnce([{ ...defaults, timeZone: "UTC", revision }]);
  const result = await getOrganizationConfiguration(sql);
  expect(result.settings.timeZone).toBe("UTC");
  expect(result.reportingPolicy.timeZone).toBe("America/New_York");
  expect(result.revision).toBe(revision);
});

it("requires the loaded revision and rejects stale writers before mutation", async () => {
  for (const version of [null, "older"]) await expect(save(undefined, version)).rejects.toMatchObject({ status: 409 });
  expect(sql.mock.calls.every(([query]) => !query.join("").includes("UPDATE"))).toBe(true);
});

it.each([['fiscalYearStartMonth', 1], ['timeZone', 'UTC'], ['currencyCode', 'CAD'], ['dateFormat', 'YYYY-MM-DD']])("guards %s from silently changing reports", async (field, value) => {
  await expect(save({ ...defaults, [field]: value })).rejects.toMatchObject({ status: 400 });
  expect(sql).toHaveBeenCalledTimes(1);
});

it("writes the audit and version-guarded update atomically, retaining protected fields", async () => {
  sql.mockResolvedValueOnce([{ ...defaults, revision }]).mockResolvedValueOnce([{ ...defaults, applicationName: "Test Hub", revision: "new", change: { id: 1 } }]);
  const result = await save();
  expect(result.settings.applicationName).toBe("Test Hub");
  expect(result.revision).toBe("new");
  const [parts, ...values] = sql.mock.calls[1];
  const query = parts.join("?");
  expect(query).toContain("WITH updated AS");
  expect(query).toContain("INSERT INTO organization_settings_audits");
  expect(query).toContain("AND updated_at = ?::timestamptz");
  expect(query).not.toMatch(/(?:time_zone|fiscal_year_start_month|currency_code|date_format)\s*=/);
  expect(values).toContain(JSON.stringify(defaults));
  expect(values).toContain(JSON.stringify(['applicationName']));
});

it("does not report success if another writer won or the audit failed", async () => {
  sql.mockResolvedValueOnce([{ ...defaults, revision }]).mockResolvedValueOnce([]);
  await expect(save()).rejects.toMatchObject({ status: 409 });
  sql.mockResolvedValueOnce([{ ...defaults, revision }]).mockRejectedValueOnce(new Error("audit unavailable"));
  await expect(save()).rejects.toThrow("audit unavailable");
});

it("does not create an audit for a no-op", async () => {
  expect((await save(defaults)).revision).toBe(revision);
  expect(sql).toHaveBeenCalledTimes(1);
});

it("returns only bounded audit metadata, not previous notification addresses", async () => {
  await getOrganizationSettingsHistory(sql);
  const query = sql.mock.calls[0][0].join("");
  expect(query).toContain("LIMIT 10");
  expect(query).not.toMatch(/previous_settings|a\.settings|email/);
});

it("does not accept arbitrary query IDs or invalid label payloads", async () => {
  for (const extra of [{ pledgeQueryId: '999' }, { shortName: 'this-is-too-long' }, { terminology: { mgo: '<x>\nunsafe' } }]) {
    await expect(save({ ...defaults, ...extra })).rejects.toMatchObject({ status: 400 });
  }
  expect(sql).not.toHaveBeenCalled();
});
