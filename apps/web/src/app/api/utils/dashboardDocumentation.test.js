import { beforeEach, expect, it, vi } from "vitest";
vi.mock("./sql", () => ({ default: vi.fn(() => { throw new Error("Unexpected database call"); }) }));
vi.mock("./blackbaud", () => ({ blackbaudApiFetch: vi.fn(() => { throw new Error("Unexpected provider call"); }) }));
vi.mock("./societyGivingSource", () => ({ societySourceScope: vi.fn() }));
import { assessDocumentation, documentationPage, checkGiftDocumentation, claimDocumentationCheck, finishDocumentationCheck } from "./dashboardDocumentation";
import { giftPriorityRevision } from "./dashboardGiftPriorities";
const gift = { id: "900", constituent_id: "100", type: "Donation", date: "2026-09-25", amount: { value: 10000 } };
const item = { key: "gift:900", revision: giftPriorityRevision(gift), giftId: "900", constituentId: "100", giftAmount: 10000, kind: "gift" };
const empty = () => ({ count: 0, value: [] });
const action = (type = "Cultivation") => ({ id: "20", constituent_id: "100", type });
const page = (...value) => ({ count: value.length, value });
let deps;
beforeEach(() => {
  deps = { viewerId: 7, workspaceId: 10, origin: "https://example.app", item,
    fetchNxt: vi.fn(async path => path.startsWith("/gift/") ? gift : empty()), resolveScope: vi.fn().mockResolvedValue("connection-1"),
    localCheck: vi.fn().mockResolvedValue(false), claim: vi.fn().mockResolvedValue({ token: "lease" }),
    finish: vi.fn().mockResolvedValue(true), now: () => new Date("2026-09-27T20:00:00Z") };
});
it("asks for review only with complete, identity-checked history on both sources", () => {
  expect(assessDocumentation(empty(), empty(), "100")).toEqual({ status: "review", opportunityCount: 0, actionCount: 0 });
  expect(assessDocumentation(empty(), page(action()), "100")).toMatchObject({ status: "review", actionCount: 1 });
});
it("honors the server's configured threshold without weakening bounded checks", async () => {
  expect(await checkGiftDocumentation({ ...deps, settings: { majorGiftMinimum: 20000 } })).toEqual({ status: "unavailable" });
  expect(deps.claim).not.toHaveBeenCalled(); expect(deps.fetchNxt).not.toHaveBeenCalled();
  const smallGift = { ...gift, amount: { value: 5000 } };
  deps.item = { ...item, giftAmount: 5000, revision: giftPriorityRevision(smallGift) };
  deps.fetchNxt.mockImplementation(async path => path.startsWith("/gift/") ? smallGift : empty());
  expect(await checkGiftDocumentation({ ...deps, settings: { majorGiftMinimum: 5000 } })).toMatchObject({ status: "review" });
  expect(deps.fetchNxt).toHaveBeenCalledTimes(3);
});
it.each([null, {}, { value: [] }, { count: "0", value: [] }, { count: -1, value: [] },
  { count: 1, value: [] }, { count: 0, value: [], next_link: "https://other.example" },
  page({ id: "20", constituent_id: "200" }), page({ id: "20" }), page({ id: "abc", constituent_id: "100" }),
  page(action(), action()), page(...Array.from({ length: 501 }, (_, i) => ({ ...action(), id: String(i + 1) })))
])("treats malformed, partial, conflicting, and oversized data as unknown: %j", bad => {
  expect(documentationPage(bad, "100")).toBeNull();
  expect(assessDocumentation(bad, empty(), "100")).toEqual({ status: "incomplete" });
  expect(assessDocumentation(empty(), bad, "100")).toEqual({ status: "incomplete" });
});
it.each(["Solicitation", " solicitation ", "Phone Solicitation"])("recognizes %s without requiring a completed action or a recent date", type => {
  expect(assessDocumentation(empty(), page({ ...action(type), completed: false, date: "2001-01-01" }), "100")).toEqual({ status: "found", source: "solicitation" });
});
it.each([undefined, "", "Custom Phone Type", { name: "Cultivation" }])("withholds a gap when action classification is unknown: %j", type => {
  expect(assessDocumentation(empty(), page({ ...action(), type }), "100")).toEqual({ status: "incomplete" });
});
it("counts inactive, declined, and old opportunities as existing context, not missing documentation", () => {
  expect(assessDocumentation(page({ id: "10", constituent_id: "100", inactive: true, status: "Declined", expected_date: "2001-01-01" }), null, "100"))
    .toEqual({ status: "found", source: "opportunity" });
});
it("performs at most three bounded GETs through the viewer's connection, without date/status/fundraiser filters", async () => {
  const result = await checkGiftDocumentation(deps);
  expect(result).toMatchObject({ status: "review", checkedAt: "2026-09-27T20:00:00.000Z" });
  expect(deps.fetchNxt.mock.calls).toEqual([
    ["/gift/v1/gifts/900", { userId: 10, authUserId: 7, origin: deps.origin, method: "GET", maxRetries: 0, timeoutMs: 8000 }],
    ["/opportunity/v1/opportunities", { userId: 10, authUserId: 7, origin: deps.origin, method: "GET", maxRetries: 0, timeoutMs: 8000,
      searchParams: { constituent_id: "100", include_inactive: true, limit: 500 } }],
    ["/constituent/v1/constituents/100/actions", { userId: 10, authUserId: 7, origin: deps.origin, method: "GET", maxRetries: 0, timeoutMs: 8000,
      searchParams: { limit: 500 } }],
  ]);
  expect(deps.localCheck).toHaveBeenCalledTimes(2);
  expect(deps.finish).toHaveBeenCalledWith(expect.objectContaining({ viewerId: 7, token: "lease", result }));
});
it.each([{ giftAmount: 9999.99 }, { giftAmount: "10000" }, { giftAmount: Infinity }, { constituentId: "../other" }, { giftId: "0" }, { key: "gift:901" }, { revision: "old" }, { kind: "opportunity" }])("does not check invalid or non-major gifts: %j", patch => {
  return checkGiftDocumentation({ ...deps, item: { ...item, ...patch } }).then(result => {
    expect(result.status).toBe("unavailable"); expect(deps.resolveScope).not.toHaveBeenCalled(); expect(deps.fetchNxt).not.toHaveBeenCalled();
  });
});
it("does not borrow another account when the viewer has no connection", async () => {
  deps.resolveScope.mockRejectedValue(new Error("no account"));
  expect(await checkGiftDocumentation(deps)).toEqual({ status: "connection" });
  expect(deps.claim).not.toHaveBeenCalled(); expect(deps.fetchNxt).not.toHaveBeenCalled();
});
it("respects an active lease or cooldown before any NXT read", async () => {
  deps.claim.mockResolvedValue({ result: { status: "waiting" } });
  expect(await checkGiftDocumentation(deps)).toEqual({ status: "waiting" });
  expect(deps.fetchNxt).not.toHaveBeenCalled(); expect(deps.finish).not.toHaveBeenCalled();
});
it("does not reuse a cached review prompt after a local create or a failed local coverage read", async () => {
  deps.claim.mockResolvedValue({ result: { status: "review" } });
  deps.localCheck.mockResolvedValueOnce(true).mockRejectedValueOnce(new Error("database"));
  expect(await checkGiftDocumentation(deps)).toMatchObject({ status: "found", source: "app" });
  expect(await checkGiftDocumentation(deps)).toEqual({ status: "unavailable" });
  expect(deps.fetchNxt).not.toHaveBeenCalled();
});
it("avoids a remote scan when local documentation or a pending create already exists", async () => {
  deps.localCheck.mockResolvedValue(true);
  expect(await checkGiftDocumentation(deps)).toMatchObject({ status: "found", source: "app" });
  expect(deps.fetchNxt).not.toHaveBeenCalled();
});
it("rechecks local writes after NXT reads to avoid an indexing-lag gap", async () => {
  deps.localCheck.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  expect(await checkGiftDocumentation(deps)).toMatchObject({ status: "found", source: "app" });
});
it("stops after a known opportunity or an incomplete opportunity page", async () => {
  deps.fetchNxt.mockResolvedValueOnce(gift).mockResolvedValueOnce(page({ id: "10", constituent_id: "100" }));
  expect((await checkGiftDocumentation(deps)).status).toBe("found");
  expect(deps.fetchNxt).toHaveBeenCalledTimes(2);
  deps.fetchNxt.mockClear().mockResolvedValueOnce(gift).mockResolvedValueOnce({ count: 3, value: [] });
  expect((await checkGiftDocumentation(deps)).status).toBe("incomplete");
  expect(deps.fetchNxt).toHaveBeenCalledTimes(2);
});
it.each([null, { ...gift, id: "901" }, { ...gift, constituent_id: "200" }, { ...gift, amount: { value: 5000 } },
  { ...gift, type: "Pledge" }, { ...gift, date: "2026-09-24" }])("withholds gap prompts when the live gift differs: %j", async current => {
  deps.fetchNxt.mockResolvedValueOnce(current);
  expect((await checkGiftDocumentation(deps)).status).toBe("changed");
  expect(deps.fetchNxt).toHaveBeenCalledTimes(1);
});
it.each([401, 403, 429, 500])("does not turn provider %i failures into absence or leak raw errors", async code => {
  deps.fetchNxt.mockRejectedValue(Object.assign(new Error("secret provider detail"), { httpStatus: code, retryAfterMs: 120000 }));
  const result = await checkGiftDocumentation(deps);
  expect(result.status).toBe("unavailable"); expect(JSON.stringify(result)).not.toContain("secret");
  expect(deps.fetchNxt).toHaveBeenCalledTimes(1);
  expect(deps.finish).toHaveBeenCalledWith(expect.objectContaining({ retryMs: 120000 }));
});
it("fails closed on local read failure, reconnect, or lost lease", async () => {
  deps.localCheck.mockRejectedValueOnce(new Error("database"));
  expect((await checkGiftDocumentation(deps)).status).toBe("unavailable");
  expect(deps.fetchNxt).not.toHaveBeenCalled();
  deps.resolveScope.mockResolvedValueOnce("old").mockResolvedValueOnce("new");
  expect((await checkGiftDocumentation(deps)).status).toBe("unavailable");
  deps.finish.mockResolvedValue(false);
  expect((await checkGiftDocumentation(deps)).status).toBe("unavailable");
});
it("uses an atomic per-viewer gate across workspaces and a token-guarded completion", async () => {
  const statements = [];
  const db = vi.fn(async (parts, ...values) => { statements.push({ text: parts.join("?"), values }); return [{ claim_token: "new" }]; });
  const result = await claimDocumentationCheck({ viewerId: 7, workspaceId: 10, scopeKey: "scope", item, db });
  expect(result.token).toMatch(/^[a-f0-9-]{36}$/);
  expect(statements[0].text).toContain("ON CONFLICT (viewer_user_id)");
  expect(statements[0].text).toContain("retry_after <= NOW()");
  await finishDocumentationCheck({ viewerId: 7, token: result.token, result: { status: "incomplete" }, db });
  expect(statements[1].text).toContain("AND claim_token =");
  expect(statements[1].values).toContain(result.token);
});
