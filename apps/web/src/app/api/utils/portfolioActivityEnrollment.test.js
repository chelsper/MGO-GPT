import { afterEach, beforeEach, expect, it, vi } from "vitest";
const sql = vi.hoisted(() => vi.fn());
vi.mock("./sql", () => ({ default: sql }));
import { activityEnrollmentConfig, resolveActivityEnrollment } from "./portfolioActivityEnrollment";

const account = (id, extra = {}) => ({ id, role: "mgo", active: true, has_portfolio: true, ...extra });
beforeEach(() => {
  vi.stubEnv("PORTFOLIO_ACTIVITY_ENROLLMENT_MODE", "");
  vi.stubEnv("PORTFOLIO_ACTIVITY_WORKSPACE_IDS", "7,10");
  vi.stubEnv("PORTFOLIO_ACTIVITY_EXCLUDED_WORKSPACE_IDS", "");
  sql.mockReset().mockResolvedValue([account(7), account(10)]);
});
afterEach(() => vi.unstubAllEnvs());

it("keeps existing installations on explicit allowlists until automatic enrollment is enabled", async () => {
  sql.mockResolvedValue([account(7), account(8), account(10, { active: false })]);
  expect(activityEnrollmentConfig()).toMatchObject({ mode: "allowlist", enabled: true });
  expect(await resolveActivityEnrollment()).toEqual({ mode: "allowlist", workspaceIds: ["7"], awaitingAssignments: 0 });
});

it("discovers only active MGOs, including combined roles, without contacting NXT or writing", async () => {
  vi.stubEnv("PORTFOLIO_ACTIVITY_ENROLLMENT_MODE", "active_mgos");
  vi.stubEnv("PORTFOLIO_ACTIVITY_WORKSPACE_IDS", "");
  sql.mockResolvedValue([account(7), account(8, { role: " Executive, MGO " }),
    account(9, { role: "admin" }), account(10, { role: "executive" }),
    account(11, { active: false }), account(12, { role: "notmgo" }),
    account(13, { role: "advancement_services,mgo", has_portfolio: false }), account("invalid")]);
  const fetchSpy = vi.spyOn(globalThis, "fetch");
  try {
    expect(await resolveActivityEnrollment()).toEqual({ mode: "active_mgos", workspaceIds: ["7", "8", "13"], awaitingAssignments: 1 });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(sql).toHaveBeenCalledTimes(1);
    expect(sql.mock.calls[0][0].join("?")).toMatch(/^\s*SELECT/);
    expect(sql.mock.calls[0][0].join("?")).toContain("active = TRUE");
  } finally { fetchSpy.mockRestore(); }
});

it("discovers a new MGO on the next batch and stops checking removed, inactive or excluded accounts", async () => {
  vi.stubEnv("PORTFOLIO_ACTIVITY_ENROLLMENT_MODE", "active_mgos");
  expect((await resolveActivityEnrollment()).workspaceIds).toEqual(["7", "10"]);
  sql.mockResolvedValue([account(7, { role: "admin" }), account(10, { active: false }), account(11), account(12)]);
  vi.stubEnv("PORTFOLIO_ACTIVITY_EXCLUDED_WORKSPACE_IDS", "11");
  expect((await resolveActivityEnrollment()).workspaceIds).toEqual(["12"]);
});

it("supports exclusions in allowlist mode without deleting saved data", async () => {
  vi.stubEnv("PORTFOLIO_ACTIVITY_EXCLUDED_WORKSPACE_IDS", "10");
  expect((await resolveActivityEnrollment()).workspaceIds).toEqual(["7"]);
});

it.each(["disabled", "all", "typo"])("fails closed with mode %s before any database work", async mode => {
  vi.stubEnv("PORTFOLIO_ACTIVITY_ENROLLMENT_MODE", mode);
  expect(activityEnrollmentConfig().enabled).toBe(false);
  expect((await resolveActivityEnrollment()).workspaceIds).toEqual([]);
  expect(sql).not.toHaveBeenCalled();
});

it.each(["all", "7,invalid", "-1", "1.5", ",", "9007199254740992"])("does not ignore malformed exclusions (%s)", async value => {
  vi.stubEnv("PORTFOLIO_ACTIVITY_ENROLLMENT_MODE", "active_mgos");
  vi.stubEnv("PORTFOLIO_ACTIVITY_EXCLUDED_WORKSPACE_IDS", value);
  expect(activityEnrollmentConfig().enabled).toBe(false);
  await resolveActivityEnrollment();
  expect(sql).not.toHaveBeenCalled();
});

it("does not fall back to another membership mode after a discovery failure", async () => {
  vi.stubEnv("PORTFOLIO_ACTIVITY_ENROLLMENT_MODE", "active_mgos");
  sql.mockRejectedValue(new Error("database unavailable"));
  await expect(resolveActivityEnrollment()).rejects.toThrow("database unavailable");
});
