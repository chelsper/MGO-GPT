import { getSafeInternalReturnPath } from "./workflowNavigation";

const forms = new Set([
  "/request-list", "/new-constituent", "/data-requests", "/list-requests",
  "/update-opportunity", "/action-opportunity-update", "/log-donor-update",
  "/family-import", "/organization-configurations", "/report-configurations",
  "/report-configurations/metrics", "/nxt-write-recovery", "/knowledge-base/manage",
  "/reports/personal-dashboards/new",
]);

export function appReleasePath(value) {
  if (typeof value !== "string" || value.length > 4096 || !value.startsWith("/") ||
      value.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(value) ||
      /%(?:0[0-9a-f]|1[0-9a-f]|5c|7f)/i.test(value)) return "";
  try {
    const url = new URL(value, "https://release.invalid");
    if (url.origin !== "https://release.invalid" ||
        (!getSafeInternalReturnPath(value) && !forms.has(url.pathname))) return "";
    url.searchParams.delete("dpl");
    return url.pathname + url.search + url.hash;
  } catch { return ""; }
}

export function validAppVersion(value) {
  return value?.environment === "production" && /^[a-f0-9]{40}$/.test(value.commitSha || "") &&
    /^dpl_[A-Za-z0-9]+$/.test(value.deploymentId || "");
}

export function releaseCookiePaths(returnTo) {
  const safe = appReleasePath(returnTo);
  if (!safe) throw new Error("Invalid app destination.");
  // The framework's old host-only pin omitted Path, inheriting the page's parent.
  const paths = new Set(["/", "/api", "/api/version", "/api/app-release",
    "/stewardship", "/stewardship/inventory", "/stewardship/society-letters",
    "/reports", "/reports/dashboards", "/reports/lists", "/reports/custom-field",
    "/reports/personal-dashboards", "/reports/opportunity-pipeline",
    "/knowledge-base", "/report-configurations"]);
  const parts = new URL(safe, "https://release.invalid").pathname.split("/").filter(Boolean);
  for (let i = 1; i <= parts.length; i++) paths.add("/" + parts.slice(0, i).join("/"));
  return [...paths];
}

export async function recoverAppRelease(returnTo, { fetcher = fetch, signal, beforeReset = () => {} } = {}) {
  const path = appReleasePath(returnTo);
  if (!path) throw new Error("Invalid app destination.");
  const options = { cache: "no-store", redirect: "error", signal };
  async function read(url, extra) {
    signal?.throwIfAborted();
    const response = await fetcher(url, { ...options, ...extra });
    if (!response.ok) throw new Error("Release recovery could not be verified.");
    return response.json();
  }
  const latest = await read("/api/version", { credentials: "omit" });
  if (!validAppVersion(latest)) throw new Error("Invalid release metadata.");
  beforeReset();
  const receipt = await read("/api/app-release/reload", {
    method: "POST", credentials: "same-origin",
    headers: { "Content-Type": "application/json", "x-ju-release-reset": "1", "x-deployment-id": latest.deploymentId },
    body: JSON.stringify({ expectedDeployment: latest.deploymentId, returnTo: path }),
  });
  if (receipt.deploymentId !== latest.deploymentId || receipt.returnTo !== path)
    throw new Error("Release reset was not confirmed.");
  // Check both API routing and the actual page: a parent-path cookie can pin
  // the document even after /api/version reports the latest release.
  for (const [url, headers] of [["/api/version", undefined], [path.split("#")[0], { "x-ju-release-check": "1" }]]) {
    const restored = await read(url, { credentials: "same-origin", ...(headers ? { headers } : {}) });
    if (!validAppVersion(restored) || restored.deploymentId !== latest.deploymentId || restored.commitSha !== latest.commitSha)
      throw new Error("This page is still using an older release.");
  }
  signal?.throwIfAborted();
  beforeReset();
  return path;
}
