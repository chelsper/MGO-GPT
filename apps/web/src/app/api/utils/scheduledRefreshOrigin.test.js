import { describe, expect, it } from "vitest";
import { scheduledRefreshOrigin } from "./scheduledRefreshOrigin";

const request = new Request("https://deployment.example.vercel.app/api/internal/report-cache-refresh", {
  headers: { "x-forwarded-host": "untrusted.example" },
});

describe("scheduled refresh origin", () => {
  it("prefers the existing non-redirecting maintenance origin over the auth origin", () => {
    expect(scheduledRefreshOrigin(request, { VERCEL_ENV: "production",
      AUTH_URL: "https://example.edu", PORTFOLIO_MAINTENANCE_ORIGIN: "https://www.example.edu" }))
      .toBe("https://www.example.edu");
  });

  it("does not fall back when the configured maintenance origin is invalid", () => {
    expect(() => scheduledRefreshOrigin(request, { VERCEL_ENV: "production",
      AUTH_URL: "https://example.edu", PORTFOLIO_MAINTENANCE_ORIGIN: "http://example.edu" }))
      .toThrow(/production callback origin/);
  });

  it("uses the configured production origin, not the protected deployment host", () => {
    expect(scheduledRefreshOrigin(request, { VERCEL_ENV: "production", AUTH_URL: "https://www.example.edu/" }))
      .toBe("https://www.example.edu");
  });

  it.each([undefined, "", "invalid", "http://example.edu", "https://user:pass@example.edu",
    "https://example.edu/api/auth", "https://example.edu/?redirect=x", "https://example.edu/#x"])
  ("fails closed for invalid production configuration: %s", AUTH_URL => {
    expect(() => scheduledRefreshOrigin(request, { VERCEL_ENV: "production", AUTH_URL })).toThrow(/AUTH_URL/);
  });

  it.each(["development", "preview", undefined])("preserves non-production request routing: %s", VERCEL_ENV => {
    expect(scheduledRefreshOrigin(new Request("http://localhost:4000/api/internal/test"), { VERCEL_ENV }))
      .toBe("http://localhost:4000");
  });
});
