import { getSafeInternalReturnPath } from "./workflowNavigation";

export function getSignInReturnPath(search) {
  const requested = new URLSearchParams(search).get("returnTo");
  return getSafeInternalReturnPath(requested) || "/";
}

export function buildSignInHref(returnTo) {
  const path = getSafeInternalReturnPath(returnTo) || "/";
  return `/account/signin?${new URLSearchParams({ returnTo: path })}`;
}
