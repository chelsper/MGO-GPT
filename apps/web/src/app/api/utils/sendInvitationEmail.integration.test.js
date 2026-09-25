// Opt-in local PostgreSQL only; no production credentials or provider calls.
import { execFileSync } from "node:child_process";
import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import Papa from "papaparse";
const database = vi.hoisted(() => ({ query: null }));
vi.mock("@/app/api/utils/sql", () => ({ default: (parts, ...values) => database.query(parts, values) }));
import { sendInvitationEmail } from "./sendInvitationEmail";

const socket = process.env.INVITATION_TEST_PG_SOCKET;
const enabled = /^\/(?:private\/)?tmp\/ju-invitation-pg\.[A-Za-z0-9]+$/.test(socket || "");
function execute(statement) {
  const output = execFileSync("psql", ["-X", "--no-password", "-q", "--csv", "-v", "ON_ERROR_STOP=1", "-h", socket, "-p", "55448", "-d", "invitation_test"], { input: statement, encoding: "utf8" }).trim();
  return output ? Papa.parse(output, { header: true }).data.map((row) => Object.fromEntries(Object.entries(row).map(([key,value]) => [key, key === "invitation_email" ? (value ? JSON.parse(value) : null) : value]))) : [];
}
function literal(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}
describe.skipIf(!enabled)("invitation email durable SQL guards", () => {
  beforeAll(() => {
    database.query = async (parts, values) => execute(parts.reduce((sql,part,i) => sql + part + (i < values.length ? literal(values[i]) : ""), ""));
    execute("CREATE TABLE users (id BIGSERIAL PRIMARY KEY, email TEXT); CREATE TABLE user_invitations (id BIGINT PRIMARY KEY, email TEXT, accepted_at TIMESTAMPTZ, revoked_at TIMESTAMPTZ); ALTER TABLE user_invitations ADD COLUMN IF NOT EXISTS invitation_email JSONB;");
  });
  beforeEach(() => {
    execute("TRUNCATE users, user_invitations; INSERT INTO user_invitations(id,email) VALUES(12,'invitee@ju.edu');");
    for (const [key,value] of Object.entries({ VERCEL_ENV: "production", VERCEL_PROJECT_ID: "prj_S8IWnRqqTQwLnd6C5lBfTsMj15VY", RESEND_API_KEY: "fake", RESEND_FROM_EMAIL: "notifications@jumgogpt.app", OKTA_CLIENT_ID: "fake", OKTA_CLIENT_SECRET: "fake", OKTA_ISSUER: "fake", WORKSPACE_EMAIL_DOMAIN: "ju.edu" })) vi.stubEnv(key,value);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ id: "provider-123" })));
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
  it("only one concurrent call claims and sends", async () => {
    await Promise.all([sendInvitationEmail(12), sendInvitationEmail(12)]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(execute("SELECT invitation_email FROM user_invitations WHERE id=12;")[0].invitation_email).toMatchObject({ status: "accepted", messageId: "provider-123" });
    await sendInvitationEmail(12, { resend: true });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("only explicit resend can send again after cooldown", async () => {
    await sendInvitationEmail(12);
    execute("UPDATE user_invitations SET invitation_email=jsonb_set(invitation_email,'{attemptedAt}',to_jsonb(NOW()-INTERVAL '2 minutes'));");
    await sendInvitationEmail(12);
    expect(fetch).toHaveBeenCalledTimes(1);
    fetch.mockResolvedValue(Response.json({ id: "provider-456" }));
    await sendInvitationEmail(12, { resend: true });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0][1].headers["Idempotency-Key"]).not.toBe(fetch.mock.calls[1][1].headers["Idempotency-Key"]);
  });
  it.each(["sending", "unknown"])("never automatically reclaims %s even after a day", async (status) => {
    execute(`UPDATE user_invitations SET invitation_email=jsonb_build_object('status','${status}','attemptedAt',NOW()-INTERVAL '2 days');`);
    await sendInvitationEmail(12, { resend: true });
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(["UPDATE user_invitations SET accepted_at=NOW();", "UPDATE user_invitations SET revoked_at=NOW();", "INSERT INTO users(email) VALUES('INVITEE@JU.EDU');"])("does not send to accepted/revoked/existing users (%s)", async (statement) => {
    execute(statement);
    await sendInvitationEmail(12, { resend: true });
    expect(fetch).not.toHaveBeenCalled();
  });
});
