import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const { sqlMock } = vi.hoisted(() => ({ sqlMock: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: sqlMock }));
import { buildInvitationEmail, invitationEmailConfiguration, sendInvitationEmail } from "./sendInvitationEmail";
import { invitationEmailMessage, canResendInvitationEmail } from "@/utils/invitationEmail";

const env = {
  VERCEL_ENV: "production", VERCEL_PROJECT_ID: "prj_S8IWnRqqTQwLnd6C5lBfTsMj15VY",
  RESEND_API_KEY: "test-key", RESEND_FROM_EMAIL: "JUMGOGPT <notifications@jumgogpt.app>",
  WORKSPACE_EMAIL_DOMAIN: "ju.edu", OKTA_CLIENT_ID: "test-id", OKTA_CLIENT_SECRET: "test-secret", OKTA_ISSUER: "https://example.okta.com",
};
describe("JU invitation email", () => {
  beforeEach(() => {
    sqlMock.mockReset();
    Object.entries(env).forEach(([key, value]) => vi.stubEnv(key, value));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ id: "email-123" })));
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
  function claim(email = "invitee@ju.edu", result = { status: "accepted", messageId: "email-123" }) {
    sqlMock.mockResolvedValueOnce([{ email }]).mockResolvedValueOnce([{ invitation_email: result }]);
  }
  it("includes the actual SSO button, existing credentials, MFA and no new password", () => {
    const body = buildInvitationEmail("invitee@ju.edu");
    expect(body.to).toEqual(["invitee@ju.edu"]);
    expect(body.from).toBe(env.RESEND_FROM_EMAIL);
    for (const content of [body.text, body.html]) {
      expect(content).toContain("https://www.jumgogpt.app/account/signin");
      expect(content).toContain("Continue with Jacksonville University SSO");
      expect(content).toContain("OKTA");
      expect(content).toContain("MFA");
      expect(content).toContain("separate JUMGOGPT password");
      expect(content).toContain("replies are not monitored");
    }
    expect(body.html).not.toContain("invitee@ju.edu");
  });
  it.each([
    ["VERCEL_ENV", "preview"], ["VERCEL_ENV", "development"], ["VERCEL_PROJECT_ID", "sandbox"],
    ["OKTA_CLIENT_ID", ""], ["OKTA_CLIENT_SECRET", ""], ["OKTA_ISSUER", ""],
    ["RESEND_API_KEY", ""], ["RESEND_FROM_EMAIL", "onboarding@resend.dev"],
    ["WORKSPACE_EMAIL_DOMAIN", "other.edu"], ["RESEND_FROM_EMAIL", "notifications@jumgogpt.app>"],
  ])("fails closed for %s=%s", (key, value) => {
    expect(invitationEmailConfiguration({ ...env, [key]: value })).toBe(false);
  });
  it("claims before sending once, awaits and records provider acceptance with idempotency", async () => {
    claim();
    expect(await sendInvitationEmail(12)).toEqual({ status: "accepted", messageId: "email-123" });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(options.headers["Idempotency-Key"]).toMatch(/^ju-invitation\/12\//);
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(options.body).to).toEqual(["invitee@ju.edu"]);
    expect(sqlMock.mock.invocationCallOrder[0]).toBeLessThan(fetch.mock.invocationCallOrder[0]);
    const query = sqlMock.mock.calls[0][0].join(" ");
    expect(query).toContain("accepted_at IS NULL AND revoked_at IS NULL");
    expect(query).toContain("NOT EXISTS");
    expect(query).toContain("INTERVAL '60 seconds'");
    expect(query).toContain("IN ('accepted', 'failed', 'skipped')");
    expect(sqlMock.mock.calls[0]).toContain(false);
    expect(sqlMock.mock.calls[1][0].join(" ")).toContain("invitation_email->>'attemptId'");
  });
  it.each(["accepted", "sending", "unknown", "failed"])("does not send when claim is unavailable (%s)", async (status) => {
    sqlMock.mockResolvedValueOnce([]).mockResolvedValueOnce([{ invitation_email: { status } }]);
    expect(await sendInvitationEmail(12, { resend: true })).toEqual({ status });
    expect(fetch).not.toHaveBeenCalled();
    expect(sqlMock.mock.calls[0]).toContain(true);
  });
  it.each(["invitee@other.edu", "a@ju.edu, b@ju.edu", "a@ju.edu\r\nBcc: other@example.com"])("does not send to invalid JU recipient %s", async (email) => {
    claim(email, { status: "skipped" });
    expect(await sendInvitationEmail(12)).toEqual({ status: "skipped" });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("records skipped configuration without contacting Resend", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    claim("invitee@ju.edu", { status: "skipped" });
    expect(await sendInvitationEmail(12)).toEqual({ status: "skipped" });
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([[400,"failed"],[401,"failed"],[429,"failed"],[408,"unknown"],[409,"unknown"],[500,"unknown"]])("records HTTP %s as %s without exposing provider errors", async (status, expected) => {
    claim("invitee@ju.edu", { status: expected });
    fetch.mockResolvedValue(new Response("secret-provider-payload", { status }));
    expect(await sendInvitationEmail(12)).toEqual({ status: expected });
    expect(sqlMock.mock.calls[1]).toContain(JSON.stringify({ status: expected }));
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("keeps timeout and missing provider receipts uncertain, without retrying", async () => {
    claim("invitee@ju.edu", { status: "unknown" });
    fetch.mockRejectedValue(new Error("timeout secret"));
    expect(await sendInvitationEmail(12)).toEqual({ status: "unknown" });
    expect(fetch).toHaveBeenCalledTimes(1);
    sqlMock.mockReset();
    claim("invitee@ju.edu", { status: "unknown" });
    fetch.mockResolvedValue(Response.json({}));
    expect(await sendInvitationEmail(12)).toEqual({ status: "unknown" });
  });
  it("does not turn a post-send persistence failure into a second send", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    sqlMock.mockResolvedValueOnce([{ email: "invitee@ju.edu" }]).mockRejectedValueOnce(new Error("database"));
    expect(await sendInvitationEmail(12)).toEqual({ status: "unknown" });
    expect(fetch).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });
  it("distinguishes acceptance from delivery and blocks ambiguous resends", () => {
    expect(invitationEmailMessage({ status: "accepted" })).toContain("inbox delivery is not yet confirmed");
    expect(canResendInvitationEmail({ status: "unknown" })).toBe(false);
    expect(canResendInvitationEmail({ status: "sending" })).toBe(false);
    expect(canResendInvitationEmail({ status: "failed" })).toBe(true);
    expect(canResendInvitationEmail(null)).toBe(true);
  });
});
