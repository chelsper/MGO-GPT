export function scheduledRefreshOrigin(request, env = process.env) {
  if (env.VERCEL_ENV !== "production") return new URL(request.url).origin;

  // Cron requests arrive on protected deployment URLs. Use the deployment-owned
  // production origin for authenticated callbacks, never a forwarded host header.
  try {
    const url = new URL(env.PORTFOLIO_MAINTENANCE_ORIGIN || env.AUTH_URL);
    if (url.protocol === "https:" && !url.username && !url.password &&
      !url.search && !url.hash && url.pathname === "/") return url.origin;
  } catch { /* Fail closed rather than send the cron credential to a request host. */ }
  throw new Error("Scheduled refresh requires a valid production callback origin (PORTFOLIO_MAINTENANCE_ORIGIN or AUTH_URL).");
}
