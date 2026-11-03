import { appReleasePath } from "../src/utils/appRelease";
import { appReleaseVersion } from "../src/app/api/utils/appReleaseVersion";

// Public release metadata only. Never bypass API/auth handlers or render user data.
export function appReleaseCheck(request) {
  if (request.method !== "GET" || request.headers.get("x-ju-release-check") !== "1") return null;
  const url = new URL(request.url);
  if (!appReleasePath(url.pathname + url.search)) return null;
  return Response.json(appReleaseVersion(), { headers: { "Cache-Control": "private, no-store", Vary: "x-ju-release-check" } });
}
