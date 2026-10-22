import { pathToFileURL } from "node:url";

const target = process.env.VERIFY_DEPLOY_URL || "https://www.jumgogpt.app";
const expectedCommit =
  process.argv[2] ||
  process.env.EXPECTED_COMMIT_SHA ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  null;

async function fetchJson(url, headers = {}, fetcher = fetch) {
  const response = await fetcher(url, {
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(10000),
    headers: { accept: "application/json", ...headers },
  });

  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${url}`);
  }

  return response.json();
}

export async function verifyStaleSession(
  target,
  current,
  staleDeployment,
  fetcher = fetch,
) {
  if (
    !/^dpl_[A-Za-z0-9]+$/.test(staleDeployment) ||
    !/^dpl_[A-Za-z0-9]+$/.test(current.deploymentId || "")
  )
    throw new Error(
      "A valid previous and current deployment ID is required for the stale-session check.",
    );
  const endpoint = new URL("/api/version", target);
  // Synthetic version pin only. Never use a user's authentication cookies.
  const headers = { cookie: `__vdpl=${staleDeployment}` };
  const pinned = await fetchJson(endpoint, headers, fetcher);
  const explicitEndpoint = new URL(endpoint);
  explicitEndpoint.searchParams.set("dpl", current.deploymentId);
  const explicit = await fetchJson(explicitEndpoint, headers, fetcher);
  const matches = (value) =>
    value.commitSha === current.commitSha &&
    value.deploymentId === current.deploymentId;
  return {
    previousDeployment: staleDeployment,
    pinnedDeployment: pinned.deploymentId,
    pinnedCommit: pinned.commitSha,
    existingSessionCurrent: matches(pinned),
    explicitLatestRoutingWorks: matches(explicit),
  };
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: { accept: "text/html" },
  });

  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${url}`);
  }

  return response.text();
}

function extractAsset(html, pattern) {
  const match = html.match(pattern);
  return match?.[1] || null;
}

async function main() {
  const version = await fetchJson(`${target}/api/version`);
  const html = await fetchHtml(target);
  const staleSession = process.env.VERIFY_STALE_DEPLOYMENT_ID
    ? await verifyStaleSession(
        target,
        version,
        process.env.VERIFY_STALE_DEPLOYMENT_ID,
      )
    : null;

  const assets = {
    entryClient: extractAsset(html, /\/assets\/(entry\.client-[^"]+\.js)/),
    index: extractAsset(html, /\/assets\/(index-[^"]+\.js)/),
    root: extractAsset(html, /\/assets\/(root-[^"]+\.js)/),
  };

  console.log(
    JSON.stringify(
      {
        target,
        expectedCommit,
        deployedCommit: version.commitSha,
        deploymentId: version.deploymentId,
        environment: version.environment,
        vercelUrl: version.vercelUrl,
        assets,
        staleSession,
      },
      null,
      2,
    ),
  );

  if (expectedCommit && version.commitSha !== expectedCommit) {
    console.error(
      `Production commit mismatch: expected ${expectedCommit} but got ${version.commitSha}.`,
    );
    process.exitCode = 1;
  }
  if (
    staleSession &&
    (!staleSession.existingSessionCurrent ||
      !staleSession.explicitLatestRoutingWorks)
  ) {
    throw new Error(
      "Existing-session verification failed. An old version pin still serves stale code or explicit latest-version routing failed. Resolve the release boundary or perform a user-approved version reload; a cookie-free smoke check alone is insufficient.",
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
