const workspace = "/stewardship/society-letters";

// This endpoint only releases a framework version pin. It cannot access app
// records, authentication cookies, NXT, or a user-supplied destination host.
export async function GET(request) {
  const url = new URL(request.url);
  const headers = new Headers({ "Cache-Control": "private, no-store" });
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (
    (origin && origin !== url.origin) ||
    (fetchSite && !["same-origin", "none"].includes(fetchSite))
  )
    return new Response("Open Society Letters to load the update.", {
      status: 403,
      headers,
    });
  const deployment = process.env.VERCEL_DEPLOYMENT_ID;
  // Vercel consumes the reserved `dpl` routing parameter before this handler.
  // Keep the app's validation value separate from that platform parameter.
  if (!deployment || url.searchParams.get("expectedDeployment") !== deployment)
    return new Response(
      "The release changed. Return to Society Letters and check for the latest version.",
      { status: 409, headers },
    );
  let destination = new URL(workspace, url.origin);
  try {
    const requested = new URL(
      url.searchParams.get("returnTo") || workspace,
      url.origin,
    );
    if (
      requested.origin === url.origin &&
      requested.pathname === workspace &&
      !requested.username &&
      !requested.password
    )
      destination = requested;
  } catch {
    /* Keep the fixed local workspace destination. */
  }
  destination.searchParams.delete("dpl");
  // The framework omits Path when setting its pin, so previously visited
  // parent paths can each have a cookie. Expire only these host-only pins.
  for (const path of ["/", "/stewardship", workspace])
    headers.append(
      "Set-Cookie",
      `__vdpl=; Max-Age=0; Path=${path}; HttpOnly; Secure; SameSite=Lax`,
    );
  const returnTo = destination.pathname + destination.search + destination.hash;
  if (request.headers.get("accept") === "application/json")
    return Response.json({ deploymentId: deployment, returnTo }, { headers });
  headers.set("Location", returnTo);
  return new Response(null, { status: 303, headers });
}
