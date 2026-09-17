import { expect, it } from "vitest";
import { buildPortfolioUpdateHref } from "./prospectPresentation";

it("preserves distinct system and lookup IDs and safely encodes the donor and return URL", () => {
  const url = new URL(buildPortfolioUpdateHref({ name: "Test & Family", constituentId: "100", lookupId: "00123" }, "action"), "https://example.com");
  expect(url.pathname).toBe("/action-opportunity-update");
  expect(Object.fromEntries(url.searchParams)).toEqual({ mode: "action", returnTo: "/my-top-prospects?tab=portfolio",
    donor: "Test & Family", blackbaudConstituentId: "100", lookupId: "00123" });
});

it("does not substitute a lookup ID for a missing system ID", () => {
  const url = new URL(buildPortfolioUpdateHref({ lookupId: "00123" }, "opportunity"), "https://example.com");
  expect(url.searchParams.get("mode")).toBe("opportunity");
  expect(url.searchParams.get("lookupId")).toBe("00123");
  expect(url.searchParams.has("blackbaudConstituentId")).toBe(false);
});
