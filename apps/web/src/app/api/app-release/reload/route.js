import { appReleasePath, releaseCookiePaths } from "@/utils/appRelease";

// Only expire host-only framework pins. No app data or authentication access.
export async function POST(request) {
  const headers = new Headers({ "Cache-Control": "private, no-store" });
  const reply = (error, status) => Response.json({ error }, { status, headers });
  const url = new URL(request.url);
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json" ||
      request.headers.get("x-ju-release-reset") !== "1" ||
      (request.headers.get("origin") && request.headers.get("origin") !== url.origin) ||
      (request.headers.get("sec-fetch-site") && request.headers.get("sec-fetch-site") !== "same-origin"))
    return reply("Load the update from your app workspace.", 403);
  let body;
  try {
    const reader = request.body?.getReader();
    let size = 0, text = "";
    const decoder = new TextDecoder();
    if (reader) while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) { await reader.cancel(); return reply("Request too large.", 413); }
      text += decoder.decode(value, { stream: true });
    }
    body = JSON.parse(text + decoder.decode());
  } catch { return reply("Invalid release request.", 400); }
  if (!body || typeof body !== "object" || Object.keys(body).some(key => !["expectedDeployment", "returnTo"].includes(key)))
    return reply("Invalid release request.", 400);
  const deployment = process.env.VERCEL_DEPLOYMENT_ID;
  if (!/^dpl_[A-Za-z0-9]+$/.test(deployment || "") || body.expectedDeployment !== deployment)
    return reply("The release changed. Check for the latest version again.", 409);
  const returnTo = appReleasePath(body.returnTo);
  if (!returnTo) return reply("Return to an app workspace before loading the update.", 400);
  for (const path of releaseCookiePaths(returnTo)) headers.append("Set-Cookie",
    `__vdpl=; Max-Age=0; Path=${path}; HttpOnly; Secure; SameSite=Lax`);
  return Response.json({ deploymentId: deployment, returnTo }, { headers });
}
