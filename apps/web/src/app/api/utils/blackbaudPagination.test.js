import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn(async (strings) => strings.join("").includes("FROM blackbaud_connections") ? [{ access_token: "test-token" }] : []) }));
import { executeBlackbaudListQuery, listBlackbaudActions } from "./blackbaud";
import { buildStandingsActionQuery } from "./standingsActionQuery";
const options = { authUserId: 1, origin: "https://example.org", requireComplete: true, maxPages: 1 };
beforeEach(() => { vi.stubGlobal("fetch", vi.fn()); vi.stubEnv("BLACKBAUD_SUBSCRIPTION_KEY", "test-subscription"); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it("rejects a legacy action list with an unconsumed next page", async () => {
  fetch.mockResolvedValue(Response.json({ value: [{ id: "1" }], next_link: "https://api.sky.blackbaud.com/constituent/v1/actions?offset=1" }));
  await expect(listBlackbaudActions(options)).rejects.toMatchObject({ code: "NXT_INCOMPLETE_RESULTS" });
});
it("follows action pages and accepts the last complete page", async () => {
  fetch.mockResolvedValueOnce(Response.json({ value: [{ id: "1" }], next_link: "https://api.sky.blackbaud.com/constituent/v1/actions?offset=1" })).mockResolvedValueOnce(Response.json({ value: [{ id: "2" }] }));
  expect(await listBlackbaudActions({ ...options, maxPages: 2 })).toEqual([{ id: "1" }, { id: "2" }]);
  expect(fetch).toHaveBeenCalledTimes(2);
});
it("rejects a list query with an unconsumed continuation token", async () => {
  fetch.mockResolvedValue(Response.json({ items: [{ id: "1" }], continuation_token: "next-page" }));
  await expect(executeBlackbaudListQuery({ ...options, dataModelName: "renxt-action" })).rejects.toMatchObject({ code: "NXT_INCOMPLETE_RESULTS" });
});
it("follows query continuation tokens without changing the query definition", async () => {
  const definition = buildStandingsActionQuery({ fundraiserIds: ["101", "102"], startsOn: "2026-07-01", endsOn: "2027-06-30" });
  fetch.mockResolvedValueOnce(Response.json({ items: [{ id: "1" }], continuation_token: "next-page" })).mockResolvedValueOnce(Response.json({ items: [{ id: "2" }] }));
  expect(await executeBlackbaudListQuery({ ...options, maxPages: 2, dataModelName: "renxt-action", definition })).toEqual([{ id: "1" }, { id: "2" }]);
  expect(JSON.parse(fetch.mock.calls[0][1].body).definition).toEqual(definition);
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toMatchObject({ continuation_token: "next-page", definition });
  expect(String(fetch.mock.calls[0][0])).toBe("https://api.sky.blackbaud.com/lst-lists/executequery");
});
it.each(["Pending", "Failed"])("rejects a %s job instead of treating it as zero actions", async (status) => {
  fetch.mockResolvedValue(Response.json({ status, items: [] }));
  await expect(executeBlackbaudListQuery({ ...options, dataModelName: "renxt-action" })).rejects.toMatchObject({ code: "NXT_INCOMPLETE_RESULTS" });
});
it("rejects malformed successful payloads rather than treating them as no activity", async () => {
  fetch.mockImplementation(async () => Response.json({ unexpected: true }));
  await expect(listBlackbaudActions(options)).rejects.toMatchObject({ code: "NXT_INCOMPLETE_RESULTS" });
  await expect(executeBlackbaudListQuery({ ...options, dataModelName: "renxt-action" })).rejects.toMatchObject({ code: "NXT_INCOMPLETE_RESULTS" });
});
