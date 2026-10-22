// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), schema: vi.fn(), fetch: vi.fn() }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: mocks.schema }));
vi.mock("@neondatabase/serverless", () => ({
  Pool: class { query = mocks.query; end = vi.fn(); },
}));
vi.mock("@/__create/adapter", () => ({ default: () => ({}) }));

const base = "https://app.example.test/api/auth";
const issuer = "https://identity.example.test/oauth2/default";
let routes;
async function get(path) {
  return routes.GET(new Request(`${base}/${path}`), { params: { auth: path } });
}
async function signin(token, cookie = "") {
  return routes.POST(new Request(`${base}/signin/okta`, {
    method: "POST",
    headers: { cookie, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrfToken: token, callbackUrl: "https://app.example.test/" }),
  }), { params: { auth: "signin/okta" } });
}

describe("real Auth.js Okta route security", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("AUTH_SECRET", "fictional-auth-route-test-secret");
    vi.stubEnv("DATABASE_URL", "postgres://fictional.invalid/test");
    vi.stubEnv("WORKSPACE_EMAIL_DOMAIN", "ju.edu");
    vi.stubEnv("AUTH_ALLOW_CREDENTIALS", "false");
    vi.stubEnv("AUTH_DEBUG", "false");
    vi.stubEnv("OKTA_CLIENT_ID", "fictional-client");
    vi.stubEnv("OKTA_CLIENT_SECRET", "fictional-secret");
    vi.stubEnv("OKTA_ISSUER", issuer);
    mocks.query.mockResolvedValue({ rows: [] });
    mocks.fetch.mockImplementation(async (url) => {
      expect(String(url)).toBe(`${issuer}/.well-known/openid-configuration`);
      return Response.json({
        issuer, authorization_endpoint: `${issuer}/v1/authorize`,
        token_endpoint: `${issuer}/v1/token`, jwks_uri: `${issuer}/v1/keys`,
        response_types_supported: ["code"], code_challenge_methods_supported: ["S256"],
        subject_types_supported: ["public"], id_token_signing_alg_values_supported: ["RS256"],
      });
    });
    vi.stubGlobal("fetch", mocks.fetch);
    routes = await import("./[...auth]/route");
  });
  afterEach(() => {
    delete globalThis.__mgoAuthPool;
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("exposes only Okta when password login is disabled", async () => {
    const response = await get("providers");
    expect(response.status).toBe(200);
    const providers = await response.json();
    expect(Object.keys(providers)).toEqual(["okta"]);
    expect(providers.okta.callbackUrl).toBe(`${base}/callback/okta`);
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it("starts Okta authorization with CSRF and PKCE protections", async () => {
    const csrf = await get("csrf");
    const { csrfToken } = await csrf.json();
    const cookies = csrf.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
    const response = await signin(csrfToken, cookies);
    expect(response.status).toBe(302);
    const redirect = new URL(response.headers.get("location"));
    expect(redirect.origin + redirect.pathname).toBe(`${issuer}/v1/authorize`);
    expect(redirect.searchParams.get("client_id")).toBe("fictional-client");
    expect(redirect.searchParams.get("redirect_uri")).toBe(`${base}/callback/okta`);
    expect(redirect.searchParams.get("code_challenge_method")).toBe("S256");
    expect(redirect.searchParams.get("code_challenge")).toBeTruthy();
    const checkCookie = response.headers.getSetCookie().find((value) => value.includes("pkce.code_verifier"));
    expect(checkCookie).toContain("HttpOnly");
    expect(checkCookie).toContain("Secure");
    expect(checkCookie).toContain("SameSite=Lax");
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it("rejects a sign-in POST without a valid CSRF cookie", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await signin("not-valid");
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain("error=MissingCSRF");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("rejects an unsolicited OAuth callback without creating an account", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await routes.GET(new Request(`${base}/callback/okta?code=fictional-code`), {
      params: { auth: "callback/okta" },
    });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain("error=");
    expect(response.headers.getSetCookie().join(";")).not.toMatch(/authjs\.session-token=[^;]/);
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
