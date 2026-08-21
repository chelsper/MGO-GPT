function describeDatabaseUrl(value) {
  const text = String(value || "").trim();
  if (!text) {
    return {
      present: false,
      protocol: null,
      pooledHint: null,
      hostHint: null,
    };
  }

  let protocol = null;
  let pooledHint = null;
  let hostHint = null;
  let regionHint = null;

  try {
    const parsed = new URL(text);
    protocol = parsed.protocol.replace(/:$/, "");
    hostHint = parsed.hostname || null;
    regionHint = inferRegionFromHostname(parsed.hostname || "");
    pooledHint =
      parsed.hostname.includes("-pooler.") ||
      parsed.searchParams.has("pgbouncer") ||
      /pooler/i.test(parsed.hostname);
  } catch {
    protocol = text.split(":")[0] || "unknown";
  }

  return {
    present: true,
    protocol,
    pooledHint,
    hostHint,
    regionHint,
  };
}

function inferRegionFromHostname(hostname) {
  const text = String(hostname || "").trim().toLowerCase();
  if (!text) {
    return null;
  }

  const explicitRegionMatch = text.match(
    /\b(us|eu|ap|sa|ca|me|af)-[a-z]+-\d\b/,
  );
  if (explicitRegionMatch) {
    return explicitRegionMatch[0];
  }

  if (text.includes("aws.neon.tech")) {
    const awsRegionMatch = text.match(/([a-z]{2}-[a-z]+-\d)\.aws\.neon\.tech$/);
    if (awsRegionMatch) {
      return awsRegionMatch[1];
    }
  }

  return null;
}

function describeValue(value) {
  const text = String(value || "").trim();
  return {
    present: Boolean(text),
    length: text.length || 0,
  };
}

export async function GET() {
  try {
    return Response.json(
      {
        now: new Date().toISOString(),
        vercelEnv: process.env.VERCEL_ENV || null,
        vercelTargetEnv: process.env.VERCEL_TARGET_ENV || null,
        vercelRegion: process.env.VERCEL_REGION || null,
        authSecret: describeValue(process.env.AUTH_SECRET),
        databaseUrl: describeDatabaseUrl(process.env.DATABASE_URL),
        futureMadePhaseTwoQueryId: describeValue(
          process.env.BLACKBAUD_FUTURE_MADE_PHASE_TWO_QUERY_ID,
        ),
        blackbaudClientId: describeValue(process.env.BLACKBAUD_CLIENT_ID),
        blackbaudSubscriptionKey: describeValue(process.env.BLACKBAUD_SUBSCRIPTION_KEY),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("Runtime diagnostics error:", error);
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Could not load runtime diagnostics.",
      },
      { status: 500 },
    );
  }
}
