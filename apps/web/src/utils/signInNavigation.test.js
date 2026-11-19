import { expect, it } from "vitest";
import { buildSignInHref, getSignInReturnPath } from "./signInNavigation";

it.each([
  "/reports/project-prospecting/list-project-center",
  "/reports/project-prospecting/list-demo?view=saved&search=Test%20Person#results",
  "/reports/lists/list-demo",
  "/reports/future-made-phase-ii",
  "/reports/dashboards/future-made-campaign#campaign-overview",
])("preserves the internal destination %s through sign-in", path => {
  const href = buildSignInHref(path);
  expect(href.startsWith("/account/signin?")).toBe(true);
  expect(getSignInReturnPath(href.slice(href.indexOf("?")))).toBe(path);
});

it.each([
  null, "", "https://outside.test/", "//outside.test/", "javascript:alert(1)",
  "/\\outside.test", "/%5coutside.test", "/%2f%2foutside.test", "/\n/outside.test",
  "/api/reports/lists/list-demo", "/account/signin", "/account/logout",
  "/reports/project-prospecting/../../../account/logout", "/not-a-page",
])("rejects external, auth, API and invalid destinations: %s", path => {
  const search = new URLSearchParams({ returnTo: path ?? "" }).toString();
  expect(getSignInReturnPath(search)).toBe("/");
  expect(buildSignInHref(path)).toBe("/account/signin?returnTo=%2F");
});

it("keeps direct sign-in on Home and ignores unrelated parameters", () => {
  expect(getSignInReturnPath("")).toBe("/");
  expect(getSignInReturnPath("?callbackUrl=https://outside.test&error=AccessDenied")).toBe("/");
});
